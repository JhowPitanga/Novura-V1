# PRD — C0-T4: Edge Function `orders-sync-ml`

**Cycle:** 0 — Plataforma de Pedidos
**Status:** 🟡 In Progress — code exists, one import path issue + edge cases to verify
**Depends on:** [C0-T3 — `orders-upsert`](./C0-T3-orders-upsert-function.md)
**Blocks:** [C0-T7 — Queue Worker](./C0-T7-orders-queue-worker.md), [C0-T9 — Legacy Cleanup](./C0-T9-legacy-cleanup.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

When a seller connects their Mercado Livre account, or when we need to catch up on recent
orders, this function fetches all orders from the last 90 days from the ML API and saves
them to our database. It is the "batch sync" — as opposed to the webhook which handles
individual orders in real-time.

Think of it as pressing a "sync now" button that goes to ML, downloads everything from the
last 90 days, and saves it all correctly — even if you press it twice, no duplicates appear.

The function already works. The remaining tasks are: fixing one internal file reference,
verifying it handles edge cases gracefully (sellers with thousands of orders, API errors),
and confirming it's covered by tests.

---

## 2. Current State & Progress

From reading the actual code at `supabase/functions/orders-sync-ml/index.ts`:

**What works:**
- Uses `resolveMLSyncContext` from `_shared` to validate input and load ML token
- Uses `fetchOrderIds` from `_shared` to paginate through ML search API
- Uses `MlOrderSyncProcessor` from `_shared` to process each order (fetch → normalize → upsert)
- Returns `{ synced, failed, errors, duration_ms }` — correct output shape
- Error isolation per order — one failure doesn't stop the rest
- Under 80 lines — passes the size limit

**Issue (1 item):**
Line 17 imports `OrdersUpsertAdapter` from the wrong path:
```typescript
import { OrdersUpsertAdapter } from '../orders-upsert/orders-upsert-adapter.ts'  // ❌ wrong
```
After C0-T2 and C0-T3 are complete, this must change to:
```typescript
import { OrdersUpsertAdapter } from '../_shared/adapters/orders-upsert/index.ts'  // ✅ correct
```

**Not yet verified:**
- Whether `fetchOrderIds` handles the 60-second edge function timeout (>200 orders case)
- Whether 403 responses from ML (confidential/cancelled orders) are silently skipped
- Whether there is a delay between pages (ML rate limits)
- Test coverage

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

### 🚨 STOP FIRST — Check If This Is Already Done

```bash
# Check if the import path issue still exists
grep "orders-upsert/orders-upsert-adapter" supabase/functions/orders-sync-ml/index.ts
```

- If the grep returns a match → Section A still needs to be done.
- If the grep returns nothing → import path is already fixed. Check `deno check` passes and move on to Sections B and C.

```bash
# Confirm _shared adapter exists (prerequisite from C0-T2)
ls supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.ts
```

If C0-T2 is not done, the correct import path doesn't exist yet. **Do C0-T2 and C0-T3 first.**

---

- [ ] Confirm C0-T2 and C0-T3 are complete first.
- [ ] Read `orders-sync-ml/index.ts` in full.
- [ ] Read `_shared/adapters/ml/ml-fetch-orders.ts` — understand how `fetchOrderIds` works.
      Look for: pagination loop, delay between pages, handling of ML 403 responses.
- [ ] Read `_shared/adapters/sync-context/ml-order-sync-processor.ts` — understand `processOneOrder`.
      Look for: 403 skip logic, error wrapping, raw archive.
- [ ] Read `_shared/adapters/sync-context/ml-sync-context.ts` — understand what `resolveMLSyncContext` does.
      Look for: date range defaults, token refresh logic.
- [ ] Confirm the import path issue described in Section 2 still exists.
      If C0-T2/C0-T3 already fixed it, mark Section A as done.
- [ ] Update Section 2 with what you find.

---

## 4. Architecture Context

```
orders-sync-ml/index.ts
  │
  ├── resolveMLSyncContext()      ← _shared: validates input, loads token, builds date range
  ├── fetchOrderIds()             ← _shared: paginates ML /orders/search, returns array of IDs
  └── MlOrderSyncProcessor
        ├── processOneOrder(id)
        │     ├── MlOrderApiAdapter.fetchFullOrder()   ← GET /orders/:id
        │     ├── MlOrderNormalizeService.normalize()  ← raw → NormalizedOrder
        │     ├── OrdersUpsertAdapter.upsert()         ← write to DB (the fix is here)
        │     └── SupabaseMarketplaceOrdersRawAdapter  ← raw archive
        └── (per-order error isolation)
```

### ML Orders Search API (reference)

```
GET https://api.mercadolibre.com/orders/search
  ?seller={seller_id}
  &order.date_last_updated.from={ISO8601}
  &order.date_last_updated.to={ISO8601}
  &sort=date_desc
  &offset=0
  &limit=50
```

Response: `{ results: [...], paging: { total, offset, limit } }`
Loop until `offset >= paging.total` or `results` is empty.
Each result is an **order summary** — a separate `GET /orders/:id` call is needed for full details.

**Rate limit:** ML does not publish exact limits, but add a 100ms delay between pagination pages
to avoid hitting them. Do not add delays between individual order fetches (the processor handles these).

**403 responses:** Some cancelled or disputed orders return 403. These must be silently skipped
(logged only), not treated as fatal errors.

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER delete from `marketplace_orders_raw`** | This is the permanent audit log of all API responses. |
| **NEVER hardcode seller IDs or org IDs** | These come from the input body, validated by `resolveMLSyncContext`. |
| **NEVER call Focus NFe API from this function** | Sync is separate from invoice emission. |
| **NEVER use INSERT on `orders`** | Always UPSERT via `OrdersUpsertAdapter`. |

---

## 6. What to Build

### Section A: Fix the Import Path

**File:** `supabase/functions/orders-sync-ml/index.ts`

Change line 17 from:
```typescript
import { OrdersUpsertAdapter } from '../orders-upsert/orders-upsert-adapter.ts'
```
To:
```typescript
import { OrdersUpsertAdapter } from '../_shared/adapters/orders-upsert/index.ts'
```

Run `deno check supabase/functions/orders-sync-ml/index.ts` to confirm zero errors.

#### Definition of Done — Section A
- [ ] Import path updated
- [ ] `deno check` passes with zero type errors

---

### Section B: Verify Edge Cases in `ml-fetch-orders.ts`

Open `_shared/adapters/ml/ml-fetch-orders.ts` and verify these cases are handled.
**Do not rewrite working code** — only add what is missing.

**Edge case 1 — Sellers with many orders (timeout risk):**
The Deno edge function timeout is 60 seconds. A seller with 1,000 orders takes
~20 API calls × 50 orders × 1 fetch per order = potentially more than 60 seconds.

Required behavior: the function must return partial results with `{ synced, failed }` when
it reaches 200 orders processed. The caller (or a cron job) can call again to continue.

If this limit already exists in `fetchOrderIds` or the processor, confirm and document it.
If it doesn't exist, add it: stop after processing 200 orders and return early with `success: true`.

**Edge case 2 — ML 403 on individual order fetch:**
`MlOrderSyncProcessor.processOneOrder()` must skip 403 responses silently (no retry, not
counted as `failed`). Log with `console.warn` and continue to the next order.

**Edge case 3 — ML API down (5xx):**
If `/orders/search` returns 5xx, abort the sync and return `{ success: false, error }`.
If individual order GET returns 5xx, count as `failed` and add to `errors` array. Do not abort.

#### Definition of Done — Section B
- [ ] Confirmed or added: 200-order limit per invocation
- [ ] Confirmed or added: 403 on individual order fetch = skip (warn, not fail)
- [ ] Confirmed or added: 100ms delay between pagination pages
- [ ] Confirmed or added: 5xx on search endpoint = abort
- [ ] All logic is in `_shared` — not in the edge function `index.ts`

---

### Section C: Test Coverage

**File to create or update:** `orders-sync-ml/index.test.ts`

| Test | What to verify |
|---|---|
| Happy path — 3 orders | `synced: 3, failed: 0, errors: []` |
| One order returns 403 | `synced: 2, failed: 0` (403 is skipped, not failed) |
| One order returns 500 | `synced: 2, failed: 1, errors: [{ order_id, error }]` |
| Empty result from ML | `synced: 0, failed: 0, errors: []` |
| Invalid input (missing org_id) | HTTP 400 |
| Token expired (401 on first fetch) | Token refreshed, order fetched successfully |

#### Definition of Done — Section C
- [ ] Test file exists and all 6 cases pass
- [ ] Uses mocked ML API responses — no real HTTP calls in tests

---

### Section D: Deploy & Smoke Test

```bash
supabase functions deploy orders-sync-ml

# Trigger a sync for a known organization
curl -X POST https://<project>.supabase.co/functions/v1/orders-sync-ml \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{ "organization_id": "<org-id>", "integration_id": "<integration-id>" }'
```

Expected: `{ success: true, synced: N, failed: 0, errors: [], duration_ms: N }`

- [ ] Run sync twice — row count in `orders` table stays the same after second run (idempotency)
- [ ] `SELECT COUNT(*) FROM orders WHERE marketplace = 'mercado_livre' AND organization_id = '<org-id>'` returns expected number

---

## 7. Definition of Done — Full Task

- [ ] All Section A, B, C, D DoD items are checked
- [ ] No reference to `../orders-upsert/orders-upsert-adapter.ts` remains
- [ ] Function is under 80 lines
- [ ] Zero `any` types
- [ ] Deployed and smoke-tested

---

## 8. What NOT to Build

- **Do NOT add Shopee logic here.** Shopee has its own function (C0-T5).
- **Do NOT trigger NFe emission from sync.** NFe is a separate seller action.
- **Do NOT add a cron schedule here.** The periodic sync schedule is configured separately.
- **Do NOT fetch order labels during sync.** Labels are fetched lazily when the seller prints.
