"""
Aught2 Pickleball — Comprehensive Notification Tests
Covers audit findings: user isolation, club-scoped mark-all/dismiss,
idempotency, category+date+unread filters, pagination, preference suppression,
notify_club_staff role filtering, legacy categories.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select as sa_select
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership
from app.models.notification import Notification
from app.models.user import User
from app.services.notification_service import NotificationService
from tests.conftest import make_auth_header


# --- Fixtures ---

@pytest.fixture
async def two_users(db_session: AsyncSession):
    alice = User(email="nalice@demo.local", hashed_password=hash_password("Password1!"), full_name="Alice", is_active=True)
    bob   = User(email="nbob@demo.local",   hashed_password=hash_password("Password1!"), full_name="Bob",   is_active=True)
    db_session.add_all([alice, bob])
    await db_session.flush()
    return alice, bob

@pytest.fixture
async def club_a(db_session: AsyncSession):
    c = Club(name="Club A", slug="club-a-n", is_active=True)
    db_session.add(c)
    await db_session.flush()
    return c

@pytest.fixture
async def club_b(db_session: AsyncSession):
    c = Club(name="Club B", slug="club-b-n", is_active=True)
    db_session.add(c)
    await db_session.flush()
    return c

def _n(user_id, category="general", title="T", message="M", is_read=False, club_id=None, created_at=None, data=None):
    return Notification(user_id=user_id, club_id=club_id, category=category, title=title,
                        message=message, is_read=is_read, data=data or {},
                        created_at=created_at or datetime.now(timezone.utc))


# --- 1. User Isolation ---

@pytest.mark.asyncio
async def test_user_isolation_list(async_client, db_session, two_users):
    alice, bob = two_users
    db_session.add(_n(alice.id, title="Alice notif"))
    db_session.add(_n(bob.id,   title="Bob notif"))
    await db_session.commit()
    res = await async_client.get("/api/v1/notifications", headers=make_auth_header(alice))
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "Alice notif"

@pytest.mark.asyncio
async def test_cross_user_mark_read_404(async_client, db_session, two_users):
    alice, bob = two_users
    n = _n(alice.id)
    db_session.add(n); await db_session.commit()
    res = await async_client.post(f"/api/v1/notifications/{n.id}/read", headers=make_auth_header(bob))
    assert res.status_code == 404

@pytest.mark.asyncio
async def test_cross_user_delete_404(async_client, db_session, two_users):
    alice, bob = two_users
    n = _n(alice.id)
    db_session.add(n); await db_session.commit()
    res = await async_client.delete(f"/api/v1/notifications/{n.id}", headers=make_auth_header(bob))
    assert res.status_code == 404


# --- 2. mark_as_read Idempotency ---

@pytest.mark.asyncio
async def test_mark_read_idempotent(async_client, db_session, two_users):
    alice, _ = two_users
    n = _n(alice.id); db_session.add(n); await db_session.commit()
    headers = make_auth_header(alice)
    r1 = await async_client.post(f"/api/v1/notifications/{n.id}/read", headers=headers)
    r2 = await async_client.post(f"/api/v1/notifications/{n.id}/read", headers=headers)
    assert r1.status_code == 200
    assert r2.status_code == 200  # idempotent
    await db_session.refresh(n)
    assert n.is_read is True and n.read_at is not None


# --- 3. Club-Scoped Mark-All ---

@pytest.mark.asyncio
async def test_mark_all_read_club_scoped(async_client, db_session, two_users, club_a, club_b):
    alice, _ = two_users
    na = _n(alice.id, club_id=club_a.id, title="Club A")
    nb = _n(alice.id, club_id=club_b.id, title="Club B")
    ng = _n(alice.id, club_id=None,      title="General")
    db_session.add_all([na, nb, ng]); await db_session.commit()
    res = await async_client.post(f"/api/v1/notifications/read-all?club_id={club_a.id}", headers=make_auth_header(alice))
    assert res.status_code == 200
    assert res.json()["marked_read_count"] == 2  # club_a + general
    await db_session.refresh(na); await db_session.refresh(nb); await db_session.refresh(ng)
    assert na.is_read is True
    assert ng.is_read is True
    assert nb.is_read is False  # club_b untouched

@pytest.mark.asyncio
async def test_mark_all_read_global(async_client, db_session, two_users, club_a, club_b):
    alice, _ = two_users
    db_session.add_all([_n(alice.id, club_id=club_a.id), _n(alice.id, club_id=club_b.id), _n(alice.id)])
    await db_session.commit()
    res = await async_client.post("/api/v1/notifications/read-all", headers=make_auth_header(alice))
    assert res.json()["marked_read_count"] == 3
    cnt = await async_client.get("/api/v1/notifications/unread-count", headers=make_auth_header(alice))
    assert cnt.json()["unread_count"] == 0


# --- 4. Delete / Dismiss ---

@pytest.mark.asyncio
async def test_delete_removes_notification_not_club(async_client, db_session, two_users, club_a):
    alice, _ = two_users
    n = _n(alice.id, club_id=club_a.id, category="booking")
    db_session.add(n); await db_session.commit()
    res = await async_client.delete(f"/api/v1/notifications/{n.id}", headers=make_auth_header(alice))
    assert res.status_code == 200
    lst = await async_client.get("/api/v1/notifications", headers=make_auth_header(alice))
    assert lst.json()["total"] == 0
    # club still exists
    result = await db_session.execute(sa_select(Club).where(Club.id == club_a.id))
    assert result.scalar_one_or_none() is not None

@pytest.mark.asyncio
async def test_delete_nonexistent_404(async_client, db_session, two_users):
    alice, _ = two_users
    res = await async_client.delete(f"/api/v1/notifications/{uuid.uuid4()}", headers=make_auth_header(alice))
    assert res.status_code == 404

@pytest.mark.asyncio
async def test_delete_twice_second_is_404(async_client, db_session, two_users):
    alice, _ = two_users
    n = _n(alice.id); db_session.add(n); await db_session.commit()
    headers = make_auth_header(alice)
    await async_client.delete(f"/api/v1/notifications/{n.id}", headers=headers)
    r2 = await async_client.delete(f"/api/v1/notifications/{n.id}", headers=headers)
    assert r2.status_code == 404


# --- 5. Filter Composition ---

@pytest.mark.asyncio
async def test_category_date_unread_filters_compose(async_client, db_session, two_users):
    alice, _ = two_users
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(days=1)
    db_session.add_all([
        _n(alice.id, category="booking",    title="B today",   is_read=False, created_at=now),
        _n(alice.id, category="tournament", title="T today",   is_read=True,  created_at=now),
        _n(alice.id, category="booking",    title="B yest",    is_read=False, created_at=yesterday),
        _n(alice.id, category="membership", title="M today",   is_read=False, created_at=now),
    ])
    await db_session.commit()
    headers = make_auth_header(alice)
    today = now.date().isoformat()

    r = await async_client.get("/api/v1/notifications?category=bookings", headers=headers)
    assert r.json()["total"] == 2

    r = await async_client.get(f"/api/v1/notifications?category=bookings&date={today}", headers=headers)
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["title"] == "B today"

    r = await async_client.get("/api/v1/notifications?category=memberships", headers=headers)
    assert r.json()["total"] == 1

    cnt = await async_client.get("/api/v1/notifications/unread-count", headers=headers)
    assert cnt.json()["unread_count"] == 3  # booking x2 + membership; tournament read


# --- 6. Pagination Stability ---

@pytest.mark.asyncio
async def test_pagination_stable_no_duplicates(async_client, db_session, two_users):
    alice, _ = two_users
    now = datetime.now(timezone.utc)
    for i in range(5):
        db_session.add(_n(alice.id, title=f"N{i}", created_at=now - timedelta(minutes=i)))
    await db_session.commit()
    headers = make_auth_header(alice)
    p1 = await async_client.get("/api/v1/notifications?limit=3&offset=0", headers=headers)
    p2 = await async_client.get("/api/v1/notifications?limit=3&offset=3", headers=headers)
    ids = [i["id"] for i in p1.json()["items"]] + [i["id"] for i in p2.json()["items"]]
    assert len(ids) == len(set(ids)) == 5


# --- 7. Unknown Categories Visible Under All ---

@pytest.mark.asyncio
async def test_unknown_category_visible_under_all(async_client, db_session, two_users):
    alice, _ = two_users
    db_session.add(_n(alice.id, category="legacy_xyz", title="Legacy"))
    await db_session.commit()
    headers = make_auth_header(alice)
    r = await async_client.get("/api/v1/notifications", headers=headers)
    assert r.json()["total"] == 1
    for cat in ["bookings", "membership", "tournament", "events"]:
        r = await async_client.get(f"/api/v1/notifications?category={cat}", headers=headers)
        assert r.json()["total"] == 0


# --- 8. Preference Suppression ---

@pytest.mark.asyncio
async def test_preference_suppresses_booking(db_session, two_users):
    alice, _ = two_users
    svc = NotificationService(db_session)
    pref = await svc.get_preferences(alice.id)
    pref.booking_notifications = False
    await db_session.flush()
    result = await svc.create_notification(alice.id, "Booking", "Msg", category="booking")
    assert result is None

@pytest.mark.asyncio
async def test_mandatory_bypasses_preference(db_session, two_users):
    alice, _ = two_users
    svc = NotificationService(db_session)
    pref = await svc.get_preferences(alice.id)
    pref.booking_notifications = False
    await db_session.flush()
    result = await svc.create_notification(alice.id, "Critical", "Msg", category="booking", mandatory=True)
    assert result is not None


# --- 9. Idempotency Key ---

@pytest.mark.asyncio
async def test_idempotency_key_deduplicates(db_session, two_users):
    alice, _ = two_users
    svc = NotificationService(db_session)
    key = f"idem-{uuid.uuid4()}"
    n1 = await svc.create_notification(alice.id, "Booking", "Msg", category="booking", idempotency_key=key)
    n2 = await svc.create_notification(alice.id, "Booking", "Msg", category="booking", idempotency_key=key)
    assert n1 is not None and n2 is not None
    assert str(n1.id) == str(n2.id)


# --- 10. Unauthenticated ---

@pytest.mark.asyncio
async def test_unauthenticated_rejected(async_client):
    fid = uuid.uuid4()
    for method, url in [
        ("GET",    "/api/v1/notifications"),
        ("GET",    "/api/v1/notifications/unread-count"),
        ("POST",   f"/api/v1/notifications/{fid}/read"),
        ("POST",   "/api/v1/notifications/read-all"),
        ("DELETE", f"/api/v1/notifications/{fid}"),
    ]:
        r = await async_client.request(method, url)
        assert r.status_code == 401, f"{method} {url} should be 401"


# --- 11. notify_club_staff role filter ---

@pytest.mark.asyncio
async def test_notify_club_staff_excludes_players(db_session, two_users, club_a):
    alice, bob = two_users
    db_session.add(ClubMembership(user_id=alice.id, club_id=club_a.id, role="owner",  is_active=True))
    db_session.add(ClubMembership(user_id=bob.id,   club_id=club_a.id, role="player", is_active=True))
    await db_session.flush()
    svc = NotificationService(db_session)
    created = await svc.notify_club_staff(club_id=club_a.id, title="Staff Alert", message="Internal", category="administrative")
    await db_session.flush()
    recipient_ids = {str(n.user_id) for n in created}
    assert str(alice.id) in recipient_ids
    assert str(bob.id) not in recipient_ids
