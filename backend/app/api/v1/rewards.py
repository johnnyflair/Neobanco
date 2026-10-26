"""Recompensas: saldo de puntos, nivel, historial y canje."""

from decimal import Decimal

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_member
from app.core.audit import audit
from app.core.errors import ApiError, not_found
from app.db.models import AccountType, Currency, Member, RewardEntry
from app.db.session import get_session
from app.providers import Providers, get_providers
from app.schemas import RedeemIn, RedeemOut, RewardsOut
from app.services import REDEEM_MULTIPLIER, level_for, new_reference

router = APIRouter(prefix="/rewards", tags=["Recompensas"])
MIN_REDEEM = 500


@router.get("", response_model=RewardsOut)
async def rewards(member: Member = Depends(current_member), session: AsyncSession = Depends(get_session)):
    rows = await session.scalars(select(RewardEntry).where(RewardEntry.member_id == member.id)
                                 .order_by(RewardEntry.created_at.desc()).limit(20))
    level, nxt = level_for(member.points_lifetime)
    return RewardsOut(points=member.points, value_crc=Decimal(member.points), level=level, next_level_at=nxt,
                      history=[{"points": r.points, "reason": r.reason, "at": r.created_at.isoformat()} for r in rows])


@router.post("/redeem", response_model=RedeemOut)
async def redeem(body: RedeemIn, request: Request, member: Member = Depends(current_member),
                 p: Providers = Depends(get_providers), session: AsyncSession = Depends(get_session)):
    await session.refresh(member, with_for_update=True)
    if member.points < MIN_REDEEM:
        raise ApiError(422, "not_enough_points", f"Necesitás al menos {MIN_REDEEM} puntos para canjear.")
    mult = REDEEM_MULTIPLIER[body.destination]
    pts = member.points
    value = (Decimal(pts) * mult).quantize(Decimal("0.01"))
    ref = new_reference("PT")
    if body.destination in ("account", "envelope"):
        accts = await p.core.list_accounts(member.id)
        want = AccountType.savings if body.destination == "account" else AccountType.envelope
        target = next((a for a in accts if a.type == want and a.currency == Currency.CRC
                       and (body.target_id is None or a.id == body.target_id)), None)
        if target is None:
            raise not_found("cuenta destino")
        await p.core.post(target.id, value, "Canje de puntos", "rewards", ref)
    # "loan" y "cause" se registran para que el core los aplique (abono a préstamo / fondo solidario).
    member.points = 0
    session.add(RewardEntry(member_id=member.id, points=-pts, reason=f"Canje: {body.destination}"))
    audit(session, request, "rewards_redeem", member_id=member.id, destination=body.destination, reference=ref)
    await session.commit()
    return RedeemOut(points_used=pts, value=value, multiplier=mult, destination=body.destination)
