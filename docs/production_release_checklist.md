# Aught2 Pickleball — Production Release Checklist

This checklist distinguishes **completed automated codebase verifications** from **manual operational tasks** that must be performed by the deployment operator prior to live production traffic.

---

## Part 1: Automated Verification & Codebase Checks (Completed)

These checks have been independently executed and verified in the codebase:

- [x] **Backend Test Suite**: 859 tests passing across all domains with zero regressions (`pytest tests`).
- [x] **Phase 10 E2E Journeys**: 17 cross-phase journeys tested and verified (`pytest tests/test_phase10_production_readiness.py`).
- [x] **Database Schema Consistency**: `python -m alembic check` verified 0 drift warnings at migration head `becbd8891115`.
- [x] **Mobile Static Analysis**: TypeScript compilation verified with 0 errors (`npm run typecheck`).
- [x] **Mobile Linting**: ESLint clean pass with 0 errors (`npm run lint`).
- [x] **Mobile Production Build**: Expo web production bundle successfully generated (`expo export --platform web`).
- [x] **Tenant Isolation**: Multi-tenant isolation verified across all queries, exports, and routes.
- [x] **Financial Security**: Payment transitions strictly gated to `MANAGE_PAYMENTS`; Decimal arithmetic used throughout.
- [x] **Booking Concurrency**: Database GiST exclusion constraints and row-level locks protect against double bookings.
- [x] **CSV Injection Defense**: Formula injection sanitization implemented on all CSV export fields.
- [x] **Secret Hygiene**: Verified `.env` and credential files are untracked by Git and ignored in `.gitignore`.
- [x] **Endpoint Hardening**: `/api/v1/system/run-migrations` protected in production by `X-Migration-Secret`.

---

## Part 2: Manual Pre-Deployment Operational Tasks (For Deployment Operator)

The deployment operator must complete the following configuration steps in the production cloud environment:

### 1. Environment Variable Configuration
- [ ] Set `APP_ENV=production` in production backend environment (disables `/docs`, `/redoc`, and debug logs).
- [ ] Generate a cryptographically secure `JWT_SECRET_KEY` (minimum 32 random characters / 256 bits).
- [ ] Set production PostgreSQL connection string in `DATABASE_URL` with SSL mode enabled (`sslmode=require`).
- [ ] Configure `CORS_ORIGINS` with the exact production domain(s) (e.g. `["https://app.aught2pickleball.com"]`).
- [ ] Configure mobile client's `EXPO_PUBLIC_API_URL` pointing to the production backend API gateway.

### 2. Database Provisioning & Migration Execution
- [ ] Provision production PostgreSQL instance (v14+ recommended with `btree_gist` extension enabled).
- [ ] Enable `btree_gist` extension in database: `CREATE EXTENSION IF NOT EXISTS btree_gist;`.
- [ ] Execute Alembic migrations to head: `alembic upgrade head`.
- [ ] Verify database connection pool settings (`pool_size=10`, `max_overflow=20` recommended for standard cloud dynos).

### 3. Storage & Static Assets
- [ ] Ensure persistent volumes or cloud object storage is attached for `uploads/avatars` and `uploads/logos`.
- [ ] Set appropriate POSIX permissions (`chmod 750`) on upload directories.

### 4. Reverse Proxy & Networking
- [ ] Configure HTTPS/TLS termination at load balancer or reverse proxy (Nginx / Cloudflare / AWS ALB).
- [ ] Set HTTP security headers (`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`).
- [ ] Enable rate limiting on `/api/v1/auth/login` and `/api/v1/auth/register` (e.g. 10 requests/minute per IP).

### 5. Health Monitoring & Observability
- [ ] Configure uptime monitoring pinging the `/health` endpoint every 30–60 seconds.
- [ ] Set up error tracking (e.g. Sentry / CloudWatch) to capture unhandled 500 exceptions.
- [ ] Configure log aggregation for backend stdout.

### 6. Disaster Recovery & Rollback Procedures
- [ ] Verify automated daily PostgreSQL snapshots are active.
- [ ] Test restore procedure from backup to a staging database.
- [ ] Document rollback deployment strategy: `git revert` or container rollback + `alembic downgrade <target_rev>`.
