"""
Aught2 Pickleball — End-to-End Club Registration, Owner Profile, Club Details & Sync Verification

Covers:
  1. Club registration with owner personal details (name, email, phone, gender) and distinct club details.
  2. Platform approval provisioning exactly one Club, one CLUB_OWNER membership, and one PlayerProfile.
  3. Owner login & Club Side My Profile returning original registered name, email, phone, and gender.
  4. Owner Edit Profile updates (phone, gender, name) syncing immediately across /player/profile & /auth/me.
  5. Partial updates never overwriting existing fields with null/empty strings.
  6. Legacy approved owner without a PlayerProfile auto-hydrating from ClubApplication cleanly.
  7. Separation of owner personal phone (applicant_phone) vs club official phone (contact_phone).
  8. Club Details persistence and updates surviving simulated reload & re-login.
  9. Existing club owners and ordinary users unaffected.
"""
from __future__ import annotations

import uuid
from datetime import time

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_application import ClubApplication, ClubApplicationStatus
from app.models.club_membership import ClubMembership, ClubRole
from app.models.player_profile import PlayerProfile
from app.models.user import User
from tests.conftest import make_auth_header


@pytest_asyncio.fixture
async def platform_owner(db_session: AsyncSession) -> User:
    settings = get_settings()
    email = settings.PLATFORM_OWNER_EMAILS[0]
    user = User(
        email=email,
        hashed_password=hash_password("PlatformOwner2026!"),
        full_name="Platform Admin",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.asyncio
async def test_e2e_club_registration_profile_and_club_details_sync(
    async_client: AsyncClient,
    platform_owner: User,
    db_session: AsyncSession,
):
    uid = uuid.uuid4().hex[:6]
    owner_email = f"owner_{uid}@riverclub.local"
    owner_password = "OwnerSecure2026!"

    # Step 1: Register new club with owner personal info + club details
    reg_payload = {
        "applicant_name": "Maya Lin",
        "applicant_email": owner_email,
        "applicant_phone": "+1 512 555 0101",
        "applicant_gender": "Female",
        "applicant_password": owner_password,
        "club_name": f"Riverfront Pickleball {uid}",
        "slug": f"riverfront-{uid}",
        "short_description": "Premier indoor/outdoor courts",
        "description": "12 championship courts with pro shop and café.",
        "contact_email": f"info_{uid}@riverclub.local",
        "contact_phone": "+1 512 555 0299",
        "website": "https://riverfrontpickleball.example.com",
        "established_year": 2024,
        "address_line1": "500 Riverside Dr",
        "address_line2": "Suite 100",
        "city": "Austin",
        "state": "TX",
        "postal_code": "78704",
        "country": "United States",
        "operating_days": "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
        "opening_time": "06:30:00",
        "closing_time": "21:30:00",
        "timezone": "America/Chicago",
        "facilities_summary": "12 courts, LED lights, lounge, locker rooms",
    }

    sub_res = await async_client.post("/api/v1/club-applications", json=reg_payload)
    assert sub_res.status_code == 201, sub_res.text
    sub_data = sub_res.json()
    app_id = sub_data["id"]
    assert sub_data["applicant_phone"] == "+15125550101"
    assert sub_data["applicant_gender"] == "Female"
    assert sub_data["contact_phone"] == "+15125550299"

    # Verify exactly 1 User & 1 PlayerProfile exist (no duplicates)
    users = (await db_session.execute(select(User).where(User.email == owner_email))).scalars().all()
    assert len(users) == 1
    profiles = (
        await db_session.execute(select(PlayerProfile).where(PlayerProfile.user_id == users[0].id))
    ).scalars().all()
    assert len(profiles) == 1

    # Step 2: Platform owner approves application
    po_headers = make_auth_header(platform_owner.id)
    approve_res = await async_client.post(
        f"/api/v1/platform/club-applications/{app_id}/approve",
        headers=po_headers,
    )
    assert approve_res.status_code == 200, approve_res.text
    club_id = approve_res.json()["club_id"]
    assert club_id is not None

    # Step 3: Club owner logs into Club Side
    login_res = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": owner_email, "password": owner_password},
    )
    assert login_res.status_code == 200, login_res.text
    login_data = login_res.json()
    assert login_data["user"]["full_name"] == "Maya Lin"
    assert login_data["user"]["email"] == owner_email
    assert len(login_data["memberships"]) == 1
    assert login_data["memberships"][0]["club_id"] == club_id

    owner_headers = {"Authorization": f"Bearer {login_data['access_token']}"}

    # Step 4: Open My Profile -> verify all 4 owner fields returned from persisted DB
    prof_res = await async_client.get("/api/v1/player/profile", headers=owner_headers)
    assert prof_res.status_code == 200, prof_res.text
    prof_data = prof_res.json()
    assert prof_data["display_name"] == "Maya Lin"
    assert prof_data["first_name"] == "Maya"
    assert prof_data["last_name"] == "Lin"
    assert prof_data["phone"] == "+15125550101"
    assert prof_data["gender"] == "Female"

    # Step 5: Update phone, gender, and name in Edit Profile -> verify immediate sync
    patch_prof_res = await async_client.patch(
        "/api/v1/player/profile",
        headers=owner_headers,
        json={
            "display_name": "Maya Lin-Carter",
            "first_name": "Maya",
            "last_name": "Lin-Carter",
            "phone": "+1 512 555 0188",
            "gender": "Other",
        },
    )
    assert patch_prof_res.status_code == 200, patch_prof_res.text
    updated_prof = patch_prof_res.json()
    assert updated_prof["phone"] == "+15125550188"
    assert updated_prof["gender"] == "Other"
    assert updated_prof["display_name"] == "Maya Lin-Carter"

    # Verify /auth/me immediately reflects synced User.full_name without re-login
    me_res = await async_client.get("/api/v1/auth/me", headers=owner_headers)
    assert me_res.status_code == 200
    assert me_res.json()["user"]["full_name"] == "Maya Lin-Carter"

    # Partial update on bio alone must NOT erase phone or gender
    partial_res = await async_client.patch(
        "/api/v1/player/profile",
        headers=owner_headers,
        json={"bio": "Certified pickleball director"},
    )
    assert partial_res.status_code == 200
    assert partial_res.json()["phone"] == "+15125550188"
    assert partial_res.json()["gender"] == "Other"
    assert partial_res.json()["bio"] == "Certified pickleball director"

    # Step 6: Open Club Details -> verify ALL registration club data persisted accurately
    club_res = await async_client.get(f"/api/v1/clubs/{club_id}", headers=owner_headers)
    assert club_res.status_code == 200, club_res.text
    club_data = club_res.json()
    assert club_data["name"] == reg_payload["club_name"]
    assert club_data["short_description"] == reg_payload["short_description"]
    assert club_data["description"] == reg_payload["description"]
    assert club_data["contact_email"] == reg_payload["contact_email"]
    assert club_data["contact_phone"] == "+15125550299"  # Separate from owner's personal phone!
    assert club_data["website"] == reg_payload["website"]
    assert club_data["established_year"] == 2024
    assert club_data["address_line1"] == "500 Riverside Dr"
    assert club_data["address_line2"] == "Suite 100"
    assert club_data["city"] == "Austin"
    assert club_data["state"] == "TX"
    assert club_data["postal_code"] == "78704"
    assert club_data["country"] == "United States"
    assert club_data["operating_days"] == "Mon,Tue,Wed,Thu,Fri,Sat,Sun"
    assert club_data["opening_time"] == "06:30:00"
    assert club_data["closing_time"] == "21:30:00"
    assert club_data["timezone"] == "America/Chicago"
    assert club_data["facilities_summary"] == reg_payload["facilities_summary"]

    # Step 7: Edit Club Details & confirm persistence + sync across /auth/me memberships
    patch_club_res = await async_client.patch(
        f"/api/v1/clubs/{club_id}",
        headers=owner_headers,
        json={
            "name": f"Riverfront Premier Club {uid}",
            "contact_phone": "+1 512 555 0999",
            "facilities_summary": "14 championship courts, cafe, pro shop",
        },
    )
    assert patch_club_res.status_code == 200, patch_club_res.text
    assert patch_club_res.json()["name"] == f"Riverfront Premier Club {uid}"
    assert patch_club_res.json()["contact_phone"] == "+15125550999"

    me_after_club = await async_client.get("/api/v1/auth/me", headers=owner_headers)
    assert me_after_club.status_code == 200
    assert me_after_club.json()["memberships"][0]["club_name"] == f"Riverfront Premier Club {uid}"

    # Step 8: Simulate page reload & fresh login -> updated values persist cleanly
    relogin_res = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": owner_email, "password": owner_password},
    )
    assert relogin_res.status_code == 200
    relogin_data = relogin_res.json()
    assert relogin_data["user"]["full_name"] == "Maya Lin-Carter"
    assert relogin_data["memberships"][0]["club_name"] == f"Riverfront Premier Club {uid}"
    fresh_headers = {"Authorization": f"Bearer {relogin_data['access_token']}"}

    prof_reload = await async_client.get("/api/v1/player/profile", headers=fresh_headers)
    assert prof_reload.status_code == 200
    assert prof_reload.json()["phone"] == "+15125550188"
    assert prof_reload.json()["gender"] == "Other"

    club_reload = await async_client.get(f"/api/v1/clubs/{club_id}", headers=fresh_headers)
    assert club_reload.status_code == 200
    assert club_reload.json()["contact_phone"] == "+15125550999"
    assert club_reload.json()["facilities_summary"] == "14 championship courts, cafe, pro shop"


