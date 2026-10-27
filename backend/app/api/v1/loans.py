"""Préstamos: simulador, oferta preaprobada y solicitudes."""

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_member
from app.core.audit import audit
from app.core.errors import ApiError, not_found
from app.core.idempotency import body_hash, idempotency_key, remember, replay
from app.db.models import Currency, LoanApplication, Member
from app.db.session import get_session
from app.providers import Providers, get_providers
from app.schemas import (
    LoanApplicationIn,
    LoanApplicationOut,
    LoanDisburseIn,
    LoanDisburseOut,
    LoanOfferOut,
    LoanOption,
    LoanSimIn,
    LoanSimOut,
)
from app.services import LOAN_ANNUAL_RATE, check_pin, monthly_payment, new_reference

PREAPPROVED_MAX = Decimal("5000000")  # de ejemplo; con el core real sale de la capacidad de pago

router = APIRouter(prefix="/loans", tags=["Préstamos"])


@router.post("/simulate", response_model=LoanSimOut)
async def simulate(body: LoanSimIn):
    """Disponible sin sesión: el modo visitante también simula."""
    mid = 36 if body.term_months == 60 else body.term_months
    fast = 12 if mid <= 24 else 24
    opts = []
    for label, n, rec in (("Cuota baja", 60, False), ("Equilibrada", mid, True), ("Pagá menos intereses", fast, False)):
        q = monthly_payment(body.amount, n)
        opts.append(LoanOption(label=label, term_months=n, monthly_payment=q, total_paid=q * n, recommended=rec))
    return LoanSimOut(annual_rate=LOAN_ANNUAL_RATE, monthly_payment=monthly_payment(body.amount, body.term_months),
                      options=opts)


@router.get("/offer", response_model=LoanOfferOut)
async def offer(member: Member = Depends(current_member)):
    # Con el core real: consulta de capacidad de pago y buró. Aquí, regla de ejemplo.
    return LoanOfferOut(preapproved=True, max_amount=PREAPPROVED_MAX, annual_rate=LOAN_ANNUAL_RATE)


@router.post("/applications", response_model=LoanApplicationOut, status_code=201)
async def apply(body: LoanApplicationIn, request: Request, member: Member = Depends(current_member),
                session: AsyncSession = Depends(get_session)):
    app_ = LoanApplication(member_id=member.id, amount=body.amount, term_months=body.term_months,
                           income_type=body.income_type, monthly_income=body.monthly_income)
    session.add(app_)
    audit(session, request, "loan_application", member_id=member.id)
    await session.commit()
    await session.refresh(app_)
    return app_


@router.get("/applications", response_model=list[LoanApplicationOut])
async def my_applications(member: Member = Depends(current_member), session: AsyncSession = Depends(get_session)):
    rows = await session.scalars(select(LoanApplication).where(LoanApplication.member_id == member.id)
                                 .order_by(LoanApplication.created_at.desc()).limit(10))
    return list(rows)


def _first_due(today: date) -> date:
    """Primera cuota el día 15 del mes siguiente."""
    y, m = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
    return date(y, m, 15)


@router.post("/disbursements", response_model=LoanDisburseOut, status_code=201)
async def disburse(body: LoanDisburseIn, request: Request, key: str = Depends(idempotency_key),
                   member: Member = Depends(current_member), p: Providers = Depends(get_providers),
                   session: AsyncSession = Depends(get_session)):
    """Préstamo preaprobado: se firma con la clave y el dinero entra al instante a la cuenta en colones."""
    h = body_hash(body.model_dump(exclude={"pin"}))
    if (prev := await replay(session, member.id, key, h)) is not None:
        return prev
    if body.amount > PREAPPROVED_MAX:
        raise ApiError(422, "over_preapproved", f"Tu preaprobado llega hasta ₡{PREAPPROVED_MAX:,.2f}. "
                                                "Para más, enviá una solicitud.")
    acct = await p.core.get_account(member.id, body.to_account_id)
    if acct is None or acct.currency != Currency.CRC:
        raise not_found("cuenta en colones")
    await check_pin(session, request, member, body.pin, "loan_disburse")
    ref = new_reference("PR")
    await p.core.post(acct.id, body.amount, "Préstamo personal", "loan", ref)
    session.add(LoanApplication(member_id=member.id, amount=body.amount, term_months=body.term_months,
                                income_type="preaprobado", monthly_income=Decimal("0"), status="disbursed"))
    q = monthly_payment(body.amount, body.term_months)
    resp = LoanDisburseOut(reference=ref, amount=body.amount, term_months=body.term_months, monthly_payment=q,
                           first_due=_first_due(date.today())).model_dump(mode="json")
    remember(session, member.id, key, h, resp)
    audit(session, request, "loan_disburse", member_id=member.id, reference=ref)
    await session.commit()
    return resp
