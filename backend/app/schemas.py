"""Contratos JSON de la API (lo que consume la App). Los montos viajan como texto decimal
("248500.00") para no perder precisión en JavaScript."""

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field

PHONE_RE = re.compile(r"^\d{8}$")
IBAN_RE = re.compile(r"^CR\d{20}$")


def _phone(v: str) -> str:
    v = re.sub(r"\D", "", v)
    if not PHONE_RE.match(v):
        raise ValueError("El celular tiene 8 dígitos")
    return v


def _iban(v: str) -> str:
    v = v.replace(" ", "").upper()
    if not IBAN_RE.match(v):
        raise ValueError("El IBAN tiene 22 caracteres y empieza con CR")
    return v


def _cedula(v: str) -> str:
    d = re.sub(r"\D", "", v)
    if len(d) != 9:
        raise ValueError("La cédula tiene 9 dígitos")
    return f"{d[0]}-{d[1:5]}-{d[5:]}"


Phone = Annotated[str, AfterValidator(_phone)]
Iban = Annotated[str, AfterValidator(_iban)]
Cedula = Annotated[str, AfterValidator(_cedula)]
Pin = Annotated[str, Field(pattern=r"^\d{6}$")]
def _cents(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"))


PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=16, decimal_places=2), AfterValidator(_cents)]


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Money(BaseModel):
    amount: Decimal
    currency: Literal["CRC", "USD"]


# ---------- Auth y registro ----------

class OtpStartIn(BaseModel):
    phone: Phone
    channel: Literal["sms", "email"] = "sms"


class OtpStartOut(BaseModel):
    challenge_id: uuid.UUID
    expires_in: int
    resend_in: int
    debug_code: str | None = None


class OtpVerifyIn(BaseModel):
    challenge_id: uuid.UUID
    code: Annotated[str, Field(pattern=r"^\d{6}$")]


class OnboardingTokenOut(BaseModel):
    onboarding_token: str
    expires_in: int


class KycAnswers(BaseModel):
    occupation: Literal["asalariado", "negocio_propio", "pensionado", "estudiante"]
    monthly_volume: Literal["lt_500k", "500k_1500k", "gt_1500k"]
    source_of_funds: Literal["salario", "ventas", "pension", "otro"]


class RegisterIn(BaseModel):
    onboarding_token: str
    cedula: Cedula
    full_name: Annotated[str, Field(min_length=3, max_length=120)]
    email: EmailStr
    province: Annotated[str, Field(min_length=3, max_length=40)]
    canton: Annotated[str, Field(min_length=3, max_length=60)]
    selfie_ok: bool = True
    kyc: KycAnswers
    pin: Pin
    accept_terms: Literal[True]


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105
    expires_in: int


class RegisterOut(BaseModel):
    kyc_status: Literal["verified", "in_review", "rejected"]
    tokens: TokensOut | None = None
    message: str


class LoginIn(BaseModel):
    identifier: Annotated[str, Field(min_length=8, max_length=20, description="Celular o cédula")]
    pin: Pin
    device: Annotated[str | None, Field(max_length=120)] = None


class RefreshIn(BaseModel):
    refresh_token: Annotated[str, Field(min_length=20, max_length=200)]


class MeOut(Out):
    id: uuid.UUID
    full_name: str
    phone_masked: str
    cedula_masked: str = ""
    sinpe_phone: str = Field(description="Número propio completo, para compartir en Recibir dinero")
    email: str
    province: str
    canton: str
    kyc_status: str
    points: int
    member_since: datetime


# ---------- Cuentas ----------

class AccountOut(Out):
    id: uuid.UUID
    type: str
    name: str
    currency: str
    balance: Decimal
    iban_masked: str | None = None
    subtitle: str
    # Datos de ahorro (sobres y plazos), para mostrar metas y vencimientos sin pedir cada cuenta.
    goal_amount: Decimal | None = None
    savings_mode: str | None = None
    rate: Decimal | None = None
    term_months: int | None = None
    maturity_date: date | None = None
    on_maturity: str | None = None


