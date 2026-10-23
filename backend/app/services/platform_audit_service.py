"""
Aught2 Pickleball — Platform Audit Service

Central helper to reliably record platform-level administrative events
within the active database transaction of the mutating action.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_audit_log import PlatformAuditLog
from app.models.user import User


ACTION_LABELS = {
    "club_application.approved": "Application Approved",
    "club_application.rejected": "Application Rejected",
    "club.suspended": "Facility Suspended",
    "club.reactivated": "Facility Reactivated",
    "support_ticket.status_updated": "Ticket Status Updated",
    "support_ticket.replied": "Ticket Replied",
    "support_ticket.assigned": "Ticket Assigned",
}


def get_action_label(action: str) -> str:
    """Return a human-readable display label for an action identifier."""
    if action in ACTION_LABELS:
        return ACTION_LABELS[action]
    # Default fallback formatting: "entity.action_name" -> "Entity Action Name"
    return action.replace(".", " ").replace("_", " ").title()


async def record_platform_audit_event(
    db: AsyncSession,
    *,
    actor: User,
    action: str,
    entity_type: str,
    entity_id: str | uuid.UUID,
    entity_name: str | None = None,
    outcome: str = "success",
    reason: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> PlatformAuditLog:
    """
    Stage a platform audit log entry within the caller's active database transaction.

    This MUST be called BEFORE `await db.commit()` in the mutating endpoint or service.
    If the outer transaction fails or is rolled back, the audit log entry is
    automatically rolled back with it, guaranteeing transactional consistency.
    """
    clean_details = dict(details) if details else {}

    # Never log passwords, tokens, or hashes
    sensitive_keys = {
        "password",
        "hashed_password",
        "password_hash",
        "token",
        "access_token",
        "refresh_token",
        "secret",
    }
    for k in list(clean_details.keys()):
        if any(sens in k.lower() for sens in sensitive_keys):
            clean_details[k] = "[REDACTED]"

    entry = PlatformAuditLog(
        id=uuid.uuid4(),
        created_at=datetime.now(timezone.utc),
        actor_id=actor.id,
        actor_email=actor.email,
        actor_name=actor.full_name,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        entity_name=entity_name,
        outcome=outcome,
        reason=reason,
        details=clean_details,
        ip_address=ip_address,
    )
    db.add(entry)
    return entry
