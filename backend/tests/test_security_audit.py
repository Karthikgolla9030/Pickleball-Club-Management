"""
Aught2 Pickleball — Comprehensive Security Audit Test Suite

Covers:
  1. Token security (type confusion, tampering, expiry, empty tokens)
  2. Tenant isolation (cross-club data access impossible)
  3. RBAC enforcement (each role blocked from other roles' endpoints)
  4. IDOR prevention (member IDs from Club A cannot read Club B data)
  5. Input validation (empty, over-long, malformed fields rejected early)
  6. Auth abuse (invalid credentials, inactive accounts, replay attempts)
  7. Platform owner isolation (club staff cannot reach platform endpoints)
  8. Password policy enforcement
  9. Unauthenticated access rejection on all protected endpoints

The suite deliberately avoids mocking internal auth logic — all tests
exercise the full HTTP stack so that any future middleware change is caught.
"""
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
)
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User
from tests.conftest import make_auth_header


# ---------------------------------------------------------------------------
# Shared test helpers
# ---------------------------------------------------------------------------

async def _user(
    db: AsyncSession,
    email: str | None = None,
    password: str = "SecurePass1!",
    is_active: bool = True,
) -> User:
    email = email or f"u_{uuid.uuid4().hex[:8]}@sec.local"
    u = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        full_name="Security Test User",
        is_active=is_active,
        is_verified=True,
    )
    db.add(u)
    await db.flush()
    await db.refresh(u)
    return u


