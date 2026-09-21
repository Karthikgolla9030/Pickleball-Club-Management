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

---

### Club Manager — Operations only

| Permission | ✓/✗ |
|-----------|-----|
| manage_club | ❌ |
| manage_users | ❌ |
| manage_roles | ❌ |
| manage_settings | ❌ |
| manage_payments | ❌ |
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

---

### Tournament Director — Competition only

| Permission | ✓/✗ |
|-----------|-----|
| manage_club | ❌ |
| manage_users | ❌ |
| manage_roles | ❌ |
| manage_settings | ❌ |
| manage_payments | ❌ |
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
const { role } = useActiveClub();
const canManageTournaments = 
  role === 'club_owner' || 
  role === 'club_manager' || 
  role === 'tournament_director';
```

> **CRITICAL**: Frontend navigation hiding is purely for user experience.
> The backend enforces all permissions independently.
> A clever user bypassing UI restrictions will still receive `403 Forbidden`.
