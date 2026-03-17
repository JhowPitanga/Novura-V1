# PRD — C0-T3: Edge Function `orders-upsert`

**Cycle:** 0 — Plataforma de Pedidos
**Status:** 🟡 In Progress — code exists, one structural issue remains
**Depends on:** [C0-T2 — `_shared` OrdersUpsertService](./C0-T2-shared-orders-upsert.md)
**Blocks:** [C0-T4](./C0-T4-orders-sync-ml.md), [C0-T5](./C0-T5-orders-sync-shopee.md), [C0-T6](./C0-T6-orders-webhook.md), [C0-T7](./C0-T7-orders-queue-worker.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

This is the HTTP endpoint that saves an order to the database. It is the single door
through which all order data enters the new Novura system. Whether the order came from
Mercado Livre or Shopee, whether it arrived via a real-time push notification or a
manual sync — it always goes through this function.

The function is already built and running. The remaining work is a housekeeping task:
the core saving logic currently lives in a file inside the `orders-upsert` folder,
but it should live in the shared library (`_shared`) so all other functions can use it
directly. This is the same as moving a utility from one drawer to the right toolbox.

**When this task is done:** Every edge function (sync, webhook, queue worker) imports the
saving logic from one canonical place, and running the upsert twice for the same order
produces the same result with no duplicates.

---

## 2. Current State & Progress

From reading the actual code:

**Files that exist:**
- `supabase/functions/orders-upsert/index.ts` — ✅ Clean HTTP handler, 50 lines, uses `_shared` infra
- `supabase/functions/orders-upsert/upsert-order.ts` — ✅ Thin facade that delegates to `OrdersUpsertAdapter`
- `supabase/functions/orders-upsert/orders-upsert-adapter.ts` — ✅ Full implementation (~200 lines)
  - Implements `OrdersUpsertPort`
  - Uses `implements OrdersUpsertPort` correctly
  - 4-step algorithm is implemented (ensureOrderRow, appendStatusHistory, replaceOrderItems, upsertOrderShipping)
  - Proper error handling per step

**Structural issue (see C0-T2):**
`OrdersUpsertAdapter` lives in `orders-upsert/orders-upsert-adapter.ts` instead of
`_shared/adapters/orders-upsert/orders-upsert-adapter.ts`. This means `orders-sync-ml`,
`orders-sync-shopee`, and `orders-queue-worker` all import it via a relative path
from the wrong folder: `../orders-upsert/orders-upsert-adapter.ts`.

**This task's only remaining work after C0-T2 is complete:**
1. Update the import path in `orders-upsert/upsert-order.ts` to point to `_shared`
2. Verify the test file covers the required cases
3. Deploy and smoke-test

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Confirm C0-T2 is complete — `_shared/adapters/orders-upsert/orders-upsert-adapter.ts` must exist before touching this task.
- [ ] Read `orders-upsert/upsert-order.ts` — confirm it imports `OrdersUpsertAdapter` from `../orders-upsert/orders-upsert-adapter.ts` (the old path).
- [ ] Read `orders-upsert/index.ts` — confirm it calls `upsertOrder()` from `./upsert-order.ts`.
- [ ] Read `orders-upsert/upsert-order.test.ts` if it exists — note which test cases are present and which are missing.
- [ ] After verifying C0-T2 is done, update Section 2 above with what you found.

---

## 4. Architecture Context

```
orders-upsert/
├── index.ts                  ← HTTP handler (READ-ONLY — do not modify unless a bug is found)
├── upsert-order.ts           ← Thin facade — UPDATE IMPORT PATH here after C0-T2
└── orders-upsert-adapter.ts  ← MOVE TO _shared (C0-T2). Delete this file after.
```

The `index.ts` handler must stay under 50 lines. It must only:
1. Parse and validate the HTTP request body
2. Call `upsertOrder()` from the facade
3. Return the appropriate HTTP response

No business logic belongs in `index.ts`. All logic lives in `_shared`.

### Contract

```typescript
// Input (HTTP POST body)
interface UpsertOrderInput {
  organization_id: string       // required
  order: NormalizedOrder        // required — full canonical order
  source: 'webhook' | 'sync'   // required — who is calling
}

// Success response (HTTP 200)
interface UpsertOrderSuccess {
  success: true
  order_id: string   // Novura internal UUID
  created: boolean   // true = new order, false = updated existing
}

// Error response (HTTP 422 or 500)
interface UpsertOrderError {
  success: false
  order_id: null
  created: false
  error: string      // human-readable, no stack traces
}
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER delete the `upsert-order.ts` facade** | Other functions call `upsertOrder()` from this facade. It must keep working. Only update the import path inside it. |
| **NEVER add business logic to `index.ts`** | The handler is already at the size limit. Any new logic belongs in `_shared`. |
| **NEVER use INSERT on the `orders` table** | Always UPSERT. INSERT on retry creates duplicate rows. |
| **Deleting `order_items` before reinserting is intentional** | This is not a bug — it handles partial refunds where an item is removed. Do not "fix" this. |

---

## 6. What to Build

### Section A: Fix the Import Path in the Facade

After C0-T2 moves `OrdersUpsertAdapter` to `_shared`, update the import in the facade:

**File:** `supabase/functions/orders-upsert/upsert-order.ts`

Change:
```typescript
import { OrdersUpsertAdapter } from './orders-upsert-adapter.ts'
```
To:
```typescript
import { OrdersUpsertAdapter } from '../_shared/adapters/orders-upsert/index.ts'
```

Then delete `orders-upsert/orders-upsert-adapter.ts` (the original file).

> **Check before deleting:** Confirm no other file imports from `orders-upsert/orders-upsert-adapter.ts`
> by grepping the entire `supabase/functions/` directory. Only delete after all references are updated.

#### Definition of Done — Section A
- [ ] `orders-upsert/upsert-order.ts` imports `OrdersUpsertAdapter` from `_shared`
- [ ] `orders-upsert/orders-upsert-adapter.ts` is deleted (logic is now in `_shared`)
- [ ] `deno check supabase/functions/orders-upsert/index.ts` passes with zero errors

---

### Section B: Test Coverage

The test file `orders-upsert/upsert-order.test.ts` may already exist.
Review it and fill any gaps.

**Required test cases:**

| Test | What to verify |
|---|---|
| Valid ML order (new) | Returns `{ success: true, created: true }`, correct `order_id` |
| Valid Shopee order (new) | Same as above with `marketplace: 'shopee'` |
| Same order sent twice | Second call returns `{ success: true, created: false }` |
| Missing `organization_id` | Returns HTTP 400 with error message |
| Missing `order.marketplace_order_id` | Returns HTTP 400 |
| Invalid `source` value | Returns HTTP 400 |
| DB failure (mocked) | Returns HTTP 422 with `success: false` |

Tests run with: `deno test supabase/functions/orders-upsert/`

#### Definition of Done — Section B
- [ ] Test file exists with all 7 cases above
- [ ] All tests pass
- [ ] Tests use a mocked Supabase client — no real DB calls in tests

---

### Section C: Smoke Test (Manual)

After deploying, verify the function works end-to-end by calling it manually.

```bash
# Deploy
supabase functions deploy orders-upsert

# Smoke test — should return { success: true, created: true }
curl -X POST https://<your-project>.supabase.co/functions/v1/orders-upsert \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "<test-org-id>",
    "source": "sync",
    "order": {
      "marketplace": "mercado_livre",
      "marketplace_order_id": "TEST_ORDER_001",
      "status": "paid",
      "marketplace_status": "paid",
      "gross_amount": 100.00,
      "marketplace_fee": 12.00,
      "shipping_cost": 8.00,
      "shipping_subsidy": 0,
      "net_amount": 80.00,
      "items": [{ "title": "Test Product", "quantity": 1, "unit_price": 100.00 }],
      "shipping": null
    }
  }'

