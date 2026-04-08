# PRD — C3-T1: ML Listing Performance Sync

**Cycle:** 3 — Visibilidade e Conformidade
**Status:** 🔴 Not Started
**Depends on:** ML OAuth connected (marketplace_integrations row exists)
**Blocks:** [C3-T2 — Listing Performance UI](./C3-T2-listing-performance-ui.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

For Novura to tell sellers whether their listings are performing well or poorly, it needs to
fetch performance data from Mercado Livre daily — how many times each listing appeared in
search (impressions), how many people clicked on it (visits), how many ended up buying
(conversion), and how that conversion compares to the category average.

This task builds the sync engine: an edge function that fetches this data for all of a
seller's active listings once per day and stores it so the frontend can display it instantly
without waiting for the ML API.

The data has limitations — category averages may not be available for all categories,
and listings with very few visits shouldn't show a "conversion rate" (it would be misleading).
The PRD documents how to handle each of these cases.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] `supabase/functions/ml-sync-listing-performance/` — does this directory exist?
- [ ] Check if `listing_performance_snapshots` migration exists.
- [ ] Read `supabase/functions/mercado-livre-update-metrics/index.ts` — does this already fetch listing performance data? If so, can it be extended rather than creating a new function?
- [ ] Read `supabase/functions/_shared/adapters/infra/token-utils.ts` — how to decrypt ML token.
- [ ] Read `supabase/functions/_shared/adapters/integrations/` — any existing ML API adapter?

**Update this section with findings before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_3_VISIBILIDADE.md` section "Feature F3.1: Listing Performance" in full.
      Record: API endpoints, table schema, performance signal logic, sync cadence.
- [ ] Read `docs/CYCLE_3_VISIBILIDADE.md` section "Strategy Pattern — Listing Performance Signal".
- [ ] Read `supabase/functions/mercado-livre-update-metrics/index.ts` — what does it already fetch?
      If it fetches visits/impressions, extend it rather than duplicate.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1, 2, 3.

---

## 4. Architecture Context

### Database Table

```sql
CREATE TABLE IF NOT EXISTS listing_performance_snapshots (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  marketplace_item_id     text NOT NULL,
  title                   text,
  impressions_7d          integer DEFAULT 0,
  visits_7d               integer DEFAULT 0,
  sales_7d                integer DEFAULT 0,
  conversion_rate_7d      numeric(5, 4),
  category_avg_conversion numeric(5, 4),
  category_id             text,
  health_score            text,               -- ML's quality score: 'good' | 'warning' | 'critical'
  performance_signal      text,               -- our computed: 'green' | 'yellow' | 'red'
  snapshot_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, marketplace_item_id, (snapshot_at::date))
);

CREATE INDEX listing_perf_org_item ON listing_performance_snapshots (organization_id, marketplace_item_id);
CREATE INDEX listing_perf_snapshot_at ON listing_performance_snapshots (snapshot_at DESC);
```

### ML API Calls

```
For each active listing:
  GET /items/{item_id}             → quality_score, category_id, title
  GET /items/{item_id}/visits      → visits over last 7 days
  GET /categories/{id}/insights    → category_avg_conversion (may not be available)

If category insights not available:
  → set category_avg_conversion = null
  → do NOT show "vs categoria" in the UI
  → do NOT show 0% as category average
```

### Performance Signal (Strategy Pattern)

```typescript
// src/utils/listing-performance.ts
// See CYCLE_3 engineering standards section for the full pattern

export function computePerformanceSignal(
  conversionRate: number | null,
  categoryAvg: number | null,
  visits: number
): { signal: 'green' | 'yellow' | 'red'; suggestion: string } {
  // Use SIGNAL_STRATEGIES array from Cycle 3 spec
  // If visits < 20: always 'red' with "poucas visitas" suggestion
  // If categoryAvg is null: compare against a fixed threshold (e.g., 2%)
}
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **Never show conversion rate when visits < 20** | 2/5 visits = 40% "conversion" is statistical noise. Show "Volume baixo" instead. |
| **Never show 0% as category average** | If category insights API fails, hide the comparison entirely. |
| **Sync once per day per org** | Don't hammer the ML API. Check `snapshot_at::date` before syncing. |
| **Rate limit respect** | Add 50ms delay between item API calls. ML limits 200 req/min per user. |

