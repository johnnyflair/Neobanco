"""Modelo de datos. Los montos se guardan como NUMERIC(18,2): nunca float para plata.

Hoy estas tablas hacen de "core bancario simulado". Cuando se conecte el core real de la
cooperativa, las tablas de productos (cuentas, tarjetas, movimientos) pasan a ser una caché o
desaparecen detrás del adaptador en app/providers; las de seguridad (sesiones, OTP, auditoría,
idempotencia) siguen viviendo aquí.
"""

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

Money = Numeric(18, 2)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class KycStatus(enum.StrEnum):
    pending = "pending"
    in_review = "in_review"
    verified = "verified"
    rejected = "rejected"


class AccountType(enum.StrEnum):
    savings = "savings"  # cuenta a la vista (colones o dólares)
    capital = "capital"  # capital social
    envelope = "envelope"  # sobre a la vista
    term = "term"  # ahorro a plazo


class Currency(enum.StrEnum):
    CRC = "CRC"
    USD = "USD"


class CardKind(enum.StrEnum):
    debit = "debit"
    credit = "credit"


class CardStatus(enum.StrEnum):
    active = "active"
    locked = "locked"


class LinkedMode(enum.StrEnum):
    crc = "crc"
    usd = "usd"
    auto = "auto"


class Member(TimestampMixin, Base):
    __tablename__ = "members"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cedula: Mapped[str] = mapped_column(String(20), unique=True)
    phone: Mapped[str] = mapped_column(String(15), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160))
    province: Mapped[str] = mapped_column(String(40))
    canton: Mapped[str] = mapped_column(String(60))
    kyc_status: Mapped[KycStatus] = mapped_column(Enum(KycStatus, name="kyc_status"), default=KycStatus.pending)
    pin_hash: Mapped[str] = mapped_column(String(200))
    failed_pin_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    points: Mapped[int] = mapped_column(Integer, default=0)
    points_lifetime: Mapped[int] = mapped_column(Integer, default=0)

    accounts: Mapped[list["Account"]] = relationship(back_populates="member")


