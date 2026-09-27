"""API v1 router — aggregates all route modules."""
from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.bookings import (
    player_bookings_router,
    player_club_bookings_router,
    staff_bookings_router,
)
from app.api.v1.clubs import router as clubs_router
from app.api.v1.competition import (
    club_competition_router,
    player_competition_router,
)
from app.api.v1.courts import (
    club_courts_router,
    player_courts_router,
)
from app.api.v1.leagues import (
    club_league_router,
    player_league_router,
)
from app.api.v1.memberships import (
    plans_router as membership_plans_router,
    subscriptions_router as membership_subscriptions_router,
)
from app.api.v1.payments import (
    club_payments_router,
    player_payments_router,
)
from app.api.v1.events import (
    club_events_router,
    player_events_router,
)
from app.api.v1.lessons import (
    club_lessons_router,
    player_lessons_router,
)
from app.api.v1.scheduling import (
    club_scheduling_router,
    player_scheduling_router,
)
from app.api.v1.player import router as player_router
from app.api.v1.tournaments import (
    club_tournaments_router,
    tournaments_router,
)

from app.api.v1.notifications import router as notifications_router
from app.api.v1.websocket import ws_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(ws_router)
api_router.include_router(notifications_router)
api_router.include_router(auth_router)
api_router.include_router(clubs_router)
api_router.include_router(player_router)
api_router.include_router(club_tournaments_router)
api_router.include_router(tournaments_router)
api_router.include_router(club_scheduling_router)
api_router.include_router(player_scheduling_router)
api_router.include_router(club_competition_router)
api_router.include_router(player_competition_router)
api_router.include_router(club_league_router)
api_router.include_router(player_league_router)
api_router.include_router(player_courts_router)
api_router.include_router(player_club_bookings_router)
api_router.include_router(club_courts_router)
api_router.include_router(player_bookings_router)
api_router.include_router(staff_bookings_router)
api_router.include_router(membership_plans_router)
api_router.include_router(membership_subscriptions_router)
api_router.include_router(club_payments_router)
api_router.include_router(player_payments_router)
api_router.include_router(player_events_router)
api_router.include_router(club_events_router)
api_router.include_router(player_lessons_router)
api_router.include_router(club_lessons_router)

