# Aught2 Pickleball — Architecture Documentation

## Overview

Aught2 Pickleball is a Club & Facility Management Platform delivered as a mobile application (iOS/Android) backed by a Python REST API. The architecture is designed for multi-club support, role-based access control, and long-term scalability.

---

## Mobile Architecture

### Framework
- **React Native + Expo SDK 57** — Cross-platform iOS/Android
- **Expo Router** — File-based routing (similar to Next.js but for React Native)
- **TypeScript** — Strict mode throughout

### Route Groups
```
app/
├── index.tsx              # Session check → redirect
├── _layout.tsx            # Root: QueryClient + SafeAreaProvider + auth init
│
├── (auth)/                # Unauthenticated users
│   ├── login.tsx
│   ├── forgot-password.tsx
│   └── reset-password.tsx
│
├── (player)/              # Player experience
│   ├── index.tsx          # Player Dashboard
│   ├── clubs.tsx          # Enrolled clubs list
│   ├── events.tsx
│   └── profile.tsx        # View & edit player profile
│
└── (club)/                # Club management experience
    ├── index.tsx          # Dashboard
    ├── tournaments.tsx
    ├── members.tsx        # Member administration (Staff Roles & Club Players)
    └── settings.tsx
```

### State Management
| Concern | Technology |
|---------|-----------|
| Server data (API responses) | TanStack Query — caching, refetching, mutations |
| Auth session (non-sensitive) | Zustand — in-memory only, NOT persisted |
| Auth tokens (sensitive) | expo-secure-store — iOS Keychain / Android Keystore |
| Navigation state | Expo Router |

### Security Rules (Mobile)
- Access tokens and refresh tokens: **SecureStore only**
- Tokens are **never** stored in AsyncStorage, Zustand, Redux, or files
- Roles are **never** sent to the backend by the client
- No database credentials embedded in the app
- `EXPO_PUBLIC_*` variables are public by design — never put secrets there

---

## Backend Architecture

### Framework
- **FastAPI** — Async Python REST API
- **SQLAlchemy 2.x** — Async ORM
- **Alembic** — Schema migrations (only migration mechanism — no `create_all()`)
- **Pydantic v2** — Request/response validation
- **PostgreSQL** — Production database
- **passlib/bcrypt** — Password hashing
- **python-jose** — JWT tokens

### Directory Structure
```
app/
├── main.py                # FastAPI app factory
├── core/
│   ├── config.py          # Pydantic Settings (env vars)
│   ├── database.py        # SQLAlchemy engine + session
│   └── security.py        # Password hashing + JWT
├── api/
│   ├── deps.py            # FastAPI dependencies (auth, permissions, club context)
│   └── v1/
│       ├── auth.py        # Auth endpoints
│       ├── clubs.py       # Club & membership endpoints (Phases 2 & 3)
│       └── player.py      # Player identity & player club endpoints (Phase 3)
├── models/                # SQLAlchemy models (User, Club, ClubMembership, PlayerProfile, ClubPlayerMembership)
├── schemas/               # Pydantic schemas (auth, club, club_membership, player_profile, club_player_membership)
├── permissions/           # Centralized permission registry
├── repositories/          # Database query layer
└── services/              # Business logic layer (AuthService, ClubService, PlayerService)
```

### Layered Architecture
```
HTTP Request
    ↓
FastAPI Route Handler
    ↓
FastAPI Dependencies (deps.py) — auth, permission checks
    ↓
Service Layer — business logic
    ↓
Repository Layer — database queries
    ↓
SQLAlchemy ORM
    ↓
PostgreSQL
```

---

## Database Architecture

