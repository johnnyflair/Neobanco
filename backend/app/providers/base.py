"""Contratos con los sistemas de la cooperativa y de terceros.

Cada endpoint habla con estas interfaces, nunca directo con un sistema externo. Para conectar
la App a una cooperativa real se implementa cada contrato contra su sistema (core bancario,
procesador de tarjetas, SINPE, agregador de pagos, Didit, proveedor de SMS) y se elige con
NEO_PROVIDER=<nombre>. Los endpoints, la App y las pruebas no cambian.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from app.db.models import Account, Card, Transaction


class InsufficientFunds(Exception):
    pass


class CoreBanking(Protocol):
    async def list_accounts(self, member_id: uuid.UUID) -> list[Account]: ...
    async def get_account(self, member_id: uuid.UUID, account_id: uuid.UUID) -> Account | None: ...
    async def list_transactions(self, account_id: uuid.UUID, limit: int,
                                before: str | None) -> list[Transaction]: ...
    async def list_transactions_many(self, account_ids: list[uuid.UUID], limit: int,
                                     before: str | None) -> list[Transaction]:
        """Movimientos de varias cuentas a la vez, del más nuevo al más viejo."""
        ...
    async def post(self, account_id: uuid.UUID, amount: Decimal, description: str, category: str,
                   reference: str | None = None, counterparty: str | None = None,
                   detail: str | None = None) -> Transaction:
        """Asienta un movimiento con bloqueo de fila. amount < 0 debita; lanza InsufficientFunds."""
        ...
    async def open_account(self, account: Account) -> Account: ...


class CardProcessor(Protocol):
    async def list_cards(self, member_id: uuid.UUID) -> list[Card]: ...
    async def get_card(self, member_id: uuid.UUID, card_id: uuid.UUID) -> Card | None: ...
    async def reveal(self, card: Card) -> dict[str, str]:
        """Datos completos de la tarjeta. En producción el procesador devuelve una vista segura
        de un solo uso (PCI DSS); el backend nunca ve ni guarda el número completo."""
        ...


@dataclass
class SinpeContact:
    phone: str
    display_name: str
    bank: str


class SinpeGateway(Protocol):
    async def lookup_phone(self, phone: str) -> SinpeContact | None: ...
    async def lookup_iban(self, iban: str) -> str | None: ...
    async def send(self, reference: str, amount: Decimal, to: str) -> str: ...
    async def pull(self, reference: str, amount: Decimal, from_iban: str) -> str: ...


@dataclass
class BillQuote:
    provider_id: str
    reference: str
    holder: str
    amount: Decimal
    period: str
    due: str


class BillAggregator(Protocol):
    async def lookup(self, provider_id: str, reference: str, holder_hint: str) -> BillQuote | None: ...
    async def pay(self, quote: BillQuote, tx_reference: str) -> str: ...


class IdentityVerifier(Protocol):
    async def verify(self, cedula: str, selfie_ok: bool) -> str:
        """Devuelve verified, in_review o rejected (Didit en producción)."""
        ...


class Messenger(Protocol):
    async def send_otp(self, phone: str, code: str, channel: str) -> None: ...
    async def notify(self, phone: str, message: str) -> None: ...
