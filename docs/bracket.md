# Phase 8 — Standalone Bracket Competition Engine

## Overview

Phase 8 adds a **standalone single-elimination bracket** format (`bracket`) to the Aught2 Pickleball application. Unlike the Pool Play championship bracket (which is a sub-phase of Pool Play), a Bracket tournament is its own first-class competition format — teams register directly, and a single-elimination bracket is generated to determine a champion.

---

## Key Design Decisions

### Deterministic Seeding

Bracket generation is **fully deterministic** — the same set of teams always produces the same bracket. Ordering follows these rules (applied in priority order):

1. **Seeded teams first**, ordered ascending by `seed` (lowest seed number = highest ranked)
2. **Unseeded teams next**, ordered alphabetically by team name (case-insensitive)
3. **Tiebreaker**: `team.id` string comparison (stable, never random)

> No `random.shuffle()`, `random.sample()`, or timestamp-based ordering is used anywhere in the bracket engine.

### Standard Bracket Pairings

For an N-team bracket (where N is a power of 2), pairings follow standard tournament convention:

| Seed 1 vs Seed N | Seed 2 vs Seed N-1 | Seed 3 vs Seed N-2 | ... |

This means the top seed plays the lowest seed in Round 1.

### BYE Handling

When the number of teams is not a power of 2, BYE slots are inserted to pad to the next power of 2:

- BYE matches are created with `status = COMPLETED` immediately
- The real team gets `winner_team_id` set automatically
- BYE matches have `score_a = None`, `score_b = None`
- Top seeds receive BYEs first (they skip Round 1)

**BYEs never create additional playable matches.** Players never see BYE entries in any scorable match list.

### Winner Derivation

The backend **derives** the winner from scores — it is never provided by the client:

```
score_a > score_b  ->  winner = team_a
score_a < score_b  ->  winner = team_b
score_a == score_b ->  rejected (ties not allowed in single-elimination)
```

### Match Advancement

When a score is recorded on a non-final bracket match, the winning team is automatically placed into the correct slot (`team_a` or `team_b`) of the next round match. This uses the `next_match_id` and `next_match_slot` fields on the `Match` model.

### Champion Derivation

The champion is set when the **final match** (the match with `next_match_id = NULL`) is completed. The `Tournament.winner_team_id` field is updated to the winning team at that point, and the tournament status is advanced to `COMPLETED`.

---

## API Endpoints

### Staff Endpoints (require Club Staff role)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/clubs/{club_id}/tournaments/{tournament_id}/generate-bracket` | Generate bracket |
| `POST` | `/api/v1/clubs/{club_id}/tournaments/{tournament_id}/regenerate-bracket` | Regenerate bracket (before any scores) |
| `GET`  | `/api/v1/clubs/{club_id}/tournaments/{tournament_id}/bracket` | Get bracket summary |
| `GET`  | `/api/v1/clubs/{club_id}/tournaments/{tournament_id}/bracket/matches` | List all bracket matches |
| `POST` | `/api/v1/clubs/{club_id}/tournaments/{tournament_id}/matches/{match_id}/result` | Record a result |
| `PATCH`| `/api/v1/clubs/{club_id}/tournaments/{tournament_id}/matches/{match_id}/result` | Correct a result |

### Player Endpoints (authenticated, public tournaments)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/v1/tournaments/{tournament_id}/bracket` | Get bracket summary |
| `GET`  | `/api/v1/tournaments/{tournament_id}/bracket/matches` | List all bracket matches |

---

## Response Schemas

### BracketGenerationResponse

```json
{
  "tournament_id": "uuid",
  "teams_count": 4,
  "bracket_size": 4,
  "rounds_count": 2,
  "matches_generated": 3,
  "byes_count": 0,
  "played_matches_count": 0,
  "message": "Bracket generated successfully with 4 teams in 2 rounds."
}
```

### BracketSummaryResponse

```json
{
  "tournament_id": "uuid",
  "teams_count": 4,
  "bracket_size": 4,
  "rounds_count": 2,
  "champion_team_id": null,
  "champion_team_name": null,
  "matches_played": 1,
  "matches_remaining": 2
}
```

`champion_team_id` and `champion_team_name` are `null` until the final match is completed.

---

## Tournament Lifecycle

```
DRAFT -> REGISTRATION_OPEN -> REGISTRATION_CLOSED -> [generate-bracket] -> IN_PROGRESS -> COMPLETED
```

- `generate-bracket` transitions: `REGISTRATION_CLOSED` -> `IN_PROGRESS`
- `COMPLETED` is set automatically when the final match result is recorded

---

## Bracket Engine

Located at `backend/app/services/competition/bracket_engine.py`.

The `BracketEngine` class is **stateless and pure** — it never touches the database. Results are returned as `BracketMatchSlot` dataclasses for the service layer to persist.

### Validation Rules

The engine raises `BracketConfigurationError` if:

1. Fewer than 2 teams provided
2. Any team has != 2 members
3. A player appears in more than one team
4. A player appears twice within the same team

---

## Seed Data

The seed script (`backend/scripts/seed.py`) creates the following demo:

### Aught2 Summer Slam — `bracket`, `in_progress`

- 4 seeded teams: Alpha Aces (1), Beta Blasters (2), Gamma Grinders (3), Delta Dropshots (4)
- Round 1, Match 1: **Alpha Aces 11-7 Delta Dropshots** (completed, winner advanced to final)
- Round 1, Match 2: Beta Blasters vs Gamma Grinders (pending)
- Final: Alpha Aces vs TBD (pending)

---

## Testing

Test file: `backend/tests/test_bracket_api.py`

**67 tests — 67/67 pass.**

| Class | Tests |
|-------|-------|
| `TestBracketEngineUnit` | 40 |
| `TestBracketGenerateAPI` | 10 |
| `TestBracketMatchesAPI` | 5 |
| `TestBracketScoring` | 6 |
| `TestBracket2TeamsCompletion` | 1 |
| `TestBracketRegenerateAPI` | 2 |
| `TestBracketTeamManagement` | 2 |
| `TestBracketTenantIsolation` | 1 |

```bash
cd backend
python -m pytest tests/test_bracket_api.py -v
```

---

## Mobile Integration

| File | Changes |
|------|---------|
| `src/types/index.ts` | `BracketGenerationResponse`, `BracketSummaryResponse` |
| `src/constants/index.ts` | 4 new bracket query keys |
| `src/services/api/competition.ts` | 6 new bracket API methods |
| `src/hooks/useCompetition.ts` | `useBracket`, `usePlayerBracket` hooks |
| `src/hooks/index.ts` | Exports new hooks |
