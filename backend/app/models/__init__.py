"""
Models package — import all models here so Alembic can discover them
for autogenerate migrations.
"""
from app.models.club import Club
from app.models.membership import (
    MembershipPlan,
    MemberSubscription,
    PlanDurationUnit,
    PlanStatus,
    SubscriptionStatus,
)
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import (
    Match,
    MatchParticipant,
    MatchStage,
    MatchStatus,
    Pool,
    PoolTeam,
    Team,
    TeamMember,
)
from app.models.league import (
    League,
    LeagueStatus,
    LeagueWeek,
    LeagueWeekStatus,
    LeagueWeekType,
    LeagueWeeklyStanding,
)
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.player_profile import PlayerProfile
from app.models.payment import (
    Payment,
    PaymentMethod,
    PaymentPurpose,
    PaymentStatus,
)
from app.models.event import (
    Event,
    EventRegistration,
    EventRegistrationStatus,
    EventStatus,
    EventType,
    EventVisibility,
)
from app.models.lesson import (
    Coach,
    Lesson,
    LessonRegistration,
    LessonRegistrationStatus,
    LessonStatus,
    LessonType,
)
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
from app.models.notification import Notification
from app.models.user import User

__all__ = [
    "Booking",
    "BookingStatus",
    "BookingType",
    "Club",
    "ClubMembership",
    "ClubPlayerMembership",
    "ClubRole",
    "Coach",
    "Court",
    "CourtEnvironment",
    "CourtStatus",
    "Event",
    "EventRegistration",
    "EventRegistrationStatus",
    "EventStatus",
    "EventType",
    "EventVisibility",
    "League",
    "LeagueStatus",
    "LeagueWeek",
    "LeagueWeekStatus",
    "LeagueWeekType",
    "LeagueWeeklyStanding",
    "Lesson",
    "LessonRegistration",
    "LessonRegistrationStatus",
    "LessonStatus",
    "LessonType",
    "Match",
    "MatchParticipant",
    "MatchStage",
    "MatchStatus",
    "MembershipPlan",
    "MemberSubscription",
    "Notification",
    "Payment",
    "PaymentMethod",
    "PaymentPurpose",
    "PaymentStatus",
    "PlanDurationUnit",
    "PlanStatus",
    "PlayerMembershipStatus",
    "PlayerProfile",
    "Pool",
    "PoolTeam",
    "RegistrationStatus",
    "SubscriptionStatus",
    "Team",
    "TeamMember",
    "Tournament",
    "TournamentFormat",
    "TournamentRegistration",
    "TournamentStatus",
    "TournamentVisibility",
    "User",
]
