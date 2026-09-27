# Payments & Membership Payment Records (Phase 13)

This document describes the internal payment foundation for Aught2 Pickleball established in Phase 13.

---

## 1. Payment Model Overview

The `payments` table stores discrete financial transaction records. Each record documents an internal transaction with ownership, status, amount, method, and relationship to club entities.

### Core Schema

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `VARCHAR(36)` | No | Primary key (UUIDv4) |
| `reference` | `VARCHAR(32)` | No | Deterministic unique human-readable code (`A2P-YYYY-NNNNNN`), indexed |
| `club_id` | `VARCHAR(36)` | No | Foreign key -> `clubs.id` (ON DELETE CASCADE), indexed |
| `user_id` | `VARCHAR(36)` | No | Foreign key -> `users.id` (ON DELETE CASCADE, paying player), indexed |
| `subscription_id` | `VARCHAR(36)` | Yes | Foreign key -> `member_subscriptions.id` (ON DELETE SET NULL), indexed |
| `amount` | `NUMERIC(10, 2)` | No | Transaction amount in currency units (never floating point) |
| `currency` | `VARCHAR(3)` | No | 3-letter currency code (defaults to `INR`) |
| `status` | `VARCHAR(24)` | No | Payment lifecycle state (`pending`, `succeeded`, etc.), indexed |
| `purpose` | `VARCHAR(32)` | No | Payment reason (`membership` in Phase 13) |
| `payment_method` | `VARCHAR(24)` | No | Method of payment (`cash`, `bank_transfer`, `online`, `other`) |
| `notes` | `TEXT` | Yes | Optional transaction notes or remarks |
| `created_at` | `TIMESTAMPTZ` | No | Timestamp of record creation (UTC) |
| `updated_at` | `TIMESTAMPTZ` | No | Timestamp of last status update (UTC) |
| `paid_at` | `TIMESTAMPTZ` | Yes | Timestamp when payment reached `succeeded` status (UTC) |

---

## 2. Payment Purpose

In Phase 13, payment purpose is strictly restricted to membership:

* `membership`: Payment made for a club membership subscription (`subscription_id` required).

> Future phases will expand purpose to `booking`, `lesson`, `tournament_entry`, and `event_registration`.

---

## 3. Payment Status Lifecycle & State Machine

```
              ┌─────────┐
              │ PENDING │
              └────┬────┘
         ┌─────────┴─────────┐
         ▼                   ▼
   ┌───────────┐       ┌──────────┐
   │ SUCCEEDED │       │  FAILED  │
   └─────┬─────┘       └──────────┘
         │
         ├──────────────────┐
         ▼                  ▼
  ┌──────────────┐   ┌─────────────┐
  │  REFUNDED*   │   │  PARTIALLY  │
  │ (Future Ph.) │   │  REFUNDED*  │
  └──────────────┘   │ (Future Ph.)│
                     └─────────────┘
```

* `pending`: Initial state upon creation.
* `succeeded`: Funds successfully collected. Sets `paid_at` timestamp.
* `failed`: Transaction failed or was rejected. Terminal state from `pending`.
* `cancelled`: Payment voided before processing. Terminal state from `pending`.
* `refunded` / `partially_refunded`: Future-ready enum values reserved for subsequent refund phases.

### State Transition Rules
- `pending` -> `succeeded`: Allowed (records `paid_at`).
- `pending` -> `failed`: Allowed.
- `pending` -> `cancelled`: Allowed.
- `succeeded` -> `pending` / `failed`: **Forbidden** (terminal success).
- `failed` -> `succeeded` / `pending`: **Forbidden** (terminal failure).
- `cancelled` -> any: **Forbidden** (terminal cancellation).

---

## 4. Payment Method Options

| Method | Enum Value | Use Case |
|---|---|---|
| Cash | `cash` | In-person cash payment at club reception |
| Bank Transfer | `bank_transfer` | Direct NEFT/RTGS/IMPS transfer to club account |
| Online | `online` | Internal online payment record (ready for future gateways) |
| Other | `other` | Cheque, POS, voucher, or other manual methods |

---

## 5. Deterministic Payment Reference Format

Every payment is assigned a deterministic, unique reference upon creation:

$$\text{Format: } \mathbf{A2P\text{-}YYYY\text{-}NNNNNN}$$

* `A2P`: Aught2 Pickleball prefix
* `YYYY`: 4-digit UTC calendar year
* `NNNNNN`: 6-digit zero-padded sequential integer within the calendar year (e.g. `A2P-2026-000001`)

References are unique across the entire platform and indexed for fast customer lookup.

---

## 6. Decimal Precision Rules

