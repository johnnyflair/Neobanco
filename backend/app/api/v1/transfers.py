"""SINPE Móvil, transferencias IBAN y traer dinero de cuentas propias en otros bancos."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_member, mask_iban
from app.core.audit import audit
from app.core.config import get_settings
from app.core.errors import ApiError, not_found
from app.core.idempotency import body_hash, idempotency_key, remember, replay
from app.db.models import Currency, LinkedExternalAccount, Member, Transfer, TransferKind
from app.db.session import get_session
from app.providers import Providers, get_providers
from app.providers.base import InsufficientFunds
from app.schemas import IbanIn, LinkedAccountOut, Phone, PullIn, SinpeIn, TransferOut
from app.services import earn_sinpe, new_reference

router = APIRouter(prefix="/transfers", tags=["Transferencias"])


def _out(t: Transfer, points: int = 0) -> dict:
    return TransferOut(id=t.id, kind=t.kind.value, amount=t.amount, currency=t.currency.value,
                       counterparty_name=t.counterparty_name, status=t.status, reference=t.reference,
                       created_at=t.created_at, points_earned=points).model_dump(mode="json")


@router.get("/sinpe/lookup")
async def sinpe_lookup(phone: Phone = Query(...), member: Member = Depends(current_member),
                       p: Providers = Depends(get_providers)):
    """Nombre (parcial) del dueño del número, para confirmar antes de enviar."""
    c = await p.sinpe.lookup_phone(phone)
    if c is None:
        raise ApiError(404, "no_sinpe", "Ese número no tiene SINPE Móvil.")
    return {"phone": c.phone, "name": c.display_name, "bank": c.bank}


@router.post("/sinpe", status_code=201)
async def sinpe(body: SinpeIn, request: Request, key: str = Depends(idempotency_key),
                member: Member = Depends(current_member), p: Providers = Depends(get_providers),
                session: AsyncSession = Depends(get_session)):
    h = body_hash(body.model_dump())
    if (prev := await replay(session, member.id, key, h)) is not None:
        return prev
    acct = await p.core.get_account(member.id, body.from_account_id)
    if acct is None or acct.currency != Currency.CRC:
        raise not_found("cuenta en colones")
    if body.phone == member.phone:
        raise ApiError(422, "self_transfer", "No podés enviarte a tu propio número.")
    contact = await p.sinpe.lookup_phone(body.phone)
    if contact is None:
        raise ApiError(404, "no_sinpe", "Ese número no tiene SINPE Móvil.")
    ref = new_reference("SM")
    try:
        await p.core.post(acct.id, -body.amount, f"SINPE a {contact.display_name}", "sinpe", ref)
    except InsufficientFunds as e:
        raise ApiError(422, "insufficient_funds", "No te alcanza el saldo disponible.") from e
    status = await p.sinpe.send(ref, body.amount, body.phone)
    t = Transfer(member_id=member.id, kind=TransferKind.sinpe, account_id=acct.id, amount=body.amount,
                 currency=Currency.CRC, counterparty=body.phone, counterparty_name=contact.display_name,
                 description=body.description, status=status, reference=ref)
    session.add(t)
    pts = await earn_sinpe(session, member)
    await session.flush()
    resp = _out(t, pts)
    remember(session, member.id, key, h, resp)
    audit(session, request, "sinpe", member_id=member.id, reference=ref)
    await session.commit()
    return resp


@router.get("/iban/lookup")
async def iban_lookup(iban: str = Query(..., min_length=22, max_length=30),
                      member: Member = Depends(current_member), p: Providers = Depends(get_providers)):
    from app.schemas import _iban

    try:
        clean = _iban(iban)
    except ValueError as e:
        raise ApiError(422, "bad_iban", str(e)) from e
    name = await p.sinpe.lookup_iban(clean)
    if name is None:
        raise not_found("cuenta")
    return {"iban_masked": mask_iban(clean), "holder": name}


@router.post("/iban", status_code=201)
async def iban(body: IbanIn, request: Request, key: str = Depends(idempotency_key),
               member: Member = Depends(current_member), p: Providers = Depends(get_providers),
               session: AsyncSession = Depends(get_session)):
    h = body_hash(body.model_dump())
    if (prev := await replay(session, member.id, key, h)) is not None:
        return prev
    acct = await p.core.get_account(member.id, body.from_account_id)
    if acct is None:
        raise not_found("cuenta")
    holder = await p.sinpe.lookup_iban(body.iban)
    ref = new_reference("TR")
    try:
        await p.core.post(acct.id, -body.amount, f"Transferencia a {holder}", "iban", ref)
    except InsufficientFunds as e:
        raise ApiError(422, "insufficient_funds", "No te alcanza el saldo disponible.") from e
    status = await p.sinpe.send(ref, body.amount, body.iban)
    t = Transfer(member_id=member.id, kind=TransferKind.iban, account_id=acct.id, amount=body.amount,
                 currency=acct.currency, counterparty=body.iban, counterparty_name=holder,
                 description=body.description, status=status, reference=ref)
    session.add(t)
    await session.flush()
    resp = _out(t)
    remember(session, member.id, key, h, resp)
    audit(session, request, "iban_transfer", member_id=member.id, reference=ref)
    await session.commit()
    return resp


@router.get("/linked-accounts", response_model=list[LinkedAccountOut])
async def linked_accounts(member: Member = Depends(current_member), session: AsyncSession = Depends(get_session)):
    rows = await session.scalars(select(LinkedExternalAccount).where(LinkedExternalAccount.member_id == member.id))
    return [LinkedAccountOut(id=r.id, bank_name=r.bank_name, label=r.label, iban_masked=mask_iban(r.iban) or "",
                             authorized=r.authorized) for r in rows]


@router.post("/pull", status_code=201)
async def pull(body: PullIn, request: Request, key: str = Depends(idempotency_key),
               member: Member = Depends(current_member), p: Providers = Depends(get_providers),
               session: AsyncSession = Depends(get_session)):
    """Trae dinero de una cuenta propia en otro banco (débito en tiempo real de SINPE).
    Solo cuentas a nombre del asociado; una cuenta nueva queda pendiente de autorización."""
    h = body_hash(body.model_dump())
    if (prev := await replay(session, member.id, key, h)) is not None:
        return prev
    if bool(body.linked_account_id) == bool(body.new_iban):
        raise ApiError(422, "bad_source", "Elegí una cuenta guardada o ingresá un IBAN nuevo.")
    acct = await p.core.get_account(member.id, body.to_account_id)
    if acct is None or acct.currency != Currency.CRC:
        raise not_found("cuenta en colones")

    if body.new_iban:
        # Con el core real: SINPE devuelve la cédula del titular y debe ser igual a la del asociado.
        if await p.sinpe.lookup_iban(body.new_iban) is None:
            raise not_found("cuenta")
        la = LinkedExternalAccount(member_id=member.id, bank_name="Otro banco", iban=body.new_iban,
                                   label="Cuenta nueva", authorized=False)
        session.add(la)
        await session.flush()
        audit(session, request, "pull_link", member_id=member.id)
        await session.commit()
        return {"status": "pending_authorization", "linked_account_id": str(la.id),
                "message": "Aprobá el débito en la App de tu otro banco y volvé a intentarlo."}

    linked = await session.scalar(select(LinkedExternalAccount).where(
        LinkedExternalAccount.id == body.linked_account_id, LinkedExternalAccount.member_id == member.id))
    if linked is None:
        raise not_found("cuenta vinculada")
    if not linked.authorized:
        raise ApiError(409, "not_authorized", "Esa cuenta todavía no está autorizada por tu otro banco.")
    day = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    today = await session.scalar(select(func.coalesce(func.sum(Transfer.amount), 0)).where(
        Transfer.member_id == member.id, Transfer.kind == TransferKind.pull, Transfer.created_at >= day))
    cap = Decimal(get_settings().pull_daily_limit_crc)
    if Decimal(today or 0) + body.amount > cap:
        raise ApiError(422, "daily_limit", f"El máximo por día es ₡{cap:,.2f}.")
    ref = new_reference("PL")
    status = await p.sinpe.pull(ref, body.amount, linked.iban)
    await p.core.post(acct.id, body.amount, f"Traído de {linked.bank_name}", "pull", ref)
    t = Transfer(member_id=member.id, kind=TransferKind.pull, account_id=acct.id, amount=body.amount,
                 currency=Currency.CRC, counterparty=linked.iban, counterparty_name=linked.bank_name,
                 status=status, reference=ref)
    session.add(t)
    await session.flush()
    resp = _out(t)
    remember(session, member.id, key, h, resp)
    audit(session, request, "pull", member_id=member.id, reference=ref)
    await session.commit()
    return resp


@router.get("/{transfer_id}", response_model=TransferOut)
async def get_transfer(transfer_id: uuid.UUID, member: Member = Depends(current_member),
                       session: AsyncSession = Depends(get_session)):
    t = await session.scalar(select(Transfer).where(Transfer.id == transfer_id, Transfer.member_id == member.id))
    if t is None:
        raise not_found("transferencia")
    return TransferOut.model_validate(t)
