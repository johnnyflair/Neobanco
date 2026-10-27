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


# Beneficios por nivel: multiplicador de puntos y tasa extra (puntos porcentuales) en sobres y plazos.
LEVEL_PERKS: dict[str, tuple[Decimal, Decimal]] = {
    "Bronce": (Decimal("1.00"), Decimal("0.00")),
    "Plata": (Decimal("1.25"), Decimal("0.25")),
    "Oro": (Decimal("1.50"), Decimal("0.50")),
}


def member_perks(member: Member) -> tuple[Decimal, Decimal]:
    return LEVEL_PERKS[level_for(member.points_lifetime)[0]]


async def earn(session: AsyncSession, member: Member, points: int, reason: str) -> int:
    if points <= 0:
        return 0
    # El nivel con el que se llega a la operación define cuánto valen los puntos.
    points = int((Decimal(points) * member_perks(member)[0]).to_integral_value())
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


# Cómo se nombra cada movimiento en la App: (si sale, si entra).
TX_TITLES: dict[str, tuple[str, str]] = {
    "sinpe": ("Envío por SINPE Móvil", "Recibiste por SINPE Móvil"),
    "iban": ("Envío por transferencia", "Recibiste por transferencia"),
    "pull": ("Envío a otro banco", "Trajiste dinero"),
    "bill": ("Pago de servicio", "Reintegro de servicio"),
    "card": ("Compra con tarjeta", "Devolución de compra"),
    "card_payment": ("Pago de tarjeta de crédito", "Pago de tarjeta de crédito"),
    "loan": ("Pago de préstamo", "Desembolso de préstamo"),
    "envelope": ("Pasaste a un sobre", "Recibiste en tu sobre"),
    "term": ("Ahorro a plazo", "Intereses de tu plazo"),
    "rewards": ("Canje de puntos", "Canje de puntos"),
    "capital": ("Retiro de capital", "Aporte a capital social"),
    "salary": ("Ajuste de salario", "Salario"),
    "opening": ("Saldo anterior", "Saldo anterior"),
}
# Movimientos viejos (sin contraparte guardada): se saca de la descripción.
_PREFIXES = ("SINPE a ", "SINPE de ", "Transferencia a ", "Traído de ", "Desde ", "A ")


def tx_title(category: str, amount: Decimal) -> str:
    out, inc = TX_TITLES.get(category, ("Pago", "Recibiste dinero"))
    return out if amount < 0 else inc


def tx_counterparty(category: str, description: str, counterparty: str | None) -> str | None:
    if counterparty:
        return counterparty
    if category in ("opening", "loan", "rewards", "card_payment", "term"):
        return None
    for p in _PREFIXES:
        if description.startswith(p):
            return description[len(p):]
    return description
