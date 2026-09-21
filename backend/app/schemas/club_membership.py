"""
Club Membership schemas.
MembershipInfo is included in auth responses so the client knows
which clubs the user manages and at what role.
The backend is the authoritative source — the client never sends role.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.club_membership import ClubRole


class MembershipInfo(BaseModel):
    """Returned in auth response and /me endpoint."""
    membership_id: UUID
    club_id: UUID
    club_name: str
    club_slug: str
    role: ClubRole
    role_label: str
    is_active: bool

    model_config = {"from_attributes": True}
