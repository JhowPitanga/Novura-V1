# PRD — C0-T7: Edge Function `orders-queue-worker`

**Cycle:** 0 — Plataforma de Pedidos
**Status:** 🟡 In Progress — code exists, one import path + pg_cron schedule missing
**Depends on:** [C0-T4 — orders-sync-ml](./C0-T4-orders-sync-ml.md), [C0-T5 — orders-sync-shopee](./C0-T5-orders-sync-shopee.md), [C0-T6 — orders-webhook](./C0-T6-orders-webhook.md)
**Blocks:** [C0-T9 — Legacy Cleanup](./C0-T9-legacy-cleanup.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

When Mercado Livre or Shopee sends a real-time notification that an order was placed
or updated, the webhook function (C0-T6) doesn't process it immediately — it just adds
it to a queue. This function is the worker that empties that queue.

Think of the queue like a "to-do" inbox, and this worker as someone who checks the inbox
every 30 seconds, picks up to 10 items, processes each one (fetches the full order from
the marketplace, saves it to the database), and marks them done.

If processing fails (e.g., the marketplace API is temporarily down), the item stays in
the inbox and will be retried automatically the next time the worker runs. It never
silently disappears.

The code is mostly complete. The remaining work is fixing one import path and setting
up the automatic schedule (the "alarm" that wakes the worker every 30 seconds).

---

## 2. Current State & Progress

From reading `supabase/functions/orders-queue-worker/index.ts`:

**What is implemented:**
- Reads up to 10 messages from `pgmq` queue
- Routes each message to `processML()` or `processShopee()` based on message type
- `processML()`: resolves integration, gets ML token (with auto-refresh on 401/403), fetches full order, normalizes, upserts, archives message
- `processShopee()`: resolves integration, gets Shopee token, fetches single order detail, normalizes, upserts, archives message
- Unknown message shapes are archived (prevent infinite retry loops)
- Failed messages are NOT archived — left in queue for automatic retry after visibility timeout
- Returns `{ ok: true, processed, failed, errors }`
- Excellent error logging with context

**Import path issue (same as T3, T4):**
```typescript
import { OrdersUpsertAdapter } from '../orders-upsert/orders-upsert-adapter.ts'  // ❌ wrong
```
Must become:
```typescript
import { OrdersUpsertAdapter } from '../_shared/adapters/orders-upsert/index.ts'  // ✅
```

**Missing:**
- `pg_cron` or Supabase scheduled invocation setup — the worker exists but nothing calls it automatically
- `_shared/adapters/shopee/shopee-fetch-orders.ts` must provide `fetchOneOrderDetail()` (needed by this worker)

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Confirm C0-T2, C0-T3, C0-T5, C0-T6 are done.
- [ ] Read `orders-queue-worker/index.ts` in full. Confirm the import path issue on line 29.
- [ ] Read `_shared/adapters/shopee/shopee-fetch-orders.ts` — confirm `fetchOneOrderDetail()` exists.
      If it does NOT exist, this is a blocker — C0-T5 must be completed first.
- [ ] Read `_shared/domain/orders/order-queue-message.types.ts` — confirm `isMlOrderQueueMessage`
      and `isShopeeOrderQueueMessage` type guards are exported.
- [ ] Check `supabase/migrations/` for any migration file that creates a pg_cron job for this function.
      The file `20260301_000008_create_orders_sync_queue.sql` may contain this — read it.
- [ ] Update Section 2 with what you find.

---

## 4. Architecture Context

```
pg_cron (every 30s)
  │  POST /functions/v1/orders-queue-worker
  ▼
orders-queue-worker/index.ts
  │
  ├── SupabaseOrdersQueueAdapter.readBatch(10, 120s VT)
  │       ↓ returns up to 10 QueueEnvelope items
  │
  ├── for each envelope:
  │   ├── isMlOrderQueueMessage?
  │   │     ├── SupabaseMarketplaceIntegrationsAdapter.getIntegrationByMeliUserId()
  │   │     ├── getMlAccessToken() → forceRefreshMlToken() on 401/403
  │   │     ├── MlOrderApiAdapter.fetchFullOrder()
  │   │     ├── MlOrderNormalizeService.normalize()
  │   │     ├── OrdersUpsertAdapter.upsert()
  │   │     └── queue.archive(msg_id)  ← only on success
  │   │
  │   └── isShopeeOrderQueueMessage?
  │         ├── SupabaseMarketplaceIntegrationsAdapter.getIntegrationByShopId()
  │         ├── getShopeeAccessToken()
  │         ├── ShopeeFetchOrdersAdapter.fetchOneOrderDetail()
  │         ├── ShopeeOrderNormalizeService.normalize()
  │         ├── OrdersUpsertAdapter.upsert()
  │         └── queue.archive(msg_id)  ← only on success
  │
  └── returns { ok: true, processed, failed, errors }
```

### pgmq Behavior

- `readBatch(batchSize, visibilityTimeoutSec)` — pulls messages and makes them invisible to other workers for `visibilityTimeoutSec` seconds.
- If the worker crashes or doesn't call `archive()`, the message becomes visible again after the timeout and is retried automatically.
- `archive(msgId)` — moves the message from the active queue to `pgmq.a_orders_sync` (an audit table). It is NOT deleted. This is intentional — it provides a complete history of processed messages.
- Never call `delete()` on queue messages — always use `archive()`.

### Visibility Timeout

The current setting is 120 seconds (`VISIBILITY_TIMEOUT_SEC = 120`). This means:
- If processing takes > 120s, the message becomes visible again and another worker run could pick it up → duplicate processing.
- The `OrdersUpsertAdapter` is idempotent (UPSERT), so a duplicate run produces the same result.
- 120s is appropriate because edge functions have a 60s timeout limit — 120s gives enough slack.

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER call `queue.delete()` on a message** | Use `queue.archive()` only. Deletion removes the audit trail. |
| **NEVER archive a message on processing failure** | A non-archived message will be retried. This is the retry mechanism. |
| **NEVER process more than 10 messages per invocation** | Edge function timeout is 60s. At ~5s per order, 10 is the safe limit. |
| **NEVER run this worker without `TOKENS_ENCRYPTION_KEY`** | The function checks for this env var and returns 500 if absent. Do not remove this check. |

---

## 6. What to Build

### Section A: Fix the Import Path

**File:** `supabase/functions/orders-queue-worker/index.ts`

Change line 29 from:
```typescript
import { OrdersUpsertAdapter } from '../orders-upsert/orders-upsert-adapter.ts'
```
To:
```typescript
import { OrdersUpsertAdapter } from '../_shared/adapters/orders-upsert/index.ts'
```

Run `deno check supabase/functions/orders-queue-worker/index.ts` — zero errors required.

#### Definition of Done — Section A
- [ ] Import path updated
- [ ] `deno check` passes

---

### Section B: Set Up pg_cron Schedule

The worker must be invoked automatically every 30 seconds. In Supabase, this is done
with `pg_cron`.

**Check first:** Open `supabase/migrations/20260301_000008_create_orders_sync_queue.sql`
and see if a cron job already exists. If it does, confirm the URL and interval are correct.

**If the cron job does NOT exist**, create a new migration file:

**File:** `supabase/migrations/20260316_000000_create_orders_queue_worker_cron.sql`

```sql
-- Invoke orders-queue-worker every 30 seconds via pg_cron
-- The Supabase URL and service role key are available as vault secrets.
-- net.http_post is provided by the pg_net extension.

SELECT cron.schedule(
  'orders-queue-worker',                         -- job name (unique)
  '*/30 * * * * *',                              -- every 30 seconds (pg_cron 0.5 supports seconds)
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/orders-queue-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);
```

> ⚠️ **Important:** `pg_cron` with second-level scheduling requires the extension to be
> enabled. Standard pg_cron supports minute-level only (`* * * * *`). If second-level
> scheduling is not available, use `* * * * *` (every minute) as a fallback.

> ⚠️ **Important:** `current_setting('app.supabase_url')` and `current_setting('app.service_role_key')`
> must be set in the Supabase project settings under "Database > Configuration > Custom Settings".
> Confirm these are set before applying this migration.
> Alternative: hardcode the function URL if the settings approach is not available.

#### Definition of Done — Section B
- [ ] `pg_cron` job exists for this worker (either confirmed existing or new migration created)
- [ ] Schedule is every 30 seconds (or every minute as fallback)
- [ ] Job invokes the correct function URL with the service role key

---

### Section C: Test Coverage

**File:** `orders-queue-worker/index.test.ts`

| Test | What to verify |
|---|---|
| Empty queue | Returns `{ ok: true, processed: 0, failed: 0 }` |
| One valid ML message | Fetches order, upserts, archives. Returns `{ processed: 1, failed: 0 }` |
| One valid Shopee message | Same for Shopee |
| ML token expired (401) | Token refreshed, order fetched, message archived. `processed: 1` |
| ML API returns 403 | Message NOT archived (retried), `failed: 1` with error |
| Unknown message shape | Message archived (prevent loop), not counted as processed |
| Upsert fails | Message NOT archived, `failed: 1` |

#### Definition of Done — Section C
- [ ] Test file exists with all 7 cases
- [ ] All tests pass
- [ ] All external calls (ML API, Shopee API, DB) are mocked

---

### Section D: Deploy & End-to-End Test

```bash
supabase functions deploy orders-queue-worker

# Manually trigger the worker
curl -X POST https://<project>.supabase.co/functions/v1/orders-queue-worker \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

End-to-end test:
1. POST a valid ML webhook payload to `orders-webhook` (C0-T6)
2. Confirm the message appears in the pgmq queue: `SELECT * FROM pgmq.q_orders_sync LIMIT 5`
3. Trigger the queue worker manually (command above)
4. Confirm the message is archived: `SELECT * FROM pgmq.a_orders_sync LIMIT 5`
5. Confirm the order appears in `orders` table

#### Definition of Done — Section D
- [ ] End-to-end test completed successfully
- [ ] Queue is drained correctly (no messages stuck)
- [ ] pg_cron job visible in `SELECT * FROM cron.job`

---

## 7. Definition of Done — Full Task

- [ ] All Section A, B, C, D DoD items checked
- [ ] No reference to `../orders-upsert/orders-upsert-adapter.ts` remains
- [ ] `processML()` and `processShopee()` are each under 50 lines
- [ ] Zero `any` types
- [ ] Deployed and end-to-end tested
- [ ] pg_cron job is active

---

## 8. What NOT to Build

- **Do NOT add NFe auto-emission from this worker.** NFe is a seller-triggered action.
- **Do NOT process more than 10 messages per run.** The timeout risk is real.
- **Do NOT add stock deduction here.** The existing inventory job queue handles stock.
  The new order pipeline and the old inventory pipeline run independently during transition.
- **Do NOT delete processed messages.** Always archive.
