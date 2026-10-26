"""Credenciales y tokens.

* PIN y códigos OTP: Argon2id (resistente a GPU), nunca en claro.
* Access token: JWT corto (10 min) con audiencia, emisor y jti.
* Refresh token: valor aleatorio opaco; en BD solo se guarda su SHA-256.
"""

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=2)

WEAK_PINS = {"123456", "654321", "000000", "111111", "121212", "123123", "112233"}


def hash_secret(value: str) -> str:
    return _hasher.hash(value)


def verify_secret(hashed: str, value: str) -> bool:
    try:
        return _hasher.verify(hashed, value)
    except (VerifyMismatchError, VerificationError):
        return False


def pin_is_weak(pin: str, birth_hint: str | None = None) -> bool:
    if pin in WEAK_PINS or len(set(pin)) == 1:
        return True
    if pin in "0123456789" or pin in "9876543210":
        return True
    return bool(birth_hint and pin in birth_hint)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def pii_hash(value: str) -> str:
    """Hash con sal para guardar IPs u otros datos en auditoría sin exponerlos."""
    salt = get_settings().pii_hash_salt.get_secret_value().encode()
    return hmac.new(salt, value.encode(), hashlib.sha256).hexdigest()


def new_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def new_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def _signing_key() -> str:
    s = get_settings()
    if s.jwt_algorithm == "ES256":
        if s.jwt_private_key is None:
            raise RuntimeError("Falta NEO_JWT_PRIVATE_KEY")
        return s.jwt_private_key.get_secret_value()
    return s.jwt_secret.get_secret_value()


def _verify_key() -> str:
    s = get_settings()
    if s.jwt_algorithm == "ES256":
        if s.jwt_public_key is None:
            raise RuntimeError("Falta NEO_JWT_PUBLIC_KEY")
        return s.jwt_public_key
    return s.jwt_secret.get_secret_value()


def create_access_token(member_id: uuid.UUID, scope: str = "member", minutes: int | None = None,
                        extra: dict[str, Any] | None = None) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(member_id),
        "scope": scope,
        "iss": s.jwt_issuer,
        "aud": s.jwt_audience,
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=minutes or s.access_token_minutes),
        "jti": uuid.uuid4().hex,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _signing_key(), algorithm=s.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    s = get_settings()
    return jwt.decode(
        token,
        _verify_key(),
        algorithms=[s.jwt_algorithm],
        audience=s.jwt_audience,
        issuer=s.jwt_issuer,
        options={"require": ["exp", "iat", "sub", "jti", "scope"]},
    )
