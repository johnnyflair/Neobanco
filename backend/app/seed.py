"""Datos de prueba: catálogo de servicios y asociados ficticios con cuentas, tarjetas y movimientos.

    python -m app.seed            # agrega datos si la base está vacía
    python -m app.seed --reset    # borra y vuelve a sembrar (solo local, dev y test)

Asociada de demostración: celular 88112030, cédula 1-1234-0567, clave 482915.
"""

import asyncio
import random
import sys
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_secret, new_opaque_token
from app.db.models import (
    Account,
    AccountType,
    Base,
    BillProvider,
    Card,
    CardKind,
    CardPurchase,
    Currency,
    KycStatus,
    LinkedExternalAccount,
    LinkedMode,
    Member,
    RewardEntry,
    SavedBill,
    Transaction,
    Transfer,
    TransferKind,
)
from app.db.session import get_engine, sessionmaker
from app.providers.mock import KNOWN_PHONES
from app.services import new_reference

CATALOG = {
    "Acueductos y ASADAS": ("Número de servicio (NIS)", ["AyA", "ESPH Agua", "ASADA San Rafael de Aserrí"]),
    "Asociaciones y cámaras": ("Número de asociado", ["Asociación Solidarista ASEMAG", "Cámara de Comercio"]),
    "Cable y TV": ("Número de contrato", ["Liberty TV", "Telecable TV", "Kölbi TV"]),
    "CCSS": ("Número de cédula", ["Trabajador independiente", "Seguro voluntario"]),
    "Colegios profesionales": ("Número de colegiado", ["Colegio de Abogados", "CFIA", "Colegio de Médicos", "Colypro"]),
    "Condominios": ("Número de filial", ["Condominio Bosques de Lindora", "Torres de Paseo Colón"]),
    "Educación": ("Número de carné o cédula", ["UNED", "ULACIT", "Universidad Latina"]),
    "Electricidad": ("Número de servicio (NIS)", ["CNFL", "ICE", "ESPH", "JASEC", "Coopelesca", "Coopeguanacaste"]),
    "Empresas de seguridad": ("Número de cliente", ["ADT Costa Rica", "Prosegur", "G4S"]),
    "Marchamo y RTV": ("Número de placa", ["Marchamo 2027", "Revisión técnica", "Multas de tránsito"]),
    "Municipalidades": ("Número de finca o cédula", ["Municipalidad de San José", "Municipalidad de Escazú",
                                                     "Municipalidad de Aserrí", "Municipalidad de Cartago"]),
    "Recargas": ("Número de teléfono", ["Kölbi prepago", "Claro prepago", "Liberty prepago"]),
    "Seguros": ("Número de póliza", ["INS", "ASSA", "Mapfre"]),
    "Telefonía e internet": ("Número de teléfono o contrato", ["Kölbi", "Liberty", "Claro", "Telecable"]),
}

DEMO_MEMBERS = [
    ("Ana Rojas Mora", "1-1234-0567", "88112030", "ana.rojas@correo.com", "San José", "Aserrí"),
    ("Carlos Mora Solís", "2-0456-0789", "70231188", "carlos.mora@correo.com", "Alajuela", "Grecia"),
    ("Lucía Vargas Araya", "3-0321-0654", "61049932", "lucia.vargas@correo.com", "Cartago", "La Unión"),
]
DEMO_PIN = "482915"
MERCHANTS = ["Soda Doña Rosa", "Automercado", "Más x Menos", "Uber", "Farmacia Fischel", "Gasolinera Delta",
             "Pricesmart", "Café Britt", "Cinépolis", "Walmart"]


def _slug(t: str) -> str:
    import unicodedata

    t = "".join(c for c in unicodedata.normalize("NFD", t.lower()) if unicodedata.category(c) != "Mn")
    return "".join(c if c.isalnum() else "-" for c in t).strip("-")[:40]