### Schema
```
users
  id           UUID PK
  email        VARCHAR(255) UNIQUE
  hashed_password  VARCHAR(255)    ← bcrypt, never plaintext
  full_name    VARCHAR(255) NULL
  is_active    BOOLEAN
  is_verified  BOOLEAN
  created_at   TIMESTAMPTZ
  updated_at   TIMESTAMPTZ

clubs
  id           UUID PK
  name         VARCHAR(255)
  slug         VARCHAR(100) UNIQUE
  description  VARCHAR(1000) NULL
  is_active    BOOLEAN
  created_at   TIMESTAMPTZ
  updated_at   TIMESTAMPTZ

club_memberships
  id           UUID PK
  user_id      UUID FK → users.id
  club_id      UUID FK → clubs.id
  role         ENUM(club_role)    ← club_owner | club_manager | tournament_director
  is_active    BOOLEAN
  created_at   TIMESTAMPTZ
  updated_at   TIMESTAMPTZ

player_profiles
  id           UUID PK
  user_id      UUID FK → users.id UNIQUE
  display_name VARCHAR(100) NOT NULL
  first_name   VARCHAR(100) NULL
  last_name    VARCHAR(100) NULL
  phone        VARCHAR(30) NULL
  date_of_birth DATE NULL
  profile_image_url VARCHAR(500) NULL
  bio          TEXT NULL
  created_at   TIMESTAMPTZ
  updated_at   TIMESTAMPTZ

club_player_memberships
  id           UUID PK
  user_id      UUID FK → users.id
  club_id      UUID FK → clubs.id
  status       ENUM(player_membership_status) ← active | inactive | suspended | expired
  membership_number VARCHAR(100) NULL
  joined_at    TIMESTAMPTZ NOT NULL
  expires_at   TIMESTAMPTZ NULL
  created_at   TIMESTAMPTZ
  updated_at   TIMESTAMPTZ
  CONSTRAINT uq_club_player_memberships_user_club UNIQUE (user_id, club_id)
```

### Migration Strategy
Tables are NEVER created via `Base.metadata.create_all()`.

All schema changes must go through Alembic:
```bash
# Create a migration
alembic revision --autogenerate -m "describe change"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```

---

## Authentication Flow

```
Mobile App Launch
      ↓
Read access_token from SecureStore
      ↓
GET /api/v1/auth/me (with Bearer token)
      ↓
  ┌─ Token valid? ─── Yes ──→ Load user + memberships
  │                                    ↓
  │                           Memberships > 0? → Club experience
  │                           Memberships = 0? → Player experience
  │
  └─ Token invalid/missing ──→ Redirect to /auth/login
                                    ↓
                           User enters email + password
                           (NO role field on the form)
                                    ↓
                           POST /api/v1/auth/login
                                    ↓
                           Backend checks credentials
                           Backend loads ClubMemberships
                                    ↓
                           Returns: {access_token, refresh_token, user, memberships}
                                    ↓
                           Tokens → SecureStore
                           User + memberships → Zustand (in-memory)
                                    ↓
                           Navigate to appropriate experience
```

### Token Architecture
| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| Access token | 15 minutes | SecureStore | API authentication |
| Refresh token | 30 days | SecureStore | Get new access tokens |

---

## Role Model

See [permissions.md](./permissions.md) for full role and permission documentation.

**Key principle**: The role belongs to `ClubMembership`, NOT to `User`.

```
User
├── Club A
│   └── ClubMembership { role: club_owner }
│
└── Club B
    └── ClubMembership { role: tournament_director }
```

This enables multi-club support without any schema changes.

---

## Player vs Club Separation

| Domain | Description |
|--------|-------------|
| **Player Experience** | A user who participates in tournaments, leagues, open play as a competitor. No club management access. |
| **Club Management Experience** | A user with a ClubMembership and an assigned role (club_owner / club_manager / tournament_director). |

A user may eventually hold both — their player identity (as a competitor) and a club management membership. These are represented as separate domain relationships, not combined into a single "player role."

**The frontend experience switches based on membership count**:
- 0 memberships → player experience
- 1+ memberships → club management experience

---

## Multi-Club Strategy

The architecture supports multiple clubs from day one:

1. `ClubMembership` table allows a user → many clubs
2. Authentication response returns ALL active memberships
3. Mobile stores an `activeMembership` that the user can switch between
4. No club IDs are hardcoded anywhere in the application
5. API routes use `club_id` from the membership — never from the frontend

---

## Permission Architecture

See [permissions.md](./permissions.md) for the permission registry.

**Key principle**: No scattered `if role == "club_owner"` checks.

All permission logic lives in `app/permissions/__init__.py`:
```python
from app.permissions import Permission, has_permission
from app.models.club_membership import ClubRole

has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_TOURNAMENTS)  # True
has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_MEMBERS)      # False
```

