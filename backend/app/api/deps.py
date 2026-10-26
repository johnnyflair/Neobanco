import uuid

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.security import decode_token
from app.db.models import Member
from app.db.session import get_session

bearer = HTTPBearer(auto_error=False)


async def current_member(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> Member:
    if creds is None:
        raise ApiError(401, "unauthorized", "Tu sesión expiró. Ingresá de nuevo.")
    try:
        claims = decode_token(creds.credentials)
    except jwt.PyJWTError as e:
        raise ApiError(401, "unauthorized", "Tu sesión expiró. Ingresá de nuevo.") from e
    if claims.get("scope") != "member":
        raise ApiError(403, "forbidden", "Este acceso no permite esa operación.")
    member = await session.get(Member, uuid.UUID(claims["sub"]))
    if member is None:
        raise ApiError(401, "unauthorized", "Tu sesión expiró. Ingresá de nuevo.")
    request.state.member_id = member.id
    return member


def mask_phone(phone: str) -> str:
    return f"{phone[:2]}•• ••{phone[-2:]}"


def mask_iban(iban: str | None) -> str | None:
    if not iban:
        return None
    return f"{iban[:4]} •••• {iban[-4:]}"
