"""Registro con OTP, ingreso con PIN y sesiones con refresh token rotativo."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import jwt
import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.ratelimit import hit, limiter
from app.core.security import (
    create_access_token,
    decode_token,
    hash_secret,
    new_opaque_token,
    new_otp,
    pin_is_weak,
    sha256,
    verify_secret,
)
from app.db.models import (
    Account,
    AccountType,
    Card,
    CardKind,
    Currency,
    KycStatus,
    LinkedMode,
    Member,
    OtpChallenge,
    RefreshToken,
)
from app.db.session import get_session
from app.providers import Providers, get_providers
from app.schemas import (
    LoginIn,
    OnboardingTokenOut,
    OtpStartIn,
    OtpStartOut,
    OtpVerifyIn,
    RefreshIn,
    RegisterIn,
    RegisterOut,
    TokensOut,
)
from app.services import POINTS_RULES, check_pin, earn

router = APIRouter(prefix="/auth", tags=["Registro e ingreso"])
_DUMMY_HASH = hash_secret("000000-dummy")


async def _issue_tokens(session: AsyncSession, member: Member, device: str | None = None,
                        family: uuid.UUID | None = None) -> TokensOut:
    s = get_settings()
    raw = new_opaque_token()
    session.add(RefreshToken(member_id=member.id, family_id=family or uuid.uuid4(), token_hash=sha256(raw),
                             expires_at=datetime.now(UTC) + timedelta(days=s.refresh_token_days), device=device))
    return TokensOut(access_token=create_access_token(member.id), refresh_token=raw,
                     expires_in=s.access_token_minutes * 60)


@router.post("/otp/start", response_model=OtpStartOut, status_code=201,
             dependencies=[Depends(limiter("otp_ip", 20, 3600))])
async def otp_start(body: OtpStartIn, request: Request, session: AsyncSession = Depends(get_session),
                    p: Providers = Depends(get_providers)):
    """Envía un código de 6 dígitos al celular (o correo). 1 cada 30 s y máximo 6 por hora."""
    s = get_settings()
    last = await session.scalar(select(OtpChallenge).where(OtpChallenge.phone == body.phone)
                                .order_by(OtpChallenge.created_at.desc()).limit(1))
    if last and (datetime.now(UTC) - last.created_at).total_seconds() < s.otp_resend_seconds:
        raise ApiError(429, "too_many_requests", "Esperá unos segundos antes de pedir otro código.",
                       {"retry_after_seconds": s.otp_resend_seconds})
    await hit(f"otp_phone:{sha256(body.phone)}", s.otp_max_per_hour, 3600)
    code = new_otp()
    ch = OtpChallenge(phone=body.phone, code_hash=hash_secret(code), channel=body.channel,
                      expires_at=datetime.now(UTC) + timedelta(seconds=s.otp_ttl_seconds))
    session.add(ch)
    await p.messenger.send_otp(body.phone, code, body.channel)
    audit(session, request, "otp_start")
    await session.commit()
    return OtpStartOut(challenge_id=ch.id, expires_in=s.otp_ttl_seconds, resend_in=s.otp_resend_seconds,
                       debug_code=code if s.expose_debug_otp else None)


@router.post("/otp/verify", response_model=OnboardingTokenOut,
             dependencies=[Depends(limiter("otp_verify_ip", 30, 900))])
async def otp_verify(body: OtpVerifyIn, request: Request, session: AsyncSession = Depends(get_session)):
    s = get_settings()
    ch = await session.get(OtpChallenge, body.challenge_id, with_for_update=True)
    bad = ApiError(400, "bad_code", "El código no es correcto o ya venció.")
    if ch is None or ch.verified or ch.expires_at < datetime.now(UTC) or ch.attempts >= s.otp_max_attempts:
        raise bad
    if not verify_secret(ch.code_hash, body.code):
        ch.attempts += 1
        audit(session, request, "otp_verify", "bad_code")
        await session.commit()
        raise bad
    ch.verified = True
    audit(session, request, "otp_verify")
    await session.commit()
    token = create_access_token(ch.id, scope="onboarding", minutes=30, extra={"phone": ch.phone})
    return OnboardingTokenOut(onboarding_token=token, expires_in=1800)


@router.post("/register", response_model=RegisterOut, status_code=201,
             dependencies=[Depends(limiter("register_ip", 10, 3600))])
async def register(body: RegisterIn, request: Request, session: AsyncSession = Depends(get_session),
                   p: Providers = Depends(get_providers)):
    """Crea al asociado tras OTP + verificación de identidad (Didit) + preguntas de la ley 8204."""
    try:
        claims = decode_token(body.onboarding_token)
    except jwt.PyJWTError as e:
        raise ApiError(401, "unauthorized", "Tu verificación venció. Empezá de nuevo.") from e
    if claims.get("scope") != "onboarding":
        raise ApiError(401, "unauthorized", "Tu verificación venció. Empezá de nuevo.")
    phone = claims["phone"]
    exists = await session.scalar(select(Member.id).where(or_(Member.phone == phone, Member.cedula == body.cedula)))
    if exists:
        audit(session, request, "register", "duplicate")
        await session.commit()
        raise ApiError(409, "already_member",
                       "Ya existe una cuenta con ese celular o cédula. Ingresá o recuperá tu clave.")
    if pin_is_weak(body.pin):
        raise ApiError(422, "weak_pin", "Elegí una clave menos obvia.")

    status = await p.identity.verify(body.cedula, body.selfie_ok)
    if status == "rejected":
        audit(session, request, "register", "kyc_rejected")
        await session.commit()
        raise ApiError(422, "kyc_rejected", "No pudimos verificar tu identidad. Intentá la selfie de nuevo.")

    m = Member(cedula=body.cedula, phone=phone, full_name=body.full_name.strip(), email=str(body.email),
               province=body.province, canton=body.canton, pin_hash=hash_secret(body.pin),
               kyc_status=KycStatus(status))
    session.add(m)
    await session.flush()
    for acct in (
        Account(member_id=m.id, type=AccountType.savings, currency=Currency.CRC, name="Colones",
                iban=f"CR21081500000{uuid.uuid4().int % 10**9:09d}", balance=Decimal("0")),
        Account(member_id=m.id, type=AccountType.savings, currency=Currency.USD, name="Dólares",
                iban=f"CR48081500000{uuid.uuid4().int % 10**9:09d}", balance=Decimal("0")),
        Account(member_id=m.id, type=AccountType.capital, currency=Currency.CRC, name="Capital social",
                balance=Decimal("0"), monthly_contribution=Decimal("15000")),
    ):
        await p.core.open_account(acct)
    session.add(Card(member_id=m.id, kind=CardKind.debit, product_name="Débito digital", brand="Mastercard",
                     last4=f"{uuid.uuid4().int % 10000:04d}", processor_token=new_opaque_token()[:40],
                     holder_name=body.full_name.split()[0] + " " + body.full_name.split()[-1],
                     expiry=f"{(datetime.now(UTC).month):02d}/{(datetime.now(UTC).year + 4) % 100:02d}",
                     linked_mode=LinkedMode.crc))
    await earn(session, m, POINTS_RULES["welcome"], "Bienvenida")
    audit(session, request, "register", status, m.id, kyc=body.kyc.model_dump())

    if status == "in_review":
        await p.messenger.notify(phone, "Recibimos tu solicitud. Te avisamos por WhatsApp cuando tu cuenta esté lista.")
        await session.commit()
        return RegisterOut(kyc_status="in_review",
                           message="Estamos revisando tu identidad. Te avisamos por WhatsApp cuando esté lista.")
    tokens = await _issue_tokens(session, m)
    await session.commit()
    return RegisterOut(kyc_status="verified", tokens=tokens, message="Ya sos parte.")


@router.post("/login", response_model=TokensOut, dependencies=[Depends(limiter("login_ip", 20, 900))])
async def login(body: LoginIn, request: Request, session: AsyncSession = Depends(get_session)):
    ident = body.identifier.replace(" ", "").replace("-", "")
    cedula = f"{ident[0]}-{ident[1:5]}-{ident[5:]}" if len(ident) == 9 else None
    m = await session.scalar(select(Member).where(or_(Member.phone == ident, Member.cedula == cedula)))
    generic = ApiError(401, "bad_credentials", "Los datos no coinciden. Revisá tu celular y clave.")
    if m is None:
        verify_secret(_DUMMY_HASH, body.pin)  # mismo tiempo de respuesta exista o no la persona
        audit(session, request, "login", "unknown")
        await session.commit()
        raise generic
    try:
        await check_pin(session, request, m, body.pin, "login")
    except ApiError as e:
        if e.code == "bad_pin":
            raise generic from e
        raise
    if m.kyc_status != KycStatus.verified:
        raise ApiError(403, "kyc_pending", "Tu cuenta todavía está en revisión. Te avisamos por WhatsApp.")
    tokens = await _issue_tokens(session, m, body.device)
    audit(session, request, "login", "ok", m.id)
    await session.commit()
    return tokens


@router.post("/demo", response_model=TokensOut, dependencies=[Depends(limiter("demo_ip", 30, 900))])
async def demo(request: Request, session: AsyncSession = Depends(get_session)):
    """Entrada a la demo para visitantes: sesión del asociado de demostración, que solo puede mirar."""
    m = await session.scalar(select(Member).where(Member.is_demo.is_(True)).limit(1))
    if m is None:
        raise ApiError(404, "no_demo", "La demo no está disponible en este momento.")
    tokens = await _issue_tokens(session, m, "demo")
    audit(session, request, "demo", "ok", m.id)
    await session.commit()
    return tokens


@router.post("/refresh", response_model=TokensOut, dependencies=[Depends(limiter("refresh_ip", 60, 900))])
async def refresh(body: RefreshIn, request: Request, session: AsyncSession = Depends(get_session)):
    rt = await session.scalar(select(RefreshToken).where(RefreshToken.token_hash == sha256(body.refresh_token))
                              .with_for_update())
    expired = ApiError(401, "unauthorized", "Tu sesión expiró. Ingresá de nuevo.")
    if rt is None:
        raise expired
    if rt.rotated or rt.revoked:
        # Reuso de un token viejo: posible robo. Se cierra toda la familia de sesiones.
        await session.execute(update(RefreshToken).where(RefreshToken.family_id == rt.family_id)
                              .values(revoked=True))
        audit(session, request, "refresh", "reuse_detected", rt.member_id)
        structlog.get_logger().warning("refresh_reuse_detected")
        await session.commit()
        raise expired
    if rt.expires_at < datetime.now(UTC):
        raise expired
    member = await session.get(Member, rt.member_id)
    if member is None:
        raise expired
    rt.rotated = True
    tokens = await _issue_tokens(session, member, rt.device, family=rt.family_id)
    await session.commit()
    return tokens


@router.post("/logout", status_code=204)
async def logout(body: RefreshIn, request: Request, session: AsyncSession = Depends(get_session)):
    rt = await session.scalar(select(RefreshToken).where(RefreshToken.token_hash == sha256(body.refresh_token)))
    if rt is not None:
        await session.execute(update(RefreshToken).where(RefreshToken.family_id == rt.family_id)
                              .values(revoked=True))
        audit(session, request, "logout", "ok", rt.member_id)
        await session.commit()
