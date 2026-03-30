# PRD — C0-T5: Edge Function `orders-sync-shopee`

**Cycle:** 0 — Plataforma de Pedidos
**Status:** 🟡 In Progress — code exists but depends on `_shared` files that may not exist
**Depends on:** [C0-T3 — `orders-upsert`](./C0-T3-orders-upsert-function.md)
**Blocks:** [C0-T9 — Legacy Cleanup](./C0-T9-legacy-cleanup.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

This is the Shopee equivalent of `orders-sync-ml`. When a seller connects their Shopee
store, this function fetches all recent orders from the Shopee API and saves them to
our database.

Shopee and Mercado Livre work very differently behind the scenes — Shopee uses
a cursor-based pagination system, requires a digital signature on every request, and
provides financial data through a separate "escrow" API call. Despite these differences,
the final result is the same: a clean, standardized order row in our `orders` table.

The code for this function exists but it depends on a shared Shopee adapter
(`ShopeeFetchOrdersAdapter`) that may or may not be in the right place. This PRD
verifies the current state and fills any gaps.

---

## 2. Current State & Progress

From reading `supabase/functions/orders-sync-shopee/index.ts`:

**What is implemented:**
- Input validation and Shopee context resolution via `resolveShopeeSyncContext`
- Cursor-based pagination via `ShopeeFetchOrdersAdapter.fetchOrderSnList()`
- Batch detail fetching (50 orders at a time) via `ShopeeFetchOrdersAdapter.fetchOrderDetailBatch()`
- Optional escrow detail fetch per order for financial data
- Normalization via `ShopeeOrderNormalizeService`
- Upsert via `upsertOrder()` facade
- Error isolation per order

**Files imported that need to be verified in `_shared`:**
- `_shared/adapters/sync-context/shopee-sync-context.ts` — verify exists
- `_shared/adapters/shopee/shopee-fetch-orders.ts` — **may NOT exist in `_shared`**
- `_shared/orders-normalize/index.ts` → `ShopeeOrderNormalizeService` — verify exists

**Known issues to investigate:**
1. `ShopeeFetchOrdersAdapter` — confirm it is in `_shared/adapters/shopee/`, not somewhere else
2. `orders-sync-shopee` calls `upsertOrder()` from the facade (inconsistent with `orders-sync-ml`
   which uses `OrdersUpsertAdapter` directly via `MlOrderSyncProcessor`) — minor inconsistency,
   acceptable if both work correctly
3. `buildFetchParams` sets `timeFrom: 0` as initial value and then overrides it later — confusing
   but not a bug

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

### 🚨 STOP FIRST — Check Current State

```bash
# Check if the main blocker already exists
ls supabase/functions/_shared/adapters/shopee/shopee-fetch-orders.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

- If `EXISTS` → read it in full; check which methods are implemented; run `deno check`. May only need Section B (import fix) and tests.
- If `MISSING` → Section A is the main build. Continue reading below.

```bash
# Check for any import errors in the main function
grep "shopee-fetch-orders\|ShopeeFetchOrdersAdapter" supabase/functions/orders-sync-shopee/index.ts
```

---

Complete ALL of these before writing anything:

- [ ] Confirm C0-T2 and C0-T3 are done.
- [ ] Read `orders-sync-shopee/index.ts` in full.
- [ ] Check if `_shared/adapters/shopee/shopee-fetch-orders.ts` exists.
      If it does NOT exist: this is the main thing to build in this PRD (Section B).
      If it DOES exist: read it and note what methods are implemented.
- [ ] Read `_shared/adapters/sync-context/shopee-sync-context.ts` — confirm it exists and
      understand what `resolveShopeeSyncContext` returns (`ShopeeSyncContext`).
- [ ] Read `_shared/orders-normalize/shopee-order-normalize-service.ts` — confirm
      `ShopeeOrderNormalizeService.normalize()` accepts `(rawOrder, escrowDetail?)`.
- [ ] Run `deno check supabase/functions/orders-sync-shopee/index.ts` and note any import errors.
      Any missing imports = files that need to be created.
- [ ] Update Section 2 with what you found.

---

## 4. Architecture Context

```
orders-sync-shopee/index.ts
  │
  ├── resolveShopeeSyncContext()      ← _shared: validates input, loads Shopee token + credentials
  ├── ShopeeFetchOrdersAdapter
  │     ├── fetchOrderSnList()        ← _shared: cursor pagination, returns list of order_sn strings
  │     ├── fetchOrderDetailBatch()   ← _shared: batch GET of up to 50 order details
  │     └── fetchEscrowDetail()       ← _shared: GET escrow for financial data (nullable, best-effort)
  ├── ShopeeOrderNormalizeService     ← _shared: raw Shopee order → NormalizedOrder
  └── upsertOrder()                  ← facade in orders-upsert/ → calls OrdersUpsertAdapter
```

### Shopee API Notes

**Authentication:** All Shopee API calls require HMAC-SHA256 signature per request.
The signature is `HMAC-SHA256(partner_key, "{partner_id}{api_path}{timestamp}{access_token}{shop_id}")`.
The `_shared/adapters/infra/token-utils.ts` has `hmacSha256Hex()` — use it.

**Order list endpoint:**
```
GET https://partner.shopeemobile.com/api/v2/order/get_order_list
  ?partner_id=<id>
  &timestamp=<unix_ts>
  &sign=<hmac>
  &access_token=<token>
  &shop_id=<shop_id>
  &time_range_field=create_time
  &time_from=<unix_ts>
  &time_to=<unix_ts>
  &page_size=50
  &cursor=<cursor>   (omit on first call)
  &order_status=ALL
```

Response: `{ response: { order_list: [{ order_sn }], next_cursor, more }, error, message }`
Loop while `more === true`. Use `next_cursor` in the next call.

**Order detail batch endpoint (up to 50 per call):**
```
GET https://partner.shopeemobile.com/api/v2/order/get_order_detail
  ?...same auth params...
  &order_sn_list=sn1,sn2,sn3,...
  &response_optional_fields=buyer_user_id,buyer_username,estimated_shipping_fee,recipient_address,actual_shipping_fee,goods_to_declare,note,note_update_time,item_list,pay_time,dropshipper,dropshipper_phone,split_up,buyer_cancel_reason,cancel_by,cancel_reason,actual_shipping_fee_confirmed,buyer_cpf_id,fulfillment_flag,pickup_done_time,package_list,shipping_carrier,payment_method,total_amount,invoice_data,checkout_shipping_carrier,reverse_shipping_fee,order_chargeable_weight_gram,edt
```

**Escrow endpoint (per order, optional):**
```
GET https://partner.shopeemobile.com/api/v2/payment/get_escrow_detail
  ?order_sn=<sn>&...auth params...
```

This endpoint provides the commission breakdown (`commission_fee`, `service_fee`, `escrow_amount`).
It may fail (some order types don't have escrow). Always wrap in try/catch and pass `null` to
the normalizer if it fails — this is the correct behavior.

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER store the Shopee partner key in code** | Use `Deno.env.get('SHOPEE_PARTNER_KEY')` only. |
| **NEVER call the escrow endpoint without try/catch** | It returns 404 for non-escrow order types. A missing escrow is not an error — it just means financial data is partial. |
| **NEVER mark an order as `failed` because escrow returned null** | Escrow is optional financial enrichment. An order without escrow data is still a valid order. |
| **NEVER use INSERT on `orders`** | Always UPSERT via the facade or adapter. |

---

## 6. What to Build

### Section A: Verify / Fix the `ShopeeFetchOrdersAdapter` Location

**IF** the file already exists at `_shared/adapters/shopee/shopee-fetch-orders.ts`:
- Read it in full
- Confirm it implements `fetchOrderSnList`, `fetchOrderDetailBatch`, `fetchEscrowDetail`, and `fetchOneOrderDetail`
- Confirm it uses HMAC-SHA256 signatures via `hmacSha256Hex` from `_shared/adapters/infra/token-utils.ts`
- Run `deno check` to confirm no import errors

**IF** the file does NOT exist at `_shared/adapters/shopee/`:
- Create `_shared/adapters/shopee/shopee-fetch-orders.ts`
- Create `_shared/adapters/shopee/index.ts` as barrel export

The class must implement the following interface:
```typescript
interface ShopeeFetchParams {
  partnerId: string
  partnerKey: string
  accessToken: string
  shopId: number
  timeFrom: number     // unix timestamp seconds
  timeTo: number       // unix timestamp seconds
}

interface ShopeeDetailParams {
  partnerId: string
  partnerKey: string
  accessToken: string
  shopId: number
}

class ShopeeFetchOrdersAdapter {
  // Fetches all order SNs in the time range via cursor pagination
  async fetchOrderSnList(
    params: ShopeeFetchParams,
    onRefresh: () => Promise<boolean>  // callback to refresh token on 401
  ): Promise<string[]>

  // Fetches full order details for a batch of up to 50 order SNs
  async fetchOrderDetailBatch(
    orderSns: string[],
    params: ShopeeDetailParams,
    onRefresh: () => Promise<boolean>
  ): Promise<ShopeeOrderDetailItem[]>

  // Fetches escrow detail for one order (nullable — returns null on error)
  async fetchEscrowDetail(
    orderSn: string,
    params: ShopeeDetailParams,
    onRefresh: () => Promise<boolean>
  ): Promise<ShopeeEscrowDetailPayload | null>

  // Fetches detail for exactly one order (used by queue worker)
  async fetchOneOrderDetail(
    orderSn: string,
    params: ShopeeDetailParams
  ): Promise<ShopeeOrderDetailItem | null>
}
```

Each method body must be under 50 lines. Extract signature building and response parsing
into private helpers.

#### Signature Helper (reference)

`hmacSha256Hex` uses the WebCrypto API and is **async** — always `await` it:

```typescript
// Build the HMAC signature required by all Shopee API calls
// Note: async because hmacSha256Hex uses WebCrypto (async in Deno)
private async buildSignature(
  partnerId: string,
  apiPath: string,
  timestamp: number,
  accessToken: string,
  shopId: number,
  partnerKey: string
): Promise<string> {
  const baseString = `${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`
  return await hmacSha256Hex(partnerKey, baseString)
}
```

> ⚠️ **Failure mode:** If you forget `await` on `hmacSha256Hex`, the signature will be a
> `Promise` object instead of a hex string. The Shopee API will reject all requests with a
> signature error. Always `await` async crypto operations.

#### Definition of Done — Section A
- [ ] `_shared/adapters/shopee/shopee-fetch-orders.ts` exists
- [ ] `_shared/adapters/shopee/index.ts` barrel export exists
- [ ] All 4 methods implemented (`fetchOrderSnList`, `fetchOrderDetailBatch`, `fetchEscrowDetail`, `fetchOneOrderDetail`)
- [ ] HMAC signature logic uses `hmacSha256Hex` from `_shared/adapters/infra/token-utils.ts`
- [ ] Cursor pagination loop in `fetchOrderSnList` handles `more: true/false`
- [ ] `fetchEscrowDetail` catches errors and returns `null` (never throws)
- [ ] No method body exceeds 50 lines
- [ ] `deno check` passes on the file

---

### Section B: Fix Import Paths in `orders-sync-shopee/index.ts`

After Section A is done, verify that `orders-sync-shopee/index.ts` imports
`ShopeeFetchOrdersAdapter` from `_shared/adapters/shopee/index.ts`.

If the import already points there — no change needed.
If it imports from elsewhere — update the import path.

Also: the function uses `upsertOrder()` (facade). This is acceptable.
No need to change it to use `OrdersUpsertAdapter` directly.

#### Definition of Done — Section B
- [ ] All imports in `orders-sync-shopee/index.ts` resolve correctly
- [ ] `deno check supabase/functions/orders-sync-shopee/index.ts` passes with zero errors

---

### Section C: Test Coverage

**File:** `orders-sync-shopee/index.test.ts`

| Test | What to verify |
|---|---|
| Happy path — 2 orders with escrow | `synced: 2, failed: 0` |
| Happy path — 1 order without escrow | `synced: 1, failed: 0` (escrow null is OK) |
| Shopee returns empty list | `synced: 0, failed: 0, errors: []` |
| One order detail fetch fails | `synced: 1, failed: 1, errors: [...]` |
| Invalid input (missing org_id) | HTTP 400 |

#### Definition of Done — Section C
- [ ] Test file exists with all 5 cases
- [ ] All tests pass
- [ ] No real Shopee API calls in tests (mocked responses)

---

### Section D: Deploy & Smoke Test

```bash
supabase functions deploy orders-sync-shopee

curl -X POST https://<project>.supabase.co/functions/v1/orders-sync-shopee \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{ "organization_id": "<org-id>", "integration_id": "<shopee-integration-id>" }'
```

- [ ] Returns `{ success: true, synced: N, failed: 0 }`
- [ ] Second run returns same `synced` count with `created: false` on all orders (idempotency)
- [ ] `SELECT COUNT(*) FROM orders WHERE marketplace = 'shopee'` shows expected count

---

## 7. Definition of Done — Full Task

- [ ] All Section A, B, C, D DoD items checked
- [ ] `ShopeeFetchOrdersAdapter` lives in `_shared/adapters/shopee/`
- [ ] Function is under 80 lines (excluding imports)
- [ ] Zero `any` types in `_shared/adapters/shopee/shopee-fetch-orders.ts`
- [ ] Deployed and smoke-tested

---

## 8. What NOT to Build

- **Do NOT sync Shopee items/listings here.** This function is orders only.
- **Do NOT fetch shipping labels during sync.** Labels are fetched lazily when the seller prints.
- **Do NOT add Shopee-specific UI features.** Cycle 0 is backend only.
- **Do NOT add retry logic in this function.** The queue worker (C0-T7) handles retries for
  webhook-triggered updates. Sync failures are just reported in the `errors` array.
