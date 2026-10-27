"""ayuda (casos) y canje automático de puntos

Revision ID: a1c3e5f7b9d2
Revises: 365e9e9b7cf8
Create Date: 2026-10-27 09:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1c3e5f7b9d2"
down_revision: Union[str, None] = "365e9e9b7cf8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("members", sa.Column("auto_redeem", sa.String(length=20), nullable=True))
    op.create_table(
        "support_cases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("cards_locked", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("number"),
    )
    op.create_index(op.f("ix_support_cases_member_id"), "support_cases", ["member_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_support_cases_member_id"), table_name="support_cases")
    op.drop_table("support_cases")
    op.drop_column("members", "auto_redeem")
