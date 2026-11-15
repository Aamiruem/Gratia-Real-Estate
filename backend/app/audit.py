"""Audit trail helper: call record() in the same transaction as the change."""

from sqlalchemy.orm import Session

from .models import AuditLog, User


def record(db: Session, actor: User | None, action: str, target_type: str, target_id: str, detail: str = "") -> AuditLog:
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_name=(actor.name if actor else "Website")[:100],
        action=action[:40],
        target_type=target_type[:30],
        target_id=str(target_id)[:64],
        detail=detail[:4000],
    )
    db.add(entry)
    return entry