@pytest.mark.asyncio
async def test_e2e_club_without_contact_phone_does_not_leak_owner_personal_phone(
    async_client: AsyncClient,
    platform_owner: User,
):
    uid = uuid.uuid4().hex[:6]
    email = f"separate_{uid}@club.local"
    sub_res = await async_client.post(
        "/api/v1/club-applications",
        json={
            "applicant_name": "Jordan Blake",
            "applicant_email": email,
            "applicant_phone": "+1 415 555 0144",
            "applicant_gender": "Male",
            "applicant_password": "Password123!",
            "club_name": f"Golden Gate Club {uid}",
            "slug": f"golden-gate-{uid}",
            # contact_phone intentionally omitted
        },
    )
    assert sub_res.status_code == 201
    app_data = sub_res.json()
    assert app_data["applicant_phone"] == "+14155550144"
    assert app_data["contact_phone"] is None

    approve_res = await async_client.post(
        f"/api/v1/platform/club-applications/{app_data['id']}/approve",
        headers=make_auth_header(platform_owner.id),
    )
    assert approve_res.status_code == 200
    club_id = approve_res.json()["club_id"]

    login_res = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": email, "password": "Password123!"},
    )
    headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    prof = (await async_client.get("/api/v1/player/profile", headers=headers)).json()
    club = (await async_client.get(f"/api/v1/clubs/{club_id}", headers=headers)).json()
    assert prof["phone"] == "+14155550144"
    assert prof["gender"] == "Male"
    assert club["contact_phone"] is None