Backend route protection uses dependency injection:
```python
@router.post("/tournaments")
async def create_tournament(
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
):
    ...
```

---

## Phase 4: Tournament Foundation Architecture

See [tournaments.md](./tournaments.md) for full competition specification.

### Data Model Hierarchy
```
Club (Tenant Boundary)
└── Tournament (scoped to club_id)
    ├── format: round_robin | pool_play | scramble | bracket
    ├── status: draft | registration_open | registration_closed | in_progress | completed | cancelled
    ├── visibility: public | private
    ├── scoring_rules (JSON): single_game, target_score 11, win_by 2
    ├── tiebreaker_rules (JSON): wins, points_diff, total_points, deterministic
    └── TournamentRegistration (Unique per tournament_id + player_membership_id)
        └── ClubPlayerMembership (Active player in this club)
            └── User
```

### Key Principles
1. **Club-Scoped Tenancy**: Every tournament belongs strictly to one club. Cross-club tournament access is blocked at the SQL query level.
2. **Structural Locking**: Once registration is open or closed, tournament format and player capacity are immutably locked against casual edits.
3. **Player Eligibility**: Self-registration strictly requires an active `ClubPlayerMembership` in the tournament's club.
4. **Deterministic Defaults**: Deterministic single-game scoring rules and ordered tiebreaker rules stored directly with the competition record.

---

## Phase 5: Round Robin Competition Engine Architecture

See [round-robin.md](./round-robin.md) for full competition specification.

### Data Model Hierarchy
```
Tournament (format: round_robin, status: in_progress)
├── Team (doubles partner team scoped to tournament_id)
│   ├── seed: optional integer
│   └── TeamMember (exactly 2 members per team)
│       └── ClubPlayerMembership
└── Match (pairwise fixture)
    ├── round_number, match_number
    ├── team_a_id, team_b_id
    ├── score_a, score_b (validated first to 11, win by 2)
    ├── winner_team_id (derived server-side)
    └── status: pending | completed | cancelled
```

### Key Architectural Principles
1. **Pure Engine Separation**: Schedule generation and standings calculation logic live in `app/services/competition/round_robin_engine.py` as pure functions with zero DB I/O.
2. **Server-Derived Outcomes**: Winner is derived by `ScoreValidator` based on pickleball rules (first to 11, win by 2); the client never transmits the winner.
3. **Immutability Invariants**: Match generation automatically advances the tournament to `in_progress`. Team modifications and schedule regenerations are strictly blocked once any match is completed.
4. **Dynamic Standings**: Division standings are computed on-the-fly from official match results using the exact tiebreaker hierarchy (Wins → Diff → Points → Lexicographic Name).

---

## Phase 6: Pool Play Competition Engine Architecture

See [pool-play.md](./pool-play.md) for full competition specification.

### Data Model Hierarchy
```
Tournament (format: pool_play)
├── Pool (ordered partitions: "Pool A", "Pool B")
│   └── PoolTeam (many-to-many team assignment with seed_in_pool)
│       └── Team (doubles partner team)
├── Match (stage: pool)
│   ├── pool_id (foreign key)
│   └── score_a, score_b, winner_team_id
└── Match (stage: championship)
    ├── bracket_round, bracket_position
    ├── next_match_id, next_match_slot (1 or 2)
    └── team_a_id, team_b_id (nullable, populated on advancement)
```

### Key Architectural Principles
1. **Pure Engine Isolation**: Snake team distribution, pool scheduling, pool standings with qualification badges, and single-elimination bracket generation live in `app/services/competition/pool_play_engine.py` as pure, deterministic algorithms with zero randomness.
2. **Stage Boundary Enforcement**: Pool matches and Championship matches are isolated via `stage` enum (`pool` vs `championship`). Championship bracket generation is gated until 100% of pool matches are completed.
3. **Deterministic Seeding & Pairings**: Serpentine snake seeding balances pools. Top qualifiers advance into standard tournament bracket seeds (1v8, 4v5, 2v7, 3v6) with automatic BYE progression.
4. **Recursive Auto-Advancement**: Scoring a championship match instantly advances the winning team to `next_match_id` at `next_match_slot`. Completing the championship final automatically marks the tournament `completed`.

