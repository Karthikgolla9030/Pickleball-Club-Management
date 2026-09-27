# Aught2 Pickleball — Role & Permission Reference

## The Three Club Management Roles

There are exactly **three** club management roles. No more, no less.

| Role Identifier | Display Label | Description |
|----------------|---------------|-------------|
| `club_owner` | Club Owner | Full control over the club and all operations |
| `club_manager` | Club Manager | Day-to-day club operations, cannot manage roles or finances |
| `tournament_director` | Tournament Director | Manages tournaments AND leagues (both) |

> **Note**: Tournament Director manages both tournaments AND leagues. There is no separate "League Director" role.

---

## Permission Registry

All permissions are defined in `app/permissions/__init__.py`.

| Permission | Description |
|-----------|-------------|
| `manage_club` | Edit club profile and core settings |
| `manage_users` | Create, deactivate user accounts |
| `manage_roles` | Assign and change roles in ClubMembership |
| `manage_settings` | Club configuration and billing |
| `manage_payments` | Access financial records and payment processing |
| `manage_events` | Create, publish, cancel, and manage club events & rosters |
| `manage_lessons` | Create, schedule, cancel, and manage coaches, lesson types, lessons & rosters |
| `manage_members` | View and manage player/member records |
| `manage_memberships` | Create and edit membership plans |
| `manage_bookings` | Court reservation management |
| `manage_courts` | Court availability and configuration |
| `manage_reports` | Access club reports and analytics |
| `manage_tournaments` | Create and run tournaments |
| `manage_leagues` | Create and run leagues |
| `manage_teams` | Manage teams within tournaments and leagues |
| `manage_matches` | Schedule and record matches |
| `manage_scores` | Enter and update scores |
| `manage_standings` | View and manage standings tables |
| `manage_results` | Publish and manage final results |
| `manage_schedules` | Assign physical courts and schedule match times for tournaments and leagues |

---

## Role → Permission Mapping

### Club Owner — ALL permissions

| Permission | ✓ |
|-----------|---|
| manage_club | ✅ |
| manage_users | ✅ |
| manage_roles | ✅ |
| manage_settings | ✅ |
| manage_payments | ✅ |
| manage_events | ✅ |
| manage_lessons | ✅ |
| manage_members | ✅ |
| manage_memberships | ✅ |
| manage_bookings | ✅ |
| manage_courts | ✅ |
| manage_reports | ✅ |
| manage_tournaments | ✅ |
| manage_leagues | ✅ |
| manage_teams | ✅ |
| manage_matches | ✅ |
| manage_scores | ✅ |
| manage_standings | ✅ |
| manage_results | ✅ |
| manage_schedules | ✅ |

---

### Club Manager — Operations only

| Permission | ✓/✗ |
|-----------|-----|
| manage_club | ❌ |
| manage_users | ❌ |
| manage_roles | ❌ |
| manage_settings | ❌ |
| manage_payments | ✅ |
| manage_events | ✅ |
| manage_lessons | ✅ |
| manage_members | ✅ |
| manage_memberships | ✅ |
| manage_bookings | ✅ |
| manage_courts | ✅ |
| manage_reports | ✅ |
| manage_tournaments | ✅ |
| manage_leagues | ✅ |
| manage_teams | ✅ |
| manage_matches | ✅ |
| manage_scores | ✅ |
| manage_standings | ✅ |
| manage_results | ✅ |
| manage_schedules | ✅ |

---

### Tournament Director — Competition only

| Permission | ✓/✗ |
|-----------|-----|
| manage_club | ❌ |
| manage_users | ❌ |
| manage_roles | ❌ |
| manage_settings | ❌ |
| manage_payments | ❌ |
| manage_events | ❌ |
| manage_lessons | ❌ |
| manage_members | ❌ |
| manage_memberships | ❌ |
| manage_bookings | ❌ |
| manage_courts | ❌ |
| manage_reports | ❌ |
| manage_tournaments | ✅ |
| manage_leagues | ✅ |
| manage_teams | ✅ |
| manage_matches | ✅ |
| manage_scores | ✅ |
| manage_standings | ✅ |
| manage_results | ✅ |
| manage_schedules | ✅ |

---

## Implementation Notes

### Backend: Central Permission Check
```python
from app.permissions import Permission, has_permission
from app.models.club_membership import ClubRole

# Synchronous permission check
result = has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_LEAGUES)
# → True

result = has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_MEMBERS)
# → False
```

### Backend: Route Protection via Dependency
```python
from app.api.deps import require_permission
from app.permissions import Permission

@router.post("/tournaments")
async def create_tournament(
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
):
    # 403 is automatically returned if permission is missing
    ...
```

### Frontend Navigation Hiding (UX only)
```typescript
// This is UX only — backend always enforces actual permissions
const { canManageMembers, canManageRoles } = usePermission();
```

---

## Phase 2 Endpoint Permission Enforcement

