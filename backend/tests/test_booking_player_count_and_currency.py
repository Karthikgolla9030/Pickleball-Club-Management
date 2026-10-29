"""
Tests for optional player count in court bookings and USD currency standardization.
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
import uuid

from app.schemas.booking import (
    BookingCreateRequest,
    StaffBookingCreateRequest,
    BookingResponse,
)
from app.schemas.payment import (
    CheckoutInitiateRequest,
    CheckoutPriceBreakdown,
)
from app.models.booking import Booking, BookingType, BookingStatus


def test_booking_create_request_optional_player_count():
    now = datetime.now(timezone.utc)
    start_at = now + timedelta(days=1)
    end_at = start_at + timedelta(minutes=60)
    court_id = uuid.uuid4()

    # 1. Null / omitted player_count is valid
    req_none = BookingCreateRequest(
        court_id=court_id,
        start_at=start_at,
        end_at=end_at,
    )
    assert req_none.player_count is None

    # 2. Explicit player_count is valid
    req_four = BookingCreateRequest(
        court_id=court_id,
        start_at=start_at,
        end_at=end_at,
        player_count=4,
    )
    assert req_four.player_count == 4

    # 3. Validation bounds (ge=1, le=50)
    with pytest.raises(Exception):
        BookingCreateRequest(
            court_id=court_id,
            start_at=start_at,
            end_at=end_at,
            player_count=0,
        )


def test_staff_booking_create_request_optional_player_count():
    now = datetime.now(timezone.utc)
    start_at = now + timedelta(days=1)
    end_at = start_at + timedelta(minutes=60)
    court_id = uuid.uuid4()

    # Omitted player_count is valid
    req_none = StaffBookingCreateRequest(
        court_id=court_id,
        guest_name="Walk-in Guest",
        start_at=start_at,
        end_at=end_at,
    )
    assert req_none.player_count is None

    # Explicit player_count is valid
    req_five = StaffBookingCreateRequest(
        court_id=court_id,
        guest_name="Walk-in Guest",
        start_at=start_at,
        end_at=end_at,
        player_count=5,
    )
    assert req_five.player_count == 5


from app.models.payment import PaymentPurpose

def test_payment_schemas_default_usd_currency():
    # CheckoutPriceBreakdown defaults to USD
    breakdown = CheckoutPriceBreakdown(
        base_amount=Decimal("40.00"),
        final_amount=Decimal("40.00"),
    )
    assert breakdown.currency == "USD"

    # CheckoutInitiateRequest defaults to USD
    initiate = CheckoutInitiateRequest(
        club_id=uuid.uuid4(),
        purpose=PaymentPurpose.COURT_BOOKING,
        activity_id=uuid.uuid4(),
        selected_method="card",
    )
    assert initiate.currency == "USD"


@pytest.mark.asyncio
async def test_booking_model_player_count_persistence(db_session):
    # Verify booking model accepts and stores player_count without altering price or status
    booking_id = uuid.uuid4()
    club_id = uuid.uuid4()
    court_id = uuid.uuid4()
    user_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    booking = Booking(
        id=booking_id,
        club_id=club_id,
        court_id=court_id,
        player_id=user_id,
        booked_by_user_id=user_id,
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        start_at=now + timedelta(days=1),
        end_at=now + timedelta(days=1, minutes=60),
        price_per_hour=Decimal("35.00"),
        total_price=Decimal("35.00"),
        currency="USD",
        player_count=4,
    )
    assert booking.player_count == 4
    assert booking.currency == "USD"
    assert booking.total_price == Decimal("35.00")

    # Booking with None player_count
    booking_unspecified = Booking(
        id=uuid.uuid4(),
        club_id=club_id,
        court_id=court_id,
        player_id=user_id,
        booked_by_user_id=user_id,
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        start_at=now + timedelta(days=2),
        end_at=now + timedelta(days=2, minutes=60),
        price_per_hour=Decimal("35.00"),
        total_price=Decimal("35.00"),
        currency="USD",
        player_count=None,
    )
    assert booking_unspecified.player_count is None
