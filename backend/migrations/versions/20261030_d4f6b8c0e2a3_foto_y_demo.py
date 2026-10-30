"""foto de perfil y asociado de demostración para visitantes

Revision ID: d4f6b8c0e2a3
Revises: c3e5a7b9d1f2
Create Date: 2026-10-30 11:40:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4f6b8c0e2a3"
down_revision: str | None = "c3e5a7b9d1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("members", sa.Column("photo", sa.Text(), nullable=True))
    op.add_column("members", sa.Column("is_demo", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("members", "is_demo")
    op.drop_column("members", "photo")
