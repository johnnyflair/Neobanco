"""Datos de prueba: catálogo de servicios y asociados ficticios con cuentas, tarjetas y movimientos.

    python -m app.seed            # agrega datos si la base está vacía
    python -m app.seed --reset    # borra y vuelve a sembrar (solo local, dev y test)

Asociado de pruebas (Johnny): celular 88112030, cédula 1-1234-0567, clave 482915.
Panel (/admin), solo en local, dev y test: diana@demo.coop (operaciones), johnny@demo.coop (admin) y
lectura@demo.coop (solo lectura), todos con la contraseña Panel-Demo-2026.
"""

import asyncio
import random
import sys
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_secret, new_opaque_token
from app.db.models import (
    Account,
    AccountType,
    AuditEvent,
    Base,
    BillProvider,
    Card,
    CardKind,
    CardPurchase,
    Currency,
    KycStatus,
    LinkedExternalAccount,
    LinkedMode,
    LoanApplication,
    Member,
    RewardEntry,
    SavedBill,
    StaffRole,
    StaffUser,
    SupportCase,
    Transaction,
    Transfer,
    TransferKind,
)
from app.db.session import get_engine, sessionmaker
from app.providers.mock import KNOWN_PHONES, MockBills
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
    ("Johnny Schmidt Rojas", "1-1234-0567", "88112030", "johnny.schmidt@correo.com", "San José", "Aserrí"),
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
            await demo_panel(s)
            await demo_visitor(s)
            await rename_test_member(s)
            return
        for cat, (label, names) in CATALOG.items():
            prefix = "recarga-" if cat == "Recargas" else "marchamo-" if cat == "Marchamo y RTV" else ""
            for n in names:
                s.add(BillProvider(id=prefix + _slug(n), category=cat, name=n, reference_label=label))
        await s.flush()

        pin_hash = hash_secret(DEMO_PIN)
        now = datetime.now(UTC)
        for i, (name, ced, phone, email, prov, canton) in enumerate(DEMO_MEMBERS):
            await _build_member(s, i, name, ced, phone, email, prov, canton, pin_hash, now, rnd)
        await s.commit()
        await demo_panel(s)
        await demo_visitor(s)
    print(f"Listo: {len(DEMO_MEMBERS)} asociados de prueba. Clave de todos: {DEMO_PIN}")


