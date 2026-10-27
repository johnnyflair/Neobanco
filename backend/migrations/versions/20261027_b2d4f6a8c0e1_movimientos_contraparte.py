"""movimientos: contraparte y detalle

Revision ID: b2d4f6a8c0e1
Revises: a1c3e5f7b9d2
Create Date: 2026-10-27 10:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2d4f6a8c0e1"
down_revision: str | None = "a1c3e5f7b9d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("counterparty", sa.String(length=120), nullable=True))
    op.add_column("transactions", sa.Column("detail", sa.String(length=60), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "detail")
    op.drop_column("transactions", "counterparty")
