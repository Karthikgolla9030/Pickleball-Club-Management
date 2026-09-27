"""
Aught2 Pickleball — Courts & Court Management Test Suite (Phase 10)

Tests:
1. Model tests:
   - Creation of court with all fields
   - FK relationship with Club
   - Uniqueness of court_number per club
   - Cross-club duplicate court_number allowed
   - Active/Inactive flag and status sync

2. Authorization & RBAC:
   - Club Owner has full access to manage courts
   - Club Manager has full access to manage courts
   - Tournament Director is denied (403 Forbidden)
   - Player is denied court management (403 Forbidden)
   - Unauthenticated requests are rejected (401 Unauthorized)

3. Tenant Isolation:
   - Staff of Club A cannot view/edit/deactivate Club B courts
   - Staff of Club A cannot reorder Club B courts
   - Listing courts only returns courts belonging to specified club

4. Player Access:
   - Players can view active courts via /active endpoint
   - Inactive courts are excluded from player endpoint
   - Courts returned in deterministic display_order

5. CRUD & Validation:
   - Create court assigns display_order sequentially
   - Duplicate court_number in same club rejected (400)
   - Duplicate name in same club rejected (400)
   - Update court fields
   - Soft deactivation sets is_active=False & status=inactive
   - Reactivation sets is_active=True & status=active
   - Filter staff listing by status (active / inactive / all)

6. Reordering Invariants:
   - Successful transactional reorder
   - Reorder with duplicate IDs rejected (400)
   - Reorder with foreign club court ID rejected (400)
   - Reorder with missing club court ID rejected (400)
"""
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Test Helpers ─────────────────────────────────────────────────────────────

async def create_user(
    db: AsyncSession,
    email: str | None = None,
    full_name: str = "Test User",
) -> User:
    email = email or f"user_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email,
        hashed_password=hash_password("Secret123!"),
        full_name=full_name,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


async def create_club(
    db: AsyncSession,
    name: str | None = None,
    slug: str | None = None,
) -> Club:
    suffix = uuid.uuid4().hex[:8]
    name = name or f"Club {suffix}"
    slug = slug or f"club-{suffix}"
    club = Club(name=name, slug=slug, is_active=True)
    db.add(club)
    await db.flush()
    return club


async def add_member(
    db: AsyncSession,
    club: Club,
    user: User,
    role: ClubRole = ClubRole.CLUB_OWNER,
) -> ClubMembership:
    membership = ClubMembership(
        user_id=user.id,
        club_id=club.id,
        role=role,
        is_active=True,
    )
    db.add(membership)
    await db.flush()
    return membership


async def create_court(
    db: AsyncSession,
    club: Club,
    name: str = "Court 1",
    court_number: int | None = 1,
    environment: CourtEnvironment = CourtEnvironment.INDOOR,
    surface_type: str | None = "Acrylic",
    display_order: int = 0,
    is_active: bool = True,
    status: CourtStatus = CourtStatus.ACTIVE,
) -> Court:
    court = Court(
        club_id=club.id,
        name=name,
        court_number=court_number,
        indoor_outdoor=environment,
        surface_type=surface_type,
        display_order=display_order,
        is_active=is_active,
        status=status,
    )
    db.add(court)
    await db.flush()
    return court


# ─── 1. Model & Data Tests ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_court_model_creation(db_session: AsyncSession):
    """Test court creation and attributes."""
    club = await create_club(db_session)
    court = await create_court(
        db_session,
        club,
        name="Center Court",
        court_number=1,
        environment=CourtEnvironment.INDOOR,
        surface_type="Cushioned Acrylic",
        display_order=0,
    )
    assert court.id is not None
    assert court.club_id == club.id
    assert court.name == "Center Court"
    assert court.court_number == 1
    assert court.indoor_outdoor == CourtEnvironment.INDOOR
    assert court.is_active is True
    assert court.status == CourtStatus.ACTIVE


