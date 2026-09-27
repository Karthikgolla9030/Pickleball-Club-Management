"""
Aught2 Pickleball — Player & Club Member API Test Suite

Tests all Phase 3 requirements:
 1. User can create their player profile.
 2. Duplicate player profile creation fails (400).
 3. User can fetch their player profile (200).
 4. User receives 404 when profile has not been created.
 5. User can update their player profile.
 6. User can view their enrolled clubs.
 7. User only sees their own player memberships (tenant & user isolation).
 8. User can view player membership details for a specific club.
 9. Club staff with MANAGE_MEMBERS (Owner/Manager) can list club player memberships.
10. Club staff without MANAGE_MEMBERS (Tournament Director) cannot list club player memberships (403).
11. User with no club staff membership cannot list club player memberships (403).
12. Club staff with MANAGE_MEMBERS can enroll a player into the club.
13. Enrolling a non-existent user returns 404.
14. Enrolling an already active player returns 400.
15. Enrolling a previously inactive/expired player reactivates the membership.
16. Club staff without MANAGE_MEMBERS cannot enroll a player (403).
17. Club staff with MANAGE_MEMBERS can update player membership status and expiry.
18. Updating player membership with expires_at < joined_at fails validation (400 or 422).
19. Club staff cannot update player membership belonging to a different club (404).
20. Dual-identity: A user can be both staff (ClubMembership) and player (ClubPlayerMembership) at the same club.
21. Multi-club: A player can be a member of multiple clubs.
22. Player profile updates sanitize string inputs (whitespace stripped, empty strings to None).
23. Invalid date of birth (future date) is rejected (422).
24. Profile image URL validation works (invalid scheme rejected).
25. Unauthenticated requests to /player/profile return 401.
26. Unauthenticated requests to /player/clubs return 401.
27. Unauthenticated requests to /clubs/{club_id}/player-memberships return 401.
28. Filtering player clubs returns correct subset.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.player_profile import PlayerProfile
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def create_user(
    db: AsyncSession,
    email: str | None = None,
    full_name: str = "Test User",
    is_active: bool = True,
) -> User:
    email = email or f"user_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email,
        hashed_password=hash_password("Secret123!"),
        full_name=full_name,
        is_active=is_active,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


async def create_club(
    db: AsyncSession,
    name: str | None = None,
    slug: str | None = None,
    is_active: bool = True,
) -> Club:
    uid = uuid.uuid4().hex[:6]
    name = name or f"Test Club {uid}"
    slug = slug or f"test-club-{uid}"
    club = Club(name=name, slug=slug, is_active=is_active)
    db.add(club)
    await db.flush()
    return club


async def create_staff_membership(
    db: AsyncSession,
    user: User,
    club: Club,
    role: ClubRole = ClubRole.CLUB_OWNER,
    is_active: bool = True,
) -> ClubMembership:
    membership = ClubMembership(
        user_id=user.id,
        club_id=club.id,
        role=role,
        is_active=is_active,
    )
    db.add(membership)
    await db.flush()
    return membership


async def create_player_membership(
    db: AsyncSession,
    user: User,
    club: Club,
    status: PlayerMembershipStatus = PlayerMembershipStatus.ACTIVE,
    membership_number: str | None = None,
    joined_at: datetime | None = None,
    expires_at: datetime | None = None,
) -> ClubPlayerMembership:
    membership = ClubPlayerMembership(
        user_id=user.id,
        club_id=club.id,
        status=status,
        membership_number=membership_number or f"MEM-{uuid.uuid4().hex[:6].upper()}",
        joined_at=joined_at or datetime.now(timezone.utc),
        expires_at=expires_at,
    )
    db.add(membership)
    await db.flush()
    return membership


# ─── Player Profile Tests ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_01_user_can_create_player_profile(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session)
    await db_session.commit()

    headers = make_auth_header(user.id)
    payload = {
        "display_name": "PicklePro",
        "first_name": "Johnny",
        "last_name": "Dink",
        "phone": "+15551234567",
        "date_of_birth": "1990-05-15",
        "bio": "Competitive 4.5 tournament player",
    }
    resp = await async_client.post("/api/v1/player/profile", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["display_name"] == "PicklePro"
    assert data["first_name"] == "Johnny"
    assert data["last_name"] == "Dink"
    assert data["phone"] == "+15551234567"
    assert data["date_of_birth"] == "1990-05-15"
    assert data["bio"] == "Competitive 4.5 tournament player"
    assert data["user_id"] == str(user.id)


@pytest.mark.asyncio
async def test_02_duplicate_profile_creation_fails(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session)
    # create profile in db
    profile = PlayerProfile(user_id=user.id, display_name="FirstProfile")
    db_session.add(profile)
    await db_session.commit()

    headers = make_auth_header(user.id)
    resp = await async_client.post(
        "/api/v1/player/profile",
        json={"display_name": "SecondProfile"},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "already exists" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_03_user_can_fetch_player_profile(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session)
    profile = PlayerProfile(
        user_id=user.id,
        display_name="SpeedyServe",
        bio="Fast serves only",
    )
    db_session.add(profile)
    await db_session.commit()

    headers = make_auth_header(user.id)
    resp = await async_client.get("/api/v1/player/profile", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["display_name"] == "SpeedyServe"
    assert data["bio"] == "Fast serves only"


@pytest.mark.asyncio
async def test_04_user_receives_404_when_profile_not_created(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session)
    await db_session.commit()

    headers = make_auth_header(user.id)
    resp = await async_client.get("/api/v1/player/profile", headers=headers)
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_05_user_can_update_player_profile(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session)
    profile = PlayerProfile(user_id=user.id, display_name="OldName", bio="Old Bio")
    db_session.add(profile)
    await db_session.commit()

    headers = make_auth_header(user.id)
    resp = await async_client.patch(
        "/api/v1/player/profile",
        json={"display_name": "NewName", "bio": "Updated Bio"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["display_name"] == "NewName"
    assert data["bio"] == "Updated Bio"


# ─── Player's Own Clubs Tests ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_06_user_can_view_enrolled_clubs(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session)
    club1 = await create_club(db_session, name="Aught2 Club A")
    club2 = await create_club(db_session, name="Aught2 Club B")

    await create_player_membership(db_session, user, club1, membership_number="MEM-001")
    await create_player_membership(db_session, user, club2, membership_number="MEM-002")
    await db_session.commit()

    headers = make_auth_header(user.id)
    resp = await async_client.get("/api/v1/player/clubs", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    club_names = {c["club_name"] for c in data}
    assert "Aught2 Club A" in club_names
    assert "Aught2 Club B" in club_names


@pytest.mark.asyncio
async def test_07_user_only_sees_own_player_memberships(
    async_client: AsyncClient, db_session: AsyncSession
):
    user1 = await create_user(db_session)
    user2 = await create_user(db_session)
    club1 = await create_club(db_session, name="Club 1")
    club2 = await create_club(db_session, name="Club 2")

    await create_player_membership(db_session, user1, club1)
    await create_player_membership(db_session, user2, club2)
    await db_session.commit()

    headers1 = make_auth_header(user1.id)
    resp = await async_client.get("/api/v1/player/clubs", headers=headers1)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["club_id"] == str(club1.id)


@pytest.mark.asyncio
async def test_08_user_can_view_player_membership_details_for_specific_club(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session)
    club = await create_club(db_session, name="Detail Club")
    pm = await create_player_membership(
        db_session,
        user,
        club,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="AUG-DETAIL-01",
    )
    await db_session.commit()

    headers = make_auth_header(user.id)
    resp = await async_client.get(f"/api/v1/player/clubs/{club.id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(pm.id)
    assert data["club_name"] == "Detail Club"
    assert data["membership_number"] == "AUG-DETAIL-01"
    assert data["status"] == "active"


# ─── Club-Side Player Administration Tests ────────────────────────────────────

@pytest.mark.asyncio
async def test_09_club_owner_and_manager_can_list_player_memberships(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session, email="owner@perm.local")
    manager = await create_user(db_session, email="manager@perm.local")
    player = await create_user(db_session, email="player@perm.local")
    club = await create_club(db_session)

    await create_staff_membership(db_session, owner, club, role=ClubRole.CLUB_OWNER)
    await create_staff_membership(db_session, manager, club, role=ClubRole.CLUB_MANAGER)
    await create_player_membership(db_session, player, club)
    await db_session.commit()

    # Owner can list
    resp_owner = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(owner.id),
    )
    assert resp_owner.status_code == 200
    assert len(resp_owner.json()) == 1

    # Manager can list (MANAGE_MEMBERS is granted to club_manager)
    resp_mgr = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(manager.id),
    )
    assert resp_mgr.status_code == 200
    assert len(resp_mgr.json()) == 1


@pytest.mark.asyncio
async def test_10_tournament_director_cannot_list_player_memberships(
    async_client: AsyncClient, db_session: AsyncSession
):
    td = await create_user(db_session, email="td@perm.local")
    club = await create_club(db_session)
    await create_staff_membership(db_session, td, club, role=ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(td.id),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_11_user_with_no_staff_role_cannot_list_player_memberships(
    async_client: AsyncClient, db_session: AsyncSession
):
    player = await create_user(db_session, email="pureplayer@perm.local")
    club = await create_club(db_session)
    await create_player_membership(db_session, player, club)
    await db_session.commit()

    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(player.id),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_12_manager_can_enroll_player_into_club(
    async_client: AsyncClient, db_session: AsyncSession
):
    manager = await create_user(db_session)
    player = await create_user(db_session, email="enroll_me@test.local")
    club = await create_club(db_session)

    await create_staff_membership(db_session, manager, club, role=ClubRole.CLUB_MANAGER)
    await db_session.commit()

    headers = make_auth_header(manager.id)
    payload = {
        "email": "enroll_me@test.local",
        "membership_number": "ENR-001",
        "status": "active",
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/player-memberships",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["user_email"] == "enroll_me@test.local"
    assert data["membership_number"] == "ENR-001"
    assert data["status"] == "active"


@pytest.mark.asyncio
async def test_13_enrolling_non_existent_user_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session)
    club = await create_club(db_session)
    await create_staff_membership(db_session, owner, club, role=ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    payload = {"email": "nobody@doesnotexist.local", "status": "active"}
    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/player-memberships",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_14_enrolling_already_active_player_returns_400(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session)
    player = await create_user(db_session, email="already_active@test.local")
    club = await create_club(db_session)

    await create_staff_membership(db_session, owner, club, role=ClubRole.CLUB_OWNER)
    await create_player_membership(db_session, player, club, status=PlayerMembershipStatus.ACTIVE)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    payload = {"email": "already_active@test.local", "status": "active"}
    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/player-memberships",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 400
    assert "already has an active player membership" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_15_enrolling_inactive_player_reactivates_membership(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session)
    player = await create_user(db_session, email="rejoin@test.local")
    club = await create_club(db_session)

    await create_staff_membership(db_session, owner, club, role=ClubRole.CLUB_OWNER)
    # Existing expired membership
    await create_player_membership(
        db_session,
        player,
        club,
        status=PlayerMembershipStatus.EXPIRED,
        membership_number="OLD-001",
    )
    await db_session.commit()

    headers = make_auth_header(owner.id)
    payload = {
        "email": "rejoin@test.local",
        "status": "active",
        "membership_number": "REJOIN-001",
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/player-memberships",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "active"
    assert data["membership_number"] == "REJOIN-001"


@pytest.mark.asyncio
async def test_16_tournament_director_cannot_enroll_player(
    async_client: AsyncClient, db_session: AsyncSession
):
    td = await create_user(db_session)
    player = await create_user(db_session, email="candidate@test.local")
    club = await create_club(db_session)

    await create_staff_membership(db_session, td, club, role=ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    headers = make_auth_header(td.id)
    payload = {"email": "candidate@test.local", "status": "active"}
    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/player-memberships",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_17_staff_with_manage_members_can_update_player_membership(
    async_client: AsyncClient, db_session: AsyncSession
):
    manager = await create_user(db_session)
    player = await create_user(db_session)
    club = await create_club(db_session)

    await create_staff_membership(db_session, manager, club, role=ClubRole.CLUB_MANAGER)
    pm = await create_player_membership(
        db_session, player, club, status=PlayerMembershipStatus.ACTIVE
    )
    await db_session.commit()

    headers = make_auth_header(manager.id)
    payload = {"status": "suspended", "membership_number": "SUSP-123"}
    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/player-memberships/{pm.id}",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "suspended"
    assert data["membership_number"] == "SUSP-123"


@pytest.mark.asyncio
async def test_18_updating_player_membership_with_invalid_expiry_fails(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session)
    player = await create_user(db_session)
    club = await create_club(db_session)

    await create_staff_membership(db_session, owner, club, role=ClubRole.CLUB_OWNER)
    # Joined 10 days ago
    joined = datetime.now(timezone.utc) - timedelta(days=10)
    pm = await create_player_membership(db_session, player, club, joined_at=joined)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    # Expiry 20 days ago (before joined)
    bad_expiry = (joined - timedelta(days=10)).isoformat()
    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/player-memberships/{pm.id}",
        json={"expires_at": bad_expiry},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "expires_at cannot be before joined_at" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_19_staff_cannot_update_player_membership_of_different_club(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner_a = await create_user(db_session)
    player_b = await create_user(db_session)
    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")

    await create_staff_membership(db_session, owner_a, club_a, role=ClubRole.CLUB_OWNER)
    pm_b = await create_player_membership(db_session, player_b, club_b)
    await db_session.commit()

    headers = make_auth_header(owner_a.id)
    resp = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/player-memberships/{pm_b.id}",
        json={"status": "inactive"},
        headers=headers,
    )
    assert resp.status_code == 404


# ─── Dual Identity & Multi-Club Architecture Tests ────────────────────────────

@pytest.mark.asyncio
async def test_20_dual_identity_user_can_hold_staff_role_and_player_membership(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session, email="dual@demo.local")
    club = await create_club(db_session, name="Dual Club")

    # Staff role
    await create_staff_membership(db_session, user, club, role=ClubRole.CLUB_OWNER)
    # Player membership
    await create_player_membership(
        db_session, user, club, membership_number="DUAL-P-01"
    )
    await db_session.commit()

    headers = make_auth_header(user.id)

    # 1. Check staff clubs
    resp_staff = await async_client.get("/api/v1/clubs", headers=headers)
    assert resp_staff.status_code == 200
    assert len(resp_staff.json()) == 1
    assert resp_staff.json()[0]["role"] == "club_owner"

    # 2. Check player clubs
    resp_player = await async_client.get("/api/v1/player/clubs", headers=headers)
    assert resp_player.status_code == 200
    assert len(resp_player.json()) == 1
    assert resp_player.json()[0]["membership_number"] == "DUAL-P-01"


@pytest.mark.asyncio
async def test_21_player_can_belong_to_multiple_clubs(
    async_client: AsyncClient, db_session: AsyncSession
):
    player = await create_user(db_session, email="multiclub_player@test.local")
    club_alpha = await create_club(db_session, name="Alpha Club")
    club_beta = await create_club(db_session, name="Beta Club")

    await create_player_membership(db_session, player, club_alpha, membership_number="ALPHA-01")
    await create_player_membership(db_session, player, club_beta, membership_number="BETA-02")
    await db_session.commit()

    headers = make_auth_header(player.id)
    resp = await async_client.get("/api/v1/player/clubs", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    club_ids = {c["club_id"] for c in data}
    assert str(club_alpha.id) in club_ids
    assert str(club_beta.id) in club_ids


# ─── Data Validation & Edge Cases ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_22_profile_sanitizes_strings(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session)
    await db_session.commit()

    headers = make_auth_header(user.id)
    payload = {
        "display_name": "   TrimmedName   ",
        "first_name": "  Jane  ",
        "last_name": "  ",  # all whitespace should become None
        "bio": "   Pickleball addict   ",
    }
    resp = await async_client.post("/api/v1/player/profile", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["display_name"] == "TrimmedName"
    assert data["first_name"] == "Jane"
    assert data["last_name"] is None
    assert data["bio"] == "Pickleball addict"


@pytest.mark.asyncio
async def test_23_future_date_of_birth_rejected(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session)
    await db_session.commit()

    headers = make_auth_header(user.id)
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    resp = await async_client.post(
        "/api/v1/player/profile",
        json={"display_name": "TimeTraveler", "date_of_birth": tomorrow},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_24_invalid_profile_image_url_rejected(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session)
    await db_session.commit()

    headers = make_auth_header(user.id)
    resp = await async_client.post(
        "/api/v1/player/profile",
        json={"display_name": "BadURL", "profile_image_url": "javascript:alert(1)"},
        headers=headers,
    )
    assert resp.status_code == 422


# ─── Unauthenticated Access Denials ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_25_unauthenticated_player_profile_returns_401(
    async_client: AsyncClient
):
    resp = await async_client.get("/api/v1/player/profile")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_26_unauthenticated_player_clubs_returns_401(
    async_client: AsyncClient
):
    resp = await async_client.get("/api/v1/player/clubs")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_27_unauthenticated_club_player_memberships_returns_401(
    async_client: AsyncClient
):
    dummy_club_id = uuid.uuid4()
    resp = await async_client.get(f"/api/v1/clubs/{dummy_club_id}/player-memberships")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_28_player_clubs_not_found_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    user = await create_user(db_session)
    club = await create_club(db_session)
    await db_session.commit()

    # User is not enrolled in club
    headers = make_auth_header(user.id)
    resp = await async_client.get(f"/api/v1/player/clubs/{club.id}", headers=headers)
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_29_upload_and_delete_player_profile_photo(
    async_client: AsyncClient, db_session: AsyncSession
):
    import base64
    user = await create_user(db_session, email="photo_player@demo.local")
    headers = make_auth_header(user.id)

    # 1. Create player profile
    create_resp = await async_client.post(
        "/api/v1/player/profile",
        json={"display_name": "Photo Pete"},
        headers=headers,
    )
    assert create_resp.status_code == 201

    # 2. Upload photo (base64 dummy png)
    dummy_b64 = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82").decode()
    upload_resp = await async_client.post(
        "/api/v1/player/profile/photo",
        json={"image_data": dummy_b64},
        headers=headers,
    )
    assert upload_resp.status_code == 200
    photo_url = upload_resp.json()["profile_image_url"]
    assert photo_url is not None
    assert "/uploads/avatars/" in photo_url

    # 3. Verify photo returned in profile
    get_resp = await async_client.get("/api/v1/player/profile", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["profile_image_url"] == photo_url

    # 4. Delete photo
    del_resp = await async_client.delete("/api/v1/player/profile/photo", headers=headers)
    assert del_resp.status_code == 200
    assert del_resp.json()["profile_image_url"] is None


@pytest.mark.asyncio
async def test_30_club_members_returns_player_profile_photo(
    async_client: AsyncClient, db_session: AsyncSession
):
    import base64
    owner = await create_user(db_session, email="owner_photo@demo.local")
    player = await create_user(db_session, email="player_photo@demo.local")
    club = await create_club(db_session, name="Photo Club")

    await create_staff_membership(db_session, owner, club, role=ClubRole.CLUB_OWNER)
    await create_player_membership(db_session, player, club, membership_number="P-PHOTO")

    # Set profile with image for player
    p_headers = make_auth_header(player.id)
    dummy_b64 = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82").decode()
    await async_client.post(
        "/api/v1/player/profile",
        json={"display_name": "Club Pete", "profile_image_url": "https://example.com/pete.jpg"},
        headers=p_headers,
    )
    await db_session.commit()

    # Club owner lists members
    o_headers = make_auth_header(owner.id)
    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=o_headers,
    )
    assert resp.status_code == 200
    members = resp.json()
    assert len(members) == 1
    assert members[0]["user_email"] == "player_photo@demo.local"
    assert members[0]["profile_image_url"] == "https://example.com/pete.jpg"
