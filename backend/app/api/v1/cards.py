"""Tarjetas de débito y crédito: bloqueo, ajustes, límites, datos sensibles, pagos y cuotas."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_member
from app.core.audit import audit
from app.core.errors import ApiError, not_found
from app.core.idempotency import body_hash, idempotency_key, remember, replay
from app.core.ratelimit import hit
from app.db.models import Card, CardKind, CardPurchase, CardStatus, Currency, LinkedMode, Member
from app.db.session import get_session
from app.providers import Providers, get_providers
from app.providers.base import InsufficientFunds
from app.schemas import (
    CardLimitsIn,
    CardOut,
    CardPaymentIn,
    CardSettingsIn,
    InstallmentIn,
    PurchaseOut,
    RevealIn,
)
from app.services import check_pin, installment_payment, new_reference

router = APIRouter(prefix="/cards", tags=["Tarjetas"])
DEFAULT_LIMITS = {"store": Decimal("300000"), "online": Decimal("200000"), "atm": Decimal("150000")}


def min_payment(c: Card) -> Decimal:
    bal = c.credit_balance or Decimal("0")
    return max(min(bal, Decimal("5000")), (bal * Decimal("0.10")).quantize(Decimal("0.01")))


def card_out(c: Card) -> CardOut:
    limits = {"store": c.limit_store, "online": c.limit_online, "atm": c.limit_atm}
    credit = None
    if c.kind == CardKind.credit:
        bal = c.credit_balance or Decimal("0")
        lim = c.credit_limit or Decimal("0")
        credit = {"limit": lim, "balance": bal, "available": lim - bal, "full_payment": bal,
                  "minimum_payment": min_payment(c), "statement_day": c.statement_day,
                  "due_date": c.due_date.isoformat() if c.due_date else None, "points_per_1000": 2}
    return CardOut(id=c.id, kind=c.kind.value, product_name=c.product_name, brand=c.brand, last4=c.last4,
                   holder_name=c.holder_name, expiry=c.expiry, status=c.status.value,
                   online_enabled=c.online_enabled, international_enabled=c.international_enabled,
                   linked_mode=c.linked_mode.value if c.linked_mode else None, limits=limits,
                   limits_are_default=limits == DEFAULT_LIMITS, credit=credit)


async def _card(p: Providers, member: Member, card_id: uuid.UUID) -> Card:
    c = await p.cards.get_card(member.id, card_id)
    if c is None:
        raise not_found("tarjeta")
    return c


@router.get("", response_model=list[CardOut])
async def list_cards(member: Member = Depends(current_member), p: Providers = Depends(get_providers)):
    return [card_out(c) for c in await p.cards.list_cards(member.id)]


@router.get("/{card_id}", response_model=CardOut)
async def get_card(card_id: uuid.UUID, member: Member = Depends(current_member),
                   p: Providers = Depends(get_providers)):
    return card_out(await _card(p, member, card_id))


@router.post("/{card_id}/lock", response_model=CardOut)
async def lock(card_id: uuid.UUID, request: Request, member: Member = Depends(current_member),
               p: Providers = Depends(get_providers), session: AsyncSession = Depends(get_session)):
    """Bloqueo inmediato, sin PIN: en una emergencia no debe haber fricción."""
    c = await _card(p, member, card_id)
    c.status = CardStatus.locked
    audit(session, request, "card_lock", member_id=member.id, card=str(c.id))
    await session.commit()
    return card_out(c)


@router.post("/{card_id}/unlock", response_model=CardOut)
async def unlock(card_id: uuid.UUID, body: RevealIn, request: Request, member: Member = Depends(current_member),
                 p: Providers = Depends(get_providers), session: AsyncSession = Depends(get_session)):
    c = await _card(p, member, card_id)
    await check_pin(session, request, member, body.pin, "card_unlock")
    c.status = CardStatus.active
    audit(session, request, "card_unlock", member_id=member.id, card=str(c.id))
    await session.commit()
    return card_out(c)


@router.patch("/{card_id}/settings", response_model=CardOut)
async def settings(card_id: uuid.UUID, body: CardSettingsIn, request: Request,
                   member: Member = Depends(current_member), p: Providers = Depends(get_providers),
                   session: AsyncSession = Depends(get_session)):
    c = await _card(p, member, card_id)
    if body.online_enabled is not None:
        c.online_enabled = body.online_enabled
    if body.international_enabled is not None:
        c.international_enabled = body.international_enabled
    if body.linked_mode is not None:
        if c.kind != CardKind.debit:
            raise ApiError(422, "not_debit", "Solo la tarjeta de débito tiene cuenta ligada.")
        c.linked_mode = LinkedMode(body.linked_mode)
    audit(session, request, "card_settings", member_id=member.id, **body.model_dump(exclude_none=True))
    await session.commit()
    return card_out(c)


@router.put("/{card_id}/limits", response_model=CardOut)
async def limits(card_id: uuid.UUID, body: CardLimitsIn, request: Request, member: Member = Depends(current_member),
                 p: Providers = Depends(get_providers), session: AsyncSession = Depends(get_session)):
    """Bajar un límite aplica de inmediato; subirlo exige PIN (paso adicional de seguridad)."""
    c = await _card(p, member, card_id)
    raising = body.store > c.limit_store or body.online > c.limit_online or body.atm > c.limit_atm
    if raising:
        if not body.pin:
            raise ApiError(403, "step_up_required", "Para subir un límite confirmá con tu clave.")
        await check_pin(session, request, member, body.pin, "card_limits")
    c.limit_store, c.limit_online, c.limit_atm = body.store, body.online, body.atm
    audit(session, request, "card_limits", member_id=member.id, raised=raising)
    await session.commit()
    return card_out(c)


@router.post("/{card_id}/reveal")
async def reveal(card_id: uuid.UUID, body: RevealIn, request: Request, member: Member = Depends(current_member),
                 p: Providers = Depends(get_providers), session: AsyncSession = Depends(get_session)):
    """Número completo y CVV, con PIN y límite de usos. Nunca se registra en logs."""
    await hit(f"reveal:{member.id}", 10, 3600)
    c = await _card(p, member, card_id)
    await check_pin(session, request, member, body.pin, "card_reveal")
    audit(session, request, "card_reveal", member_id=member.id, card=str(c.id))
    await session.commit()
    return await p.cards.reveal(c)


@router.post("/{card_id}/payments", status_code=201)
async def pay_credit_card(card_id: uuid.UUID, body: CardPaymentIn, request: Request,
                          key: str = Depends(idempotency_key), member: Member = Depends(current_member),
                          p: Providers = Depends(get_providers), session: AsyncSession = Depends(get_session)):
    h = body_hash({"card": str(card_id), **body.model_dump()})
    if (prev := await replay(session, member.id, key, h)) is not None:
        return prev
    c = await _card(p, member, card_id)
    if c.kind != CardKind.credit:
        raise ApiError(422, "not_credit", "Esa tarjeta no es de crédito.")
    bal = c.credit_balance or Decimal("0")
    if bal <= 0:
        raise ApiError(422, "nothing_due", "Tu tarjeta no tiene saldo pendiente.")
    minimum = min_payment(c)
    amount = bal if body.mode == "full" else minimum if body.mode == "minimum" else body.amount
    if amount is None or amount < minimum or amount > bal:
        raise ApiError(422, "bad_amount", f"Elegí un monto entre ₡{minimum:,.2f} y ₡{bal:,.2f}.")
    acct = await p.core.get_account(member.id, body.from_account_id)
    if acct is None or acct.currency != Currency.CRC:
        raise not_found("cuenta en colones")
    ref = new_reference("TC")
    try:
        await p.core.post(acct.id, -amount, f"Pago tarjeta de crédito •••• {c.last4}", "card_payment", ref)
    except InsufficientFunds as e:
        raise ApiError(422, "insufficient_funds", "No te alcanza el saldo de esa cuenta.") from e
    c.credit_balance = bal - amount
    resp = {"reference": ref, "amount": str(amount), "new_balance": str(c.credit_balance)}
    remember(session, member.id, key, h, resp)
    audit(session, request, "card_payment", member_id=member.id, reference=ref)
    await session.commit()
    return resp


@router.get("/{card_id}/purchases", response_model=list[PurchaseOut])
async def purchases(card_id: uuid.UUID, member: Member = Depends(current_member),
                    p: Providers = Depends(get_providers), session: AsyncSession = Depends(get_session)):
    """Compras de los últimos 30 días que se pueden pasar a cuotas."""
    c = await _card(p, member, card_id)
    since = datetime.now(UTC) - timedelta(days=30)
    rows = await session.scalars(select(CardPurchase).where(CardPurchase.card_id == c.id,
                                                            CardPurchase.created_at >= since)
                                 .order_by(CardPurchase.created_at.desc()))
    return list(rows)


@router.post("/{card_id}/installments")
async def installments(card_id: uuid.UUID, body: InstallmentIn, request: Request,
                       member: Member = Depends(current_member), p: Providers = Depends(get_providers),
                       session: AsyncSession = Depends(get_session)):
    c = await _card(p, member, card_id)
    pur = await session.scalar(select(CardPurchase).where(CardPurchase.id == body.purchase_id,
                                                          CardPurchase.card_id == c.id).with_for_update())
    if pur is None:
        raise not_found("compra")
    if pur.installments:
        raise ApiError(409, "already_installments", "Esa compra ya está en cuotas.")
    pur.installments = body.months
    q = installment_payment(pur.amount, body.months)
    audit(session, request, "card_installments", member_id=member.id, months=body.months)
    await session.commit()
    return {"purchase_id": str(pur.id), "months": body.months, "monthly_payment": str(q),
            "total": str(q * body.months), "monthly_rate": "1.5"}