class AccountDetailOut(AccountOut):
    iban: str | None = None
    client_account: str | None = Field(default=None, description="Cuenta cliente SINPE (17 dígitos), sale del IBAN")
    holder_name: str | None = None
    monthly_contribution: Decimal | None = None


class AccountsSummaryOut(BaseModel):
    accounts: list[AccountOut]


class TransactionOut(Out):
    id: uuid.UUID
    amount: Decimal
    balance_after: Decimal
    description: str
    category: str
    created_at: datetime
    title: str = Field(default="", description="Tipo de movimiento en lenguaje simple (Envío por SINPE Móvil…)")
    counterparty: str | None = None
    detail: str | None = None
    reference: str | None = None
    # En la vista combinada: de qué cuenta es cada movimiento.
    account_id: uuid.UUID | None = None
    account_name: str | None = None
    currency: str | None = None


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    next_before: str | None


# ---------- Tarjetas ----------

class CardOut(Out):
    id: uuid.UUID
    kind: str
    product_name: str
    brand: str
    last4: str
    holder_name: str
    expiry: str
    status: str
    online_enabled: bool
    international_enabled: bool
    linked_mode: str | None
    limits: dict[str, Decimal]
    limits_are_default: bool
    credit: dict | None = None


class CardSettingsIn(BaseModel):
    online_enabled: bool | None = None
    international_enabled: bool | None = None
    linked_mode: Literal["crc", "usd", "auto"] | None = None


class CardLimitsIn(BaseModel):
    store: Annotated[Decimal, Field(ge=0, le=1_000_000)]
    online: Annotated[Decimal, Field(ge=0, le=1_000_000)]
    atm: Annotated[Decimal, Field(ge=0, le=500_000)]
    pin: Pin | None = Field(default=None, description="Obligatorio si algún límite sube")


class RevealIn(BaseModel):
    pin: Pin


class CardPaymentIn(BaseModel):
    mode: Literal["full", "minimum", "other"]
    amount: PositiveMoney | None = None
    from_account_id: uuid.UUID


class InstallmentIn(BaseModel):
    purchase_id: uuid.UUID
    months: Literal[3, 6, 12, 18]


class PurchaseOut(Out):
    id: uuid.UUID
    merchant: str
    amount: Decimal
    installments: int | None
    created_at: datetime


# ---------- Transferencias ----------

class SinpeIn(BaseModel):
    from_account_id: uuid.UUID
    phone: Phone
    amount: PositiveMoney
    description: Annotated[str | None, Field(max_length=60)] = None


class IbanIn(BaseModel):
    from_account_id: uuid.UUID
    iban: Iban
    amount: PositiveMoney
    description: Annotated[str | None, Field(max_length=60)] = None


class PullIn(BaseModel):
    to_account_id: uuid.UUID
    linked_account_id: uuid.UUID | None = None
    new_iban: Iban | None = None
    amount: PositiveMoney


class TransferOut(Out):
    id: uuid.UUID
    kind: str
    amount: Decimal
    currency: str
    counterparty_name: str | None
    status: str
    reference: str
    created_at: datetime
    points_earned: int = 0


class LinkedAccountOut(Out):
    id: uuid.UUID
    bank_name: str
    label: str
    iban_masked: str
    authorized: bool


# ---------- Recibos ----------

class BillProviderOut(Out):
    id: str
    category: str
    name: str
    reference_label: str


class BillLookupIn(BaseModel):
    provider_id: Annotated[str, Field(max_length=40)]
    reference: Annotated[str, Field(min_length=3, max_length=40)]


class BillQuoteOut(BaseModel):
    provider_id: str
    provider_name: str
    reference: str
    holder: str
    amount: Decimal
    period: str
    due: str


class BillPayIn(BillLookupIn):
    from_account_id: uuid.UUID
    save: bool = True
    autopay: bool = False


class SavedBillOut(Out):
    id: uuid.UUID
    provider_id: str
    nickname: str
    reference: str
    autopay: bool
    autopay_cap: Decimal | None
    pending_amount: Decimal | None
    due_date: date | None
    provider_name: str = ""
    category: str = ""
    reference_label: str = ""


