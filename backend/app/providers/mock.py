"""Implementación simulada: usa la base de datos local como core bancario y responde datos
falsos pero coherentes para SINPE, el agregador de pagos, Didit y SMS."""

import hashlib
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Account, Card, Transaction
from app.providers.base import BillQuote, InsufficientFunds, SinpeContact

log = structlog.get_logger()

CENT = Decimal("0.01")


class MockCore:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def list_accounts(self, member_id: uuid.UUID) -> list[Account]:
        rows = await self.s.scalars(
            select(Account).where(Account.member_id == member_id, Account.is_open.is_(True))
        )
        rank = {"savings": 0, "capital": 1, "envelope": 2, "term": 3}
        return sorted(rows, key=lambda a: (rank[a.type.value], a.currency.value != "CRC", a.created_at, a.name))

    async def get_account(self, member_id: uuid.UUID, account_id: uuid.UUID) -> Account | None:
        return await self.s.scalar(
            select(Account).where(Account.id == account_id, Account.member_id == member_id)
        )

    async def list_transactions(self, account_id: uuid.UUID, limit: int,
                                before: str | None) -> list[Transaction]:
        q = select(Transaction).where(Transaction.account_id == account_id)
        if before:
            q = q.where(Transaction.created_at < datetime.fromisoformat(before))
        rows = await self.s.scalars(q.order_by(Transaction.created_at.desc()).limit(limit))
        return list(rows)

    async def list_transactions_many(self, account_ids: list[uuid.UUID], limit: int,
                                     before: str | None) -> list[Transaction]:
        # El "saldo anterior" de apertura no es un movimiento real: no va en la vista combinada.
        q = select(Transaction).where(Transaction.account_id.in_(account_ids), Transaction.category != "opening")
        if before:
            q = q.where(Transaction.created_at < datetime.fromisoformat(before))
        rows = await self.s.scalars(q.order_by(Transaction.created_at.desc()).limit(limit))
        return list(rows)

    async def post(self, account_id: uuid.UUID, amount: Decimal, description: str, category: str,
                   reference: str | None = None, counterparty: str | None = None,
                   detail: str | None = None) -> Transaction:
        acct = await self.s.scalar(select(Account).where(Account.id == account_id).with_for_update())
        if acct is None:
            raise LookupError("account")
        amount = amount.quantize(CENT)
        new_balance = (acct.balance + amount).quantize(CENT)
        if new_balance < 0:
            raise InsufficientFunds()
        acct.balance = new_balance
        tx = Transaction(account_id=acct.id, amount=amount, balance_after=new_balance,
                         description=description[:140], category=category, reference=reference,
                         counterparty=counterparty, detail=detail)
        self.s.add(tx)
        await self.s.flush()
        return tx

    async def open_account(self, account: Account) -> Account:
        self.s.add(account)
        await self.s.flush()
        return account

    async def close_account(self, account: Account) -> None:
        account.is_open = False
        await self.s.flush()


class MockCards:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def list_cards(self, member_id: uuid.UUID) -> list[Card]:
        return list(await self.s.scalars(select(Card).where(Card.member_id == member_id).order_by(Card.kind)))

    async def get_card(self, member_id: uuid.UUID, card_id: uuid.UUID) -> Card | None:
        return await self.s.scalar(select(Card).where(Card.id == card_id, Card.member_id == member_id))

    async def reveal(self, card: Card) -> dict[str, str]:
        digest = hashlib.sha256(card.processor_token.encode()).hexdigest()
        body = "".join(str(int(c, 16) % 10) for c in digest[:12])
        return {"pan": f"5{body[:11]}{card.last4}", "cvv": body[-3:], "expiry": card.expiry}


_FIRST = ["María", "José", "Luis", "Carmen", "Andrés", "Sofía", "Daniel", "Valeria", "Carlos", "Lucía"]
_LAST = ["Rojas", "Mora", "Jiménez", "Vargas", "Solís", "Castro", "Araya", "Quesada", "Chaves", "Brenes"]
_BANKS = ["BAC Credomatic", "Banco Nacional", "Banco de Costa Rica", "Banco Popular", "Coopenae"]


def _pick(seed: str, items: list[str], salt: str = "") -> str:
    h = int(hashlib.sha256((seed + salt).encode()).hexdigest(), 16)
    return items[h % len(items)]


# Directorio fijo para que los datos de prueba sean coherentes (contactos frecuentes, asociados demo).
KNOWN_PHONES = {
    "88112030": ("Ana Rojas M.", "Coopecaja"),
    "70231188": ("Carlos Mora S.", "Coopecaja"),
    "61049932": ("Lucía Vargas A.", "Coopecaja"),
    "88124455": ("María Rojas M.", "BAC Credomatic"),
    "88902210": ("Marta Araya V.", "Banco Nacional"),
    "60145522": ("Luis Castro Q.", "Banco Popular"),
}


class MockSinpe:
    async def lookup_phone(self, phone: str) -> SinpeContact | None:
        if phone.endswith("0000"):
            return None  # número sin SINPE Móvil
        if phone in KNOWN_PHONES:
            known, bank = KNOWN_PHONES[phone]
            return SinpeContact(phone=phone, display_name=known, bank=bank)
        name = f"{_pick(phone, _FIRST)} {_pick(phone, _LAST, 'a')} {_pick(phone, _LAST, 'b')[0]}."
        return SinpeContact(phone=phone, display_name=name, bank=_pick(phone, _BANKS))

    async def lookup_iban(self, iban: str) -> str | None:
        return f"{_pick(iban, _FIRST)} {_pick(iban, _LAST, 'x')} {_pick(iban, _LAST, 'y')}"

    async def send(self, reference: str, amount: Decimal, to: str) -> str:
        log.info("sinpe_send", reference=reference)
        return "completed"

    async def pull(self, reference: str, amount: Decimal, from_iban: str) -> str:
        log.info("sinpe_pull", reference=reference)
        return "completed"


class MockBills:
    async def lookup(self, provider_id: str, reference: str, holder_hint: str) -> BillQuote | None:
        if reference.endswith("000"):
            return None
        h = int(hashlib.sha256(f"{provider_id}:{reference}".encode()).hexdigest(), 16)
        if provider_id.startswith("recarga"):
            amount = Decimal("5000")
        elif provider_id.startswith("marchamo"):
            amount = Decimal(185000 + (h % 90000))
        else:
            amount = Decimal(8000 + (h % 40000) // 100 * 100)
        now = datetime.now(UTC)
        return BillQuote(provider_id=provider_id, reference=reference, holder=holder_hint,
                         amount=amount.quantize(CENT), period=now.strftime("%Y-%m"),
                         due=now.replace(day=28).date().isoformat())

    async def pay(self, quote: BillQuote, tx_reference: str) -> str:
        log.info("bill_paid", provider=quote.provider_id)
        return f"AGR-{tx_reference[-8:]}"


class MockIdentity:
    async def verify(self, cedula: str, selfie_ok: bool) -> str:
        # Regla de prueba: cédulas terminadas en 0 quedan en revisión manual.
        if not selfie_ok:
            return "rejected"
        return "in_review" if cedula.replace("-", "").endswith("0") else "verified"


class MockMessenger:
    async def send_otp(self, phone: str, code: str, channel: str) -> None:
        log.info("otp_sent", channel=channel)

    async def notify(self, phone: str, message: str) -> None:
        log.info("notification_sent")