* Currency amounts use `NUMERIC(10, 2)` / Python `Decimal` / string-compatible serialized numeric representation.
* Floating point types (`float`, `DOUBLE PRECISION`) are strictly prohibited in database schemas, models, services, and schemas to avoid roundoff errors.
* Validation ensures amounts are strictly positive ($> 0.00$) with a maximum of 2 decimal places.

---

## 7. Payment-to-Subscription Relationship

* A payment with purpose `membership` must reference a valid `MemberSubscription` belonging to the specified player and club.
* If a subscription is deleted or purged, `subscription_id` is set to `NULL` (`ON DELETE SET NULL`) to maintain historical accounting auditability without breaking foreign keys.
* Multiple payments can link to the same subscription (e.g. initial payment, renewals, or installment payments).

---

## 8. Historical Amount Immutability

* The `amount` on a `Payment` record represents historical financial truth at the moment the transaction was recorded.
* Even if a `MembershipPlan` price is updated later, existing `Payment` amounts remain immutable.
* Updating a plan's price will never mutate historical payment records.

---

## 9. Permission and Authorization Rules

Payments are protected by RBAC and club tenant isolation:

| Role | Club Staff Payments | Player's Own Payments | Cross-Club Payments |
|---|---|---|---|
| `club_owner` | Full Access (`create`, `view`, `succeed`, `fail`, `cancel`) | N/A | Forbidden |
| `club_manager` | Full Access (`create`, `view`, `succeed`, `fail`, `cancel`) | N/A | Forbidden |
| `tournament_director` | Forbidden | N/A | Forbidden |
| Player | Forbidden | Read-only (`my-payments`) | Forbidden |
| Superuser | Platform Audit | Full Access | Full Access |

---

## 10. Club Tenant Isolation

All staff endpoints enforce that the authenticated user possesses `MANAGE_PAYMENTS` on the active club.
- Any attempt to query or record a payment for a player who does not belong to the club or a subscription belonging to a different club yields `400 Bad Request` or `404 Not Found`.
- Cross-tenant payment access yields `403 Forbidden` or `404 Not Found`.

---

## 11. Refund-Ready Architecture

* The `PaymentStatus` enum defines `refunded` and `partially_refunded`.
* In Phase 13, no endpoints transition payments into refund states or process refunds.
* This prepares the database schema and domain types so Phase 14+ refund engines can be layered without database migrations.

---

## 12. API Endpoint Reference

### Staff Payment Endpoints (`/api/v1/clubs/{club_id}/payments`)

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/` | `manage_payments` | List club payments with filters (`status`, `purpose`, `player_id`, `date_from`, `date_to`) |
| `POST` | `/` | `manage_payments` | Record a new payment (auto-generates `reference`, starts in `pending`) |
| `GET` | `/summary` | `manage_payments` | Aggregate metrics (total collected, pending amount, failed amount, transaction counts) |
| `GET` | `/{payment_id}` | `manage_payments` | Get detailed payment record |
| `POST` | `/{payment_id}/process` | `manage_payments` | Move payment to processing (internal lifecycle) |
| `POST` | `/{payment_id}/succeed` | `manage_payments` | Mark payment as succeeded (`paid_at` recorded) |
| `POST` | `/{payment_id}/fail` | `manage_payments` | Mark payment as failed with reason |
| `POST` | `/{payment_id}/cancel` | `manage_payments` | Cancel a pending payment |

### Player Payment Endpoints (`/api/v1/players/me/payments`)

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/` | Authenticated Player | List current player's payments across all clubs |
| `GET` | `/{payment_id}` | Authenticated Player | View player's own payment receipt (read-only) |

---

## 13. Mobile Implementation Overview

### Club Staff Interface (`app/(club)/payments.tsx`)
- Summary cards: Total collected revenue, pending volume, successful transaction count.
- Filterable payment list: Filter by status (`all`, `succeeded`, `pending`, `failed`, `cancelled`).
- Payment detail card: Reference, member name, subscription plan, method, date, status badge.
- Record payment modal: Select player member, subscription, enter amount, choose method (`cash`, `bank_transfer`, `online`, `other`), add notes.
- Direct actions: Mark pending payments as succeeded with confirmation dialog.

### Player Interface (`app/(player)/payments.tsx`)
- Personal payment history with pull-to-refresh and status filters.
- Read-only transaction receipt modal with reference, club name, amount, method, status badge, and payment timestamps.

---

## 14. Phase 13 Scope Boundaries & Exclusions

The following are intentionally excluded from Phase 13:
- External payment gateway SDKs (Stripe, Razorpay, PayPal).
- Refund processing endpoints and automated refund workflows.
- Recurring automated card charging or invoice PDF generation.
- Payments for court bookings, coaching lessons, or tournaments.