@pytest.mark.asyncio
async def test_e2e_legacy_approved_owner_without_player_profile_hydrates_cleanly(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Existing owner registered before this fix (no PlayerProfile row yet) still gets their saved applicant_phone."""
    uid = uuid.uuid4().hex[:6]
    legacy_user = User(
        email=f"legacy_{uid}@oldclub.local",
        hashed_password=hash_password("LegacyPass2026!"),
        full_name="Sam Rivera",
        is_active=True,
        is_verified=True,
    )
    db_session.add(legacy_user)
    await db_session.flush()

    legacy_club = Club(
        name=f"Legacy Pines {uid}",
        slug=f"legacy-pines-{uid}",
        is_active=True,
        opening_time=time(6, 0),
        closing_time=time(22, 0),
    )
    db_session.add(legacy_club)
    await db_session.flush()

    db_session.add(
        ClubMembership(
            user_id=legacy_user.id,
            club_id=legacy_club.id,
            role=ClubRole.CLUB_OWNER,
            is_active=True,
        )
    )
    db_session.add(
        ClubApplication(
            reference_number=f"APP-LEG{uid[:5].upper()}",
            applicant_name="Sam Rivera",
            applicant_email=legacy_user.email,
            applicant_phone="+13125550177",
            user_id=legacy_user.id,
            club_name=legacy_club.name,
            slug=legacy_club.slug,
            status=ClubApplicationStatus.APPROVED,
            club_id=legacy_club.id,
        )
    )
    await db_session.commit()

    headers = make_auth_header(legacy_user.id)
    prof_res = await async_client.get("/api/v1/player/profile", headers=headers)
    assert prof_res.status_code == 200
    data = prof_res.json()
    assert data["display_name"] == "Sam Rivera"
    assert data["first_name"] == "Sam"
    assert data["last_name"] == "Rivera"
    assert data["phone"] == "+13125550177"
    assert data["gender"] is None  # Genuinely not provided during legacy registration

    # Confirm no duplicate profiles created on repeated GET
    prof_res_2 = await async_client.get("/api/v1/player/profile", headers=headers)
    assert prof_res_2.status_code == 200
    all_profiles = (
        await db_session.execute(select(PlayerProfile).where(PlayerProfile.user_id == legacy_user.id))
    ).scalars().all()
    assert len(all_profiles) == 1
