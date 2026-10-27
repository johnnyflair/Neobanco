"""Ayuda: reporte de fraude con bloqueo inmediato de tarjetas y seguimiento del caso."""

import secrets

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_member
from app.core.audit import audit
from app.core.errors import not_found
from app.db.models import Card, CardStatus, Member, SupportCase
from app.db.session import get_session
from app.schemas import CaseOut, FraudReportIn

router = APIRouter(prefix="/support", tags=["Ayuda"])


@router.post("/fraud", response_model=CaseOut, status_code=201)
async def report_fraud(body: FraudReportIn, request: Request, member: Member = Depends(current_member),
                       session: AsyncSession = Depends(get_session)):
    # Número corto, fácil de dictar por teléfono (único por la restricción de la tabla).
    # Primero se bloquea todo (lo urgente); el caso queda para que un agente lo revise.
    res = await session.execute(update(Card).where(Card.member_id == member.id, Card.status == CardStatus.active)
                                .values(status=CardStatus.locked))
    number = str(100_000 + secrets.randbelow(900_000))
    case = SupportCase(member_id=member.id, number=number, kind="fraud", reason=body.reason,
                       cards_locked=res.rowcount or 0)  # type: ignore[attr-defined]
    session.add(case)
    audit(session, request, "fraud_report", member_id=member.id, reason=body.reason, case=case.number)
    await session.commit()
    await session.refresh(case)
    return case


@router.get("/cases", response_model=list[CaseOut])
async def cases(member: Member = Depends(current_member), session: AsyncSession = Depends(get_session)):
    rows = await session.scalars(select(SupportCase).where(SupportCase.member_id == member.id)
                                 .order_by(SupportCase.created_at.desc()).limit(10))
    return list(rows)


@router.get("/cases/{number}", response_model=CaseOut)
async def case(number: str, member: Member = Depends(current_member), session: AsyncSession = Depends(get_session)):
    c = await session.scalar(select(SupportCase).where(SupportCase.member_id == member.id,
                                                       SupportCase.number == number))
    if c is None:
        raise not_found("caso")
    return c