async def _build_member(s: AsyncSession, i: int, name: str, ced: str, phone: str, email: str, prov: str,
                        canton: str, pin_hash: str, now: datetime, rnd: random.Random,
                        demo: bool = False) -> None:
    """Asociado completo de ejemplo: cuentas, sobres, plazo, tarjetas, recibos, puntos y 60 días de historia."""
    pts = DEMO_VISITOR_POINTS if demo else max(1240 - i * 300, 110)
    m = Member(full_name=name, cedula=ced, phone=phone, email=email, province=prov, canton=canton,
               kyc_status=KycStatus.verified, pin_hash=pin_hash, points=pts, points_lifetime=pts,
               created_at=now - timedelta(days=200), is_demo=demo)
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
    # (cuándo, monto, descripción, categoría, contraparte, detalle)
    flows: list[tuple[datetime, Decimal, str, str, str | None, str | None]] = []
    card_ref = f"Débito •••• 44{17 + i}"
    for d in range(60, 0, -1):
        when = now - timedelta(days=d, hours=rnd.randint(0, 10))
        if d in (45, 15):
            flows.append((when, Decimal("425000"), "Salario CoopeEjemplo", "salary", "CoopeEjemplo",
                          "Planilla"))
        if rnd.random() < 0.5:
            amt = -Decimal(rnd.choice([2500, 4500, 8900, 12500, 18200, 23400]))
            shop = rnd.choice(MERCHANTS)
            flows.append((when, amt, shop, "card", shop, card_ref))
    flows.append((now - timedelta(hours=2), Decimal("15000"), "SINPE de María Rojas", "sinpe", "María Rojas",
                  "88124455"))
    # SINPE enviados recientes: alimentan "Frecuentes" en la App.
    others = [p for p in ("88124455", "88902210", "60145522", *(d[2] for d in DEMO_MEMBERS)) if p != phone]
    sent = [(others[k], Decimal(v), now - timedelta(days=dd, hours=3))
            for k, v, dd in ((0, 8000, 1), (1, 12000, 4), (3, 5000, 9), (2, 3500, 16))]
    for to, amt, when in sent:
        flows.append((when, -amt, f"SINPE a {KNOWN_PHONES[to][0]}", "sinpe", KNOWN_PHONES[to][0], to))
    flows.append((now - timedelta(days=5), Decimal("-285000"), "Pago de alquiler", "iban",
                  "Inmobiliaria Los Robles", "CR05 •••• 4066"))
    # Saldo inicial que hace que la cuenta termine en ₡248,500.00. Si los salarios dejan el
    # saldo inicial muy bajo, la diferencia sale como pago de la tarjeta de crédito, para que
    # la historia se vea normal y la cuenta cierre exacta.
    opening = Decimal("248500") - sum(f[1] for f in flows)
    if opening < Decimal("120000"):
        flows.append((now - timedelta(days=31), opening - Decimal("120000"),
                      "Pago tarjeta de crédito", "card_payment", None, None))
        opening = Decimal("120000")
    flows.sort(key=lambda f: f[0])
    bal = opening
    txs: list[Transaction] = [Transaction(account_id=crc.id, amount=opening, balance_after=opening,
                                          description="Saldo anterior", category="opening",
                                          created_at=now - timedelta(days=61))]
    for when, amt, desc, cat, cp, det in flows:
        bal += amt
        txs.append(Transaction(account_id=crc.id, amount=amt, balance_after=bal, description=desc,
                               category=cat, created_at=when, counterparty=cp, detail=det,
                               reference=new_reference("MV")))
    crc.balance = bal
    s.add_all(txs)

    # Historia también en dólares, sobres, plazo y capital, para que "Todas" se vea real.
    # Cada cuenta cierra en el saldo con el que se creó.
    def history(acct: Account, moves: list[tuple[int, Decimal, str, str, str | None, str | None]]) -> None:
        first = now - timedelta(days=max(d for d, *_ in moves) + 1)
        running = acct.balance - sum(mv[1] for mv in moves)
        rows = [Transaction(account_id=acct.id, amount=running, balance_after=running,
                            description="Saldo anterior", category="opening", created_at=first)]
        for d, amt, desc, cat, cp, det in sorted(moves, key=lambda mv: -mv[0]):
            running += amt
            rows.append(Transaction(account_id=acct.id, amount=amt, balance_after=running, description=desc,
                                    category=cat, counterparty=cp, detail=det, reference=new_reference("MV"),
                                    created_at=now - timedelta(days=d, hours=rnd.randint(1, 9))))
        s.add_all(rows)

    usd_card = f"Débito •••• 44{17 + i}"
    history(usd, [(1, Decimal("-24.99"), "Amazon", "card", "Amazon", usd_card),
                  (6, Decimal("-15.49"), "Netflix", "card", "Netflix", usd_card),
                  (12, Decimal("350.00"), "Transferencia de Juan Pérez", "iban", "Juan Pérez",
                   "CR61 •••• 2231"),
                  (20, Decimal("-9.99"), "Spotify", "card", "Spotify", usd_card)])
    history(envs[0], [(d, Decimal("5000"), "Ahorro automático", "envelope", None, "Monto fijo")
                      for d in (0, 15, 30, 45)])
    history(envs[1], [(d, Decimal(v), "Redondeo de compras", "envelope", None, "Redondeo")
                      for d, v in ((2, 500), (8, 1100), (19, 900))])
    history(envs[2], [(d, Decimal("42500"), "10% del salario", "envelope", None, "Salario")
                      for d in (15, 45)])
    history(cap, [(d, Decimal("15000"), "Aporte mensual", "capital", "Cooperativa", "Aporte de asociado")
                  for d in (3, 33)])
    history(term, [(40, Decimal("2731.67"), "Intereses del mes", "term", None, "5.5% anual")])
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
    for pid, ref, nick, auto, due in (("cnfl", "1234567", "CNFL · luz", False, 1),
                                      ("kolbi", "88112030", "Internet hogar", False, 10),
                                      ("aya", "7781203", "AyA · agua", True, 8)):
        # El pendiente es el mismo monto que cobra el recaudador simulado, como pasaría con uno real.
        quote = await MockBills().lookup(pid, ref, m.full_name)
        s.add(SavedBill(member_id=m.id, provider_id=pid, reference=ref, nickname=nick, autopay=auto,
                        autopay_cap=Decimal("40000") if auto else None,
                        pending_amount=quote.amount if quote else None,
                        due_date=(now + timedelta(days=due)).date()))
    s.add_all([RewardEntry(member_id=m.id, points=500, reason="Bienvenida",
                           created_at=now - timedelta(days=200)),
               RewardEntry(member_id=m.id, points=186, reason="Compras con tarjeta en octubre"),
               RewardEntry(member_id=m.id, points=20, reason="Recibo AyA automático")])


async def rename_test_member(s: AsyncSession) -> None:
    """El asociado de pruebas (88112030) lleva el nombre de Johnny. Actualiza bases ya sembradas."""
    if get_settings().env not in ("local", "dev", "test"):
        return
    name, _, phone, email, *_ = DEMO_MEMBERS[0]
    m = await s.scalar(select(Member).where(Member.phone == phone))
    if m is None or m.full_name == name:
        return
    m.full_name, m.email = name, email
    for card in await s.scalars(select(Card).where(Card.member_id == m.id)):
        card.holder_name = " ".join(name.split()[:2])
    await s.commit()