class SavedBillUpdateIn(BaseModel):
    autopay: bool
    # Tope: si el recibo llega por encima de este monto, se le consulta antes de pagar.
    autopay_cap: PositiveMoney | None = None


# ---------- Ahorro ----------

class RateOut(BaseModel):
    product: str
    term_months: int | None
    annual_rate: Decimal


class EnvelopeIn(BaseModel):
    name: Annotated[str, Field(min_length=2, max_length=60)]
    goal_amount: PositiveMoney
    months: Annotated[int, Field(ge=1, le=60)]
    mode: Literal["fixed", "roundup", "percent"]


class MoveIn(BaseModel):
    amount: PositiveMoney
    account_id: uuid.UUID = Field(description="Cuenta en colones de origen o destino")


class TermDepositIn(BaseModel):
    from_account_id: uuid.UUID
    amount: Annotated[Decimal, Field(ge=50_000, max_digits=16, decimal_places=2)]
    term_months: Literal[3, 6, 9, 12, 24, 36]
    on_maturity: Literal["renew", "to_account", "to_envelope"] = "renew"


# ---------- Préstamos ----------

class LoanSimIn(BaseModel):
    amount: Annotated[Decimal, Field(ge=100_000, le=50_000_000)]
    term_months: Annotated[int, Field(ge=6, le=120)]


class LoanOption(BaseModel):
    label: str
    term_months: int
    monthly_payment: Decimal
    total_paid: Decimal
    recommended: bool = False


class LoanSimOut(BaseModel):
    annual_rate: Decimal
    monthly_payment: Decimal
    options: list[LoanOption]


class LoanOfferOut(BaseModel):
    preapproved: bool
    max_amount: Decimal
    annual_rate: Decimal


class LoanApplicationIn(BaseModel):
    amount: Annotated[Decimal, Field(ge=100_000, le=50_000_000)]
    term_months: Annotated[int, Field(ge=6, le=120)]
    income_type: Literal["asalariado", "independiente", "pensionado"]
    monthly_income: PositiveMoney


class LoanDisburseIn(BaseModel):
    amount: Annotated[Decimal, Field(ge=100_000, le=50_000_000, max_digits=16, decimal_places=2)]
    term_months: Annotated[int, Field(ge=6, le=120)]
    to_account_id: uuid.UUID
    pin: Pin


class LoanDisburseOut(BaseModel):
    reference: str
    amount: Decimal
    term_months: int
    monthly_payment: Decimal
    first_due: date


class LoanApplicationOut(Out):
    id: uuid.UUID
    amount: Decimal
    term_months: int
    status: str
    created_at: datetime


# ---------- Recompensas ----------

class LevelOut(BaseModel):
    name: Literal["Bronce", "Plata", "Oro"]
    from_points: int
    points_multiplier: Decimal
    rate_bonus: Decimal
    reached: bool


class RewardsOut(BaseModel):
    points: int
    value_crc: Decimal
    level: Literal["Bronce", "Plata", "Oro"]
    points_lifetime: int = Field(description="Puntos acumulados en total: definen el nivel")
    next_level_at: int | None
    history: list[dict]
    levels: list[LevelOut] = []


class RedeemIn(BaseModel):
    destination: Literal["account", "loan", "envelope", "cause"]
    target_id: uuid.UUID | None = None


RedeemDestination = Literal["account", "loan", "envelope", "cause"]


class AutoRuleIO(BaseModel):
    destination: RedeemDestination | None = None


class RedeemOut(BaseModel):
    points_used: int
    value: Decimal
    multiplier: Decimal
    destination: str


# ---------- Ayuda ----------

class FraudReportIn(BaseModel):
    reason: Literal["unknown_charge", "lost_card", "stolen_phone", "suspicious_contact"]


class CaseOut(Out):
    number: str
    kind: str
    reason: str
    status: str
    cards_locked: int
    created_at: datetime
