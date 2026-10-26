"""Idempotencia para operaciones que mueven plata.

La App manda un `Idempotency-Key` (UUID) por intento de operación. Si la red se cae y la App
reintenta con la misma llave, devolvemos la respuesta original en lugar de cobrar dos veces.
Si la misma llave llega con un cuerpo distinto, se rechaza.
"""

import json
import uuid
from typing import Any

from fastapi import Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.security import sha256
from app.db.models import IdempotencyRecord


def idempotency_key(idempotency_key: str = Header(..., alias="Idempotency-Key",
                                                   min_length=8, max_length=80)) -> str:
    return idempotency_key


def body_hash(payload: Any) -> str:
    return sha256(json.dumps(payload, sort_keys=True, default=str))


async def replay(session: AsyncSession, member_id: uuid.UUID, key: str, req_hash: str) -> dict | None:
    rec = await session.scalar(
        select(IdempotencyRecord).where(IdempotencyRecord.member_id == member_id, IdempotencyRecord.key == key)
    )
    if rec is None:
        return None
    if rec.request_hash != req_hash:
        raise ApiError(409, "idempotency_conflict", "Esta operación ya se usó con otros datos.")
    return rec.response


def remember(session: AsyncSession, member_id: uuid.UUID, key: str, req_hash: str, response: dict,
             status_code: int = 201) -> None:
    session.add(IdempotencyRecord(member_id=member_id, key=key, request_hash=req_hash,
                                  status_code=status_code, response=response))
