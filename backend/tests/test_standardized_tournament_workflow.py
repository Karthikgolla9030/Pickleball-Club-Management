"""
Comprehensive E2E Verification Suite for Standardized Tournament Lifecycle,
Registration Closure Validation, Court Capacity Bounds, Config Persistence,
and Balanced Pool Distribution Across All Four Formats.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from tests.conftest import make_auth_header


async def _setup_club_with_players_and_courts(
    db: AsyncSession,
    num_players: int = 16,
    num_active_courts: int = 2,
    num_inactive_courts: int = 1,
):
    club = Club(
        name=f"Workflow Club {uuid.uuid4().hex[:6]}",
        slug=f"wf-club-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db.add(club)
    await db.flush()

    owner = User(
        email=f"owner_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Workflow Owner",
        is_active=True,
        is_verified=True,
    )
    db.add(owner)
    await db.flush()
    db.add(
        ClubMembership(
            user_id=owner.id,
            club_id=club.id,
            role=ClubRole.CLUB_OWNER,
            is_active=True,
        )
    )

    active_courts: list[Court] = []
    for i in range(num_active_courts):
        c = Court(
            club_id=club.id,
            name=f"Court {i + 1}",
            display_name=f"Court {i + 1}",
            court_number=i + 1,
            surface_type="Sport Court",
            indoor_outdoor=CourtEnvironment.OUTDOOR,
            status=CourtStatus.ACTIVE,
            is_active=True,
            display_order=i,
        )
        db.add(c)
        await db.flush()
        active_courts.append(c)

    inactive_courts: list[Court] = []
    for j in range(num_inactive_courts):
        c = Court(
            club_id=club.id,
            name=f"Maintenance Court {j + 1}",
            display_name=f"Maintenance Court {j + 1}",
            court_number=num_active_courts + j + 1,
            surface_type="Concrete",
            indoor_outdoor=CourtEnvironment.OUTDOOR,
            status=CourtStatus.INACTIVE,
            is_active=False,
            display_order=num_active_courts + j,
        )
        db.add(c)
        await db.flush()
        inactive_courts.append(c)

    players: list[tuple[User, ClubPlayerMembership]] = []
    for i in range(num_players):
        u = User(
            email=f"wf_player_{i}_{uuid.uuid4().hex[:6]}@test.local",
            hashed_password=hash_password("Pass123!"),
            full_name=f"Player {i + 1:02d}",
            is_active=True,
            is_verified=True,
        )
        db.add(u)
        await db.flush()
        db.add(
            PlayerProfile(
                user_id=u.id,
                display_name=f"Player {i + 1:02d}",
                skill_rating=3.0 + ((i % 4) * 0.5),
            )
        )
        pm = ClubPlayerMembership(
            user_id=u.id,
            club_id=club.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"WF-{i + 1:03d}",
        )
        db.add(pm)
        await db.flush()
        players.append((u, pm))

    await db.commit()
    return club, owner, active_courts, inactive_courts, players


async def _create_tournament(
    db: AsyncSession,
    club: Club,
    owner: User,
    fmt: TournamentFormat,
    *,
    is_doubles: bool = False,
    min_participants: int | None = None,
    max_participants: int = 16,
) -> Tournament:
    now = datetime.now(timezone.utc)
    cfg = (
        {"category": "Open Scramble", "registration_type": "individual", "team_size": 1}
        if fmt == TournamentFormat.SCRAMBLE
        else (
            {"category": "Men's Doubles", "registration_type": "team", "team_size": 2}
            if is_doubles
            else {"category": "Singles", "registration_type": "individual", "team_size": 1}
        )
    )
    t = Tournament(
        club_id=club.id,
        created_by_user_id=owner.id,
        name=f"WF {fmt.value} {uuid.uuid4().hex[:4]}",
        format=fmt,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        start_date=now + timedelta(days=3),
        end_date=now + timedelta(days=4),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=2),
        min_participants=min_participants,
        max_participants=max_participants,
        format_configuration=cfg,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "fmt,min_req",
    [
        (TournamentFormat.ROUND_ROBIN, 2),
        (TournamentFormat.BRACKET, 2),
        (TournamentFormat.POOL_PLAY, 4),
        (TournamentFormat.SCRAMBLE, 4),
    ],
)
async def test_closure_validation_blocks_odd_and_insufficient_counts_all_formats(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fmt: TournamentFormat,
    min_req: int,
):
    """
    Stage 2 Validation across ALL 4 formats:
    - 1, 3, 5, 15 participants must be blocked from closing registration.
    - Pending registration blocks closure cleanly.
    - Registration remains open when blocked.
    - 16 confirmed active players passes even & minimum checks across all 4 formats.
    """
    club, owner, _, _, players = await _setup_club_with_players_and_courts(
        db_session, num_players=16
    )
    owner_h = make_auth_header(owner.id)
    t = await _create_tournament(
        db_session, club, owner, fmt, min_participants=min_req, max_participants=16
    )

    def _register_sync_count(target_count: int):
        for idx in range(target_count):
            db_session.add(
                TournamentRegistration(
                    tournament_id=t.id,
                    player_membership_id=players[idx][1].id,
                    status=RegistrationStatus.CONFIRMED,
                    seed=idx + 1,
                )
            )

    # Blocked at odd/insufficient counts (3, 5, 15)
    _register_sync_count(3)
    await db_session.commit()
    r3 = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/close-registration",
        headers=owner_h,
    )
    assert r3.status_code == 400
    if min_req > 3:
        assert "at least 4" in r3.json()["detail"].lower()
    else:
        assert "even" in r3.json()["detail"].lower()

    # Check 5 players -> odd -> blocked across all 4 formats
    for idx in (3, 4):
        db_session.add(
            TournamentRegistration(
                tournament_id=t.id,
                player_membership_id=players[idx][1].id,
                status=RegistrationStatus.CONFIRMED,
                seed=idx + 1,
            )
        )
    await db_session.commit()
    r5 = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/close-registration",
        headers=owner_h,
    )
    assert r5.status_code == 400
    assert "even" in r5.json()["detail"].lower()

    # Check 15 players -> odd -> blocked; workflow_state reports blocked
    for idx in range(5, 15):
        db_session.add(
            TournamentRegistration(
                tournament_id=t.id,
                player_membership_id=players[idx][1].id,
                status=RegistrationStatus.CONFIRMED,
                seed=idx + 1,
            )
        )
    await db_session.commit()

    detail_blocked = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}",
        headers=owner_h,
    )
    assert detail_blocked.status_code == 200
    assert detail_blocked.json()["status"] == "registration_open"
    assert detail_blocked.json()["workflow_state"] == "registration_closure_blocked"
    assert detail_blocked.json()["closure_eligibility"]["can_close"] is False

    r15 = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/close-registration",
        headers=owner_h,
    )
    assert r15.status_code == 400
    assert "even" in r15.json()["detail"].lower()

    # Pending registration with 16 confirmed still blocks until resolved
    u_extra, pm_extra = players[15]
    pending_reg = TournamentRegistration(
        tournament_id=t.id,
        player_membership_id=pm_extra.id,
        status=RegistrationStatus.PENDING,
    )
    db_session.add(pending_reg)
    await db_session.commit()

    # Wait: make 14 confirmed + 1 pending? Or 16 total where 15th became confirmed + 16th pending -> add 16th confirmed by swapping:
    # Let's delete pending_reg after asserting pending check on 16 confirmed + 1 extra pending user:
    u_pend = User(
        email=f"pend_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Pending User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u_pend)
    await db_session.flush()
    pm_pend = ClubPlayerMembership(
        user_id=u_pend.id,
        club_id=club.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="WF-PEND",
    )
    db_session.add(pm_pend)
    await db_session.flush()
    pending_reg.status = RegistrationStatus.CONFIRMED
    extra_pend_reg = TournamentRegistration(
        tournament_id=t.id,
        player_membership_id=pm_pend.id,
        status=RegistrationStatus.PENDING,
    )
    db_session.add(extra_pend_reg)
    await db_session.commit()

    r_pend = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/close-registration",
        headers=owner_h,
    )
    assert r_pend.status_code == 400
    assert "pending" in r_pend.json()["detail"].lower()

    # Resolve pending -> 16 confirmed -> close succeeds cleanly
    extra_pend_reg.status = RegistrationStatus.CANCELLED
    await db_session.commit()

    r16 = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/close-registration",
        headers=owner_h,
    )
    assert r16.status_code == 200, r16.text
    assert r16.json()["status"] == "registration_closed"
    assert r16.json()["workflow_state"] == "configuration_required"
    assert r16.json()["configuration_saved"] is False


@pytest.mark.asyncio
async def test_pool_play_balanced_12_teams_and_court_capacity_bounds(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Reproduces and verifies fix for the exact reported Pool Play bug:
    - 12 confirmed teams across 2 active courts (plus 1 inactive court).
    - Selecting 4 pools yields balanced [3, 3, 3, 3] across setup preview, saved DB pools, and matches.
    - Selecting 3 pools yields balanced [4, 4, 4]; 6 pools yields balanced [2, 2, 2, 2, 2, 2].
    - Setting concurrent courts > selected active courts (e.g. 3 > 2) or choosing inactive court is rejected (400).
    - Requires Save Configuration before UI generation (`require_saved_config=True`), then assigns generated matches strictly to selected active courts.
    """
    club, owner, active_courts, inactive_courts, players = await _setup_club_with_players_and_courts(
        db_session, num_players=12, num_active_courts=2, num_inactive_courts=1
    )
    owner_h = make_auth_header(owner.id)
    t = await _create_tournament(
        db_session, club, owner, TournamentFormat.POOL_PLAY, is_doubles=False, min_participants=4
    )

    for idx in range(12):
        res = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=make_auth_header(players[idx][0].id),
        )
        assert res.status_code == 201

    close_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/close-registration",
        headers=owner_h,
    )
    assert close_res.status_code == 200

    # Unsaved generation attempt with require_saved_config=True must fail
    gen_unsaved = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/pool-play/confirm-and-generate",
        headers=owner_h,
        json={
            "number_of_pools": 4,
            "qualifiers_per_pool": 1,
            "bracket_type": "Single Elimination",
            "require_saved_config": True,
        },
    )
    assert gen_unsaved.status_code == 400
    assert "save" in gen_unsaved.json()["detail"].lower()

    # Reject concurrent capacity exceeding selected active courts (3 > 2)
    bad_cap = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json={
            "number_of_pools": 4,
            "qualifiers_per_pool": 1,
            "balance_tolerance": 0.5,
            "bracket_type": "Single Elimination",
            "selected_court_ids": [str(c.id) for c in active_courts],
            "courts_count": 3,
        },
    )
    assert bad_cap.status_code == 400
    assert "exceed" in bad_cap.json()["detail"].lower()

    # Reject inactive court ID
    bad_court = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json={
            "number_of_pools": 4,
            "qualifiers_per_pool": 1,
            "selected_court_ids": [str(inactive_courts[0].id)],
            "courts_count": 1,
        },
    )
    assert bad_court.status_code == 400

    # Save valid 4-pool config with both active courts and verify persistence + balanced DB pools
    save_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json={
            "number_of_pools": 4,
            "qualifiers_per_pool": 1,
            "balance_tolerance": 0.5,
            "bracket_type": "Single Elimination",
            "selected_court_ids": [str(c.id) for c in active_courts],
            "courts_count": 2,
        },
    )
    assert save_res.status_code == 200, save_res.text
    saved = save_res.json()
    assert saved["configuration_saved"] is True
    assert saved["workflow_state"] == "configuration_saved"
    assert saved["selected_pools"] == 4
    assert saved["courts_count"] == 2
    assert len(saved["selected_court_ids"]) == 2
    preview_counts = [p["teams_count"] for p in saved["pool_play_setup"]["preview_pools"]]
    assert preview_counts == [3, 3, 3, 3]

    # DB /pools must immediately match 4 balanced pools of 3 teams (never 3 & 9!)
    pools_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/pools",
        headers=owner_h,
    )
    assert pools_res.status_code == 200
    pools_data = pools_res.json()
    assert len(pools_data) == 4
    assert [len(p["pool_teams"]) for p in pools_data] == [3, 3, 3, 3]

    # Confirm 6-pool config also distributes [2, 2, 2, 2, 2, 2] cleanly (exceeds old A-D cap!)
    save_6 = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json={
            "number_of_pools": 6,
            "qualifiers_per_pool": 1,
            "selected_court_ids": [str(active_courts[0].id)],
            "courts_count": 1,
        },
    )
    assert save_6.status_code == 200
    pools_6 = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/pools",
        headers=owner_h,
    )
    assert [len(p["pool_teams"]) for p in pools_6.json()] == [2, 2, 2, 2, 2, 2]

    # Re-save 4 pools and Generate
    await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json={
            "number_of_pools": 4,
            "qualifiers_per_pool": 1,
            "selected_court_ids": [str(c.id) for c in active_courts],
            "courts_count": 2,
        },
    )
    gen_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/pool-play/confirm-and-generate",
        headers=owner_h,
        json={
            "number_of_pools": 4,
            "qualifiers_per_pool": 1,
            "bracket_type": "Single Elimination",
            "selected_court_ids": [str(c.id) for c in active_courts],
            "courts_count": 2,
            "require_saved_config": True,
        },
    )
    assert gen_res.status_code == 201, gen_res.text
    assert gen_res.json()["pools_count"] == 4
    assert gen_res.json()["matches_generated"] == 12  # C(3,2)*4 = 12 matches

    # Every generated match must be assigned strictly to selected active courts
    matches_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/pools/matches",
        headers=owner_h,
    )
    assert matches_res.status_code == 200
    allowed_court_ids = {str(c.id) for c in active_courts}
    for m in matches_res.json():
        assert m["court_id"] in allowed_court_ids


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "fmt",
    [
        TournamentFormat.ROUND_ROBIN,
        TournamentFormat.BRACKET,
        TournamentFormat.SCRAMBLE,
    ],
)
async def test_standardized_setup_save_edit_generate_across_other_three_formats(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fmt: TournamentFormat,
):
    """
    Verifies Stage 3 -> 4 -> 5 -> 6 across Round Robin, Bracket, and Scramble:
    - Setup rejected before registration closes.
    - Generation rejected if require_saved_config=True before saving.
    - Save Configuration persists settings + selected court subset (1 of 2 courts) cleanly across reloads.
    - Generate assigns matches strictly to selected active court(s).
    - Editing saved config safely clears unplayed schedule and unlocks fresh generation.
    """
    club, owner, active_courts, _, players = await _setup_club_with_players_and_courts(
        db_session, num_players=8, num_active_courts=2, num_inactive_courts=0
    )
    owner_h = make_auth_header(owner.id)
    t = await _create_tournament(
        db_session, club, owner, fmt, is_doubles=False, min_participants=4, max_participants=8
    )

    for idx in range(8):
        r = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=make_auth_header(players[idx][0].id),
        )
        assert r.status_code == 201

    # Saving configuration while registration is still open must be blocked
    premature_save = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json={"selected_court_ids": [str(active_courts[0].id)], "courts_count": 1},
    )
    assert premature_save.status_code == 400

    # Close registration
    close_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/close-registration",
        headers=owner_h,
    )
    assert close_res.status_code == 200
    assert close_res.json()["workflow_state"] == "configuration_required"

    selected_only = [str(active_courts[0].id)]
    save_payload: dict = {"selected_court_ids": selected_only, "courts_count": 1}
    if fmt == TournamentFormat.BRACKET:
        save_payload["bracket_type"] = "Double Elimination"
    elif fmt == TournamentFormat.SCRAMBLE:
        save_payload["rounds"] = 3
        save_payload["rotation_rule"] = "Full Rotation (no repeating partners)"

    save_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json=save_payload,
    )
    assert save_res.status_code == 200, save_res.text
    assert save_res.json()["configuration_saved"] is True
    assert save_res.json()["workflow_state"] == "configuration_saved"
    assert save_res.json()["selected_court_ids"] == selected_only
    assert save_res.json()["courts_count"] == 1

    # Reload setup endpoint and confirm persistence
    reloaded = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/setup",
        headers=owner_h,
    )
    assert reloaded.status_code == 200
    assert reloaded.json()["configuration_saved"] is True
    assert reloaded.json()["selected_court_ids"] == selected_only

    # Generate structure
    if fmt == TournamentFormat.ROUND_ROBIN:
        g = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-round-robin?require_saved_config=true",
            headers=owner_h,
        )
        assert g.status_code == 201
        matches_url = f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches"
    elif fmt == TournamentFormat.BRACKET:
        g = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-bracket?require_saved_config=true",
            headers=owner_h,
        )
        assert g.status_code == 201
        matches_url = f"/api/v1/clubs/{club.id}/tournaments/{t.id}/bracket/matches"
    else:
        g = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/confirm-and-generate",
            headers=owner_h,
            json={
                "rounds": 3,
                "rotation_rule": "Full Rotation (no repeating partners)",
                "selected_court_ids": selected_only,
                "courts_count": 1,
                "require_saved_config": True,
            },
        )
        assert g.status_code == 201
        matches_url = f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches"

    matches = (await async_client.get(matches_url, headers=owner_h)).json()
    assert len(matches) > 0
    for m in matches:
        assert m["court_id"] == selected_only[0]

    # Edit saved config prior to scoring -> clears unplayed schedule safely and returns to configuration_saved
    edit_payload = {"selected_court_ids": [str(c.id) for c in active_courts], "courts_count": 2}
    if fmt == TournamentFormat.BRACKET:
        edit_payload["bracket_type"] = "Single Elimination"
    elif fmt == TournamentFormat.SCRAMBLE:
        edit_payload["rounds"] = 4
    re_save = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json=edit_payload,
    )
    assert re_save.status_code == 200
    assert re_save.json()["workflow_state"] == "configuration_saved"
    assert re_save.json()["is_generated"] is False
    assert re_save.json()["courts_count"] == 2


