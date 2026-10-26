from dataclasses import dataclass

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.providers.base import (
    BillAggregator,
    CardProcessor,
    CoreBanking,
    IdentityVerifier,
    Messenger,
    SinpeGateway,
)
from app.providers.mock import MockBills, MockCards, MockCore, MockIdentity, MockMessenger, MockSinpe


@dataclass
class Providers:
    core: CoreBanking
    cards: CardProcessor
    sinpe: SinpeGateway
    bills: BillAggregator
    identity: IdentityVerifier
    messenger: Messenger


def get_providers(session: AsyncSession = Depends(get_session)) -> Providers:
    # Punto único de cambio: aquí se elegirá la implementación real según NEO_PROVIDER.
    return Providers(
        core=MockCore(session),
        cards=MockCards(session),
        sinpe=MockSinpe(),
        bills=MockBills(),
        identity=MockIdentity(),
        messenger=MockMessenger(),
    )
