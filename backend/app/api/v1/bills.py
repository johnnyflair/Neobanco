"""Pago de servicios: categorías, búsqueda de empresas, consulta, pago y recibos guardados."""

import unicodedata
import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_member
from app.core.audit import audit
from app.core.errors import ApiError, not_found
from app.core.idempotency import body_hash, idempotency_key, remember, replay
from app.db.models import BillProvider, Currency, Member, SavedBill
from app.db.session import get_session
from app.providers import Providers, get_providers
from app.providers.base import InsufficientFunds
from app.schemas import BillLookupIn, BillPayIn, BillProviderOut, BillQuoteOut, SavedBillOut, SavedBillUpdateIn
from app.services import POINTS_RULES, earn, new_reference

router = APIRouter(prefix="/bills", tags=["Pago de servicios"])

# Palabras comunes que la gente escribe y la categoría a la que apuntan.
ALIASES = {"luz": "electricidad", "agua": "acueductos", "celular": "telefonia", "tele": "cable",
           "seguro": "seguros", "universidad": "educacion", "colegio": "educacion", "placa": "marchamo",
           "carro": "marchamo", "municipal": "municipalidades"}


def _norm(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t.lower()) if unicodedata.category(c) != "Mn")


@router.get("/categories")
async def categories(session: AsyncSession = Depends(get_session)):
    rows = await session.scalars(select(BillProvider.category).distinct().order_by(BillProvider.category))
    return [{"name": c} for c in rows]


@router.get("/providers", response_model=list[BillProviderOut])
async def providers(q: str | None = Query(None, max_length=40), category: str | None = Query(None, max_length=60),
                    session: AsyncSession = Depends(get_session)):
    """Busca por nombre de empresa, categoría o palabras comunes como «luz» o «agua»."""
    stmt = select(BillProvider).order_by(BillProvider.category, BillProvider.name)
    if category:
        stmt = stmt.where(BillProvider.category == category)
    rows = list(await session.scalars(stmt))
    if q:
        nq = _norm(q.strip())
        alias = next((v for k, v in ALIASES.items() if k.startswith(nq) or nq.startswith(k)), None)
        rows = [r for r in rows if nq in _norm(r.name) or nq in _norm(r.category)
                or (alias and alias in _norm(r.category))]
    return rows


async def _provider(session: AsyncSession, pid: str) -> BillProvider:
    prov = await session.get(BillProvider, pid)
    if prov is None:
        raise not_found("servicio")
    return prov


@router.post("/lookup", response_model=BillQuoteOut)
async def lookup(body: BillLookupIn, member: Member = Depends(current_member), p: Providers = Depends(get_providers),
                 session: AsyncSession = Depends(get_session)):
    prov = await _provider(session, body.provider_id)
    q = await p.bills.lookup(prov.id, body.reference, member.full_name)
    if q is None:
        raise ApiError(404, "no_bill", f"No encontramos recibos pendientes con ese {prov.reference_label.lower()}.")
    return BillQuoteOut(provider_id=prov.id, provider_name=prov.name, reference=q.reference, holder=q.holder,
                        amount=q.amount, period=q.period, due=q.due)


@router.post("/pay", status_code=201)
async def pay(body: BillPayIn, request: Request, key: str = Depends(idempotency_key),
              member: Member = Depends(current_member), p: Providers = Depends(get_providers),
              session: AsyncSession = Depends(get_session)):
    h = body_hash(body.model_dump())
    if (prev := await replay(session, member.id, key, h)) is not None:
        return prev
    prov = await _provider(session, body.provider_id)
    acct = await p.core.get_account(member.id, body.from_account_id)
    if acct is None or acct.currency != Currency.CRC:
        raise not_found("cuenta en colones")
    q = await p.bills.lookup(prov.id, body.reference, member.full_name)
    if q is None:
        raise ApiError(404, "no_bill", "Ese recibo ya no está pendiente.")
    if body.expected_amount is not None and q.amount != body.expected_amount:
        # El recibo guardado se pone al día con el monto real, para que al recargar se vea bien.
        stale = await session.scalar(select(SavedBill).where(SavedBill.member_id == member.id,
                                                             SavedBill.provider_id == prov.id,
                                                             SavedBill.reference == body.reference))
        if stale is not None:
            stale.pending_amount = q.amount
            await session.commit()
        raise ApiError(409, "bill_amount_changed",
                       f"El recibo ahora es de ₡{q.amount:,.2f}. Revisalo antes de pagar.")
    ref = new_reference("RC")
    try:
        await p.core.post(acct.id, -q.amount, prov.name, "bill", ref, counterparty=prov.name,
                          detail=f"{prov.reference_label} {body.reference}"[:60])
    except InsufficientFunds as e:
        raise ApiError(422, "insufficient_funds", "No te alcanza el saldo disponible.") from e
    receipt = await p.bills.pay(q, ref)
    saved = await session.scalar(select(SavedBill).where(SavedBill.member_id == member.id,
                                                         SavedBill.provider_id == prov.id,
                                                         SavedBill.reference == body.reference))
    if saved is None and body.save:
        saved = SavedBill(member_id=member.id, provider_id=prov.id, reference=body.reference, nickname=prov.name,
                          autopay=body.autopay)
        session.add(saved)
    if saved is not None:
        saved.pending_amount = None
    pts = await earn(session, member, POINTS_RULES["bill_autopay" if body.autopay else "bill"], f"Recibo {prov.name}")
    resp = {"reference": ref, "receipt": receipt, "amount": str(q.amount), "provider": prov.name,
            "points_earned": pts}
    remember(session, member.id, key, h, resp)
    audit(session, request, "bill_pay", member_id=member.id, reference=ref)
    await session.commit()
    return resp


def _saved_out(b: SavedBill, prov: BillProvider) -> SavedBillOut:
    out = SavedBillOut.model_validate(b)
    out.provider_name, out.category, out.reference_label = prov.name, prov.category, prov.reference_label
    return out


@router.get("/saved", response_model=list[SavedBillOut])
async def saved(member: Member = Depends(current_member), session: AsyncSession = Depends(get_session)):
    rows = await session.execute(select(SavedBill, BillProvider).join(BillProvider)
                                 .where(SavedBill.member_id == member.id).order_by(SavedBill.due_date.nulls_last()))
    return [_saved_out(b, prov) for b, prov in rows]


@router.patch("/saved/{bill_id}", response_model=SavedBillOut)
async def update_saved(bill_id: uuid.UUID, body: SavedBillUpdateIn, request: Request,
                       member: Member = Depends(current_member), session: AsyncSession = Depends(get_session)):
    """Activa o apaga el pago automático. La primera vez que se activa suma puntos."""
    b = await session.scalar(select(SavedBill).where(SavedBill.id == bill_id, SavedBill.member_id == member.id))
    if b is None:
        raise not_found("recibo")
    prov = await _provider(session, b.provider_id)
    if body.autopay and not b.autopay:
        await earn(session, member, POINTS_RULES["bill_autopay"], f"Pago automático de {prov.name}")
    b.autopay = body.autopay
    if body.autopay_cap is not None:
        b.autopay_cap = body.autopay_cap
    audit(session, request, "bill_autopay", member_id=member.id, autopay=body.autopay)
    await session.commit()
    return _saved_out(b, prov)
