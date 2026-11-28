import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.event import Event, EventStatus, EventType, EventVisibility
from app.models.league import League, LeagueStatus
from app.models.lesson import Coach, Lesson, LessonStatus, LessonType
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_e2e_all_services_bookings_payments_sync_and_reconciliation(async_client, db_session):
    now = datetime.now(timezone.utc)

    # ─── 1. Create two isolated player accounts and two active clubs ──────────
    p1 = User(
        email=f"e2e_p1_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Player Alpha",
        is_active=True,
        is_verified=True,
    )
    p2 = User(
        email=f"e2e_p2_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Player Beta",
        is_active=True,
        is_verified=True,
    )
    db_session.add_all([p1, p2])
    await db_session.flush()

    club1 = Club(
        id=uuid.uuid4(),
        name="Summit Pickleball",
        slug=f"summit-{uuid.uuid4().hex[:6]}",
        address_line1="10 Summit Rd",
        city="Austin",
        state="TX",
        postal_code="78701",
        is_active=True,
    )
    club2 = Club(
        id=uuid.uuid4(),
        name="Harbor Courts",
        slug=f"harbor-{uuid.uuid4().hex[:6]}",
        address_line1="20 Harbor Ave",
        city="Miami",
        state="FL",
        postal_code="33101",
        is_active=True,
    )
    db_session.add_all([club1, club2])
    await db_session.flush()

    m1_c1 = ClubPlayerMembership(user_id=p1.id, club_id=club1.id, status=PlayerMembershipStatus.ACTIVE)
    m1_c2 = ClubPlayerMembership(user_id=p1.id, club_id=club2.id, status=PlayerMembershipStatus.ACTIVE)
    m2_c1 = ClubPlayerMembership(user_id=p2.id, club_id=club1.id, status=PlayerMembershipStatus.ACTIVE)
    db_session.add_all([m1_c1, m1_c2, m2_c1])
    await db_session.flush()

    # Courts in club1 (paid) and club2 (free)
    court_paid = Court(
        id=uuid.uuid4(),
        club_id=club1.id,
        name="Summit Paid Court 1",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        price_per_hour=Decimal("40.00"),
        is_active=True,
    )
    court_free = Court(
        id=uuid.uuid4(),
        club_id=club2.id,
        name="Harbor Free Court",
        indoor_outdoor=CourtEnvironment.OUTDOOR,
        status=CourtStatus.ACTIVE,
        price_per_hour=Decimal("0.00"),
        is_active=True,
    )
    db_session.add_all([court_paid, court_free])

    # Paid & Free Tournaments
    t_paid = Tournament(
        id=uuid.uuid4(),
        club_id=club1.id,
        name="Summit Open Paid",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=5),
        end_date=now + timedelta(days=6),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=4),
        format_configuration={"category": "Singles", "registration_fee": 50.0, "team_size": 1},
        max_participants=16,
    )
    t_free = Tournament(
        id=uuid.uuid4(),
        club_id=club2.id,
        name="Harbor Community Free Open",
        format=TournamentFormat.SCRAMBLE,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=7),
        end_date=now + timedelta(days=8),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=6),
        format_configuration={"category": "Open Scramble", "registration_fee": 0.0, "team_size": 1},
        max_participants=24,
    )
    db_session.add_all([t_paid, t_free])

    # Paid & Free Leagues
    lg_paid = League(
        id=uuid.uuid4(),
        club_id=club1.id,
        name="Summit Pro Ladder",
        status=LeagueStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=4),
        end_date=now + timedelta(days=35),
        number_of_weeks=5,
        team_size=1,
        max_teams=12,
        registration_fee=Decimal("75.00"),
    )
    lg_free = League(
        id=uuid.uuid4(),
        club_id=club2.id,
        name="Harbor Free Social League",
        status=LeagueStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=6),
        end_date=now + timedelta(days=34),
        number_of_weeks=4,
        team_size=1,
        max_teams=12,
        registration_fee=Decimal("0.00"),
    )
    db_session.add_all([lg_paid, lg_free])

    # Paid & Free Events
    ev_paid = Event(
        id=uuid.uuid4(),
        club_id=club1.id,
        title="Summit Night Bash",
        event_type=EventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=3),
        end_at=now + timedelta(days=3, hours=2),
        capacity=30,
        registration_fee=Decimal("20.00"),
        registration_required=True,
    )
    ev_free = Event(
        id=uuid.uuid4(),
        club_id=club2.id,
        title="Harbor Free Open Play",
        event_type=EventType.COMMUNITY,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=3, hours=3),
        end_at=now + timedelta(days=3, hours=5),
        capacity=30,
        registration_fee=Decimal("0.00"),
        registration_required=True,
    )
    db_session.add_all([ev_paid, ev_free])

    # Paid & Free Lessons
    coach1 = Coach(club_id=club1.id, name="Coach One", is_active=True)
    coach2 = Coach(club_id=club2.id, name="Coach Two", is_active=True)
    db_session.add_all([coach1, coach2])
    await db_session.flush()

    lt1 = LessonType(club_id=club1.id, name="Paid Clinic", duration_minutes=60, default_capacity=8, default_price=30.0)
    lt2 = LessonType(club_id=club2.id, name="Free Intro", duration_minutes=60, default_capacity=8, default_price=0.0)
    db_session.add_all([lt1, lt2])
    await db_session.flush()

    ls_paid = Lesson(
        id=uuid.uuid4(),
        club_id=club1.id,
        lesson_type_id=lt1.id,
        coach_id=coach1.id,
        title="Paid Serve Clinic",
        status=LessonStatus.PUBLISHED,
        start_at=now + timedelta(days=2),
        end_at=now + timedelta(days=2, hours=1),
        capacity=8,
        price=Decimal("30.00"),
    )
    ls_free = Lesson(
        id=uuid.uuid4(),
        club_id=club2.id,
        lesson_type_id=lt2.id,
        coach_id=coach2.id,
        title="Free Beginner Intro",
        status=LessonStatus.PUBLISHED,
        start_at=now + timedelta(days=2, hours=2),
        end_at=now + timedelta(days=2, hours=3),
        capacity=8,
        price=Decimal("0.00"),
    )
    db_session.add_all([ls_paid, ls_free])
    await db_session.commit()

    h1 = make_auth_header(p1.id)
    h2 = make_auth_header(p2.id)

    # ─── 2. BOOK PAID COURT VIA UNIFIED CHECKOUT (collect_payment=False -> pending, + verify retry idempotency!) ───
    slot1_start = (now + timedelta(days=2)).replace(hour=10, minute=0, second=0, microsecond=0)
    slot1_end = slot1_start + timedelta(hours=1)
    init_paid_c = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        headers=h1,
        json={
            "club_id": str(club1.id),
            "purpose": "court_booking",
            "activity_id": str(court_paid.id),
            "start_at": slot1_start.isoformat(),
            "end_at": slot1_end.isoformat(),
        },
    )
    assert init_paid_c.status_code == 201, init_paid_c.text
    pay_paid_c_id = init_paid_c.json()["payment_id"]
    order_paid_c = init_paid_c.json()["provider_order_id"]

    verify_paid_c = await async_client.post(
        "/api/v1/payments/checkout/verify",
        headers=h1,
        json={
            "payment_id": pay_paid_c_id,
            "provider": "direct",
            "provider_order_id": order_paid_c,
            "collect_payment": False,
        },
    )
    assert verify_paid_c.status_code == 200, verify_paid_c.text
    paid_booking_id = verify_paid_c.json()["booking_or_registration"]["booking_id"]
    assert verify_paid_c.json()["payment"]["status"] == "pending"

    # Retry verify_checkout on pending booking (must remain idempotent & NOT conflict-refund!)
    verify_retry = await async_client.post(
        "/api/v1/payments/checkout/verify",
        headers=h1,
        json={
            "payment_id": pay_paid_c_id,
            "provider": "direct",
            "provider_order_id": order_paid_c,
            "collect_payment": False,
        },
    )
    assert verify_retry.status_code == 200
    assert verify_retry.json()["payment"]["status"] == "pending"
    assert verify_retry.json()["booking_or_registration"]["booking_id"] == paid_booking_id

    # ─── 3. BOOK FREE COURT VIA UNIFIED CHECKOUT ──────────────────────────────
    slot2_start = (now + timedelta(days=2)).replace(hour=12, minute=0, second=0, microsecond=0)
    slot2_end = slot2_start + timedelta(hours=1)
    init_free_c = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        headers=h1,
        json={
            "club_id": str(club2.id),
            "purpose": "court_booking",
            "activity_id": str(court_free.id),
            "start_at": slot2_start.isoformat(),
            "end_at": slot2_end.isoformat(),
        },
    )
    assert init_free_c.status_code == 201, init_free_c.text
    assert init_free_c.json()["is_free"] is True
    free_booking_id = init_free_c.json()["booking_or_registration"]["booking_id"]

    # ─── 4. TOURNAMENTS (Paid + Free) ─────────────────────────────────────────
    r_tp = await async_client.post(
        f"/api/v1/tournaments/{t_paid.id}/register",
        headers=h1,
        json={"payment_collected": False},
    )
    assert r_tp.status_code == 201, r_tp.text
    assert r_tp.json()["payment_status"] == "PENDING"

    r_tf = await async_client.post(
        f"/api/v1/tournaments/{t_free.id}/register",
        headers=h1,
        json={},
    )
    assert r_tf.status_code == 201, r_tf.text
    assert r_tf.json()["payment_status"] == "FREE"

    # ─── 5. LEAGUES (Paid + Free) ─────────────────────────────────────────────
    r_lp = await async_client.post(
        f"/api/v1/leagues/{lg_paid.id}/register",
        headers=h1,
        json={"team_name": "Summit Aces", "payment_collected": True},
    )
    assert r_lp.status_code == 201, r_lp.text

    r_lf = await async_client.post(
        f"/api/v1/leagues/{lg_free.id}/register",
        headers=h1,
        json={"team_name": "Harbor Free Crew"},
    )
    assert r_lf.status_code == 201, r_lf.text

    # ─── 6. EVENTS (Paid + Free via Checkout) ─────────────────────────────────
    r_ep_init = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        headers=h1,
        json={"club_id": str(club1.id), "purpose": "event", "activity_id": str(ev_paid.id)},
    )
    assert r_ep_init.status_code == 201, r_ep_init.text
    r_ep_ver = await async_client.post(
        "/api/v1/payments/checkout/verify",
        headers=h1,
        json={
            "payment_id": r_ep_init.json()["payment_id"],
            "provider": "direct",
            "provider_order_id": r_ep_init.json()["provider_order_id"],
            "collect_payment": True,
        },
    )
    assert r_ep_ver.status_code == 200, r_ep_ver.text

    r_ef_init = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        headers=h1,
        json={"club_id": str(club2.id), "purpose": "event", "activity_id": str(ev_free.id)},
    )
    assert r_ef_init.status_code == 201, r_ef_init.text
    assert r_ef_init.json()["is_free"] is True

    # ─── 7. LESSONS (Paid + Free via Checkout) ────────────────────────────────
    r_lsp_init = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        headers=h1,
        json={"club_id": str(club1.id), "purpose": "lesson", "activity_id": str(ls_paid.id)},
    )
    assert r_lsp_init.status_code == 201, r_lsp_init.text
    r_lsp_ver = await async_client.post(
        "/api/v1/payments/checkout/verify",
        headers=h1,
        json={
            "payment_id": r_lsp_init.json()["payment_id"],
            "provider": "direct",
            "provider_order_id": r_lsp_init.json()["provider_order_id"],
            "collect_payment": True,
        },
    )
    assert r_lsp_ver.status_code == 200, r_lsp_ver.text

    r_lsf_init = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        headers=h1,
        json={"club_id": str(club2.id), "purpose": "lesson", "activity_id": str(ls_free.id)},
    )
    assert r_lsf_init.status_code == 201, r_lsf_init.text
    assert r_lsf_init.json()["is_free"] is True

    # ─── 8. VERIFY MY BOOKINGS ACROSS ALL CLUBS & ALL 10 ITEMS ─────────────────
    mb_resp = await async_client.get("/api/v1/player/my-bookings?status=upcoming&limit=100", headers=h1)
    assert mb_resp.status_code == 200
    mb_items = mb_resp.json()["items"]
    assert len(mb_items) == 10, f"Expected all 10 upcoming bookings across both clubs, got {len(mb_items)}"

    club_ids_seen = {it["club_id"] for it in mb_items}
    assert club_ids_seen == {str(club1.id), str(club2.id)}

    court_items = [it for it in mb_items if it["activity_type"] == "court"]
    assert len(court_items) == 2
    assert all(it["details"]["duration_minutes"] == 60 for it in court_items)
    assert all(it["details"].get("payment_reference") for it in court_items)

    # Check league confirmed status (not raw "registration_open")
    league_items = [it for it in mb_items if it["activity_type"] == "league"]
    assert all(it["status"] == "confirmed" and it["status_label"] == "Confirmed" for it in league_items)

    # ─── 9. VERIFY MY PAYMENTS HAS ALL 10 RECORDS (PAID, PENDING, FREE) ──────
    mp_resp = await async_client.get("/api/v1/payments", headers=h1)
    assert mp_resp.status_code == 200
    mp_items = mp_resp.json()
    assert len(mp_items) == 10, f"Expected 10 payment records, got {len(mp_items)}"

    free_payments = [p for p in mp_items if float(p["amount"]) == 0.0]
    assert len(free_payments) == 5, f"Expected 5 free $0.00 payment records, got {len(free_payments)}"
    assert all(p["status"] == "succeeded" and p["status_label"] == "Free" and p["payment_method_label"] == "Free" for p in free_payments)
    assert {p["purpose"] for p in free_payments} == {"court_booking", "tournament", "league", "event", "lesson"}

    # Check single-payment duplication did not happen for checkout event/lesson
    ev_pmt_cnt = (
        await db_session.execute(
            select(func.count(Payment.id)).where(Payment.event_id == ev_paid.id, Payment.player_id == p1.id)
        )
    ).scalar_one()
    assert ev_pmt_cnt == 1

    ls_pmt_cnt = (
        await db_session.execute(
            select(func.count(Payment.id)).where(Payment.lesson_id == ls_paid.id, Payment.player_id == p1.id)
        )
    ).scalar_one()
    assert ls_pmt_cnt == 1

    # ─── 10. CROSS-PLAYER ISOLATION CHECK ─────────────────────────────────────
    p2_bookings = await async_client.get("/api/v1/player/my-bookings", headers=h2)
    assert p2_bookings.status_code == 200
    assert p2_bookings.json()["items"] == []

    p2_payments = await async_client.get("/api/v1/payments", headers=h2)
    assert p2_payments.status_code == 200
    assert p2_payments.json() == []

    # ─── 11. CANCELLATION CHECK (Court Free + Paid Tournament) ────────────────
    c_free_court = await async_client.post(f"/api/v1/bookings/{free_booking_id}/cancel", headers=h1)
    assert c_free_court.status_code == 200

    c_paid_t = await async_client.delete(f"/api/v1/tournaments/{t_paid.id}/register", headers=h1)
    assert c_paid_t.status_code == 200

    cancelled_mb = await async_client.get("/api/v1/player/my-bookings?status=cancelled", headers=h1)
    assert cancelled_mb.status_code == 200
    cancelled_record_ids = {it["record_id"] for it in cancelled_mb.json()["items"]}
    assert free_booking_id in cancelled_record_ids

    mp_after_cancel = (await async_client.get("/api/v1/payments", headers=h1)).json()
    free_c_pmt = next(p for p in mp_after_cancel if p["booking_id"] == free_booking_id)
    assert free_c_pmt["status"] == "cancelled"
    paid_t_pmt = next(p for p in mp_after_cancel if p["tournament_id"] == str(t_paid.id))
    assert paid_t_pmt["status"] == "cancelled"

    # ─── 12. LEGACY RECONCILIATION CHECK ──────────────────────────────────────
    legacy_booking = Booking(
        id=uuid.uuid4(),
        club_id=club1.id,
        court_id=court_paid.id,
        booked_by_user_id=p2.id,
        player_id=p2.id,
        start_at=now + timedelta(days=9),
        end_at=now + timedelta(days=9, hours=1),
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        total_price=Decimal("40.00"),
    )
    legacy_free_t_reg = TournamentRegistration(
        id=uuid.uuid4(),
        tournament_id=t_free.id,
        player_membership_id=m2_c1.id,
        status=RegistrationStatus.CONFIRMED,
    )
    db_session.add_all([legacy_booking, legacy_free_t_reg])
    await db_session.commit()

    p2_reconciled = (await async_client.get("/api/v1/payments", headers=h2)).json()
    assert len(p2_reconciled) == 2
    reconciled_c = next(p for p in p2_reconciled if p["booking_id"] == str(legacy_booking.id))
    assert float(reconciled_c["amount"]) == 40.0
    assert reconciled_c["status"] == "pending"  # Never fabricates paid SUCCEEDED
    reconciled_t = next(p for p in p2_reconciled if p["tournament_id"] == str(t_free.id))
    assert float(reconciled_t["amount"]) == 0.0
    assert reconciled_t["status"] == "succeeded"
    assert reconciled_t["status_label"] == "Free"

    # Calling /payments again creates zero duplicates
    p2_reconciled_again = (await async_client.get("/api/v1/payments", headers=h2)).json()
    assert len(p2_reconciled_again) == 2

    # Edge case: legacy non-numeric reference + 2nd legacy booking must generate monotonic numeric refs cleanly
    non_num_pmt = Payment(
        reference=f"A2P-{now.year}-ZZZ999",
        club_id=club1.id,
        player_id=p2.id,
        amount=Decimal("10.00"),
        currency="USD",
        status=PaymentStatus.SUCCEEDED,
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.OTHER,
    )
    second_legacy_booking = Booking(
        id=uuid.uuid4(),
        club_id=club1.id,
        court_id=court_paid.id,
        booked_by_user_id=p2.id,
        player_id=p2.id,
        start_at=now + timedelta(days=10),
        end_at=now + timedelta(days=10, hours=1),
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        total_price=Decimal("40.00"),
    )
    db_session.add_all([non_num_pmt, second_legacy_booking])
    await db_session.commit()

    p2_after_non_num = await async_client.get("/api/v1/payments", headers=h2)
    assert p2_after_non_num.status_code == 200
    assert len(p2_after_non_num.json()) == 4
