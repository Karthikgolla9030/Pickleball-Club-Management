"""API v1 router — aggregates all route modules."""
from fastapi import APIRouter

from app.api.v1.auth import router as auth_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)

# Phase 2+ routers will be added here:
# from app.api.v1.clubs import router as clubs_router
# from app.api.v1.members import router as members_router
# from app.api.v1.tournaments import router as tournaments_router
# from app.api.v1.leagues import router as leagues_router
# from app.api.v1.bookings import router as bookings_router
