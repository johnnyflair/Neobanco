"""Reglas de negocio compartidas (recompensas, préstamos, PIN). Todos los valores marcados como
"de ejemplo" los define la cooperativa y deberían salir de su configuración."""

import secrets
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.security import verify_secret
from app.db.models import Member, RewardEntry

CENT = Decimal("0.01")

# ---------- PIN ----------


async def check_pin(session: AsyncSession, request: Request, member: Member, pin: str, action: str) -> None:
    """Valida el PIN con bloqueo temporal tras varios intentos fallidos."""
    s = get_settings()
    now = datetime.now(UTC)
    if member.locked_until and member.locked_until > now:
        raise ApiError(423, "locked", "Bloqueamos tu clave por seguridad. Intentá más tarde o recuperala.")
    if verify_secret(member.pin_hash, pin):
        member.failed_pin_attempts = 0
        return
    member.failed_pin_attempts += 1
    if member.failed_pin_attempts >= s.pin_max_attempts:
        member.locked_until = now + timedelta(minutes=s.pin_lock_minutes)
        member.failed_pin_attempts = 0
    audit(session, request, action, "bad_pin", member.id)
    await session.commit()
    raise ApiError(401, "bad_pin", "La clave no es correcta.")


# ---------- Recompensas ----------

POINTS_RULES = {
    "card_debit_per_1000": 1,
    "card_credit_per_1000": 2,
    "sinpe": 5,
    "sinpe_monthly_cap": 20,
    "bill": 10,
    "bill_autopay": 20,
    "envelope": 50,
    "welcome": 500,
}
REDEEM_MULTIPLIER = {"account": Decimal("1"), "loan": Decimal("1.10"), "envelope": Decimal("1.05"),
                     "cause": Decimal("2")}
LEVELS = [("Oro", 5000), ("Plata", 2000), ("Bronce", 0)]


async def earn(session: AsyncSession, member: Member, points: int, reason: str) -> int:
    if points <= 0:
        return 0
    member.points += points
    member.points_lifetime += points
    session.add(RewardEntry(member_id=member.id, points=points, reason=reason))
    return points


async def earn_sinpe(session: AsyncSession, member: Member) -> int:
    month_start = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    earned = await session.scalar(
        select(func.coalesce(func.sum(RewardEntry.points), 0)).where(
            RewardEntry.member_id == member.id,
            RewardEntry.reason.like("SINPE%"),
            RewardEntry.created_at >= month_start,
        )
    )
    room = POINTS_RULES["sinpe_monthly_cap"] - int(earned or 0)
    return await earn(session, member, min(POINTS_RULES["sinpe"], room), "SINPE Móvil")


def level_for(lifetime: int) -> tuple[str, int | None]:
    for i, (name, floor) in enumerate(LEVELS):
        if lifetime >= floor:
            nxt = LEVELS[i - 1][1] if i > 0 else None
            return name, nxt
    return "Bronce", 2000


# ---------- Préstamos ----------

LOAN_ANNUAL_RATE = Decimal("18.00")  # de ejemplo


def monthly_payment(amount: Decimal, months: int, annual_rate: Decimal = LOAN_ANNUAL_RATE) -> Decimal:
    r = annual_rate / Decimal(1200)
    if r == 0:
        return (amount / months).quantize(CENT, ROUND_HALF_UP)
    q = amount * r / (1 - (1 + r) ** -months)
    return q.quantize(CENT, ROUND_HALF_UP)


def installment_payment(amount: Decimal, months: int, monthly_rate: Decimal = Decimal("0.015")) -> Decimal:
    q = amount * monthly_rate / (1 - (1 + monthly_rate) ** -months)
    return q.quantize(CENT, ROUND_HALF_UP)


# ---------- Ahorro ----------

TERM_RATES = {3: Decimal("4.50"), 6: Decimal("5.50"), 9: Decimal("6.00"), 12: Decimal("6.75"),
              24: Decimal("7.25"), 36: Decimal("7.50")}  # de ejemplo
ENVELOPE_RATE = Decimal("3.00")


def new_reference(prefix: str) -> str:
    return f"{prefix}{datetime.now(UTC):%y%m%d}{secrets.randbelow(10**8):08d}"
