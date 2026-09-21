"""
Test: Backend Startup

Verifies:
  1. Backend starts successfully (FastAPI app can be created)
  2. Health endpoint responds correctly
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


# ─── Test 1: Backend starts successfully ─────────────────────────────────────

def test_app_starts_successfully():
    """Test 1: The FastAPI application can be created without errors."""
    assert app is not None
    assert app.title == "Aught2 Pickleball API"


def test_health_endpoint(client: TestClient):
    """Test 1b: Health check endpoint returns 200 OK."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


def test_app_has_correct_routers(client: TestClient):
    """Test 1c: API router is mounted at /api/v1."""
    # Login endpoint should exist (returns 422 for missing body, not 404)
    response = client.post("/api/v1/auth/login")
    assert response.status_code in (422, 401)  # Not 404