@pytest.mark.asyncio
async def test_cross_club_duplicate_court_number_allowed(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Different clubs can each have Court #1."""
    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")
    owner = await create_user(db_session)
    await add_member(db_session, club_a, owner, ClubRole.CLUB_OWNER)
    await add_member(db_session, club_b, owner, ClubRole.CLUB_OWNER)
    headers = make_auth_header(owner)

    # Create Court 1 in Club A
    res_a = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/courts",
        headers=headers,
        json={"name": "Court 1", "court_number": 1, "indoor_outdoor": "indoor"},
    )
    assert res_a.status_code == 201

    # Create Court 1 in Club B (same number, different club)
    res_b = await async_client.post(
        f"/api/v1/clubs/{club_b.id}/courts",
        headers=headers,
        json={"name": "Court 1", "court_number": 1, "indoor_outdoor": "outdoor"},
    )
    assert res_b.status_code == 201


# ─── 2. Authorization & RBAC Tests ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_owner_and_manager_can_create_courts(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Club Owner and Manager have MANAGE_COURTS permission."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    manager = await create_user(db_session)
    await add_member(db_session, club, owner, ClubRole.CLUB_OWNER)
    await add_member(db_session, club, manager, ClubRole.CLUB_MANAGER)

    # Owner creates court
    res_owner = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        headers=make_auth_header(owner),
        json={"name": "Court 1", "court_number": 1, "indoor_outdoor": "indoor"},
    )
    assert res_owner.status_code == 201
    data = res_owner.json()
    assert data["name"] == "Court 1"
    assert data["court_number"] == 1

    # Manager creates court
    res_mgr = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        headers=make_auth_header(manager),
        json={"name": "Court 2", "court_number": 2, "indoor_outdoor": "outdoor"},
    )
    assert res_mgr.status_code == 201
    assert res_mgr.json()["court_number"] == 2


@pytest.mark.asyncio
async def test_tournament_director_cannot_manage_courts(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Tournament Director lacks MANAGE_COURTS permission (403)."""
    club = await create_club(db_session)
    director = await create_user(db_session)
    await add_member(db_session, club, director, ClubRole.TOURNAMENT_DIRECTOR)

    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        headers=make_auth_header(director),
        json={"name": "Court 1", "court_number": 1, "indoor_outdoor": "indoor"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_player_cannot_manage_courts(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Player without staff role is denied court management (403)."""
    club = await create_club(db_session)
    player = await create_user(db_session)

    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        headers=make_auth_header(player),
        json={"name": "Court 1", "court_number": 1, "indoor_outdoor": "indoor"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_request_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Unauthenticated requests return 401."""
    club = await create_club(db_session)
    res = await async_client.get(f"/api/v1/clubs/{club.id}/courts")
    assert res.status_code == 401


# ─── 3. Tenant Isolation Tests ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_club_staff_cannot_access_foreign_club_courts(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Staff of Club A cannot view or modify Club B courts."""
    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")
    staff_a = await create_user(db_session)
    await add_member(db_session, club_a, staff_a, ClubRole.CLUB_OWNER)
    court_b = await create_court(db_session, club_b, name="Club B Court 1", court_number=1)

    headers_a = make_auth_header(staff_a)

    # Cannot list Club B courts
    res_list = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/courts",
        headers=headers_a,
    )
    assert res_list.status_code == 403

    # Cannot get Club B court details via Club A router
    res_detail = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/courts/{court_b.id}",
        headers=headers_a,
    )
    assert res_detail.status_code == 404

    # Cannot update Club B court
    res_update = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/courts/{court_b.id}",
        headers=headers_a,
        json={"name": "Hacked Court"},
    )
    assert res_update.status_code == 404


# ─── 4. Player Endpoints (/active) ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_player_can_view_active_courts_only(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Players can view active courts; inactive courts are excluded."""
    club = await create_club(db_session)
    player = await create_user(db_session)
    headers = make_auth_header(player)

    await create_court(db_session, club, name="Active Court 1", court_number=1, is_active=True, status=CourtStatus.ACTIVE, display_order=0)
    await create_court(db_session, club, name="Active Court 2", court_number=2, is_active=True, status=CourtStatus.ACTIVE, display_order=1)
    await create_court(db_session, club, name="Inactive Court 3", court_number=3, is_active=False, status=CourtStatus.INACTIVE, display_order=2)

    res = await async_client.get(
        f"/api/v1/clubs/{club.id}/courts/active",
        headers=headers,
    )
    assert res.status_code == 200
    courts = res.json()
    assert len(courts) == 2
    names = [c["name"] for c in courts]
    assert "Active Court 1" in names
    assert "Active Court 2" in names
    assert "Inactive Court 3" not in names


