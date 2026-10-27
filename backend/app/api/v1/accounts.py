"""Perfil, cuentas y movimientos (pantalla de inicio y detalle de cuenta)."""

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import current_member, mask_iban, mask_phone
from app.core.errors import not_found
from app.db.models import Account, AccountType, Member
from app.providers import Providers, get_providers
from app.schemas import (
    AccountDetailOut,
    AccountOut,
    AccountsSummaryOut,
    MeOut,
    TransactionOut,
    TransactionPage,
)
from app.services import tx_counterparty, tx_title

router = APIRouter(tags=["Perfil y cuentas"])


def _subtitle(a: Account) -> str:
    if a.type == AccountType.savings:
        return "Disponible"
    if a.type == AccountType.capital:
        return "Tu aporte"
    if a.type == AccountType.envelope:
        return a.savings_mode or "Sobre a la vista"
    if a.type == AccountType.term and a.maturity_date:
        return f"Vence {a.maturity_date:%d/%m/%Y}"
    return ""


def account_out(a: Account) -> AccountOut:
    return AccountOut(id=a.id, type=a.type.value, name=a.name, currency=a.currency.value, balance=a.balance,
                      iban_masked=mask_iban(a.iban), subtitle=_subtitle(a), goal_amount=a.goal_amount,
                      savings_mode=a.savings_mode, rate=a.rate, term_months=a.term_months,
                      maturity_date=a.maturity_date, on_maturity=a.on_maturity)


@router.get("/me", response_model=MeOut)
async def me(member: Member = Depends(current_member)):
    return MeOut(id=member.id, full_name=member.full_name, phone_masked=mask_phone(member.phone),
                 sinpe_phone=member.phone, cedula_masked=f"{member.cedula[:2]}••••-{member.cedula[-4:]}",
                 email=member.email, province=member.province, canton=member.canton,
                 kyc_status=member.kyc_status.value, points=member.points, member_since=member.created_at)


@router.get("/accounts", response_model=AccountsSummaryOut)
async def list_accounts(member: Member = Depends(current_member), p: Providers = Depends(get_providers)):
    """Todas las cuentas del asociado con su saldo real (sin totalizar, como en la pantalla de inicio)."""
    return AccountsSummaryOut(accounts=[account_out(a) for a in await p.core.list_accounts(member.id)])


@router.get("/accounts/{account_id}", response_model=AccountDetailOut)
async def get_account(account_id: uuid.UUID, member: Member = Depends(current_member),
                      p: Providers = Depends(get_providers)):
    a = await p.core.get_account(member.id, account_id)
    if a is None:
        raise not_found("cuenta")
    # IBAN de Costa Rica: CR + 2 de control + 0 + 3 del banco + 14 de la cuenta. La cuenta cliente
    # (la que piden otros bancos para SINPE) son esos últimos 17 dígitos.
    client = a.iban[5:] if a.iban and len(a.iban) == 22 else None
    return AccountDetailOut(**account_out(a).model_dump(), iban=a.iban, client_account=client,
                            holder_name=member.full_name, monthly_contribution=a.monthly_contribution)


@router.get("/accounts/{account_id}/transactions", response_model=TransactionPage)
async def list_transactions(account_id: uuid.UUID, limit: int = Query(20, ge=1, le=100),
                            before: str | None = Query(None, max_length=40,
                                                       description="Cursor: created_at del último ítem"),
                            member: Member = Depends(current_member), p: Providers = Depends(get_providers)):
    if await p.core.get_account(member.id, account_id) is None:
        raise not_found("cuenta")
    rows = await p.core.list_transactions(account_id, limit + 1, before)
    items = [TransactionOut.model_validate(t).model_copy(update={
        "title": tx_title(t.category, t.amount),
        "counterparty": tx_counterparty(t.category, t.description, t.counterparty)}) for t in rows[:limit]]
    nxt = items[-1].created_at.isoformat() if len(rows) > limit else None
    return TransactionPage(items=items, next_before=nxt)
