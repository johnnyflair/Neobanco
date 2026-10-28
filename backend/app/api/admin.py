"""Panel de administración para la cooperativa (/admin).

* El equipo entra con correo y contraseña propios (tabla staff_users); nada que ver con los asociados.
* Token corto con scope "staff". Roles: admin, operaciones (actúa) y lectura (solo mira, datos enmascarados).
* Toda acción queda en la bitácora del panel (staff_actions) con quién, sobre quién y cuándo.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

import jwt
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import and_, distinct, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import bearer
from app.core.errors import ApiError, not_found
from app.core.middleware import client_ip
from app.core.ratelimit import limiter
from app.core.security import create_access_token, decode_token, hash_secret, pii_hash, verify_secret
from app.db.models import (
    Account,
    AccountType,
    AuditEvent,
    Card,
    CardStatus,
    Currency,
    KycStatus,
    LoanApplication,
    Member,
    RefreshToken,
    RewardEntry,
    StaffAction,
    StaffNote,
    StaffRole,
    StaffUser,
    SupportCase,
    Transaction,
    Transfer,
    TransferKind,
)
from app.db.session import get_session
from app.providers import Providers, get_providers
from app.services import level_for, tx_counterparty, tx_title

router = APIRouter(prefix="/admin/api", tags=["Panel"], include_in_schema=False)
pages = APIRouter(include_in_schema=False)

CR = ZoneInfo("America/Costa_Rica")
STAFF_TOKEN_MINUTES = 60
MAX_ATTEMPTS, LOCK_MINUTES = 5, 15
_DUMMY = hash_secret("panel-dummy-password")
PANEL_DIR = Path(__file__).resolve().parent.parent / "admin_panel"
PANEL_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; "
             "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; "
             "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

CASE_REASONS = {
    "unknown_charge": "Cargo no reconocido",
    "lost_card": "Tarjeta perdida",
    "stolen_phone": "Celular robado",
    "suspicious_contact": "Contacto sospechoso",
}
KYC_LABELS = {
    "occupation": ("Actividad", {"asalariado": "Asalariado", "negocio_propio": "Negocio propio",
                                 "pensionado": "Pensionado", "estudiante": "Estudiante"}),
    "monthly_volume": ("Movimiento mensual", {"lt_500k": "Menos de ₡500,000", "500k_1500k": "₡500,000 – ₡1,500,000",
                                              "gt_1500k": "Más de ₡1,500,000"}),
    "source_of_funds": ("Origen de fondos", {"salario": "Salario", "ventas": "Ventas", "pension": "Pensión",
                                             "otro": "Otro"}),
}


# ---------------- Panel (archivos) ----------------


def _panel_file(name: str, media: str) -> FileResponse:
    r = FileResponse(PANEL_DIR / name, media_type=media)
    r.headers["Content-Security-Policy"] = PANEL_CSP
    return r


@pages.get("/admin", response_class=HTMLResponse)
async def panel_index() -> FileResponse:
    return _panel_file("index.html", "text/html; charset=utf-8")


@pages.get("/admin/app.js")
async def panel_js() -> FileResponse:
    return _panel_file("app.js", "text/javascript; charset=utf-8")


@pages.get("/admin/app.css")
async def panel_css() -> FileResponse:
    return _panel_file("app.css", "text/css; charset=utf-8")


# ---------------- Sesión del equipo ----------------


async def current_staff(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                        session: AsyncSession = Depends(get_session)) -> StaffUser:
    expired = ApiError(401, "unauthorized", "Tu sesión del panel expiró. Ingresá de nuevo.")
    if creds is None:
        raise expired
    try:
        claims = decode_token(creds.credentials)
    except jwt.PyJWTError as e:
        raise expired from e
    if claims.get("scope") != "staff":
        raise ApiError(403, "forbidden", "Este acceso no es del panel.")
    staff = await session.get(StaffUser, uuid.UUID(claims["sub"]))
    if staff is None or not staff.active:
        raise expired
    return staff


async def can_act(staff: StaffUser = Depends(current_staff)) -> StaffUser:
    if staff.role == StaffRole.lectura:
        raise ApiError(403, "read_only", "Tu rol es de solo lectura.")
    return staff


Staff = Annotated[StaffUser, Depends(current_staff)]
Actor = Annotated[StaffUser, Depends(can_act)]
DB = Annotated[AsyncSession, Depends(get_session)]


def log(session: AsyncSession, request: Request, staff: StaffUser | None, action: str,
        member_id: uuid.UUID | None = None, **detail: Any) -> None:
    session.add(StaffAction(staff_id=staff.id if staff else None, action=action, member_id=member_id,
                            detail=detail or None, ip_hash=pii_hash(client_ip(request))))


def _staff_out(s: StaffUser) -> dict:
    return {"id": str(s.id), "email": s.email, "full_name": s.full_name, "role": s.role.value}


class LoginIn(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=200)]


@router.post("/auth/login", dependencies=[Depends(limiter("panel_login_ip", 20, 900))])
async def login(body: LoginIn, request: Request, session: DB) -> dict:
    s = await session.scalar(select(StaffUser).where(func.lower(StaffUser.email) == body.email.lower())
                             .with_for_update())
    bad = ApiError(401, "bad_credentials", "El correo o la contraseña no coinciden.")
    now = datetime.now(UTC)
    if s is None or not s.active:
        verify_secret(_DUMMY, body.password)  # mismo tiempo de respuesta exista o no
        log(session, request, None, "login_failed", email_hash=pii_hash(body.email.lower()))
        await session.commit()
        raise bad
    if s.locked_until and s.locked_until > now:
        raise ApiError(423, "locked", "Demasiados intentos. Probá de nuevo en unos minutos.")
    if not verify_secret(s.password_hash, body.password):
        s.failed_attempts += 1
        if s.failed_attempts >= MAX_ATTEMPTS:
            s.failed_attempts, s.locked_until = 0, now + timedelta(minutes=LOCK_MINUTES)
        log(session, request, s, "login_failed")
        await session.commit()
        raise bad
    s.failed_attempts, s.locked_until, s.last_login_at = 0, None, now
    log(session, request, s, "login")
    await session.commit()
    token = create_access_token(s.id, scope="staff", minutes=STAFF_TOKEN_MINUTES, extra={"role": s.role.value})
    return {"token": token, "expires_in": STAFF_TOKEN_MINUTES * 60, "staff": _staff_out(s)}


@router.get("/me")
async def me(staff: Staff) -> dict:
    return _staff_out(staff)


# ---------------- Ayudas ----------------


def _mask(staff: StaffUser, value: str | None, kind: str) -> str | None:
    if value is None or staff.role != StaffRole.lectura:
        return value
    if kind == "email" and "@" in value:
        user, dom = value.split("@", 1)
        return f"{user[:1]}•••@{dom}"
    if kind == "cedula":
        return f"{value[:2]}••••{value[-4:]}"
    return f"{value[:2]}••-••{value[-2:]}"


def _day_start(days_ago: int = 0) -> datetime:
    d = datetime.now(CR).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago)
    return d.astimezone(UTC)


def _since(range_: str) -> datetime:
    return {"today": _day_start(0), "7d": _day_start(6), "30d": _day_start(29)}[range_]


def _age(dt: datetime) -> str:
    mins = int((datetime.now(UTC) - dt).total_seconds() // 60)
    if mins < 60:
        return f"{max(mins, 1)} min"
    if mins < 60 * 24:
        return f"{mins // 60} h"
    return f"{mins // (60 * 24)} d"


def _crc(v: Decimal | int | float) -> str:
    return f"₡{Decimal(v):,.0f}"


async def _member(session: AsyncSession, member_id: uuid.UUID) -> Member:
    m = await session.get(Member, member_id)
    if m is None:
        raise not_found("asociado")
    return m


# ---------------- Resumen ----------------


@router.get("/summary")
async def summary(staff: Staff, session: DB,
                  range_: Literal["today", "7d", "30d"] = Query("today", alias="range")) -> dict:
    since = _since(range_)
    month = datetime.now(CR).replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
    d30 = _day_start(29)

    active = await session.scalar(select(func.count()).where(Member.kyc_status == KycStatus.verified)) or 0
    new_members = await session.scalar(select(func.count()).where(Member.created_at >= since)) or 0
    new_month = await session.scalar(select(func.count()).where(Member.created_at >= month)) or 0
    sinpe_sum, sinpe_n = (await session.execute(
        select(func.coalesce(func.sum(Transfer.amount), 0), func.count())
        .where(Transfer.kind == TransferKind.sinpe, Transfer.created_at >= since))).one()
    loans_sum, loans_n = (await session.execute(
        select(func.coalesce(func.sum(LoanApplication.amount), 0), func.count())
        .where(LoanApplication.status == "disbursed", LoanApplication.created_at >= month))).one()
    on_demand = await session.scalar(select(func.coalesce(func.sum(Account.balance), 0)).where(
        Account.type == AccountType.savings, Account.currency == Currency.CRC, Account.is_open.is_(True))) or 0
    saved = await session.scalar(select(func.coalesce(func.sum(Account.balance), 0)).where(
        Account.type.in_([AccountType.envelope, AccountType.term]), Account.currency == Currency.CRC,
        Account.is_open.is_(True))) or 0

    kyc_n, kyc_old = (await session.execute(select(func.count(), func.min(Member.created_at))
                                            .where(Member.kyc_status == KycStatus.in_review))).one()
    case_n, case_old = (await session.execute(select(func.count(), func.min(SupportCase.created_at))
                                              .where(SupportCase.status == "open"))).one()
    loan_n, loan_sum = (await session.execute(select(func.count(), func.coalesce(func.sum(LoanApplication.amount), 0))
                                              .where(LoanApplication.status == "received"))).one()

    # Cuentas nuevas por día, últimos 14 días (hora de Costa Rica).
    start14 = _day_start(13)
    rows = await session.execute(select(Member.created_at).where(Member.created_at >= start14))
    per_day = [0] * 14
    for (created,) in rows:
        idx = (created.astimezone(CR).date() - start14.astimezone(CR).date()).days
        if 0 <= idx < 14:
            per_day[idx] += 1

    logins_today = await session.scalar(select(func.count(distinct(AuditEvent.member_id))).where(
        AuditEvent.action == "login", AuditEvent.outcome == "ok", AuditEvent.created_at >= _day_start(0))) or 0
    sinpe_30 = await session.scalar(select(func.count()).where(Transfer.kind == TransferKind.sinpe,
                                                               Transfer.created_at >= d30)) or 0
    payers_30 = await session.scalar(select(func.count(distinct(Account.member_id))).select_from(Transaction)
                                     .join(Account, Account.id == Transaction.account_id)
                                     .where(Transaction.category == "bill", Transaction.created_at >= d30)) or 0
    redeemed = await session.scalar(select(func.coalesce(-func.sum(RewardEntry.points), 0)).where(
        RewardEntry.points < 0, RewardEntry.created_at >= month)) or 0
    auto_redeem = await session.scalar(select(func.count()).where(Member.auto_redeem.is_not(None))) or 0
    points_out = await session.scalar(select(func.coalesce(func.sum(Member.points), 0))) or 0

    return {
        "range": range_,
        "kpis": [
            {"label": "Asociados activos", "value": f"{active:,}", "note": f"+{new_month} este mes"},
            {"label": {"today": "Cuentas abiertas hoy", "7d": "Cuentas abiertas · 7 días",
                       "30d": "Cuentas abiertas · 30 días"}[range_], "value": f"{new_members:,}", "note": "con la App"},
            {"label": "SINPE enviados", "value": _crc(sinpe_sum), "note": f"{sinpe_n:,} envíos"},
            {"label": "Préstamos colocados (mes)", "value": _crc(loans_sum), "note": f"{loans_n} desembolsos"},
            {"label": "Saldos a la vista", "value": _crc(on_demand), "note": f"{_crc(saved)} en sobres y plazos"},
        ],
        "today": [
            {"kind": "kyc", "label": "Verificaciones de identidad en revisión", "count": kyc_n, "tone": "o",
             "note": f"la más antigua: {_age(kyc_old)}" if kyc_old else "nada pendiente"},
            {"kind": "case", "label": "Casos de fraude y soporte abiertos", "count": case_n, "tone": "r",
             "note": f"el más antiguo: {_age(case_old)}" if case_old else "nada pendiente"},
            {"kind": "loan", "label": "Solicitudes de préstamo por revisar", "count": loan_n, "tone": "n",
             "note": f"{_crc(loan_sum)} en total" if loan_n else "nada pendiente"},
        ],
        "new_per_day": per_day,
        "usage": [
            {"label": "Asociados que ingresaron hoy", "value": f"{logins_today:,}"},
            {"label": "SINPE por asociado (30 días)", "value": f"{(sinpe_30 / active) if active else 0:.1f}"},
            {"label": "Pagan recibos en la App (30 días)",
             "value": f"{(100 * payers_30 / active) if active else 0:.0f}%"},
        ],
        "rewards": [
            {"label": "Puntos canjeados este mes", "value": f"{redeemed:,}"},
            {"label": "Con canje automático", "value": f"{auto_redeem:,} asociados"},
            {"label": "Puntos por canjear", "value": f"{points_out:,}"},
        ],
        "systems": [
            {"label": "Core bancario", "status": "Simulado", "tone": "n"},
            {"label": "SINPE (BCCR)", "status": "Simulado", "tone": "n"},
            {"label": "Verificación de identidad (Didit)", "status": "Simulado", "tone": "n"},
        ],
    }


# ---------------- Bandeja ----------------


@router.get("/queue")
async def queue(staff: Staff, session: DB, kind: Literal["all", "kyc", "case", "loan"] = "all") -> dict:
    items: list[dict] = []
    if kind in ("all", "case"):
        rows = await session.execute(select(SupportCase, Member).join(Member, Member.id == SupportCase.member_id)
                                     .where(SupportCase.status == "open").order_by(SupportCase.created_at))
        for c, m in rows:
            items.append({"kind": "case", "id": str(c.id), "member_id": str(m.id), "name": m.full_name,
                          "label": "Fraude" if c.kind == "fraud" else "Soporte", "tone": "r", "priority": 0,
                          "sub": f"{CASE_REASONS.get(c.reason, c.reason)} · caso {c.number} · {_age(c.created_at)}",
                          "created_at": c.created_at.isoformat()})
    if kind in ("all", "kyc"):
        rows2 = await session.scalars(select(Member).where(Member.kyc_status == KycStatus.in_review)
                                      .order_by(Member.created_at))
        for m in rows2:
            items.append({"kind": "kyc", "id": str(m.id), "member_id": str(m.id), "name": m.full_name,
                          "label": "Verificación", "tone": "o", "priority": 1,
                          "sub": f"Identidad en revisión manual · {_age(m.created_at)}",
                          "created_at": m.created_at.isoformat()})
    if kind in ("all", "loan"):
        rows3 = await session.execute(select(LoanApplication, Member)
                                      .join(Member, Member.id == LoanApplication.member_id)
                                      .where(LoanApplication.status == "received").order_by(LoanApplication.created_at))
        for a, m in rows3:
            items.append({"kind": "loan", "id": str(a.id), "member_id": str(m.id), "name": m.full_name,
                          "label": "Préstamo", "tone": "n", "priority": 2,
                          "sub": f"{_crc(a.amount)} a {a.term_months} meses · ingreso {_crc(a.monthly_income)} · "
                                 f"{_age(a.created_at)}",
                          "created_at": a.created_at.isoformat()})
    items.sort(key=lambda i: (i["priority"], i["created_at"]))
    counts = {"kyc": 0, "case": 0, "loan": 0}
    for i in items:
        counts[i["kind"]] += 1
    return {"items": items, "counts": counts if kind == "all" else None}


async def _kyc_answers(session: AsyncSession, member_id: uuid.UUID) -> list[dict]:
    ev = await session.scalar(select(AuditEvent)
                              .where(AuditEvent.member_id == member_id, AuditEvent.action == "register")
                              .order_by(AuditEvent.created_at.desc()).limit(1))
    raw = (ev.detail or {}).get("kyc") if ev else None
    if not isinstance(raw, dict):
        return []
    return [{"label": label, "value": names.get(str(raw.get(k)), str(raw.get(k)))}
            for k, (label, names) in KYC_LABELS.items() if raw.get(k)]


@router.get("/queue/{kind}/{item_id}")
async def queue_item(kind: Literal["kyc", "case", "loan"], item_id: uuid.UUID, staff: Staff, session: DB) -> dict:
    if kind == "kyc":
        m = await _member(session, item_id)
        return {"kind": kind, "id": str(m.id), "member": _member_card(staff, m), "status": m.kyc_status.value,
                "kyc": await _kyc_answers(session, m.id),
                "checks": [{"label": "Prueba de vida y rostro", "value": "No confirmada",
                            "tone": "o"}]}
    if kind == "case":
        c = await session.get(SupportCase, item_id)
        if c is None:
            raise not_found("caso")
        m = await _member(session, c.member_id)
        return {"kind": kind, "id": str(c.id), "member": _member_card(staff, m), "status": c.status,
                "facts": [["Caso", c.number], ["Tipo", "Fraude o robo" if c.kind == "fraud" else "Soporte"],
                          ["Motivo", CASE_REASONS.get(c.reason, c.reason)],
                          ["Tarjetas bloqueadas", str(c.cards_locked)], ["Abierto", _age(c.created_at)]]}
    a = await session.get(LoanApplication, item_id)
    if a is None:
        raise not_found("solicitud")
    m = await _member(session, a.member_id)
    return {"kind": kind, "id": str(a.id), "member": _member_card(staff, m), "status": a.status,
            "facts": [["Monto", _crc(a.amount)], ["Plazo", f"{a.term_months} meses"],
                      ["Tipo de ingreso", a.income_type.capitalize()], ["Ingreso mensual", _crc(a.monthly_income)],
                      ["Recibida", _age(a.created_at)]]}


class Decision(BaseModel):
    decision: Literal["approve", "reject"]
    note: Annotated[str | None, Field(max_length=500)] = None


@router.post("/members/{member_id}/kyc")
async def decide_kyc(member_id: uuid.UUID, body: Decision, request: Request, staff: Actor, session: DB,
                     p: Providers = Depends(get_providers)) -> dict:
    m = await _member(session, member_id)
    if m.kyc_status != KycStatus.in_review:
        raise ApiError(409, "not_in_review", "Esta verificación ya fue resuelta.")
    m.kyc_status = KycStatus.verified if body.decision == "approve" else KycStatus.rejected
    if body.note:
        session.add(StaffNote(member_id=m.id, staff_id=staff.id, text=body.note))
    log(session, request, staff, f"kyc_{body.decision}", m.id)
    await p.messenger.notify(m.phone, "¡Tu cuenta ya está lista! Ingresá a la App con tu celular y clave."
                             if body.decision == "approve" else
                             "No pudimos verificar tu identidad. Escribinos para ayudarte a terminar.")
    await session.commit()
    return {"status": m.kyc_status.value}


class CaseClose(BaseModel):
    note: Annotated[str, Field(min_length=3, max_length=500)]


@router.post("/cases/{case_id}/close")
async def close_case(case_id: uuid.UUID, body: CaseClose, request: Request, staff: Actor, session: DB) -> dict:
    c = await session.get(SupportCase, case_id)
    if c is None:
        raise not_found("caso")
    if c.status != "open":
        raise ApiError(409, "already_closed", "Este caso ya está cerrado.")
    c.status = "closed"
    session.add(StaffNote(member_id=c.member_id, staff_id=staff.id, text=f"Caso {c.number} cerrado: {body.note}"))
    log(session, request, staff, "case_close", c.member_id, case=c.number)
    await session.commit()
    return {"status": c.status}


@router.post("/loans/{app_id}/decision")
async def decide_loan(app_id: uuid.UUID, body: Decision, request: Request, staff: Actor, session: DB,
                      p: Providers = Depends(get_providers)) -> dict:
    a = await session.get(LoanApplication, app_id)
    if a is None:
        raise not_found("solicitud")
    if a.status != "received":
        raise ApiError(409, "already_decided", "Esta solicitud ya fue resuelta.")
    a.status = "approved" if body.decision == "approve" else "rejected"
    m = await _member(session, a.member_id)
    if body.note:
        session.add(StaffNote(member_id=m.id, staff_id=staff.id, text=f"Préstamo {_crc(a.amount)}: {body.note}"))
    log(session, request, staff, f"loan_{body.decision}", m.id, amount=str(a.amount))
    await p.messenger.notify(m.phone, f"Tu solicitud de préstamo por {_crc(a.amount)} fue aprobada. Te contactamos "
                             "para firmar." if body.decision == "approve" else
                             f"Tu solicitud de préstamo por {_crc(a.amount)} no fue aprobada por ahora.")
    await session.commit()
    return {"status": a.status}


# ---------------- Asociados ----------------


def _member_card(staff: StaffUser, m: Member) -> dict:
    return {"id": str(m.id), "full_name": m.full_name, "cedula": _mask(staff, m.cedula, "cedula"),
            "phone": _mask(staff, m.phone, "phone"), "email": _mask(staff, m.email, "email"),
            "place": f"{m.canton}, {m.province}", "kyc_status": m.kyc_status.value,
            "level": level_for(m.points_lifetime)[0], "since": m.created_at.isoformat()}


@router.get("/members")
async def search_members(staff: Staff, session: DB, q: Annotated[str, Query(max_length=60)] = "") -> dict:
    term = q.strip()
    stmt = select(Member).order_by(Member.created_at.desc()).limit(30)
    if term:
        digits = "".join(ch for ch in term if ch.isdigit())
        conds = [Member.full_name.ilike(f"%{term}%")]
        if digits:
            conds += [Member.phone.like(f"%{digits}%"), func.replace(Member.cedula, "-", "").like(f"%{digits}%")]
        if term.upper().startswith("CR"):
            ibans = select(Account.member_id).where(Account.iban.ilike(f"%{term.replace(' ', '')}%"))
            conds.append(Member.id.in_(ibans))
        stmt = stmt.where(or_(*conds))
    rows = await session.scalars(stmt)
    return {"items": [_member_card(staff, m) for m in rows]}


@router.get("/members/{member_id}")
async def member_360(member_id: uuid.UUID, staff: Staff, session: DB) -> dict:
    m = await _member(session, member_id)
    accts = list(await session.scalars(select(Account).where(Account.member_id == m.id, Account.is_open.is_(True))
                                       .order_by(Account.created_at)))
    names = {a.id: a for a in accts}
    crc_total = sum((a.balance for a in accts if a.currency == Currency.CRC), Decimal("0"))
    usd_total = sum((a.balance for a in accts if a.currency == Currency.USD), Decimal("0"))
    cards = list(await session.scalars(select(Card).where(Card.member_id == m.id)))
    loans = list(await session.scalars(select(LoanApplication).where(LoanApplication.member_id == m.id)
                                       .order_by(LoanApplication.created_at.desc())))
    month = datetime.now(CR).replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
    sinpe_month = await session.scalar(select(func.count()).where(Transfer.member_id == m.id,
                                                                  Transfer.kind == TransferKind.sinpe,
                                                                  Transfer.created_at >= month)) or 0
    txs = await session.scalars(select(Transaction).where(Transaction.account_id.in_([a.id for a in accts]),
                                                          Transaction.category != "opening")
                                .order_by(Transaction.created_at.desc()).limit(25))
    timeline = []
    for t in txs:
        a = names.get(t.account_id)
        cp = tx_counterparty(t.category, t.description, t.counterparty)
        title = tx_title(t.category, t.amount) + (f" · {cp}" if cp else "")
        timeline.append({"at": t.created_at.isoformat(), "title": title,
                         "account": a.name if a else "", "amount": str(t.amount),
                         "currency": a.currency.value if a else "CRC"})
    last_login = await session.scalar(select(func.max(AuditEvent.created_at)).where(
        AuditEvent.member_id == m.id, AuditEvent.action == "login", AuditEvent.outcome == "ok"))
    now = datetime.now(UTC)
    sessions = list(await session.scalars(select(RefreshToken).where(
        RefreshToken.member_id == m.id, RefreshToken.revoked.is_(False), RefreshToken.rotated.is_(False),
        RefreshToken.expires_at > now)))
    cases = list(await session.scalars(select(SupportCase).where(SupportCase.member_id == m.id)
                                       .order_by(SupportCase.created_at.desc())))
    notes = await session.execute(select(StaffNote, StaffUser).join(StaffUser, StaffUser.id == StaffNote.staff_id)
                                  .where(StaffNote.member_id == m.id).order_by(StaffNote.created_at.desc()).limit(20))
    return {
        "member": _member_card(staff, m),
        "totals": [
            {"label": "Saldo total en colones", "value": _crc(crc_total)},
            {"label": "Saldo en dólares", "value": f"${usd_total:,.2f}"},
            {"label": "Puntos", "value": f"{m.points:,}"},
            {"label": "SINPE este mes", "value": str(sinpe_month)},
        ],
        "accounts": [{"name": a.name, "type": a.type.value, "currency": a.currency.value, "balance": str(a.balance),
                      "iban": _mask(staff, a.iban, "phone") if a.iban and staff.role == StaffRole.lectura else a.iban}
                     for a in accts],
        "cards": [{"id": str(c.id), "kind": c.kind.value, "name": c.product_name, "last4": c.last4,
                   "status": c.status.value} for c in cards],
        "loans": [{"amount": str(x.amount), "term_months": x.term_months, "status": x.status,
                   "at": x.created_at.isoformat()} for x in loans],
        "timeline": timeline,
        "security": [
            {"label": "Identidad", "value": {"verified": "Verificada", "in_review": "En revisión",
                                              "rejected": "Rechazada", "pending": "Pendiente"}[m.kyc_status.value],
             "tone": "" if m.kyc_status == KycStatus.verified else "o"},
            {"label": "Último ingreso", "value": last_login.astimezone(CR).strftime("%d/%m %H:%M") if last_login
             else "Nunca", "tone": "n"},
            {"label": "Sesiones abiertas", "value": str(len(sessions)), "tone": "n"},
            {"label": "Dispositivos", "value": ", ".join(sorted({s.device for s in sessions if s.device})) or "—",
             "tone": "n"},
            {"label": "Bloqueo por clave", "value": "Sí" if m.locked_until and m.locked_until > now else "No",
             "tone": "r" if m.locked_until and m.locked_until > now else ""},
        ],
        "kyc": await _kyc_answers(session, m.id),
        "cases": [{"number": c.number, "reason": CASE_REASONS.get(c.reason, c.reason), "status": c.status,
                   "at": c.created_at.isoformat()} for c in cases],
        "notes": [{"text": n.text, "by": s.full_name, "at": n.created_at.isoformat()} for n, s in notes],
    }


class NoteIn(BaseModel):
    text: Annotated[str, Field(min_length=2, max_length=1000)]


@router.post("/members/{member_id}/notes", status_code=201)
async def add_note(member_id: uuid.UUID, body: NoteIn, request: Request, staff: Actor, session: DB) -> dict:
    m = await _member(session, member_id)
    session.add(StaffNote(member_id=m.id, staff_id=staff.id, text=body.text.strip()))
    log(session, request, staff, "note_add", m.id)
    await session.commit()
    return {"ok": True}


@router.post("/members/{member_id}/lock-cards")
async def lock_cards(member_id: uuid.UUID, request: Request, staff: Actor, session: DB) -> dict:
    m = await _member(session, member_id)
    res = await session.execute(update(Card).where(Card.member_id == m.id, Card.status == CardStatus.active)
                                .values(status=CardStatus.locked))
    n = res.rowcount or 0  # type: ignore[attr-defined]
    log(session, request, staff, "cards_lock", m.id, cards=n)
    await session.commit()
    return {"cards_locked": n}


@router.post("/members/{member_id}/logout-all")
async def logout_all(member_id: uuid.UUID, request: Request, staff: Actor, session: DB) -> dict:
    m = await _member(session, member_id)
    res = await session.execute(update(RefreshToken).where(and_(RefreshToken.member_id == m.id,
                                                                RefreshToken.revoked.is_(False)))
                                .values(revoked=True))
    n = res.rowcount or 0  # type: ignore[attr-defined]
    log(session, request, staff, "sessions_revoke", m.id, sessions=n)
    await session.commit()
    return {"sessions_closed": n}


# ---------------- Bitácora ----------------

ACTION_LABELS = {
    "login": "Entró al panel", "login_failed": "Intento fallido de ingreso", "kyc_approve": "Aprobó la identidad",
    "kyc_reject": "Rechazó la identidad", "case_close": "Cerró un caso", "loan_approve": "Aprobó un préstamo",
    "loan_reject": "Rechazó un préstamo", "note_add": "Agregó una nota", "cards_lock": "Bloqueó tarjetas",
    "sessions_revoke": "Cerró las sesiones",
}


@router.get("/audit")
async def audit_log(staff: Staff, session: DB) -> dict:
    rows = await session.execute(
        select(StaffAction, StaffUser.full_name, Member.full_name)
        .outerjoin(StaffUser, StaffUser.id == StaffAction.staff_id)
        .outerjoin(Member, Member.id == StaffAction.member_id)
        .order_by(StaffAction.created_at.desc()).limit(200))
    return {"items": [{"at": a.created_at.isoformat(), "who": who or "—",
                       "action": ACTION_LABELS.get(a.action, a.action),
                       "member": mem, "member_id": str(a.member_id) if a.member_id else None, "detail": a.detail}
                      for a, who, mem in rows]}