# Call again — should return { success: true, created: false } (idempotency check)
```

#### Definition of Done — Section C
- [ ] Smoke test returns HTTP 200 on first call
- [ ] Smoke test returns HTTP 200 on second call with same `marketplace_order_id`
- [ ] Second call returns `created: false` (not a duplicate row)
- [ ] Querying `SELECT * FROM orders WHERE marketplace_order_id = 'TEST_ORDER_001'` returns exactly 1 row

---

## 7. Definition of Done — Full Task

- [ ] All Section A, B, C DoD items are checked
- [ ] No references to the old `orders-upsert/orders-upsert-adapter.ts` path remain in any file
- [ ] `index.ts` is under 50 lines
- [ ] `upsert-order.ts` is under 20 lines (it's a facade — keep it thin)
- [ ] Zero `any` types in the handler and facade
- [ ] Function deployed to Supabase
- [ ] Smoke test passed

---

## 8. What NOT to Build

- **Do NOT add rate limiting here.** The caller (sync functions) controls the pace.
- **Do NOT add NFe emission logic.** NFe is handled by `emit-invoice` (C0-T8).
- **Do NOT add real-time Supabase channel broadcasts.** The frontend uses polling or TanStack Query refetch — not websocket pushes from the edge function.
- **Do NOT change the HTTP contract.** Other functions depend on the input/output shape above.