# Demo para visitantes ("Explorar" en la bienvenida): una asociada ficticia de solo lectura.
DEMO_VISITOR = ("Ana Rojas Mora", "9-0000-0001", "80000001", "demo@kooa.cr", "San José", "Aserrí")
DEMO_VISITOR_POINTS = 10_000  # nivel Oro: la demo muestra el programa de puntos completo


async def demo_visitor(s: AsyncSession) -> None:
    """Crea la asociada de la demo si falta. Solo en local, dev y test."""
    if get_settings().env not in ("local", "dev", "test"):
        return
    existing = await s.scalar(select(Member).where(Member.is_demo.is_(True)).limit(1))
    if existing is not None:
        # Si la demo ya existía, se le dejan los puntos de la demo (la demo no puede canjear).
        if existing.points != DEMO_VISITOR_POINTS:
            diff = DEMO_VISITOR_POINTS - existing.points
            s.add(RewardEntry(member_id=existing.id, points=diff, reason="Bono de bienvenida a la demo"))
            existing.points = DEMO_VISITOR_POINTS
            existing.points_lifetime = max(existing.points_lifetime + max(diff, 0), DEMO_VISITOR_POINTS)
            await s.commit()
        return
    rnd = random.Random(2031)  # nosec B311
    # Nadie entra con clave a la demo: se usa una clave aleatoria imposible de adivinar.
    await _build_member(s, len(DEMO_MEMBERS), *DEMO_VISITOR, hash_secret(new_opaque_token()), datetime.now(UTC), rnd,
                        demo=True)
    await s.commit()


# Solo datos de demostración (local, dev y test).
DEMO_PANEL_PASSWORD = "Panel-Demo-2026"  # nosec B105
DEMO_STAFF = [("diana@demo.coop", "Diana M.", StaffRole.operaciones),
              ("johnny@demo.coop", "Johnny S.", StaffRole.admin),
              ("lectura@demo.coop", "Consulta", StaffRole.lectura)]
DEMO_REVIEW = [("María Fernanda Solís", "1-1745-0980", "87014455", "mf.solis@correo.com", "Heredia", "Barva",
                {"occupation": "asalariado", "monthly_volume": "500k_1500k", "source_of_funds": "salario"}, 3),
               ("Jimena Vargas Mora", "1-1602-0770", "60123399", "jime.vargas@correo.com", "San José", "Moravia",
                {"occupation": "negocio_propio", "monthly_volume": "lt_500k", "source_of_funds": "ventas"}, 2)]


async def demo_panel(s: AsyncSession) -> None:
    """Equipo y pendientes de ejemplo para el panel. Solo en local, dev y test; no duplica nada."""
    if get_settings().env not in ("local", "dev", "test"):
        return
    now = datetime.now(UTC)
    if not await s.scalar(select(StaffUser.id).limit(1)):
        pwd = hash_secret(DEMO_PANEL_PASSWORD)
        for email, name, role in DEMO_STAFF:
            s.add(StaffUser(email=email, full_name=name, role=role, password_hash=pwd, active=True, failed_attempts=0))
    if not await s.scalar(select(Member.id).where(Member.kyc_status == KycStatus.in_review).limit(1)):
        for name, ced, phone, email, prov, canton, kyc, hours in DEMO_REVIEW:
            if await s.scalar(select(Member.id).where(Member.phone == phone)):
                continue
            m = Member(cedula=ced, phone=phone, full_name=name, email=email, province=prov, canton=canton,
                       kyc_status=KycStatus.in_review, pin_hash=hash_secret(DEMO_PIN),
                       created_at=now - timedelta(hours=hours))
            s.add(m)
            await s.flush()
            s.add(AuditEvent(member_id=m.id, action="register", outcome="in_review", detail={"kyc": kyc},
                             created_at=m.created_at))
    members = list(await s.scalars(select(Member).where(Member.phone.in_([d[2] for d in DEMO_MEMBERS]))))
    by_phone = {m.phone: m for m in members}
    carlos, lucia = by_phone.get(DEMO_MEMBERS[1][2]), by_phone.get(DEMO_MEMBERS[2][2])
    if carlos and not await s.scalar(select(LoanApplication.id).where(LoanApplication.status == "received").limit(1)):
        s.add(LoanApplication(member_id=carlos.id, amount=Decimal("3500000"), term_months=48, income_type="asalariado",
                              monthly_income=Decimal("920000"), status="received", created_at=now - timedelta(hours=1)))
    if lucia and not await s.scalar(select(SupportCase.id).where(SupportCase.status == "open").limit(1)):
        s.add(SupportCase(member_id=lucia.id, number=f"{random.SystemRandom().randint(100000, 999999)}", kind="fraud",
                          reason="unknown_charge", status="open", cards_locked=0,
                          created_at=now - timedelta(minutes=20)))
    await s.commit()


if __name__ == "__main__":
    asyncio.run(seed(reset="--reset" in sys.argv))
