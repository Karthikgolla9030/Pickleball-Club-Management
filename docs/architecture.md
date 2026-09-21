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
│   ├── index.tsx          # Home
│   ├── events.tsx
│   └── profile.tsx
│
└── (club)/                # Club management experience
    ├── index.tsx          # Dashboard
    ├── tournaments.tsx
    ├── members.tsx
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
│   ├── deps.py            # FastAPI dependencies (auth, permissions)
│   └── v1/
│       └── auth.py        # Auth endpoints
├── models/                # SQLAlchemy models
├── schemas/               # Pydantic schemas
├── permissions/           # Centralized permission registry
├── repositories/          # Database query layer
└── services/              # Business logic layer
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
