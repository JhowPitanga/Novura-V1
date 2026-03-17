# PRD — C2-T2: Mercado Pago Balance Sync + Cash Timeline

**Cycle:** 2 — Seu Caixa
**Status:** 🔴 Not Started
**Depends on:** [C2-T1 — MP OAuth](./C2-T1-mercado-pago-oauth.md) (`mercado_pago_integrations` row must exist)
**Blocks:** [C2-T3 — SeuCaixa page](./C2-T3-seu-caixa.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

Once a seller connects their Mercado Pago account, Novura can check their balance every day
and show them a simple cash timeline: how much money is available right now, how much will
be released in the next 7 days, 14 days, and 30 days, and how much is being held (for disputes
or chargebacks).

This task builds the sync engine (an edge function that fetches this data from MP's API) and
the visual component that displays it. The display looks like a horizontal bar chart showing
proportions of total cash across the timeline.

The sync runs automatically every morning at 8am and also when the seller clicks "Atualizar"
on the SeuCaixa screen.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] C2-T1 is complete — `mercado_pago_integrations` table exists and has rows.
- [ ] `supabase/functions/mercado-pago-sync-balance/` — does this directory exist?
- [ ] Check if `mercado_pago_balance_snapshots` migration exists.
- [ ] Read `supabase/functions/_shared/adapters/infra/token-utils.ts` — how to decrypt tokens.
- [ ] Check if `mercado-pago-refresh` is deployed (needed to refresh expired tokens before sync).

**Update this section with findings before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_2_SEU_CAIXA.md` section "Feature F2.1" — specifically the sync edge function,
      table schema, and cron setup.
- [ ] Read `supabase/functions/_shared/adapters/infra/token-utils.ts` — `decryptToken` function.
- [ ] Read `supabase/functions/mercado-pago-refresh/index.ts` (from C2-T1) — how does token refresh work?
- [ ] Read any existing cron migration in `supabase/migrations/` to understand the pg_cron pattern.

---

## 4. Architecture Context

### MP API Calls

```
GET /v1/account/balance
  → { available_balance, total_amount, blocked_balance, reserved_balance }

GET /v1/account/releases
  → { results: [{ date, amount, type, status }] }
  → Aggregate by date to compute releasing_7_days, releasing_14_days, releasing_30_days
```

### Database Schema

```sql
-- supabase/migrations/YYYYMMDD_000000_create_mp_balance_snapshots.sql
CREATE TABLE IF NOT EXISTS mercado_pago_balance_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  available_amount    numeric(18,2) NOT NULL DEFAULT 0,
  held_amount         numeric(18,2) NOT NULL DEFAULT 0,
  releasing_7_days    numeric(18,2) NOT NULL DEFAULT 0,
  releasing_14_days   numeric(18,2) NOT NULL DEFAULT 0,
  releasing_30_days   numeric(18,2) NOT NULL DEFAULT 0,
  raw_releases        jsonb,
  snapshot_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mp_balance_snapshots_org_at
  ON mercado_pago_balance_snapshots (organization_id, snapshot_at DESC);
```

Keep only the last 30 snapshots per org — add a trigger or handle in the sync function.

### Edge Function Flow

```
mercado-pago-sync-balance/index.ts:
1. Get mercado_pago_integrations row for the org
2. Check if access_token is expired → if yes, call mercado-pago-refresh first
3. Decrypt access_token
4. GET /v1/account/balance
5. GET /v1/account/releases
6. Aggregate releases into 7/14/30 day buckets
7. INSERT into mercado_pago_balance_snapshots
8. DELETE snapshots older than 30 per org (cleanup)
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **Refresh token before API call if expired** | Stale token causes 401 → sync fails silently. Always check `token_expires_at` first. |
| **Store raw_releases as JSONB** | Future debugging. Never truncate the raw response. |
| **Never fail silently** | If MP API returns an error, log it with context. Return a structured error response. |
| **held_amount aggregates all holds** | MP held amount includes chargebacks, disputes, verifications. Do NOT break these down — show as "retido" only. |

---

## 6. What to Build

### Section A: Database Migration

**File:** `supabase/migrations/[DATE]_000000_create_mp_balance_snapshots.sql`

Use schema from Section 4. Present for human review before applying.

#### Definition of Done — Section A
- [ ] Migration file exists
- [ ] Index on `(organization_id, snapshot_at DESC)` exists

---

### Section B: `mercado-pago-sync-balance` Edge Function

**File:** `supabase/functions/mercado-pago-sync-balance/index.ts`

Structure (under 80 lines):

```typescript
// Handler:
// 1. Auth: require service_role or internal call
// 2. Extract organization_id from request body
// 3. Fetch integration row (decrypt token, check expiry)
// 4. If expired: call refresh, get new token
// 5. Fetch balance + releases from MP API
// 6. Compute releasing_7/14/30_days from releases array
// 7. INSERT snapshot row
// 8. Cleanup old snapshots (keep last 30)

// Helper: aggregateReleases(releases, days) → number
// Helper: checkAndRefreshToken(integrationRow) → string (decrypted token)
```

Also create `_shared/adapters/mercado-pago/mp-balance-adapter.ts`:
```typescript
export class MPBalanceAdapter {
  async fetchBalance(token: string): Promise<MPBalanceRaw>
  async fetchReleases(token: string): Promise<MPReleasesRaw>
  normalizeBalance(raw: MPBalanceRaw, releases: MPReleasesRaw): MPBalanceSnapshot
}
```

#### Definition of Done — Section B
- [ ] Edge function exists and compiles
- [ ] Inserts a row into `mercado_pago_balance_snapshots`
- [ ] Handles token expiry (refreshes before calling MP API)
- [ ] Cleans up old snapshots (keeps last 30)
- [ ] Under 80 lines handler

---

### Section C: Daily Cron Job

**File:** `supabase/migrations/[DATE]_000001_create_mp_balance_sync_cron.sql`

```sql
-- Run daily balance sync for all orgs with MP integration
SELECT cron.schedule(
  'sync-mp-balance-daily',
  '0 11 * * *',  -- 8am BRT (UTC-3) = 11am UTC
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/mercado-pago-sync-balance',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{"sync_all_orgs": true}'
    )
  $$
);
```

**Note:** The edge function must handle `sync_all_orgs: true` by iterating all
`mercado_pago_integrations` rows and syncing each.

Present this migration to a human for review before applying.

#### Definition of Done — Section C
- [ ] Cron migration file exists
- [ ] Edge function handles `sync_all_orgs: true` flag

---

### Section D: `CashTimeline` Component

**File:** `src/components/seu-caixa/CashTimeline.tsx`

```typescript
interface CashTimelineProps {
  snapshot: MPBalanceSnapshot
  onRefresh?: () => void
  isRefreshing?: boolean
}
```

UI (see spec in CYCLE_2 doc):
```
Seu Caixa no Mercado Pago
Disponível agora    R$X.XXX,XX
────────────────────────────
A liberar:
  Em 7 dias         R$X.XXX,XX  ████░░
  Em 14 dias        R$X.XXX,XX  ██░░░░
  Em 30 dias        R$X.XXX,XX  █░░░░░
────────────────────────────
Retido (disputas)   R$X.XXX,XX
Atualizado há X minutos [↻ Atualizar]
```

The proportional bars represent each bucket as a fraction of `releasing_30_days` (max bar = 30d).
"Atualizado há X minutos" uses `snapshot_at` to compute elapsed time.

Uses `formatBRL` from `@/utils/formatting`.

Constraints: under 80 lines.

#### Definition of Done — Section D
- [ ] Component renders correctly with mock data
- [ ] "Atualizar" button calls `onRefresh` prop
- [ ] All amounts formatted with `formatBRL`
- [ ] Under 80 lines

---

### Section E: `useMPBalance` Hook

**File:** `src/hooks/useMPBalance.ts`

```typescript
export function useMPBalance() {
  const { organizationId } = useAuth()
  const queryClient = useQueryClient()

  const snapshot = useQuery({
    queryKey: ['mp-balance', organizationId],
    queryFn: () => fetchLatestMPBalance(organizationId!),
    enabled: !!organizationId,
    staleTime: 30 * 60 * 1000,  // 30 minutes
  })

  const syncBalance = useMutation({
    mutationFn: () => triggerMPBalanceSync(organizationId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mp-balance'] }),
  })

  return { snapshot, syncBalance, isConnected: !!snapshot.data }
}
```

Service functions to add to `src/services/mercado-pago.service.ts`:
```typescript
export async function fetchLatestMPBalance(orgId: string): Promise<MPBalanceSnapshot | null>
export async function triggerMPBalanceSync(orgId: string): Promise<void>
```

#### Definition of Done — Section E
- [ ] Hook returns `{ snapshot, syncBalance, isConnected }`
- [ ] `staleTime: 30 * 60 * 1000` (30 minutes)
- [ ] `isConnected` is `false` when no snapshot exists (MP not connected)

---

## 7. Integration Checklist

- [ ] Sync function fetches real data from MP API (not hardcoded)
- [ ] Token refresh happens before API call if expired
- [ ] Cron runs at correct time (8am BRT)
- [ ] `CashTimeline` shows correct proportional bars
- [ ] "Atualizar" button triggers on-demand sync

---

## 8. Definition of Done — Full Task

- [ ] All Section A–E DoD items checked
- [ ] `npm run build` passes
- [ ] Manual QA:
  - [ ] After MP OAuth, balance snapshot appears in DB within 30 seconds
  - [ ] CashTimeline renders with correct amounts
  - [ ] "Atualizar" button triggers a new sync and refreshes the display
  - [ ] If MP not connected: `isConnected = false` (CashTimeline not rendered)

---

## 9. What NOT to Build

- **Do NOT break down "held" into sub-categories** (disputes, chargebacks, verifications).
  Show as "retido" only. Breakdown is a future enhancement.
- **Do NOT build payment reconciliation** — matching MP payments to orders is Cycle 3+.
- **Do NOT build historical chart** — single snapshot display only. No time series chart.
