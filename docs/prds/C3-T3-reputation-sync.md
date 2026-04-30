# PRD — C3-T3: Reputation Risk Alerts Sync

**Cycle:** 3 — Visibilidade e Conformidade
**Status:** 🔴 Not Started
**Depends on:** ML OAuth connected (marketplace_integrations row exists)
**Blocks:** [C3-T4 — Reputation Alerts Frontend](./C3-T4-reputation-ui.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

ML sellers can lose their "Verde" (green) reputation status if they have too many late
shipments, unanswered complaints, or cancellations. By the time ML changes the color,
it's often too late to fix.

This task makes Novura proactive: it fetches reputation metrics twice per day and calculates
whether the seller is on track to stay green or is approaching a threshold that would trigger
a warning. It also tracks open complaints that have a response deadline — because missing a
complaint response window directly hurts the thermometer.

The data is stored in a snapshot table so trends can be tracked, and so the frontend can
display the latest status instantly without waiting for the ML API.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] `supabase/functions/ml-sync-reputation/` — does this directory exist?
- [ ] Check if `seller_reputation_snapshots` migration exists.
- [ ] Read `supabase/functions/mercado-livre-update-metrics/index.ts` — does it already fetch reputation data? If yes, extend rather than duplicate.
- [ ] Read `supabase/functions/_shared/adapters/infra/token-utils.ts` — how to decrypt ML token.

**Update this section before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_3_VISIBILIDADE.md` section "Feature F3.2: Reputation Risk Alerts" in full.
      Record: ML API endpoints, table schema, risk level computation, alert copy examples.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1–3.
- [ ] Verify ML API endpoints are accessible with the seller's OAuth token scope.

---

## 4. Architecture Context

### Database Table

```sql
CREATE TABLE IF NOT EXISTS seller_reputation_snapshots (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thermometer_status          text,           -- ML's: 'green' | 'light_green' | 'yellow' | 'orange' | 'red'
  sales_completed_90d         integer DEFAULT 0,
  claims_rate_90d             numeric(5, 4),  -- e.g. 0.0210 = 2.10%
  delayed_shipment_rate_90d   numeric(5, 4),
  cancellation_rate_90d       numeric(5, 4),
  open_complaints_count       integer DEFAULT 0,
  complaints_response_deadline jsonb,         -- [{ complaint_id, deadline_at }]
  risk_level                  text NOT NULL DEFAULT 'ok'
    CHECK (risk_level IN ('ok', 'warning', 'critical')),
  snapshot_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rep_snapshots_org_at ON seller_reputation_snapshots (organization_id, snapshot_at DESC);
```

### ML API Calls

```
GET /users/{user_id}/seller_reputation
  → thermometer_status, metrics (claims_rate, delayed_shipment_rate, cancellations_rate)

GET /users/{user_id}/complaints?status=open
  → list of open complaints with deadline timestamps

GET /users/{user_id}/
  → sales_completed in last 90 days (from user stats)
```

### Risk Level Computation

```typescript
function computeRiskLevel(
  claimsRate: number,
  delayedRate: number,
  cancellationRate: number,
  openComplaints: number,
  complaintsWithDeadline: Array<{ deadline_at: string }>
): 'ok' | 'warning' | 'critical' {
  // ML thresholds for yellow thermometer:
  const WARNING_CONDITIONS = [
    claimsRate > 0.02,              // > 2%
    delayedRate > 0.05,             // > 5%
    cancellationRate > 0.02,        // > 2%
  ]
  const warningCount = WARNING_CONDITIONS.filter(Boolean).length

  // Critical conditions:
  const hasComplaintDeadlineIn24h = complaintsWithDeadline.some(c =>
    new Date(c.deadline_at).getTime() - Date.now() < 24 * 60 * 60 * 1000
  )

  if (hasComplaintDeadlineIn24h || warningCount >= 2) return 'critical'
  if (warningCount >= 1) return 'warning'
  return 'ok'
}
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **Show exact deadline — not relative time** | "amanhã às 18h" is NOT enough. Show "domingo, 22/03 às 18h00". Sellers need exact dates. |
| **Sync twice per day** | Reputation changes quickly. Once per day is too slow for complaint deadlines. |
| **Never show zero-value rates if API returns null** | If ML doesn't return a rate, show "—" not "0%". |

---

## 6. What to Build

### Section A: Database Migration

**File:** `supabase/migrations/[DATE]_000000_create_seller_reputation_snapshots.sql`

Present for human review before applying.

---

### Section B: `ml-sync-reputation` Edge Function

**File:** `supabase/functions/ml-sync-reputation/index.ts`

```
1. Fetch org's ML access token (decrypt)
2. GET /users/{user_id}/seller_reputation
3. GET /users/{user_id}/complaints?status=open (extract deadlines)
4. Compute risk_level from rates + open complaints
5. INSERT into seller_reputation_snapshots
6. Keep last 30 snapshots per org
```

Helpers: `fetchReputation(token, userId)`, `fetchOpenComplaints(token, userId)`, `computeRiskLevel(...)`.
Each helper under 30 lines. Handler under 80 lines.

Add cron:
```sql
SELECT cron.schedule('sync-reputation-twice-daily', '0 9,17 * * *', ...);
-- 9am and 5pm UTC (6am and 2pm BRT)
```

#### Definition of Done — Section B
- [ ] Function inserts a snapshot row after running
- [ ] `risk_level` computed correctly from thresholds
- [ ] `complaints_response_deadline` stored as JSONB array with exact timestamps
- [ ] Cron runs twice daily

---

## 7. Definition of Done — Full Task

- [ ] Section A–B DoD items checked
- [ ] Manual QA:
  - [ ] After running function, `seller_reputation_snapshots` has a row
  - [ ] `risk_level = 'warning'` when one metric exceeds threshold
  - [ ] `risk_level = 'critical'` when complaint deadline < 24h away

---

## 9. What NOT to Build

- **Do NOT build the frontend UI here** — that is C3-T4.
- **Do NOT fetch Shopee reputation** — ML only. Shopee reputation is Cycle 4+.
