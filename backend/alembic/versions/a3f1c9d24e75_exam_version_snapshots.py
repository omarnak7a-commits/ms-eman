"""exam version snapshots

Freezes the exact question set a student started with onto their attempt
(``exam_attempts.questions_snapshot``) so later teacher edits can never change
an in-progress or past attempt. Also adds ``questions.hidden`` for safe
(soft) deletion of questions that already have student answers.

The upgrade backfills a snapshot for every pre-existing attempt from the
current questions — the best possible reconstruction for legacy data.

Revision ID: a3f1c9d24e75
Revises: d8c4e6337bb8
Create Date: 2026-09-06
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = 'a3f1c9d24e75'
down_revision = 'd8c4e6337bb8'
branch_labels = None
depends_on = None


def _backfill_snapshots() -> None:
    """Best-effort snapshot for attempts created before versioning existed."""
    conn = op.get_bind()
    attempts_t = sa.table(
        'exam_attempts',
        sa.column('id', sa.String()),
        sa.column('exam_id', sa.String()),
        sa.column('questions_snapshot', sa.JSON()),
    )
    questions_t = sa.table(
        'questions',
        sa.column('id', sa.String()),
        sa.column('exam_id', sa.String()),
        sa.column('type', sa.String()),
        sa.column('text', sa.Text()),
        sa.column('marks', sa.Integer()),
        sa.column('order_index', sa.Integer()),
        sa.column('data', sa.JSON()),
    )

    rows = conn.execute(sa.select(attempts_t.c.id, attempts_t.c.exam_id)).fetchall()
    for attempt_id, exam_id in rows:
        qrows = conn.execute(
            sa.select(questions_t)
            .where(questions_t.c.exam_id == exam_id)
            .order_by(questions_t.c.order_index)
        ).fetchall()
        snapshot = [
            {
                'id': q.id,
                'type': q.type,
                'text': q.text,
                'marks': q.marks,
                'order_index': q.order_index,
                'data': q.data,
            }
            for q in qrows
        ]
        conn.execute(
            attempts_t.update()
            .where(attempts_t.c.id == attempt_id)
            .values(questions_snapshot=snapshot)
        )


def upgrade() -> None:
    with op.batch_alter_table('exam_attempts') as batch_op:
        batch_op.add_column(
            sa.Column('questions_snapshot', sa.JSON(), nullable=True)
        )
    with op.batch_alter_table('questions') as batch_op:
        batch_op.add_column(
            sa.Column('hidden', sa.Boolean(), nullable=False, server_default=sa.false())
        )
    _backfill_snapshots()


def downgrade() -> None:
    with op.batch_alter_table('questions') as batch_op:
        batch_op.drop_column('hidden')
    with op.batch_alter_table('exam_attempts') as batch_op:
        batch_op.drop_column('questions_snapshot')
