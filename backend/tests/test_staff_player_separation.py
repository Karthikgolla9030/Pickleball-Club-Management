"""
Test strict separation between Staff and Player memberships, and profile image URL inclusion.
"""
import uuid
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


async def make_user(
    db: AsyncSession,
    email: str | None = None,
    full_name: str = "Test User",
    avatar_url: str | None = None,
) -> User:
    email = email or f"user_{uuid.uuid4().hex[:8]}@example.com"
    user = User(
        email=email,
        hashed_password=hash_password("Password123!"),
        full_name=full_name,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    if avatar_url:
        prof = PlayerProfile(
            user_id=user.id,
            display_name=full_name,
            profile_image_url=avatar_url,
        )
        db.add(prof)
        await db.flush()

    return user


async def make_club(db: AsyncSession, name: str = "Alpha Club") -> Club:
    slug = f"club-{uuid.uuid4().hex[:8]}"
    club = Club(
        name=name,
        slug=slug,
        is_active=True,
    )
    db.add(club)
    await db.flush()
    return club


@pytest.mark.asyncio
async def test_staff_excluded_from_player_memberships(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    club = await make_club(db_session)

    # 1. Staff owner user
    owner_user = await make_user(db_session, email="owner@alpha.local", full_name="Alice Owner", avatar_url="https://example.com/alice.jpg")
    owner_mem = ClubMembership(
        user_id=owner_user.id,
        club_id=club.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(owner_mem)

    # Give owner also a player membership in the same club (dual identity in DB)
    owner_player_mem = ClubPlayerMembership(
        user_id=owner_user.id,
        club_id=club.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="OWN-001",
    )
    db_session.add(owner_player_mem)

    # 2. Pure player user
    pure_player = await make_user(db_session, email="player@alpha.local", full_name="Bob Player", avatar_url="https://example.com/bob.jpg")
    pure_player_mem = ClubPlayerMembership(
        user_id=pure_player.id,
        club_id=club.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="AUG-P-001",
    )
    db_session.add(pure_player_mem)

    await db_session.commit()

    headers = make_auth_header(owner_user)

    # Test GET /clubs/{club_id}/player-memberships
    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    players = resp.json()

    # The player list must include pure_player, but MUST NOT include owner_user
    player_emails = [p["user_email"] for p in players]
    assert "player@alpha.local" in player_emails
    assert "owner@alpha.local" not in player_emails

    # Verify player profile image is returned
    bob_record = next(p for p in players if p["user_email"] == "player@alpha.local")
    assert bob_record["profile_image_url"] == "https://example.com/bob.jpg"

    # Test GET /clubs/{club_id}/members (Staff list)
    staff_resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/members",
        headers=headers,
    )
    assert staff_resp.status_code == 200, staff_resp.text
    staff = staff_resp.json()

    # Staff list must include owner, but MUST NOT include pure player
    staff_emails = [s["user_email"] for s in staff]
    assert "owner@alpha.local" in staff_emails
    assert "player@alpha.local" not in staff_emails

    # Verify staff profile image is returned
    owner_record = next(s for s in staff if s["user_email"] == "owner@alpha.local")
    assert owner_record["profile_image_url"] == "https://example.com/alice.jpg"


@pytest.mark.asyncio
async def test_all_staff_roles_excluded_from_player_memberships(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    club = await make_club(db_session, "Beta Club")

    # Create Owner, Manager, Tournament Director
    owner = await make_user(db_session, "owner@beta.local", "Beta Owner")
    db_session.add(ClubMembership(user_id=owner.id, club_id=club.id, role=ClubRole.CLUB_OWNER))
    db_session.add(ClubPlayerMembership(user_id=owner.id, club_id=club.id, status=PlayerMembershipStatus.ACTIVE))

    manager = await make_user(db_session, "manager@beta.local", "Beta Manager")
    db_session.add(ClubMembership(user_id=manager.id, club_id=club.id, role=ClubRole.CLUB_MANAGER))
    db_session.add(ClubPlayerMembership(user_id=manager.id, club_id=club.id, status=PlayerMembershipStatus.ACTIVE))

    director = await make_user(db_session, "director@beta.local", "Beta Director")
    db_session.add(ClubMembership(user_id=director.id, club_id=club.id, role=ClubRole.TOURNAMENT_DIRECTOR))
    db_session.add(ClubPlayerMembership(user_id=director.id, club_id=club.id, status=PlayerMembershipStatus.ACTIVE))

    # Real enrolled players
    p1 = await make_user(db_session, "p1@beta.local", "Player One")
    db_session.add(ClubPlayerMembership(user_id=p1.id, club_id=club.id, status=PlayerMembershipStatus.ACTIVE))
    p2 = await make_user(db_session, "p2@beta.local", "Player Two")
    db_session.add(ClubPlayerMembership(user_id=p2.id, club_id=club.id, status=PlayerMembershipStatus.ACTIVE))

    await db_session.commit()

    headers = make_auth_header(owner)

    # 1. GET player-memberships
    p_resp = await async_client.get(f"/api/v1/clubs/{club.id}/player-memberships", headers=headers)
    assert p_resp.status_code == 200
    players = p_resp.json()
    player_emails = {p["user_email"] for p in players}

    assert player_emails == {"p1@beta.local", "p2@beta.local"}
    assert "owner@beta.local" not in player_emails
    assert "manager@beta.local" not in player_emails
    assert "director@beta.local" not in player_emails

    # 2. GET members (staff)
    s_resp = await async_client.get(f"/api/v1/clubs/{club.id}/members", headers=headers)
    assert s_resp.status_code == 200
    staff = s_resp.json()
    staff_emails = {s["user_email"] for s in staff}

    assert staff_emails == {"owner@beta.local", "manager@beta.local", "director@beta.local"}
    assert "p1@beta.local" not in staff_emails
    assert "p2@beta.local" not in staff_emails
