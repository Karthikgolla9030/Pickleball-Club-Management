"""
Authentication schemas.

The login request contains only email + password.
NEVER includes role — the backend determines role from ClubMembership.

The auth response includes:
  - access_token (short-lived)
  - refresh_token (long-lived)
  - user info
  - club memberships (so the client knows which club management experiences to show)
"""
from __future__ import annotations

from pydantic import BaseModel, EmailStr

from app.schemas.club_membership import MembershipInfo
from app.schemas.user import UserResponse


class LoginRequest(BaseModel):
    """
    Login request — email and password only.
    The client NEVER specifies a role. Backend is authoritative.
    """
    email: EmailStr
    password: str


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    """
    Authentication response returned on login and token refresh.

    access_token: Short-lived JWT (15 min default). Used for API calls.
    refresh_token: Long-lived JWT (30 days default). Used to get new access tokens.
    token_type: Always "bearer".
    user: User identity information.
    memberships: Club memberships with role — backend authoritative.
    """
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
    memberships: list[MembershipInfo]


class TokenRefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