async def seed(reset: bool = False) -> None:
    env = get_settings().env
    engine = get_engine()
    async with engine.begin() as conn:
        if reset:
            if env not in ("local", "dev", "test"):
                raise SystemExit("--reset solo se permite en local, dev o test")
            await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    rnd = random.Random(2030)  # nosec B311
    async with sessionmaker()() as s:
        if await s.scalar(select(Member.id).limit(1)):
            print("La base ya tiene datos; usá --reset para volver a sembrar.")
            return
        for cat, (label, names) in CATALOG.items():
            prefix = "recarga-" if cat == "Recargas" else "marchamo-" if cat == "Marchamo y RTV" else ""
            for n in names:
                s.add(BillProvider(id=prefix + _slug(n), category=cat, name=n, reference_label=label))
        await s.flush()

        pin_hash = hash_secret(DEMO_PIN)
        now = datetime.now(UTC)
        for i, (name, ced, phone, email, prov, canton) in enumerate(DEMO_MEMBERS):
            m = Member(full_name=name, cedula=ced, phone=phone, email=email, province=prov, canton=canton,
                       kyc_status=KycStatus.verified, pin_hash=pin_hash, points=1240 - i * 300,
                       points_lifetime=1240 - i * 300, created_at=now - timedelta(days=200))
            s.add(m)
            await s.flush()
            crc = Account(member_id=m.id, type=AccountType.savings, currency=Currency.CRC, name="Colones",
                          iban=f"CR2108150000001044172{i}", balance=Decimal("0"))
            usd = Account(member_id=m.id, type=AccountType.savings, currency=Currency.USD, name="Dólares",
                          iban=f"CR4808150000002088170{i}", balance=Decimal("1120.40"))
            cap = Account(member_id=m.id, type=AccountType.capital, currency=Currency.CRC, name="Capital social",
                          balance=Decimal("1850000"), monthly_contribution=Decimal("15000"))
            envs = [
                Account(member_id=m.id, type=AccountType.envelope, currency=Currency.CRC, name="Diciembre",
                        balance=Decimal("186000"), goal_amount=Decimal("300000"), rate=Decimal("3"),
                        savings_mode="Monto fijo · ₡5,000.00 por quincena"),
                Account(member_id=m.id, type=AccountType.envelope, currency=Currency.CRC, name="Viaje a Guanacaste",
                        balance=Decimal("126000"), goal_amount=Decimal("360000"), rate=Decimal("3"),
                        savings_mode="Redondeo de compras"),
                Account(member_id=m.id, type=AccountType.envelope, currency=Currency.CRC, name="Fondo de emergencia",
                        balance=Decimal("300000"), goal_amount=Decimal("600000"), rate=Decimal("3"),
                        savings_mode="10% de cada salario"),
            ]
            term = Account(member_id=m.id, type=AccountType.term, currency=Currency.CRC, name="Plazo 6 meses",
                           balance=Decimal("596000"), rate=Decimal("5.5"), term_months=6,
                           maturity_date=date(2027, 3, 12), on_maturity="renew")
            s.add_all([crc, usd, cap, *envs, term])
            await s.flush()

            # Movimientos de los últimos 60 días en la cuenta en colones; el saldo final queda en ₡248,500.00
            flows: list[tuple[datetime, Decimal, str, str]] = []
            for d in range(60, 0, -1):
                when = now - timedelta(days=d, hours=rnd.randint(0, 10))
                if d in (45, 15):
                    flows.append((when, Decimal("425000"), "Salario CoopeEjemplo", "salary"))
                if rnd.random() < 0.5:
                    amt = -Decimal(rnd.choice([2500, 4500, 8900, 12500, 18200, 23400]))
                    flows.append((when, amt, rnd.choice(MERCHANTS), "card"))
            flows.append((now - timedelta(hours=2), Decimal("15000"), "SINPE de María Rojas", "sinpe"))
            # SINPE enviados recientes: alimentan "Frecuentes" en la App.
            others = [p for p in ("88124455", "88902210", "60145522", *(d[2] for d in DEMO_MEMBERS)) if p != phone]
            sent = [(others[k], Decimal(v), now - timedelta(days=dd, hours=3))
                    for k, v, dd in ((0, 8000, 1), (1, 12000, 4), (3, 5000, 9), (2, 3500, 16))]
            for to, amt, when in sent:
                flows.append((when, -amt, f"SINPE a {KNOWN_PHONES[to][0]}", "sinpe"))
            flows.append((now - timedelta(days=5), Decimal("-285000"), "Pago de alquiler", "iban"))
            # Saldo inicial que hace que la cuenta termine en ₡248,500.00. Si los salarios dejan el
            # saldo inicial muy bajo, la diferencia sale como pago de la tarjeta de crédito, para que
            # la historia se vea normal y la cuenta cierre exacta.
            opening = Decimal("248500") - sum(f[1] for f in flows)
            if opening < Decimal("120000"):
                flows.append((now - timedelta(days=31), opening - Decimal("120000"), "Pago tarjeta de crédito", "card_payment"))
                opening = Decimal("120000")
            flows.sort(key=lambda f: f[0])
            bal = opening
            txs: list[Transaction] = [Transaction(account_id=crc.id, amount=opening, balance_after=opening,
                                                  description="Saldo anterior", category="opening",
                                                  created_at=now - timedelta(days=61))]
            for when, amt, desc, cat in flows:
                bal += amt
                txs.append(Transaction(account_id=crc.id, amount=amt, balance_after=bal, description=desc,
                                       category=cat, created_at=when))
            crc.balance = bal
            s.add_all(txs)
            s.add_all([Transfer(member_id=m.id, kind=TransferKind.sinpe, account_id=crc.id, amount=amt,
                                currency=Currency.CRC, counterparty=to, counterparty_name=KNOWN_PHONES[to][0],
                                reference=new_reference("SM"), created_at=when) for to, amt, when in sent])

            s.add(Card(member_id=m.id, kind=CardKind.debit, product_name="Débito digital", brand="Mastercard",
                       last4=f"44{17 + i}", processor_token=new_opaque_token()[:40],
                       holder_name=" ".join(name.split()[:2]), expiry="09/29", linked_mode=LinkedMode.crc))
            credit = Card(member_id=m.id, kind=CardKind.credit, product_name="Clásica", brand="Mastercard",
                          last4=f"90{32 + i}", processor_token=new_opaque_token()[:40],
                          holder_name=" ".join(name.split()[:2]), expiry="03/30", credit_limit=Decimal("1000000"),
                          credit_balance=Decimal("186450"), statement_day=25, due_date=date(2026, 11, 10))
            s.add(credit)
            await s.flush()
            for merch, price, days in (("Gollo · Televisor 55\"", 240000, 8), ("Ekono · Lavadora", 185000, 14),
                                     ("Aerolínea · Boletos", 312000, 23)):
                s.add(CardPurchase(card_id=credit.id, merchant=merch, amount=Decimal(price),
                                   created_at=now - timedelta(days=days)))
            s.add_all([
                LinkedExternalAccount(member_id=m.id, bank_name="BAC Credomatic", iban=f"CR7601020000000033{91 + i}",
                                      label="Ahorros colones", authorized=True),
                LinkedExternalAccount(member_id=m.id, bank_name="Banco Nacional", iban=f"CR1501510000000000{72 + i}",
                                      label="Cuenta corriente", authorized=True),
            ])
            for pid, ref, nick, auto, pending, due in (("cnfl", "1234567", "CNFL · luz", False, 24300, 1),
                                                   ("kolbi", "88112030", "Internet hogar", False, 21900, 10),
                                                   ("aya", "7781203", "AyA · agua", True, 9800, 8)):
                s.add(SavedBill(member_id=m.id, provider_id=pid, reference=ref, nickname=nick, autopay=auto,
                                autopay_cap=Decimal("40000") if auto else None, pending_amount=Decimal(pending),
                                due_date=(now + timedelta(days=due)).date()))
            s.add_all([RewardEntry(member_id=m.id, points=500, reason="Bienvenida",
                                   created_at=now - timedelta(days=200)),
                       RewardEntry(member_id=m.id, points=186, reason="Compras con tarjeta en octubre"),
                       RewardEntry(member_id=m.id, points=20, reason="Recibo AyA automático")])
        await s.commit()
    print(f"Listo: {len(DEMO_MEMBERS)} asociados de prueba. Clave de todos: {DEMO_PIN}")


if __name__ == "__main__":
    asyncio.run(seed(reset="--reset" in sys.argv))