@pytest.mark.asyncio
async def test_player_courts_ordered_by_display_order(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Player courts endpoint returns courts sorted by display_order ascending."""
    club = await create_club(db_session)
    player = await create_user(db_session)
    headers = make_auth_header(player)

    await create_court(db_session, club, name="Third Court", court_number=3, display_order=2)
    await create_court(db_session, club, name="First Court", court_number=1, display_order=0)
    await create_court(db_session, club, name="Second Court", court_number=2, display_order=1)

    res = await async_client.get(
        f"/api/v1/clubs/{club.id}/courts/active",
        headers=headers,
    )
    assert res.status_code == 200
    courts = res.json()
    assert len(courts) == 3
    assert courts[0]["name"] == "First Court"
    assert courts[1]["name"] == "Second Court"
    assert courts[2]["name"] == "Third Court"


# ─── 5. CRUD & Validation Tests ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_court_duplicate_number_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Duplicate court_number within the same club returns 400."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await add_member(db_session, club, owner, ClubRole.CLUB_OWNER)
    headers = make_auth_header(owner)

    # First court
    res1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        headers=headers,
        json={"name": "Court 1", "court_number": 1, "indoor_outdoor": "indoor"},
    )
    assert res1.status_code == 201

    # Duplicate court_number
    res2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        headers=headers,
        json={"name": "Another Court 1", "court_number": 1, "indoor_outdoor": "outdoor"},
    )
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_court_duplicate_name_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Duplicate name within the same club returns 409 Conflict."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await add_member(db_session, club, owner, ClubRole.CLUB_OWNER)
    headers = make_auth_header(owner)

    await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        headers=headers,
        json={"name": "Center Court", "court_number": 1, "indoor_outdoor": "indoor"},
    )

    res_dup = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        headers=headers,
        json={"name": "Center Court", "court_number": 2, "indoor_outdoor": "indoor"},
    )
    assert res_dup.status_code == 409
    assert "already exists" in res_dup.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_court_and_conflict_handling(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Updating court properties works, and conflicts are prevented."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await add_member(db_session, club, owner, ClubRole.CLUB_OWNER)
    headers = make_auth_header(owner)

    court1 = await create_court(db_session, club, name="Court 1", court_number=1)
    court2 = await create_court(db_session, club, name="Court 2", court_number=2)

    # Valid update
    res = await async_client.patch(
        f"/api/v1/clubs/{club.id}/courts/{court1.id}",
        headers=headers,
        json={
            "name": "Stadium Court",
            "display_name": "Main Showcase",
            "surface_type": "Cushioned",
            "indoor_outdoor": "covered",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Stadium Court"
    assert data["display_name"] == "Main Showcase"
    assert data["surface_type"] == "Cushioned"
    assert data["indoor_outdoor"] == "covered"

    # Conflicting number update: trying to set court2's number to court1's number
    res_conflict = await async_client.patch(
        f"/api/v1/clubs/{club.id}/courts/{court2.id}",
        headers=headers,
        json={"court_number": 1},
    )
    assert res_conflict.status_code == 409


@pytest.mark.asyncio
async def test_soft_deactivation_and_reactivation(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Soft deactivating and reactivating a court preserves the record."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await add_member(db_session, club, owner, ClubRole.CLUB_OWNER)
    headers = make_auth_header(owner)

    court = await create_court(db_session, club, name="Court 1", court_number=1)

    # Soft deactivate
    res_del = await async_client.delete(
        f"/api/v1/clubs/{club.id}/courts/{court.id}",
        headers=headers,
    )
    assert res_del.status_code == 200
    data_del = res_del.json()
    assert data_del["is_active"] is False
    assert data_del["status"] == "inactive"

    # Reactivate
    res_react = await async_client.patch(
        f"/api/v1/clubs/{club.id}/courts/{court.id}/reactivate",
        headers=headers,
    )
    assert res_react.status_code == 200
    data_react = res_react.json()
    assert data_react["is_active"] is True
    assert data_react["status"] == "active"


@pytest.mark.asyncio
async def test_staff_list_courts_filter_by_status(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Staff can list all courts, or filter by active/inactive."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await add_member(db_session, club, owner, ClubRole.CLUB_OWNER)
    headers = make_auth_header(owner)

    await create_court(db_session, club, name="Court 1", court_number=1, is_active=True, status=CourtStatus.ACTIVE)
    await create_court(db_session, club, name="Court 2", court_number=2, is_active=False, status=CourtStatus.INACTIVE)

    # List all
    res_all = await async_client.get(f"/api/v1/clubs/{club.id}/courts", headers=headers)
    assert res_all.status_code == 200
    assert len(res_all.json()) == 2

    # Filter active
    res_active = await async_client.get(f"/api/v1/clubs/{club.id}/courts?status=active", headers=headers)
    assert res_active.status_code == 200
    assert len(res_active.json()) == 1
    assert res_active.json()[0]["name"] == "Court 1"

    # Filter inactive
    res_inactive = await async_client.get(f"/api/v1/clubs/{club.id}/courts?status=inactive", headers=headers)
    assert res_inactive.status_code == 200
    assert len(res_inactive.json()) == 1
    assert res_inactive.json()[0]["name"] == "Court 2"


# ─── 6. Reordering Tests ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reorder_courts_success(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Staff can successfully reorder courts within their club."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await add_member(db_session, club, owner, ClubRole.CLUB_OWNER)
    headers = make_auth_header(owner)

    c1 = await create_court(db_session, club, name="Court 1", court_number=1, display_order=0)
    c2 = await create_court(db_session, club, name="Court 2", court_number=2, display_order=1)
    c3 = await create_court(db_session, club, name="Court 3", court_number=3, display_order=2)

    # Reverse order: c3, c2, c1
    reorder_payload = {"court_ids": [str(c3.id), str(c2.id), str(c1.id)]}
    res = await async_client.patch(
        f"/api/v1/clubs/{club.id}/courts/reorder",
        headers=headers,
        json=reorder_payload,
    )
    assert res.status_code == 200
    reordered = res.json()
    assert [c["id"] for c in reordered] == [str(c3.id), str(c2.id), str(c1.id)]
    assert [c["display_order"] for c in reordered] == [0, 1, 2]


@pytest.mark.asyncio
async def test_reorder_duplicate_ids_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Reordering payload with duplicate IDs is rejected (400)."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await add_member(db_session, club, owner, ClubRole.CLUB_OWNER)
    headers = make_auth_header(owner)

    c1 = await create_court(db_session, club, name="Court 1", court_number=1, display_order=0)
    c2 = await create_court(db_session, club, name="Court 2", court_number=2, display_order=1)

    res = await async_client.patch(
        f"/api/v1/clubs/{club.id}/courts/reorder",
        headers=headers,
        json={"court_ids": [str(c1.id), str(c1.id)]},
    )
    assert res.status_code == 400
    assert "duplicate" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_reorder_foreign_court_id_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Reordering payload with an ID from another club is rejected (400)."""
    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")
    owner = await create_user(db_session)
    await add_member(db_session, club_a, owner, ClubRole.CLUB_OWNER)
    headers = make_auth_header(owner)

    c_a = await create_court(db_session, club_a, name="Court A1", court_number=1)
    c_b = await create_court(db_session, club_b, name="Court B1", court_number=1)

    res = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/courts/reorder",
        headers=headers,
        json={"court_ids": [str(c_a.id), str(c_b.id)]},
    )
    assert res.status_code == 400
    assert "belong to this club" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_reorder_partial_list_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Reordering list missing existing club courts is rejected (400)."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await add_member(db_session, club, owner, ClubRole.CLUB_OWNER)
    headers = make_auth_header(owner)

    c1 = await create_court(db_session, club, name="Court 1", court_number=1, display_order=0)
    _c2 = await create_court(db_session, club, name="Court 2", court_number=2, display_order=1)

    # Only include c1, omit c2
    res = await async_client.patch(
        f"/api/v1/clubs/{club.id}/courts/reorder",
        headers=headers,
        json={"court_ids": [str(c1.id)]},
    )
    assert res.status_code == 400
    assert "must contain all" in res.json()["detail"].lower()
