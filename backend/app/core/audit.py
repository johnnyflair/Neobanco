import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.middleware import client_ip
from app.core.security import pii_hash
from app.db.models import AuditEvent


def audit(session: AsyncSession, request: Request, action: str, outcome: str = "ok",
          member_id: uuid.UUID | None = None, **detail: Any) -> None:
    """Agrega un evento de auditoría a la transacción en curso (se guarda con el mismo commit)."""
    session.add(
        AuditEvent(
            member_id=member_id,
            action=action,
            outcome=outcome,
            ip_hash=pii_hash(client_ip(request)),
            request_id=getattr(request.state, "request_id", None),
            detail=detail or None,
        )
    )