class Account(TimestampMixin, Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id", ondelete="RESTRICT"), index=True)
    type: Mapped[AccountType] = mapped_column(Enum(AccountType, name="account_type"))
    currency: Mapped[Currency] = mapped_column(Enum(Currency, name="currency"))
    name: Mapped[str] = mapped_column(String(80))
    iban: Mapped[str | None] = mapped_column(String(34), unique=True)
    balance: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    goal_amount: Mapped[Decimal | None] = mapped_column(Money)
    savings_mode: Mapped[str | None] = mapped_column(String(80))
    rate: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    term_months: Mapped[int | None] = mapped_column(Integer)
    maturity_date: Mapped[date | None] = mapped_column(Date)
    on_maturity: Mapped[str | None] = mapped_column(String(40))
    monthly_contribution: Mapped[Decimal | None] = mapped_column(Money)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)

    member: Mapped[Member] = relationship(back_populates="accounts")


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (Index("ix_tx_account_created", "account_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    amount: Mapped[Decimal] = mapped_column(Money)  # positivo entra, negativo sale
    balance_after: Mapped[Decimal] = mapped_column(Money)
    description: Mapped[str] = mapped_column(String(140))
    category: Mapped[str] = mapped_column(String(30))
    reference: Mapped[str | None] = mapped_column(String(40))


class Card(TimestampMixin, Base):
    __tablename__ = "cards"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    kind: Mapped[CardKind] = mapped_column(Enum(CardKind, name="card_kind"))
    product_name: Mapped[str] = mapped_column(String(40))
    brand: Mapped[str] = mapped_column(String(20))
    last4: Mapped[str] = mapped_column(String(4))
    # El número completo nunca se guarda aquí: vive tokenizado en el procesador (PCI DSS).
    processor_token: Mapped[str] = mapped_column(String(64))
    holder_name: Mapped[str] = mapped_column(String(60))
    expiry: Mapped[str] = mapped_column(String(5))
    status: Mapped[CardStatus] = mapped_column(Enum(CardStatus, name="card_status"), default=CardStatus.active)
    online_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    international_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    linked_mode: Mapped[LinkedMode | None] = mapped_column(Enum(LinkedMode, name="linked_mode"))
    limit_store: Mapped[Decimal] = mapped_column(Money, default=Decimal("300000"))
    limit_online: Mapped[Decimal] = mapped_column(Money, default=Decimal("200000"))
    limit_atm: Mapped[Decimal] = mapped_column(Money, default=Decimal("150000"))
    credit_limit: Mapped[Decimal | None] = mapped_column(Money)
    credit_balance: Mapped[Decimal | None] = mapped_column(Money)
    statement_day: Mapped[int | None] = mapped_column(Integer)
    due_date: Mapped[date | None] = mapped_column(Date)


class CardPurchase(TimestampMixin, Base):
    """Compras de tarjeta de crédito (base para pasar a cuotas)."""

    __tablename__ = "card_purchases"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cards.id"), index=True)
    merchant: Mapped[str] = mapped_column(String(80))
    amount: Mapped[Decimal] = mapped_column(Money)
    installments: Mapped[int | None] = mapped_column(Integer)


class TransferKind(enum.StrEnum):
    sinpe = "sinpe"
    iban = "iban"
    pull = "pull"


class Transfer(TimestampMixin, Base):
    __tablename__ = "transfers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    kind: Mapped[TransferKind] = mapped_column(Enum(TransferKind, name="transfer_kind"))
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"))
    amount: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[Currency] = mapped_column(Enum(Currency, name="currency"))
    counterparty: Mapped[str] = mapped_column(String(60))
    counterparty_name: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(String(140))
    status: Mapped[str] = mapped_column(String(20), default="completed")
    reference: Mapped[str] = mapped_column(String(40))


class LinkedExternalAccount(TimestampMixin, Base):
    """Cuentas propias en otros bancos autorizadas para traer dinero (débito en tiempo real)."""

    __tablename__ = "linked_external_accounts"
    __table_args__ = (UniqueConstraint("member_id", "iban"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    bank_name: Mapped[str] = mapped_column(String(60))
    iban: Mapped[str] = mapped_column(String(34))
    label: Mapped[str] = mapped_column(String(60))
    authorized: Mapped[bool] = mapped_column(Boolean, default=False)


class BillProvider(Base):
    __tablename__ = "bill_providers"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    category: Mapped[str] = mapped_column(String(60), index=True)
    name: Mapped[str] = mapped_column(String(80))
    reference_label: Mapped[str] = mapped_column(String(60))


class SavedBill(TimestampMixin, Base):
    __tablename__ = "saved_bills"
    __table_args__ = (UniqueConstraint("member_id", "provider_id", "reference"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    provider_id: Mapped[str] = mapped_column(ForeignKey("bill_providers.id"))
    reference: Mapped[str] = mapped_column(String(40))
    nickname: Mapped[str] = mapped_column(String(60))
    autopay: Mapped[bool] = mapped_column(Boolean, default=False)
    autopay_cap: Mapped[Decimal | None] = mapped_column(Money)
    pending_amount: Mapped[Decimal | None] = mapped_column(Money)
    due_date: Mapped[date | None] = mapped_column(Date)


class LoanApplication(TimestampMixin, Base):
    __tablename__ = "loan_applications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    term_months: Mapped[int] = mapped_column(Integer)
    income_type: Mapped[str] = mapped_column(String(30))
    monthly_income: Mapped[Decimal] = mapped_column(Money)
    status: Mapped[str] = mapped_column(String(20), default="received")


class RewardEntry(TimestampMixin, Base):
    __tablename__ = "reward_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    points: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(120))


# ---------- Seguridad ----------


class OtpChallenge(TimestampMixin, Base):
    __tablename__ = "otp_challenges"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(15), index=True)
    code_hash: Mapped[str] = mapped_column(String(200))
    channel: Mapped[str] = mapped_column(String(10))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)


class RefreshToken(TimestampMixin, Base):
    """Refresh tokens rotativos por familia: si se reusa uno ya rotado, se revoca toda la familia."""

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    rotated: Mapped[bool] = mapped_column(Boolean, default=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    device: Mapped[str | None] = mapped_column(String(120))


class IdempotencyRecord(TimestampMixin, Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("member_id", "key"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"))
    key: Mapped[str] = mapped_column(String(80))
    request_hash: Mapped[str] = mapped_column(String(64))
    status_code: Mapped[int] = mapped_column(Integer)
    response: Mapped[dict] = mapped_column(JSON)


class AuditEvent(TimestampMixin, Base):
    """Bitácora inmutable de acciones sensibles. Sin datos personales en claro."""

    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_member_created", "member_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("members.id"))
    action: Mapped[str] = mapped_column(String(60))
    outcome: Mapped[str] = mapped_column(String(20))
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    request_id: Mapped[str | None] = mapped_column(String(40))
    detail: Mapped[dict | None] = mapped_column(JSON)
