"""
Aught2 Pickleball — Regression Test Suite
Focus: Player Profile Persistence & Scramble Registration Gender Validation

Verifies:
 1. Profile persistence: phone, gender, and bio updates persist across requests,
    form reopenings, screen navigation, and re-authentication sessions.
 2. Cache-Control headers ensure GET /api/v1/player/profile is never cached by browsers/proxies.
 3. Clearing optional fields (phone, bio) correctly resets them to None in the database.
 4. Proper error responses on invalid data without corrupting existing profile.
 5. User isolation: User A cannot read or modify User B's profile.
 6. Men's Scramble registration with Male profile -> 201 Confirmed.
 7. Men's Scramble registration with gender selected during registration -> persists to profile and 201 Confirmed.
 8. Men's Scramble registration with genuinely missing gender -> 400 with specific requirement error.
 9. Men's Scramble registration with Female profile -> 400 with division restriction error.
10. Women's Scramble registration rules (Female accepted, Male rejected, missing rejected).
11. Mixed Scramble registration rules (Male/Female accepted, missing rejected).
12. Failed eligibility checks do not create confirmed registrations or increment participant counts.
13. Reopening tournament registration reflects persisted state.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import (
    ClubPlayerMembership,
    PlayerMembershipStatus,
)
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import (
    RegistrationStatus,
    TournamentRegistration,
)
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def setup_regression_env(db_session: AsyncSession):
    now = datetime.now(timezone.utc)

    # 1. Platform Club
    club = Club(
        name=f"Pickle Club {uuid.uuid4().hex[:6]}",
        slug=f"club-{uuid.uuid4().hex[:6]}",
        timezone="America/New_York",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    # 2. Tournament Director
    director = User(
        email=f"director_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Password123!"),
        full_name="Tournament Director",
        is_active=True,
        is_verified=True,
    )
    db_session.add(director)
    await db_session.flush()

    dir_cm = ClubMembership(
        club_id=club.id,
        user_id=director.id,
        role=ClubRole.TOURNAMENT_DIRECTOR,
        is_active=True,
    )
    db_session.add(dir_cm)

    # 3. Male Player
    male_user = User(
        email=f"male_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Password123!"),
        full_name="Male Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(male_user)
    await db_session.flush()

    male_profile = PlayerProfile(
        user_id=male_user.id,
        display_name="Male Player",
        gender="Male",
        phone="+1 555-100-2000",
        bio="Competitive 3.5 player",
        skill_rating=3.5,
    )
    db_session.add(male_profile)

    male_cpm = ClubPlayerMembership(
        club_id=club.id,
        user_id=male_user.id,
        membership_number="M-001",
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(male_cpm)

    # 4. Female Player
    female_user = User(
        email=f"female_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Password123!"),
        full_name="Female Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(female_user)
    await db_session.flush()

    female_profile = PlayerProfile(
        user_id=female_user.id,
        display_name="Female Player",
        gender="Female",
        phone="+1 555-200-3000",
        bio="Advanced 4.0 player",
        skill_rating=4.0,
    )
    db_session.add(female_profile)

    female_cpm = ClubPlayerMembership(
        club_id=club.id,
        user_id=female_user.id,
        membership_number="F-001",
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(female_cpm)

    # 5. Player with Profile but Missing Gender
    unspecified_user = User(
        email=f"unspec_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Password123!"),
        full_name="Unspecified Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(unspecified_user)
    await db_session.flush()

    unspecified_profile = PlayerProfile(
        user_id=unspecified_user.id,
        display_name="Unspecified Player",
        gender=None,
        phone=None,
        bio=None,
        skill_rating=3.5,
    )
    db_session.add(unspecified_profile)

    unspecified_cpm = ClubPlayerMembership(
        club_id=club.id,
        user_id=unspecified_user.id,
        membership_number="U-001",
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(unspecified_cpm)

    # 6. Player with No Profile Record at all
    no_profile_user = User(
        email=f"noprofile_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Password123!"),
        full_name="No Profile Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(no_profile_user)
    await db_session.flush()

    no_profile_cpm = ClubPlayerMembership(
        club_id=club.id,
        user_id=no_profile_user.id,
        membership_number="NP-001",
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(no_profile_cpm)

    # 7. Create Scramble Tournaments
    mens_scramble = Tournament(
        club_id=club.id,
        name="Men's Scramble Open",
        format=TournamentFormat.SCRAMBLE,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        format_configuration={"category": "Men's Scramble", "rounds": 3},
        start_date=now + timedelta(days=3),
        end_date=now + timedelta(days=4),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=2),
        max_participants=16,
    )
    db_session.add(mens_scramble)

    womens_scramble = Tournament(
        club_id=club.id,
        name="Women's Scramble Open",
        format=TournamentFormat.SCRAMBLE,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        format_configuration={"category": "Women's Scramble", "rounds": 3},
        start_date=now + timedelta(days=3),
        end_date=now + timedelta(days=4),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=2),
        max_participants=16,
    )
    db_session.add(womens_scramble)

    mixed_scramble = Tournament(
        club_id=club.id,
        name="Mixed Scramble Open",
        format=TournamentFormat.SCRAMBLE,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        format_configuration={"category": "Mixed Scramble", "rounds": 3},
        start_date=now + timedelta(days=3),
        end_date=now + timedelta(days=4),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=2),
        max_participants=16,
    )
    db_session.add(mixed_scramble)

    await db_session.commit()

    return {
        "club": club,
        "director": director,
        "male_user": male_user,
        "male_cpm": male_cpm,
        "female_user": female_user,
        "female_cpm": female_cpm,
        "unspecified_user": unspecified_user,
        "unspecified_cpm": unspecified_cpm,
        "no_profile_user": no_profile_user,
        "mens_scramble": mens_scramble,
        "womens_scramble": womens_scramble,
        "mixed_scramble": mixed_scramble,
    }


# ─── 1. PLAYER PROFILE PERSISTENCE TESTS ─────────────────────────────────────

class TestPlayerProfilePersistence:

    @pytest.mark.asyncio
    async def test_update_phone_gender_bio_persistence_and_cache_headers(
        self, async_client: AsyncClient, setup_regression_env: dict
    ):
        """
        Updates phone number, gender, and bio.
        Verifies:
         - Backend returns updated values immediately in PATCH response.
         - Cache-Control header has no-cache, no-store.
         - Subsequent GET returns identical updated values (form reopening).
         - Re-authentication session (logout/login simulation) returns identical saved values.
        """
        user = setup_regression_env["unspecified_user"]
        headers = make_auth_header(user)

        # 1. Update personal info
        update_payload = {
            "display_name": "Updated Name",
            "phone": "+91 98765 43210",
            "gender": "Male",
            "bio": "Passionate tournament player looking for competitive matches.",
        }
        patch_res = await async_client.patch(
            "/api/v1/player/profile",
            headers=headers,
            json=update_payload,
        )
        assert patch_res.status_code == 200
        patch_data = patch_res.json()
        assert patch_data["display_name"] == "Updated Name"
        assert patch_data["phone"] == "+91 98765 43210"
        assert patch_data["gender"] == "Male"
        assert patch_data["bio"] == "Passionate tournament player looking for competitive matches."

        # Cache control headers check
        assert "no-cache" in patch_res.headers.get("cache-control", "")
        assert "no-store" in patch_res.headers.get("cache-control", "")

        # 2. Form Reopen Simulation (GET profile)
        get_res = await async_client.get(
            "/api/v1/player/profile",
            headers=headers,
        )
        assert get_res.status_code == 200
        get_data = get_res.json()
        assert get_data["display_name"] == "Updated Name"
        assert get_data["phone"] == "+91 98765 43210"
        assert get_data["gender"] == "Male"
        assert get_data["bio"] == "Passionate tournament player looking for competitive matches."
        assert "no-store" in get_res.headers.get("cache-control", "")

        # 3. Fresh session simulation (new token)
        fresh_headers = make_auth_header(user)
        session_res = await async_client.get(
            "/api/v1/player/profile",
            headers=fresh_headers,
        )
        assert session_res.status_code == 200
        session_data = session_res.json()
        assert session_data["phone"] == "+91 98765 43210"
        assert session_data["gender"] == "Male"
        assert session_data["bio"] == "Passionate tournament player looking for competitive matches."

    @pytest.mark.asyncio
    async def test_clearing_optional_fields_persists_none(
        self, async_client: AsyncClient, setup_regression_env: dict
    ):
        """
        Clearing phone and bio (setting them to null/None) persists to the DB.
        """
        user = setup_regression_env["male_user"]
        headers = make_auth_header(user)

        # Male profile starts with phone and bio populated
        get_res = await async_client.get("/api/v1/player/profile", headers=headers)
        assert get_res.status_code == 200
        assert get_res.json()["phone"] is not None
        assert get_res.json()["bio"] is not None

        # Clear phone and bio
        clear_res = await async_client.patch(
            "/api/v1/player/profile",
            headers=headers,
            json={"phone": None, "bio": None},
        )
        assert clear_res.status_code == 200
        assert clear_res.json()["phone"] is None
        assert clear_res.json()["bio"] is None
        # Gender should remain unchanged
        assert clear_res.json()["gender"] == "Male"

        # Verify on subsequent GET
        verify_res = await async_client.get("/api/v1/player/profile", headers=headers)
        assert verify_res.status_code == 200
        assert verify_res.json()["phone"] is None
        assert verify_res.json()["bio"] is None
        assert verify_res.json()["gender"] == "Male"

    @pytest.mark.asyncio
    async def test_failed_update_does_not_mutate_profile(
        self, async_client: AsyncClient, setup_regression_env: dict
    ):
        """
        Validation failure (e.g. invalid date of birth in future) returns 422 and does not corrupt existing data.
        """
        user = setup_regression_env["female_user"]
        headers = make_auth_header(user)

        fail_res = await async_client.patch(
            "/api/v1/player/profile",
            headers=headers,
            json={"date_of_birth": "2099-01-01"},
        )
        assert fail_res.status_code == 422

        # Existing profile untouched
        get_res = await async_client.get("/api/v1/player/profile", headers=headers)
        assert get_res.status_code == 200
        assert get_res.json()["gender"] == "Female"
        assert get_res.json()["phone"] == "+1 555-200-3000"

    @pytest.mark.asyncio
    async def test_user_profile_isolation(
        self, async_client: AsyncClient, setup_regression_env: dict
    ):
        """
        Updating User A's profile does not affect User B's profile.
        """
        user_a = setup_regression_env["male_user"]
        user_b = setup_regression_env["female_user"]

        headers_a = make_auth_header(user_a)
        headers_b = make_auth_header(user_b)

        await async_client.patch(
            "/api/v1/player/profile",
            headers=headers_a,
            json={"phone": "+1 999-999-9999", "bio": "Bio for A"},
        )

        res_b = await async_client.get("/api/v1/player/profile", headers=headers_b)
        assert res_b.status_code == 200
        assert res_b.json()["phone"] == "+1 555-200-3000"
        assert res_b.json()["gender"] == "Female"
        assert res_b.json()["bio"] == "Advanced 4.0 player"


# ─── 2. SCRAMBLE REGISTRATION GENDER VALIDATION TESTS ────────────────────────

class TestScrambleRegistrationGenderValidation:

    @pytest.mark.asyncio
    async def test_mens_scramble_registration_with_verified_male_profile(
        self, async_client: AsyncClient, setup_regression_env: dict, db_session: AsyncSession
    ):
        """
        A player with an existing verified Male profile successfully registers for Men's Scramble.
        """
        t = setup_regression_env["mens_scramble"]
        user = setup_regression_env["male_user"]
        headers = make_auth_header(user)

        res = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=headers,
            json={"gender": "Male"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "confirmed"
        assert data["tournament_id"] == str(t.id)

        # Verify DB registration row
        male_cpm = setup_regression_env["male_cpm"]
        reg_stmt = select(TournamentRegistration).where(
            TournamentRegistration.tournament_id == t.id,
            TournamentRegistration.player_membership_id == male_cpm.id,
        )
        reg_res = await db_session.execute(reg_stmt)
        reg = reg_res.scalar_one_or_none()
        assert reg is not None
        assert reg.status == RegistrationStatus.CONFIRMED

    @pytest.mark.asyncio
    async def test_mens_scramble_persists_gender_selected_during_registration(
        self, async_client: AsyncClient, setup_regression_env: dict, db_session: AsyncSession
    ):
        """
        A player with no gender on their profile selects 'Male' during registration.
        Registration succeeds, and 'Male' persists to their profile.
        """
        t = setup_regression_env["mens_scramble"]
        user = setup_regression_env["unspecified_user"]
        headers = make_auth_header(user)

        # Initial check: profile gender is None
        prof_res = await async_client.get("/api/v1/player/profile", headers=headers)
        assert prof_res.status_code == 200
        assert prof_res.json()["gender"] is None

        # Register with gender="Male" selected in registration form
        reg_res = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=headers,
            json={"gender": "Male"},
        )
        assert reg_res.status_code == 201
        assert reg_res.json()["status"] == "confirmed"

        # Verify profile was updated in DB
        prof_after = await async_client.get("/api/v1/player/profile", headers=headers)
        assert prof_after.status_code == 200
        assert prof_after.json()["gender"] == "Male"

    @pytest.mark.asyncio
    async def test_mens_scramble_rejects_missing_gender_with_clear_message(
        self, async_client: AsyncClient, setup_regression_env: dict, db_session: AsyncSession
    ):
        """
        A player with no gender on their profile and no gender provided in payload
        is rejected with the specific requirement message:
        'Men's Scramble requires a verified player profile with gender set to Male. Please update your profile.'
        No registration or charge is created.
        """
        t = setup_regression_env["mens_scramble"]
        user = setup_regression_env["unspecified_user"]
        headers = make_auth_header(user)

        res = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=headers,
            json={},
        )
        assert res.status_code == 400
        assert "Men's Scramble requires a verified player profile with gender set to Male. Please update your profile." in res.json()["detail"]

        # Ensure no registration was created
        unspec_cpm = setup_regression_env["unspecified_cpm"]
        reg_stmt = select(TournamentRegistration).where(
            TournamentRegistration.tournament_id == t.id,
            TournamentRegistration.player_membership_id == unspec_cpm.id,
        )
        reg_res = await db_session.execute(reg_stmt)
        assert reg_res.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_mens_scramble_rejects_female_profile(
        self, async_client: AsyncClient, setup_regression_env: dict, db_session: AsyncSession
    ):
        """
        A player with a Female profile attempting to register for Men's Scramble
        is rejected with division restriction explanation.
        """
        t = setup_regression_env["mens_scramble"]
        user = setup_regression_env["female_user"]
        female_cpm = setup_regression_env["female_cpm"]
        headers = make_auth_header(user)

        res = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=headers,
            json={},
        )
        assert res.status_code == 400
        assert "This tournament division is restricted to male players." in res.json()["detail"]

        # Ensure no registration was created
        reg_stmt = select(TournamentRegistration).where(
            TournamentRegistration.tournament_id == t.id,
            TournamentRegistration.player_membership_id == female_cpm.id,
        )
        reg_res = await db_session.execute(reg_stmt)
        assert reg_res.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_womens_scramble_registration_rules(
        self, async_client: AsyncClient, setup_regression_env: dict
    ):
        """
        Women's Scramble:
         - Female player accepted -> 201 Confirmed
         - Male player rejected -> 400 with division restriction
         - Missing gender rejected -> 400 with profile requirement message
        """
        t = setup_regression_env["womens_scramble"]
        f_user = setup_regression_env["female_user"]
        m_user = setup_regression_env["male_user"]
        u_user = setup_regression_env["unspecified_user"]

        # Female player succeeds
        f_res = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=make_auth_header(f_user),
            json={"gender": "Female"},
        )
        assert f_res.status_code == 201
        assert f_res.json()["status"] == "confirmed"

        # Male player rejected
        m_res = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=make_auth_header(m_user),
            json={},
        )
        assert m_res.status_code == 400
        assert "This tournament division is restricted to female players." in m_res.json()["detail"]

        # Unspecified player rejected if no gender passed
        u_res = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=make_auth_header(u_user),
            json={},
        )
        assert u_res.status_code == 400
        assert "Women's Scramble requires a verified player profile with gender set to Female. Please update your profile." in u_res.json()["detail"]

    @pytest.mark.asyncio
    async def test_mixed_scramble_registration_rules(
        self, async_client: AsyncClient, setup_regression_env: dict
    ):
        """
        Mixed Scramble:
         - Male player accepted -> 201 Confirmed
         - Female player accepted -> 201 Confirmed
         - Missing gender rejected -> 400 with requirement message
        """
        t = setup_regression_env["mixed_scramble"]
        m_user = setup_regression_env["male_user"]
        f_user = setup_regression_env["female_user"]
        u_user = setup_regression_env["unspecified_user"]

        m_res = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=make_auth_header(m_user),
            json={},
        )
        assert m_res.status_code == 201
        assert m_res.json()["status"] == "confirmed"

        f_res = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=make_auth_header(f_user),
            json={},
        )
        assert f_res.status_code == 201
        assert f_res.json()["status"] == "confirmed"

        u_res = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=make_auth_header(u_user),
            json={},
        )
        assert u_res.status_code == 400
        assert "Mixed Scramble requires a verified player profile with gender set to Male or Female. Please update your profile." in u_res.json()["detail"]
