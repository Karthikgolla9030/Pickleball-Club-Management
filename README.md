# Aught2 Pickleball

> Club & Facility Management Platform — Mobile Application + REST API

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | v18+ (v25 tested) | [nodejs.org](https://nodejs.org) |
| npm | v9+ | Included with Node.js |
| Python | 3.11+ (3.14 tested) | [python.org](https://python.org) |
| PostgreSQL | 14+ (18 tested) | Running locally or remote |
| Git | Any | [git-scm.com](https://git-scm.com) |
| Expo CLI | Auto-installed | `npx expo` |
| Expo Go | Mobile app | For testing on device |

---

## Repository Structure

```
aught2-pickleball/
├── mobile/          React Native + Expo mobile application
├── backend/         Python FastAPI REST API
├── docs/            Architecture and reference documentation
├── .gitignore
└── README.md
```

---

## Backend Setup

### 1. Create and activate virtual environment

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements-dev.txt
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL=postgresql+psycopg://postgres:yourpassword@localhost:5432/aught2_pickleball
JWT_SECRET_KEY=your-super-secret-key-at-least-32-characters
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30
CORS_ORIGINS=["http://localhost:8081","http://localhost:19006"]
APP_ENV=development
```

### 4. Create PostgreSQL database

```sql
-- Connect to PostgreSQL and run:
CREATE DATABASE aught2_pickleball;
```

Or via command line:
```bash
createdb aught2_pickleball
```

### 5. Run database migrations

```bash
# From backend/ directory with venv active
alembic upgrade head
```

> **Note**: Tables are NEVER created automatically. Always use Alembic.

### 6. Seed development data (optional)

```bash
python -m scripts.seed
```

This creates:
- 1 demo club: **Aught2 Demo Club**
- `owner@demo.local` / `DemoOwner2024!` → Club Owner
- `manager@demo.local` / `DemoManager2024!` → Club Manager
- `director@demo.local` / `DemoDirector2024!` → Tournament Director
- `player@demo.local` / `DemoPlayer2024!` → Player (no club membership)

### 7. Start the backend server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API documentation available at: http://localhost:8000/docs

---

## Mobile Setup

### 1. Install dependencies

```bash
cd mobile
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
EXPO_PUBLIC_API_URL=http://localhost:8000
```

> For physical device testing, use your machine's local IP instead of `localhost`:
> `EXPO_PUBLIC_API_URL=http://192.168.1.xxx:8000`

### 3. Start the Expo development server

```bash
npx expo start
```

Then:
- Press `i` for iOS Simulator (macOS only)
- Press `a` for Android Emulator
- Scan QR code with **Expo Go** app for physical device

---

## Development Commands

### Backend

```bash
# Run all tests
pytest

# Run tests with coverage
pytest --cov=app

# Type checking (if mypy installed)
mypy app/

# Format code
black app/ tests/
isort app/ tests/

# Lint
ruff check app/ tests/

# Create a new migration
alembic revision --autogenerate -m "describe your change"

# Apply migrations
alembic upgrade head

# Rollback last migration
alembic downgrade -1

# Show migration history
alembic history
```

### Mobile

```bash
# TypeScript type check
npx tsc --noEmit

# ESLint
npm run lint

# Start Expo
npx expo start

# Install a new Expo-managed package (use this instead of plain npm install)
npx expo install <package-name>
```

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET_KEY` | ✅ | Secret for signing JWT tokens |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | ✅ | Access token lifetime (default: 15) |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | ✅ | Refresh token lifetime (default: 30) |
| `CORS_ORIGINS` | ✅ | JSON array of allowed origins |
| `APP_ENV` | ✅ | `development` or `production` |
| `LOG_LEVEL` | Optional | `DEBUG`, `INFO`, `WARNING` (default: `INFO`) |

### Mobile (`mobile/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | ✅ | Backend API base URL |

---

## Security Notes

- **Never** commit `.env` files — they are gitignored
- **Never** store tokens in AsyncStorage — use SecureStore
- **Never** send role from the mobile client — backend is authoritative
- **Never** use `Base.metadata.create_all()` in production — use Alembic
- Production `JWT_SECRET_KEY` must be a strong random string (≥32 chars)

---

## Architecture

See [docs/architecture.md](./docs/architecture.md) for full documentation.

See [docs/permissions.md](./docs/permissions.md) for the role and permission model.

---

## Phase 1 Status

Phase 1 establishes the foundation. No business modules yet.

| Component | Status |
|-----------|--------|
| Monorepo structure | ✅ |
| Git + .gitignore | ✅ |
| Backend (FastAPI + SQLAlchemy + Alembic) | ✅ |
| PostgreSQL configuration | ✅ |
| User / Club / ClubMembership models | ✅ |
| JWT authentication (access + refresh) | ✅ |
| Role model (3 roles, on ClubMembership) | ✅ |
| Centralized permission system | ✅ |
| Backend authorization dependencies | ✅ |
| Mobile (Expo + Expo Router + TypeScript) | ✅ |
| Auth routing group | ✅ |
| Player routing group | ✅ |
| Club routing group | ✅ |
| SecureStore token storage | ✅ |
| API client foundation | ✅ |
| TanStack Query setup | ✅ |
| Zustand auth store | ✅ |
| Design system (colors/typography/spacing) | ✅ |
| UI primitives | ✅ |
| Tests (15+ test cases) | ✅ |
| Seed data | ✅ |
| Documentation | ✅ |

**Phase 2** will implement business modules: tournaments, leagues, bookings, memberships, payments.
