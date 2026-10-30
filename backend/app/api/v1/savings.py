"""Invertir: sobres a la vista y ahorros a plazo."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_member
from app.api.v1.accounts import account_out
from app.core.audit import audit
from app.core.errors import ApiError, not_found
from app.core.idempotency import body_hash, idempotency_key, remember, replay
from app.db.models import Account, AccountType, Currency, Member
from app.db.session import get_session
from app.providers import Providers, get_providers
from app.providers.base import InsufficientFunds
from app.schemas import AccountOut, CloseEnvelopeIn, EnvelopeIn, MoveIn, RateOut, TermDepositIn
from app.services import ENVELOPE_RATE, POINTS_RULES, TERM_RATES, earn, member_perks, new_reference

router = APIRouter(prefix="/savings", tags=["Ahorro e inversión"])

MODES = {"fixed": "Monto fijo", "roundup": "Redondeo de compras", "percent": "Porcentaje de lo que entra"}


@router.get("/rates", response_model=list[RateOut])
async def rates():
    """Tasas vigentes (de ejemplo hasta conectar las de la cooperativa)."""
    return [RateOut(product="envelope", term_months=None, annual_rate=ENVELOPE_RATE)] + [
        RateOut(product="term", term_months=m, annual_rate=r) for m, r in TERM_RATES.items()
    ]


@router.post("/envelopes", response_model=AccountOut, status_code=201)
async def create_envelope(body: EnvelopeIn, request: Request, member: Member = Depends(current_member),
                          p: Providers = Depends(get_providers), session: AsyncSession = Depends(get_session)):
    per_fortnight = (body.goal_amount / (body.months * 2)).quantize(Decimal("0.01"))
    mode = f"{MODES[body.mode]} · ₡{per_fortnight:,.2f} por quincena" if body.mode == "fixed" else MODES[body.mode]
    a = await p.core.open_account(Account(member_id=member.id, type=AccountType.envelope, currency=Currency.CRC,
                                          name=body.name, balance=Decimal("0"), goal_amount=body.goal_amount,
                                          savings_mode=mode, rate=ENVELOPE_RATE + member_perks(member)[1]))
    await earn(session, member, POINTS_RULES["envelope"], f"Sobre {body.name}")
    audit(session, request, "envelope_create", member_id=member.id)
    await session.commit()
    return account_out(a)


async def _envelope(p: Providers, member: Member, envelope_id: uuid.UUID) -> Account:
    a = await p.core.get_account(member.id, envelope_id)
    if a is None or a.type != AccountType.envelope or not a.is_open:
        raise not_found("sobre")
    return a


async def _move(direction: int, envelope_id: uuid.UUID, body: MoveIn, request: Request, key: str,
                member: Member, p: Providers, session: AsyncSession) -> dict:
    h = body_hash({"env": str(envelope_id), "dir": direction, **body.model_dump()})
    if (prev := await replay(session, member.id, key, h)) is not None:
        return prev
    env = await _envelope(p, member, envelope_id)
    src = await p.core.get_account(member.id, body.account_id)
    if src is None or src.currency != Currency.CRC or src.type != AccountType.savings:
        raise not_found("cuenta en colones")
    ref = new_reference("SB")
    frm, to = (src, env) if direction > 0 else (env, src)
    try:
        await p.core.post(frm.id, -body.amount, f"A {to.name}", "envelope", ref)
    except InsufficientFunds as e:
        raise ApiError(422, "insufficient_funds", "No hay saldo suficiente.") from e
    await p.core.post(to.id, body.amount, f"Desde {frm.name}", "envelope", ref)
    resp = {"reference": ref, "envelope_balance": str(env.balance)}
    remember(session, member.id, key, h, resp)
    audit(session, request, "envelope_move", member_id=member.id, reference=ref)
    await session.commit()
    return resp


@router.post("/envelopes/{envelope_id}/deposit", status_code=201)
async def deposit(envelope_id: uuid.UUID, body: MoveIn, request: Request, key: str = Depends(idempotency_key),
                  member: Member = Depends(current_member), p: Providers = Depends(get_providers),
                  session: AsyncSession = Depends(get_session)):
    return await _move(1, envelope_id, body, request, key, member, p, session)


@router.post("/envelopes/{envelope_id}/withdraw", status_code=201)
async def withdraw(envelope_id: uuid.UUID, body: MoveIn, request: Request, key: str = Depends(idempotency_key),
                   member: Member = Depends(current_member), p: Providers = Depends(get_providers),
                   session: AsyncSession = Depends(get_session)):
    return await _move(-1, envelope_id, body, request, key, member, p, session)


@router.post("/envelopes/{envelope_id}/close")
async def close_envelope(envelope_id: uuid.UUID, body: CloseEnvelopeIn, request: Request,
                         key: str = Depends(idempotency_key), member: Member = Depends(current_member),
                         p: Providers = Depends(get_providers), session: AsyncSession = Depends(get_session)):
    """Elimina un sobre: lo que tenga vuelve a la cuenta en colones elegida y se apaga su ahorro automático.
    El sobre queda cerrado (no se borra) para que su historial siga en los movimientos."""
    h = body_hash({"env": str(envelope_id), "close": True, **body.model_dump()})
    if (prev := await replay(session, member.id, key, h)) is not None:
        return prev
    env = await _envelope(p, member, envelope_id)
    dest = await p.core.get_account(member.id, body.account_id)
    if dest is None or not dest.is_open or dest.currency != Currency.CRC or dest.type != AccountType.savings:
        raise not_found("cuenta en colones")
    returned = env.balance
    ref = None
    if returned > 0:
        ref = new_reference("SB")
        await p.core.post(env.id, -returned, f"Cierre del sobre {env.name}", "envelope", ref)
        await p.core.post(dest.id, returned, f"Desde el sobre {env.name}", "envelope", ref)
    await p.core.close_account(env)
    resp = {"reference": ref, "returned": str(returned), "account_balance": str(dest.balance)}
    remember(session, member.id, key, h, resp)
    audit(session, request, "envelope_close", member_id=member.id, reference=ref)
    await session.commit()
    return resp


@router.post("/term-deposits", status_code=201)
async def term_deposit(body: TermDepositIn, request: Request, key: str = Depends(idempotency_key),
                       member: Member = Depends(current_member), p: Providers = Depends(get_providers),
                       session: AsyncSession = Depends(get_session)):
    h = body_hash(body.model_dump())
    if (prev := await replay(session, member.id, key, h)) is not None:
        return prev
    src = await p.core.get_account(member.id, body.from_account_id)
    if src is None or src.currency != Currency.CRC:
        raise not_found("cuenta en colones")
    rate = TERM_RATES[body.term_months] + member_perks(member)[1]  # extra por nivel
    today = datetime.now(UTC).date()
    month = today.month - 1 + body.term_months
    maturity = today.replace(year=today.year + month // 12, month=month % 12 + 1, day=min(today.day, 28))
    ref = new_reference("AP")
    try:
        await p.core.post(src.id, -body.amount, f"Ahorro a plazo {body.term_months} meses", "term", ref)
    except InsufficientFunds as e:
        raise ApiError(422, "insufficient_funds", "No te alcanza el saldo disponible.") from e
    acc = await p.core.open_account(Account(member_id=member.id, type=AccountType.term, currency=Currency.CRC,
                                            name=f"Plazo {body.term_months} meses", balance=Decimal("0"),
                                            rate=rate, term_months=body.term_months, maturity_date=maturity,
                                            on_maturity=body.on_maturity))
    await p.core.post(acc.id, body.amount, "Apertura", "term", ref)
    interest = (body.amount * rate / 100 * body.term_months / 12).quantize(Decimal("0.01"))
    resp = {"account_id": str(acc.id), "reference": ref, "annual_rate": str(rate),
            "maturity_date": maturity.isoformat(),
            "estimated_interest": str(interest)}
    remember(session, member.id, key, h, resp)
    audit(session, request, "term_deposit", member_id=member.id, reference=ref)
    await session.commit()
    return resp