| Endpoint | HTTP Method | Required Permission | Allowed Roles | Denied Roles |
|----------|-------------|---------------------|---------------|--------------|
| `/api/v1/clubs` | GET | Active User | All authenticated users (own clubs only) | Unauthenticated |
| `/api/v1/clubs/{id}` | GET | Active Member | Club Owner, Club Manager, Tournament Director (member only) | Non-members (403/404), Inactive (403) |
| `/api/v1/clubs/{id}/membership` | GET | Active Member | Club Owner, Club Manager, Tournament Director (own membership) | Non-members (403/404) |
| `/api/v1/clubs/{id}/members` | GET | `manage_members` | Club Owner, Club Manager | Tournament Director (403) |
| `/api/v1/clubs/{id}/members` | POST | `manage_roles` | Club Owner only | Club Manager (403), Tournament Director (403) |
| `/api/v1/clubs/{id}/members/{m_id}` | PATCH | `manage_roles` | Club Owner only | Club Manager (403), Tournament Director (403) |
| `/api/v1/clubs/{id}/members/{m_id}` | DELETE | `manage_roles` | Club Owner only | Club Manager (403), Tournament Director (403) |

---

## Phase 3 Endpoint Permission Enforcement

| Endpoint | HTTP Method | Required Permission | Allowed Roles / Access | Denied Roles / Access |
|----------|-------------|---------------------|------------------------|-----------------------|
| `/api/v1/player/profile` | GET / POST / PATCH | Active User | Authenticated user (own profile) | Unauthenticated (401) |
| `/api/v1/player/clubs` | GET | Active User | Authenticated user (own player clubs) | Unauthenticated (401) |
| `/api/v1/player/clubs/{club_id}` | GET | Active User | Authenticated user (own club membership) | Non-player member (404), Unauthenticated (401) |
| `/api/v1/clubs/{id}/player-memberships` | GET | `manage_members` | Club Owner, Club Manager | Tournament Director (403), Non-staff (403) |
| `/api/v1/clubs/{id}/player-memberships` | POST | `manage_members` | Club Owner, Club Manager | Tournament Director (403), Non-staff (403) |
| `/api/v1/clubs/{id}/player-memberships/{m_id}` | PATCH | `manage_members` | Club Owner, Club Manager | Tournament Director (403), Non-staff (403) |

---

## Phase 4 Endpoint Permission Enforcement

| Endpoint | HTTP Method | Required Permission | Allowed Roles / Access | Denied Roles / Access |
|----------|-------------|---------------------|------------------------|-----------------------|
| `/api/v1/clubs/{id}/tournaments` | GET / POST | `manage_tournaments` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}` | GET / PATCH / DELETE | `manage_tournaments` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/open-registration` | POST | `manage_tournaments` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/close-registration` | POST | `manage_tournaments` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/cancel` | POST | `manage_tournaments` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/registrations` | GET | `manage_tournaments` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/tournaments` | GET | Active User | Authenticated players (published public tournaments) | Unauthenticated (401) |
| `/api/v1/tournaments/{t_id}/register` | POST | Active User | Club Player Member | Non-member of club (400), Unauthenticated (401) |

---

## Phase 5: Competition Engine Permission Enforcement

| Endpoint | HTTP Method | Required Permission | Allowed Roles / Access | Denied Roles / Access |
|----------|-------------|---------------------|------------------------|-----------------------|
| `/api/v1/clubs/{id}/tournaments/{t_id}/teams` | GET / POST | `manage_teams` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/teams/{team_id}` | PATCH / DELETE | `manage_teams` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/generate-round-robin` | POST | `manage_matches` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/regenerate-round-robin` | POST | `manage_matches` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/matches` | GET | `manage_matches` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/matches/{m_id}` | GET | `manage_matches` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/matches/{m_id}/result` | POST / PATCH | `manage_results` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/standings` | GET | `manage_standings` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/tournaments/{t_id}/teams` | GET | Active User | All authenticated users (read-only) | Unauthenticated (401) |
| `/api/v1/tournaments/{t_id}/matches` | GET | Active User | All authenticated users (read-only) | Unauthenticated (401) |
| `/api/v1/tournaments/{t_id}/standings` | GET | Active User | All authenticated users (read-only) | Unauthenticated (401) |

---

## Phase 6: Pool Play & Championship Permission Enforcement

| Endpoint | HTTP Method | Required Permission | Allowed Roles / Access | Denied Roles / Access |
|----------|-------------|---------------------|------------------------|-----------------------|
| `/api/v1/clubs/{id}/tournaments/{t_id}/pools` | GET | `manage_teams` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/pools/configure` | POST | `manage_tournaments` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/pools/assign-serpentine` | POST | `manage_teams` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/pools/manual-assign` | POST | `manage_teams` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/pools/generate-matches` | POST | `manage_matches` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/pools/regenerate-matches` | POST | `manage_matches` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/pools/matches` | GET | `manage_matches` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/pools/standings` | GET | `manage_standings` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/championship/generate` | POST | `manage_matches` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/clubs/{id}/tournaments/{t_id}/championship/matches` | GET | `manage_matches` | Club Owner, Club Manager, Tournament Director | Non-staff (403), Unauthenticated (401) |
| `/api/v1/tournaments/{t_id}/pools` | GET | Active User | All authenticated users (read-only) | Unauthenticated (401) |
| `/api/v1/tournaments/{t_id}/pools/matches` | GET | Active User | All authenticated users (read-only) | Unauthenticated (401) |
| `/api/v1/tournaments/{t_id}/pools/standings` | GET | Active User | All authenticated users (read-only) | Unauthenticated (401) |
| `/api/v1/tournaments/{t_id}/championship/matches` | GET | Active User | All authenticated users (read-only) | Unauthenticated (401) |

> **CRITICAL**: Frontend navigation hiding is purely for user experience.
> The backend enforces all permissions independently.
> A user bypassing UI restrictions will still receive `403 Forbidden`.