---

## 6. What to Build

### Section A: Database Migration

**File:** `supabase/migrations/[DATE]_000000_create_listing_performance_snapshots.sql`

Present for human review before applying.

#### Definition of Done — Section A
- [ ] Migration file exists
- [ ] UNIQUE constraint on `(organization_id, marketplace_item_id, snapshot_at::date)`

---

### Section B: `listing-performance.ts` Utility

**File:** `src/utils/listing-performance.ts` (shared between edge function and frontend)

Alternatively, create in `_shared/domain/` for use in edge functions.

```typescript
import { SIGNAL_STRATEGIES } from './listing-performance-strategies'

export function computePerformanceSignal(
  conversionRate: number | null,
  categoryAvg: number | null,
  visits: number
): { signal: 'green' | 'yellow' | 'red'; suggestion: string }

export function shouldShowConversionRate(visits: number): boolean {
  return visits >= 20
}
```

Under 50 lines.

#### Definition of Done — Section B
- [ ] `computePerformanceSignal` returns `'red'` with "poucas visitas" when `visits < 20`
- [ ] Strategy Pattern implemented (see CYCLE_3 engineering standards)

---

### Section C: `ml-sync-listing-performance` Edge Function

**File:** `supabase/functions/ml-sync-listing-performance/index.ts`

```
1. Auth: service_role or per-org trigger
2. Fetch organization's ML integration (decrypt access token)
3. For each active listing (from marketplace_integrations or from a listings table):
   a. GET /items/{item_id} — title, category_id, quality_score
   b. GET /items/{item_id}/visits — visits_7d
   c. GET /categories/{category_id}/insights — category_avg_conversion (best effort)
   d. Compute conversion_rate_7d = sales_7d / visits_7d (if visits_7d > 0)
   e. Compute performance_signal via computePerformanceSignal()
   f. UPSERT into listing_performance_snapshots (conflict on org+item+date)
   g. Add 50ms delay between items (rate limit respect)
```

Split into helpers: `fetchListingData`, `fetchCategoryAvg`, `computeSnapshot`.
Each helper under 30 lines. Handler under 80 lines.

Add cron:
```sql
SELECT cron.schedule('sync-listing-performance-daily', '0 6 * * *', ...);
```

#### Definition of Done — Section C
- [ ] Function exists and compiles
- [ ] UPSERT is idempotent (running twice on same day = same result)
- [ ] Category avg failures handled gracefully (set to null, don't crash)
- [ ] 50ms rate limit delay between items
- [ ] Cron migration exists

---

## 7. Integration Checklist

- [ ] `listing_performance_snapshots` has rows after first sync
- [ ] `performance_signal` is set correctly for green/yellow/red cases
- [ ] `conversion_rate_7d` is `null` when `visits_7d < 20`
- [ ] `category_avg_conversion` is `null` when category insights API fails

---

## 8. Definition of Done — Full Task

- [ ] All Section A–C DoD items checked
- [ ] Cron deployed
- [ ] Manual QA:
  - [ ] After running function, `listing_performance_snapshots` has rows
  - [ ] Listings with < 20 visits have `conversion_rate_7d = null`
  - [ ] Running twice on same day = same row count (UPSERT works)

---

## 9. What NOT to Build

- **Do NOT build the frontend UI here** — that is C3-T2.
- **Do NOT fetch ADS impressions here** — ADS is separate (C2-T5).
- **Do NOT store more than 30 days of snapshots per listing** — add cleanup logic.