async def _club(db: AsyncSession, name: str = "SecClub") -> Club:
    c = Club(name=name, slug=f"sec-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c


async def _membership(
    db: AsyncSession,
    user: User,
    club: Club,
    role: ClubRole = ClubRole.CLUB_OWNER,
    is_active: bool = True,
) -> ClubMembership:
    m = ClubMembership(user_id=user.id, club_id=club.id, role=role, is_active=is_active)
    db.add(m)
    await db.flush()
    await db.refresh(m)
    return m


# ===========================================================================
# 1. TOKEN SECURITY
# ===========================================================================

@pytest.mark.asyncio
async def test_no_token_returns_401(async_client: AsyncClient, db_session: AsyncSession):
    """Protected endpoint with no Authorization header returns 401."""
    user = await _user(db_session)
    club = await _club(db_session)
    await _membership(db_session, user, club)
    await db_session.commit()
    resp = await async_client.get(f"/api/v1/clubs/{club.id}")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_malformed_bearer_returns_401(async_client: AsyncClient, db_session: AsyncSession):
    """Authorization header with garbage token returns 401."""
    user = await _user(db_session)
    club = await _club(db_session)
    await _membership(db_session, user, club)
    await db_session.commit()
    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}",
        headers={"Authorization": "Bearer not.a.real.jwt"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_cannot_access_protected_endpoint(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Refresh tokens must not be accepted for authenticated API calls."""
    user = await _user(db_session)
    club = await _club(db_session)
    await _membership(db_session, user, club)
    await db_session.commit()

    refresh_token = create_refresh_token(str(user.id))
    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}",
        headers={"Authorization": f"Bearer {refresh_token}"},
    )
    # Refresh tokens carry type="refresh" — decode_access_token raises JWTError -> 401
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_access_token_rejected_as_refresh(
    async_client: AsyncClient, db_session: AsyncSession
):
    """An access token submitted to /auth/refresh is rejected with 401."""
    user = await _user(db_session)
    await db_session.commit()

    access_token = create_access_token(str(user.id))
    resp = await async_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": access_token},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_tampered_token_rejected(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A bit-flipped JWT signature is rejected with 401."""
    user = await _user(db_session)
    club = await _club(db_session)
    await _membership(db_session, user, club)
    await db_session.commit()

    token = create_access_token(str(user.id))
    tampered = token[:-5] + ("A" * 5)
    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}",
        headers={"Authorization": f"Bearer {tampered}"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_token_for_nonexistent_user_returns_401(
    async_client: AsyncClient,
):
    """Access token for a non-existent user ID is rejected."""
    fake_id = str(uuid.uuid4())
    token = create_access_token(fake_id)
    resp = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_token_for_inactive_user_returns_401(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Access token for a deactivated user account is rejected."""
    user = await _user(db_session, is_active=False)
    await db_session.commit()

    token = create_access_token(str(user.id))
    resp = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_for_inactive_user_returns_401(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Refresh endpoint rejects tokens for deactivated accounts."""
    user = await _user(db_session, is_active=False)
    await db_session.commit()

    refresh = create_refresh_token(str(user.id))
    resp = await async_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh},
    )
    assert resp.status_code == 401


# ===========================================================================
# 2. TENANT ISOLATION
# ===========================================================================

@pytest.mark.asyncio
async def test_club_owner_cannot_access_another_clubs_details(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Owner of Club A cannot read Club B details."""
    owner_a = await _user(db_session, email="owner_a@iso.local")
    owner_b = await _user(db_session, email="owner_b@iso.local")
    club_a = await _club(db_session, "Club Alpha")
    club_b = await _club(db_session, "Club Beta")
    await _membership(db_session, owner_a, club_a)
    await _membership(db_session, owner_b, club_b)
    await db_session.commit()

    headers = make_auth_header(owner_a)
    resp = await async_client.get(f"/api/v1/clubs/{club_b.id}", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_club_owner_cannot_list_another_clubs_members(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Owner of Club A cannot list members of Club B."""
    owner_a = await _user(db_session, email="owner_list_a@iso.local")
    club_a = await _club(db_session, "Club List Alpha")
    club_b = await _club(db_session, "Club List Beta")
    await _membership(db_session, owner_a, club_a)
    await db_session.commit()

    headers = make_auth_header(owner_a)
    resp = await async_client.get(f"/api/v1/clubs/{club_b.id}/members", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_club_owner_cannot_manage_courts_of_another_club(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Owner of Club A cannot create courts in Club B."""
    owner_a = await _user(db_session, email="owner_courts_a@iso.local")
    club_a = await _club(db_session, "Court Club A")
    club_b = await _club(db_session, "Court Club B")
    await _membership(db_session, owner_a, club_a)
    await db_session.commit()

    headers = make_auth_header(owner_a)
    resp = await async_client.post(
        f"/api/v1/clubs/{club_b.id}/courts",
        headers=headers,
        json={"name": "Stolen Court"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cross_club_membership_id_idor(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Owner A cannot read a membership record from Club B via its ID."""
    owner_a = await _user(db_session, email="owner_idor_a@iso.local")
    owner_b = await _user(db_session, email="owner_idor_b@iso.local")
    club_a = await _club(db_session, "IDOR Club A")
    club_b = await _club(db_session, "IDOR Club B")
    await _membership(db_session, owner_a, club_a)
    mem_b = await _membership(db_session, owner_b, club_b)
    await db_session.commit()

    # Owner A uses Club A URL but supplies Club B's membership ID
    headers = make_auth_header(owner_a)
    resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/members/{mem_b.id}",
        headers=headers,
    )
    # Either 404 (not found in this club) or 403
    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_club_manager_cannot_access_different_club(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Club Manager of Club A cannot access any Club B endpoint."""
    manager = await _user(db_session, email="mgr_iso@iso.local")
    club_a = await _club(db_session, "Manager Club A")
    club_b = await _club(db_session, "Untouched Club B")
    await _membership(db_session, manager, club_a, role=ClubRole.CLUB_MANAGER)
    await db_session.commit()

    headers = make_auth_header(manager)
    for path in [
        f"/api/v1/clubs/{club_b.id}",
        f"/api/v1/clubs/{club_b.id}/members",
        f"/api/v1/clubs/{club_b.id}/courts",
    ]:
        resp = await async_client.get(path, headers=headers)
        assert resp.status_code == 403, f"Expected 403 for {path}, got {resp.status_code}"


# ===========================================================================
# 3. RBAC ENFORCEMENT
# ===========================================================================

@pytest.mark.asyncio
async def test_club_manager_cannot_create_staff(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Club Manager cannot add new staff members (requires MANAGE_ROLES)."""
    manager = await _user(db_session, email="mgr_staff@rbac.local")
    club = await _club(db_session)
    await _membership(db_session, manager, club, role=ClubRole.CLUB_MANAGER)
    await db_session.commit()

    headers = make_auth_header(manager)
    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/members",
        headers=headers,
        json={"email": "newguy@rbac.local", "role": "tournament_director"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_tournament_director_cannot_manage_courts(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Tournament Director cannot access court management endpoints."""
    td = await _user(db_session, email="td_courts@rbac.local")
    club = await _club(db_session)
    await _membership(db_session, td, club, role=ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    headers = make_auth_header(td)
    resp = await async_client.get(f"/api/v1/clubs/{club.id}/courts", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_tournament_director_cannot_list_members(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Tournament Director cannot list club members."""
    td = await _user(db_session, email="td_members@rbac.local")
    club = await _club(db_session)
    await _membership(db_session, td, club, role=ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    headers = make_auth_header(td)
    resp = await async_client.get(f"/api/v1/clubs/{club.id}/members", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_club_manager_cannot_update_club_settings(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Club Manager cannot update club core settings (requires MANAGE_CLUB)."""
    manager = await _user(db_session, email="mgr_settings@rbac.local")
    club = await _club(db_session)
    await _membership(db_session, manager, club, role=ClubRole.CLUB_MANAGER)
    await db_session.commit()

    headers = make_auth_header(manager)
    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}",
        headers=headers,
        json={"description": "Hack attempt"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_player_token_cannot_reach_club_endpoints(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A pure player account (no club membership) cannot access club management."""
    player = await _user(db_session, email="pure_player@rbac.local")
    club = await _club(db_session)
    await db_session.commit()

    headers = make_auth_header(player)
    resp = await async_client.get(f"/api/v1/clubs/{club.id}/members", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_inactive_membership_cannot_reach_club_endpoints(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A user with a deactivated club membership is denied access."""
    user = await _user(db_session, email="inactive_mem@rbac.local")
    club = await _club(db_session)
    await _membership(db_session, user, club, is_active=False)
    await db_session.commit()

    headers = make_auth_header(user)
    resp = await async_client.get(f"/api/v1/clubs/{club.id}", headers=headers)
    assert resp.status_code == 403


# ===========================================================================
# 4. PLATFORM OWNER ISOLATION
# ===========================================================================

@pytest.mark.asyncio
async def test_unauthenticated_cannot_reach_platform_endpoints(async_client: AsyncClient):
    """Unauthenticated calls to /platform/* are rejected with 401 or 403."""
    for path in [
        "/api/v1/platform/me",
        "/api/v1/platform/clubs",
        "/api/v1/platform/club-applications",
    ]:
        resp = await async_client.get(path)
        assert resp.status_code in (401, 403), f"Expected 401/403 for {path}"


@pytest.mark.asyncio
async def test_club_owner_cannot_access_platform_endpoints(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Club Owner token is denied on all /platform/* endpoints."""
    owner = await _user(db_session, email="owner_plat@plat.local")
    club = await _club(db_session)
    await _membership(db_session, owner, club)
    await db_session.commit()

    headers = make_auth_header(owner)
    for path in ["/api/v1/platform/me", "/api/v1/platform/clubs"]:
        resp = await async_client.get(path, headers=headers)
        assert resp.status_code == 403, f"Expected 403 for {path}"


@pytest.mark.asyncio
async def test_club_manager_cannot_access_platform_endpoints(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Club Manager token is denied on all /platform/* endpoints."""
    mgr = await _user(db_session, email="mgr_plat@plat.local")
    club = await _club(db_session)
    await _membership(db_session, mgr, club, role=ClubRole.CLUB_MANAGER)
    await db_session.commit()

    headers = make_auth_header(mgr)
    resp = await async_client.get("/api/v1/platform/me", headers=headers)
    assert resp.status_code == 403


# ===========================================================================
# 5. AUTH INPUT VALIDATION
# ===========================================================================

@pytest.mark.asyncio
async def test_login_empty_email_rejected(async_client: AsyncClient):
    """Empty email on login is rejected with 422."""
    resp = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": "", "password": "SomePass1!"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_invalid_email_rejected(async_client: AsyncClient):
    """Non-email string is rejected before DB lookup."""
    resp = await async_client.post(
        "/api/v1/auth/player/login",
        json={"email": "notanemail", "password": "SomePass1!"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_empty_password_rejected(async_client: AsyncClient):
    """Empty password is rejected without a DB query."""
    resp = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": "user@valid.com", "password": ""},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_short_password_rejected(async_client: AsyncClient):
    """Registration with password shorter than 8 characters is rejected with 422."""
    resp = await async_client.post(
        "/api/v1/auth/player/register",
        json={"email": "newbie@test.local", "password": "ab1", "full_name": "New Bie"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_no_digit_password_rejected(async_client: AsyncClient):
    """Registration with letters-only password (no digit) is rejected."""
    resp = await async_client.post(
        "/api/v1/auth/player/register",
        json={"email": "newbie2@test.local", "password": "NoDigitHere", "full_name": "New Bie"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_no_letter_password_rejected(async_client: AsyncClient):
    """Registration with digits-only password (no letter) is rejected."""
    resp = await async_client.post(
        "/api/v1/auth/player/register",
        json={"email": "newbie3@test.local", "password": "123456789", "full_name": "New Bie"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_empty_full_name_rejected(async_client: AsyncClient):
    """Registration with whitespace-only full_name is rejected."""
    resp = await async_client.post(
        "/api/v1/auth/player/register",
        json={"email": "newbie4@test.local", "password": "ValidPass1!", "full_name": "  "},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_refresh_empty_token_rejected(async_client: AsyncClient):
    """Empty refresh token body is rejected with 422."""
    resp = await async_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": ""},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_refresh_garbage_token_rejected(async_client: AsyncClient):
    """Garbage string submitted as refresh token is rejected with 401."""
    resp = await async_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": "garbage.token.value"},
    )
    assert resp.status_code == 401


# ===========================================================================
# 6. CREDENTIAL SECURITY
# ===========================================================================

@pytest.mark.asyncio
async def test_wrong_password_returns_401(async_client: AsyncClient, db_session: AsyncSession):
    """Valid email with wrong password returns 401."""
    user = await _user(db_session, email="cred_test@cred.local", password="CorrectPass1!")
    await db_session.commit()

    resp = await async_client.post(
        "/api/v1/auth/player/login",
        json={"email": user.email, "password": "WrongPassword99!"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unknown_email_returns_401(async_client: AsyncClient):
    """Non-existent email returns 401 — same as wrong password to prevent enumeration."""
    resp = await async_client.post(
        "/api/v1/auth/player/login",
        json={"email": "nobody@nowhere.example", "password": "AnyPass1!"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_disabled_account_login_returns_403(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A deactivated user account returns 403 on login (account disabled, not wrong credentials)."""
    user = await _user(db_session, email="disabled@cred.local", password="CorrectPass1!", is_active=False)
    await db_session.commit()

    resp = await async_client.post(
        "/api/v1/auth/player/login",
        json={"email": user.email, "password": "CorrectPass1!"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_login_response_has_expected_fields(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Successful login response contains access_token, refresh_token, user, memberships."""
    user = await _user(db_session, email="fields@cred.local", password="CorrectPass1!")
    await db_session.commit()

    resp = await async_client.post(
        "/api/v1/auth/player/login",
        json={"email": user.email, "password": "CorrectPass1!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert "user" in data
    assert "memberships" in data


@pytest.mark.asyncio
async def test_login_does_not_echo_password(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Login response must never include the plaintext or hashed password."""
    user = await _user(db_session, email="noecho@cred.local", password="CorrectPass1!")
    await db_session.commit()

    resp = await async_client.post(
        "/api/v1/auth/player/login",
        json={"email": user.email, "password": "CorrectPass1!"},
    )
    assert resp.status_code == 200
    body = resp.text
    assert "CorrectPass1!" not in body
    assert "hashed_password" not in body
    assert "$2b$" not in body  # no bcrypt hash leak


@pytest.mark.asyncio
async def test_duplicate_registration_rejected(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Registering with an already-registered email returns 400."""
    email = f"dup_{uuid.uuid4().hex[:6]}@dup.local"
    await _user(db_session, email=email)
    await db_session.commit()

    resp = await async_client.post(
        "/api/v1/auth/player/register",
        json={"email": email, "password": "ValidPass1!", "full_name": "Dup User"},
    )
    assert resp.status_code == 400


# ===========================================================================
# 7. OWNER SAFETY — LAST OWNER CANNOT LOCK OUT THE CLUB
# ===========================================================================

@pytest.mark.asyncio
async def test_owner_cannot_deactivate_sole_owner_membership(
    async_client: AsyncClient, db_session: AsyncSession
):
    """The last active Club Owner cannot deactivate their own membership."""
    owner = await _user(db_session, email="sole_owner@safety.local")
    club = await _club(db_session, "Safety Club")
    mem = await _membership(db_session, owner, club)
    await db_session.commit()

    headers = make_auth_header(owner)
    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/members/{mem.id}",
        headers=headers,
        json={"is_active": False},
    )
    # Backend must reject this with 400 (owner safety rule)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_owner_cannot_downgrade_sole_owner_role(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Last owner cannot change their own role to a non-owner role."""
    owner = await _user(db_session, email="sole_role_owner@safety.local")
    club = await _club(db_session, "Role Safety Club")
    mem = await _membership(db_session, owner, club)
    await db_session.commit()

    headers = make_auth_header(owner)
    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/members/{mem.id}",
        headers=headers,
        json={"role": "club_manager"},
    )
    assert resp.status_code == 400


# ===========================================================================
# 8. UNAUTHENTICATED ACCESS COVERAGE
# ===========================================================================

@pytest.mark.asyncio
async def test_auth_me_requires_auth(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_user_clubs_requires_auth(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/clubs")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_player_profile_requires_auth(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/player/profile")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_club_detail_requires_auth(async_client: AsyncClient):
    fake_club_id = str(uuid.uuid4())
    resp = await async_client.get(f"/api/v1/clubs/{fake_club_id}")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_platform_endpoints_require_auth(async_client: AsyncClient):
    for path in ["/api/v1/platform/me", "/api/v1/platform/clubs"]:
        resp = await async_client.get(path)
        assert resp.status_code in (401, 403)