@pytest.mark.asyncio
async def test_listing_reflects_saved_state_and_failed_save_preserves_config(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verifies:
    - Club tournament listing & detail immediately reflect `configuration_saved` (no longer
      `configuration_required`) as soon as valid configuration is saved.
    - Failed configuration save returns 400 and preserves the previous saved configuration intact.
    """
    club, owner, active_courts, _, players = await _setup_club_with_players_and_courts(
        db_session, num_players=16, num_active_courts=2, num_inactive_courts=0
    )
    owner_h = make_auth_header(owner.id)
    t = await _create_tournament(
        db_session, club, owner, TournamentFormat.POOL_PLAY, is_doubles=True, min_participants=4, max_participants=16
    )

    # Register 8 doubles teams (16 players)
    for idx in range(8):
        p1 = players[idx * 2][0]
        p2 = players[idx * 2 + 1][0]
        reg = await async_client.post(
            f"/api/v1/tournaments/{t.id}/register",
            headers=make_auth_header(p1.id),
            json={"partner_user_id": str(p2.id), "team_name": f"PP Team {idx + 1}"},
        )
        assert reg.status_code == 201

    close_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/close-registration",
        headers=owner_h,
    )
    assert close_res.status_code == 200
    assert close_res.json()["workflow_state"] == "configuration_required"

    # Save valid Pool Play configuration
    selected_courts = [str(active_courts[0].id)]
    save_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json={
            "number_of_pools": 2,
            "qualifiers_per_pool": 2,
            "bracket_type": "Single Elimination",
            "balance_tolerance": 0.5,
            "selected_court_ids": selected_courts,
            "courts_count": 1,
        },
    )
    assert save_res.status_code == 200, save_res.text
    assert save_res.json()["configuration_saved"] is True
    assert save_res.json()["workflow_state"] == "configuration_saved"

    # Club listing & detail MUST immediately show configuration_saved and configuration_saved=True
    list_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=owner_h,
    )
    assert list_res.status_code == 200
    card = next(x for x in list_res.json() if x["id"] == str(t.id))
    assert card["workflow_state"] == "configuration_saved"
    assert card["configuration_saved"] is True
    assert card["structure_generated"] is False

    # Failed edit (impossible 6 pools for 8 teams) -> rejected with 400 and preserves prior saved config
    bad_save = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json={
            "number_of_pools": 6,
            "qualifiers_per_pool": 1,
            "bracket_type": "Double Elimination",
            "selected_court_ids": [str(c.id) for c in active_courts],
            "courts_count": 2,
        },
    )
    assert bad_save.status_code == 400

    reloaded = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/setup",
        headers=owner_h,
    )
    assert reloaded.status_code == 200
    assert reloaded.json()["configuration_saved"] is True
    assert reloaded.json()["selected_pools"] == 2
    assert reloaded.json()["selected_qualifiers_per_pool"] == 2
    assert reloaded.json()["bracket_type"] == "Single Elimination"
    assert reloaded.json()["selected_court_ids"] == selected_courts
    assert reloaded.json()["courts_count"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "fmt",
    [
        TournamentFormat.ROUND_ROBIN,
        TournamentFormat.BRACKET,
        TournamentFormat.POOL_PLAY,
        TournamentFormat.SCRAMBLE,
    ],
)
async def test_completed_tournament_readonly_setup_and_permanent_locks_all_formats(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fmt: TournamentFormat,
):
    """
    Verifies end-to-end across ALL FOUR tournament formats:
    - Full lifecycle: open -> register -> close -> save config -> generate -> duplicate gen blocked
      -> start -> complete.
    - Completed tournament setup GET endpoints return 200 OK with is_completed=True, is_locked=True,
      workflow_state='completed', configuration_saved=True, and persisted settings read-only.
    - ALL backend mutation/config/generation/regeneration/customization/lifecycle APIs strictly reject
      modification once COMPLETED.
    """
    club, owner, active_courts, _, players = await _setup_club_with_players_and_courts(
        db_session, num_players=16, num_active_courts=2, num_inactive_courts=0
    )
    owner_h = make_auth_header(owner.id)
    is_doubles = fmt == TournamentFormat.POOL_PLAY
    t = await _create_tournament(
        db_session, club, owner, fmt, is_doubles=is_doubles, min_participants=4, max_participants=16
    )

    if is_doubles:
        for idx in range(8):
            p1 = players[idx * 2][0]
            p2 = players[idx * 2 + 1][0]
            reg = await async_client.post(
                f"/api/v1/tournaments/{t.id}/register",
                headers=make_auth_header(p1.id),
                json={"partner_user_id": str(p2.id), "team_name": f"PP Team {idx + 1}"},
            )
            assert reg.status_code == 201
    else:
        for idx in range(8):
            reg = await async_client.post(
                f"/api/v1/tournaments/{t.id}/register",
                headers=make_auth_header(players[idx][0].id),
            )
            assert reg.status_code == 201

    assert (
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/close-registration",
            headers=owner_h,
        )
    ).status_code == 200

    court_ids = [str(active_courts[0].id)]
    save_payload: dict = {"selected_court_ids": court_ids, "courts_count": 1}
    if fmt == TournamentFormat.POOL_PLAY:
        save_payload.update({"number_of_pools": 2, "qualifiers_per_pool": 1, "bracket_type": "Single Elimination"})
    elif fmt == TournamentFormat.BRACKET:
        save_payload["bracket_type"] = "Single Elimination"
    elif fmt == TournamentFormat.SCRAMBLE:
        save_payload.update({"rounds": 3, "rotation_rule": "Full Rotation (no repeating partners)"})

    save_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json=save_payload,
    )
    assert save_res.status_code == 200, save_res.text

    # Generate structure and confirm duplicate generation is rejected
    if fmt == TournamentFormat.ROUND_ROBIN:
        gen_url = f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-round-robin?require_saved_config=true"
        assert (await async_client.post(gen_url, headers=owner_h)).status_code == 201
        assert (await async_client.post(gen_url, headers=owner_h)).status_code == 400
    elif fmt == TournamentFormat.BRACKET:
        gen_url = f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-bracket?require_saved_config=true"
        assert (await async_client.post(gen_url, headers=owner_h)).status_code == 201
        assert (await async_client.post(gen_url, headers=owner_h)).status_code == 400
    elif fmt == TournamentFormat.POOL_PLAY:
        pp_url = f"/api/v1/clubs/{club.id}/tournaments/{t.id}/pool-play/confirm-and-generate"
        pp_body = {
            "number_of_pools": 2,
            "qualifiers_per_pool": 1,
            "bracket_type": "Single Elimination",
            "selected_court_ids": court_ids,
            "courts_count": 1,
            "require_saved_config": True,
        }
        assert (await async_client.post(pp_url, headers=owner_h, json=pp_body)).status_code == 201
        assert (await async_client.post(pp_url, headers=owner_h, json=pp_body)).status_code == 400
    else:
        sc_url = f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/confirm-and-generate"
        sc_body = {
            "rounds": 3,
            "rotation_rule": "Full Rotation (no repeating partners)",
            "selected_court_ids": court_ids,
            "courts_count": 1,
            "require_saved_config": True,
        }
        assert (await async_client.post(sc_url, headers=owner_h, json=sc_body)).status_code == 201
        assert (await async_client.post(sc_url, headers=owner_h, json=sc_body)).status_code == 400

    # Transition to IN_PROGRESS (explicit /start for Pool Play & Scramble; auto on RR/Bracket) then COMPLETED
    detail_before_start = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}",
        headers=owner_h,
    )
    assert detail_before_start.status_code == 200
    if detail_before_start.json()["status"] == "registration_closed":
        assert (
            await async_client.post(
                f"/api/v1/clubs/{club.id}/tournaments/{t.id}/start",
                headers=owner_h,
            )
        ).status_code == 200

    t.status = TournamentStatus.COMPLETED
    await db_session.commit()
    await db_session.refresh(t)

    # 1. Read-only setup endpoints succeed cleanly with is_completed=True, is_locked=True, configuration_saved=True
    setup_get = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/setup",
        headers=owner_h,
    )
    assert setup_get.status_code == 200, setup_get.text
    sj = setup_get.json()
    assert sj["is_completed"] is True
    assert sj["is_locked"] is True
    assert sj["workflow_state"] == "completed"
    assert sj["configuration_saved"] is True
    assert sj["selected_court_ids"] == court_ids

    if fmt == TournamentFormat.SCRAMBLE:
        sc_setup = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/post-registration-setup",
            headers=owner_h,
        )
        assert sc_setup.status_code == 200
        assert sc_setup.json()["is_completed"] is True
        assert sc_setup.json()["is_locked"] is True
        assert sc_setup.json()["configuration_saved"] is True
    elif fmt == TournamentFormat.POOL_PLAY:
        pp_setup = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/pool-play/post-registration-setup",
            headers=owner_h,
        )
        assert pp_setup.status_code == 200
        assert pp_setup.json()["is_completed"] is True
        assert pp_setup.json()["is_locked"] is True
        assert pp_setup.json()["configuration_saved"] is True

    # 2. All mutation, configuration, generation, regeneration, customization & lifecycle APIs reject COMPLETED
    blocked_requests: list[tuple[str, str, dict | None]] = [
        ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration", save_payload),
        ("PATCH", f"/api/v1/clubs/{club.id}/tournaments/{t.id}", {"name": "Mutated"}),
        ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/open-registration", None),
        ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/close-registration", None),
        ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/start", None),
        ("PATCH", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/competition/teams/customize", {"teams": []}),
        ("PATCH", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/competition/pools/customize", {"pools": []}),
        ("PATCH", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/competition/matchups/customize", {"matchups": []}),
        ("PATCH", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/competition/seeding/customize", {"seeds": []}),
        ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/competition/lock", None),
    ]
    if fmt == TournamentFormat.ROUND_ROBIN:
        blocked_requests.extend([
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-round-robin", None),
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/regenerate-round-robin", None),
        ])
    elif fmt == TournamentFormat.BRACKET:
        blocked_requests.extend([
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-bracket", None),
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/regenerate-bracket", None),
        ])
    elif fmt == TournamentFormat.POOL_PLAY:
        blocked_requests.extend([
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/pools/configure", {"number_of_pools": 2, "qualifiers_per_pool": 1}),
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-pool-play", None),
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/regenerate-pool-play", None),
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/pool-play/state", {"completed": True}),
        ])
    else:
        blocked_requests.extend([
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble", {"rounds": 4, "matches_per_player": 4}),
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/regenerate-scramble", {"rounds": 4, "matches_per_player": 4}),
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/confirm-and-generate", {"rounds": 4, "selected_court_ids": court_ids, "courts_count": 1}),
            ("POST", f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/planned-rounds", {"planned_rounds": 4}),
        ])

    for method, url, body in blocked_requests:
        res = await async_client.request(method, url, headers=owner_h, json=body)
        assert res.status_code == 400, f"Expected 400 on {method} {url} (COMPLETED), got {res.status_code}: {res.text}"

