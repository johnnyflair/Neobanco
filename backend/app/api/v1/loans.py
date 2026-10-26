"""Préstamos: simulador, oferta preaprobada y solicitudes."""

from decimal import Decimal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_member
from app.core.audit import audit
from app.db.models import LoanApplication, Member
from app.db.session import get_session
from app.schemas import LoanApplicationIn, LoanApplicationOut, LoanOfferOut, LoanOption, LoanSimIn, LoanSimOut
from app.services import LOAN_ANNUAL_RATE, monthly_payment

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
    return LoanOfferOut(preapproved=True, max_amount=Decimal("5000000"), annual_rate=LOAN_ANNUAL_RATE)


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
