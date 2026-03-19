# PRD — C0-T6: Edge Function `orders-webhook`

**Cycle:** 0 — Plataforma de Pedidos
**Status:** 🟡 In Progress — code exists but depends on `_shared` domain types that may be missing
**Depends on:** [C0-T3 — `orders-upsert`](./C0-T3-orders-upsert-function.md)
**Blocks:** [C0-T7 — Queue Worker](./C0-T7-orders-queue-worker.md), [C0-T9 — Legacy Cleanup](./C0-T9-legacy-cleanup.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

When an order is placed on Mercado Livre or Shopee, the marketplace sends a notification
to Novura within seconds. This function receives that notification and immediately queues
the order for processing.

It works like a reception desk: it checks the visitor's ID (validates the webhook signature),
takes a quick note (enqueues the order ID), and says "thank you" in under 2 seconds. The
actual processing — fetching the full order, saving it — happens separately in the queue
worker (C0-T7). This keeps the webhook fast and reliable, because if we take too long,
ML will retry the notification and we get duplicates.

The code already exists. The issue is that it imports two domain type files
(`ml-order-notification.types.ts` and `shopee-order-push.types.ts`) that may not yet exist
in the `_shared` library. Those files need to be created if they don't exist.

---

## 2. Current State & Progress

From reading `supabase/functions/orders-webhook/index.ts`:

**What is implemented:**
- Handles OPTIONS (CORS)
- Reads body as text (needed for signature validation)
- Parses JSON separately after signature check
- Routes ML vs Shopee by headers and payload shape
- ML: validates with `isMlOrderNotificationPayload`, extracts order ID from `resource` field
- Shopee: validates HMAC-SHA256 signature, validates with `isShopeeOrderPushPayload`
- Enqueues `OrderSyncQueueMessage` to `pgmq` via `SupabaseOrdersQueueAdapter`
- Returns `200` immediately (< 2 seconds — ML retry safety)
- Under 80 lines — good

**Files imported that must be verified:**

| Import | File path | Status |
|---|---|---|
| `isMlOrderNotificationPayload`, `extractOrderIdFromMlResource` | `_shared/domain/ml/ml-order-notification.types.ts` | ⚠️ May not exist |
| `isShopeeOrderPushPayload`, `getShopeePushOrderSn`, `getShopeePushShopId` | `_shared/domain/shopee/shopee-order-push.types.ts` | ⚠️ May not exist |
| `SupabaseOrdersQueueAdapter` | `_shared/adapters/orders-queue/orders-queue-adapter.ts` | ✅ Exists per agent review |
| `OrderSyncQueueMessage` | `_shared/domain/orders/order-queue-message.types.ts` | ✅ Exists |

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

### 🚨 STOP FIRST — Check What's Missing

```bash
# Check which type files the webhook is trying to import
grep "import" supabase/functions/orders-webhook/index.ts | grep "_shared/domain"

# Check if the type files exist
ls supabase/functions/_shared/domain/ml/ml-order-notification.types.ts 2>/dev/null && echo "ML TYPES: EXISTS" || echo "ML TYPES: MISSING"
ls supabase/functions/_shared/domain/shopee/shopee-order-push.types.ts 2>/dev/null && echo "SHOPEE TYPES: EXISTS" || echo "SHOPEE TYPES: MISSING"
```

Then run the type checker to see ALL missing imports at once:
```bash
deno check supabase/functions/orders-webhook/index.ts
```

Any `error[ERR_MODULE_NOT_FOUND]` lines in the output = files you need to create. Note them before writing anything.

---

- [ ] Confirm C0-T2 and C0-T3 are done.
- [ ] Read `orders-webhook/index.ts` in full.
- [ ] Run `deno check supabase/functions/orders-webhook/index.ts`.
      Any import errors identify the missing files. Note them.
- [ ] Check if `_shared/domain/ml/ml-order-notification.types.ts` exists.
      If it does, read it and confirm `isMlOrderNotificationPayload` and `extractOrderIdFromMlResource` are exported.
- [ ] Check if `_shared/domain/shopee/shopee-order-push.types.ts` exists.
      If it does, read it and confirm `isShopeeOrderPushPayload`, `getShopeePushOrderSn`, `getShopeePushShopId` are exported.
- [ ] Read `_shared/domain/orders/order-queue-message.types.ts` — confirm `OrderSyncQueueMessage` is a union type of ML and Shopee messages.
- [ ] Update Section 2 with actual findings.

---

## 4. Architecture Context

```
External Marketplace
  │  POST (webhook notification)
  ▼
orders-webhook/index.ts
  │
  ├── validateShopeeSignature()     ← inline helper (signature with partner key)
  ├── isMlOrderNotificationPayload()  ← _shared domain type guard
  ├── extractOrderIdFromMlResource()  ← _shared domain utility
  ├── isShopeeOrderPushPayload()      ← _shared domain type guard
  ├── getShopeePushOrderSn()          ← _shared domain accessor
  ├── getShopeePushShopId()           ← _shared domain accessor
  └── SupabaseOrdersQueueAdapter.enqueue()  ← _shared adapter → pgmq
        │
        ▼ (async)
  orders-queue-worker (C0-T7) picks it up every 30s
```

### ML Webhook Payload Shape

```typescript
// ML sends this to the webhook URL
interface MlOrderNotification {
  resource: string        // e.g. "/orders/2195160686"
  user_id: number         // ML seller ID
  topic: string           // "orders_v2"
  application_id: number
  attempts: number
  sent: string            // ISO8601
  received: string        // ISO8601
}

// Type guard — returns true if the object has the required fields
function isMlOrderNotificationPayload(body: unknown): body is MlOrderNotification

// Extract numeric order ID from resource string "/orders/2195160686"
function extractOrderIdFromMlResource(resource: string): string | null
```

### Shopee Webhook Payload Shape

```typescript
// Shopee push notification shape
interface ShopeeOrderPushPayload {
  shop_id: number
  code: number           // event type code (e.g., 3 = order status update)
  timestamp: number      // unix timestamp
  sign: string           // HMAC signature
  data?: {
    ordersn?: string
    order_sn?: string
    shop_id?: number
  }
  ordersn?: string       // some versions put it at root level
  order_sn?: string
}

function isShopeeOrderPushPayload(body: unknown): body is ShopeeOrderPushPayload
function getShopeePushOrderSn(payload: ShopeeOrderPushPayload): string | null
function getShopeePushShopId(payload: ShopeeOrderPushPayload): number | null
```

### Queue Message Contract

```typescript
// Union type — discriminated by marketplace
type OrderSyncQueueMessage =
  | { marketplace: 'mercado_livre'; marketplace_order_id: string; meli_user_id: string }
  | { marketplace: 'shopee'; order_sn: string; shop_id: number }
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER perform DB writes (other than queue enqueue) in the webhook handler** | The webhook must return 200 in < 2 seconds. ML retries if we're slow. Heavy work goes in the queue. |
| **NEVER call external APIs inside the webhook handler** | Same reason — speed. The queue worker calls the marketplace API. |
| **NEVER trust a Shopee webhook without validating the signature** | Anyone could POST to this URL. Invalid signature = 401 immediately. |
| **For ML webhooks, DO NOT validate the signature** | ML uses account-level URL configuration and doesn't sign webhooks. ML identity is validated later when we call the ML API with the seller's token. |
| **ALWAYS return HTTP 200 after enqueuing** | Even if the order is unexpected or the business logic later fails. A non-200 response tells ML to retry, which creates infinite loops. |

---

## 6. What to Build

### Section A: Create Missing `_shared` Domain Types

#### A1: `_shared/domain/ml/ml-order-notification.types.ts`

If this file does NOT exist, create it:

```typescript
// _shared/domain/ml/ml-order-notification.types.ts

export interface MlOrderNotification {
  resource: string
  user_id: number
  topic: string
  application_id: number
  attempts: number
  sent: string
  received: string
}

export function isMlOrderNotificationPayload(body: unknown): body is MlOrderNotification {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b['resource'] === 'string' &&
    typeof b['user_id'] === 'number' &&
    typeof b['topic'] === 'string'
  )
}

// Parses "/orders/2195160686" → "2195160686"
// Returns null if the string doesn't match the expected pattern
export function extractOrderIdFromMlResource(resource: string): string | null {
  const match = resource.match(/\/orders\/(\d+)/)
  return match ? match[1] : null
}
```

**Constraints:** This file must be pure types and pure functions — no I/O, no imports from adapters.

#### A2: `_shared/domain/shopee/shopee-order-push.types.ts`

If this file does NOT exist, create it:

```typescript
// _shared/domain/shopee/shopee-order-push.types.ts

export interface ShopeeOrderPushPayload {
  shop_id: number
  code: number
  timestamp: number
  sign: string
  data?: {
    ordersn?: string
    order_sn?: string
    shop_id?: number
  }
  ordersn?: string
  order_sn?: string
}

export function isShopeeOrderPushPayload(body: unknown): body is ShopeeOrderPushPayload {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    (typeof b['shop_id'] === 'number' || typeof b['shop_id'] === 'string') &&
    typeof b['code'] === 'number'
  )
}

// Extracts order_sn from various locations in the payload (Shopee is inconsistent)
export function getShopeePushOrderSn(payload: ShopeeOrderPushPayload): string | null {
  return payload.data?.ordersn
    ?? payload.data?.order_sn
    ?? payload.ordersn
    ?? payload.order_sn
    ?? null
}

export function getShopeePushShopId(payload: ShopeeOrderPushPayload): number | null {
  const raw = payload.data?.shop_id ?? payload.shop_id
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') return parseInt(raw, 10) || null
  return null
}
```

#### Definition of Done — Section A
- [ ] `_shared/domain/ml/ml-order-notification.types.ts` exists (created or already present)
- [ ] `_shared/domain/shopee/shopee-order-push.types.ts` exists (created or already present)
- [ ] Both files are pure — no imports from adapters or infra
- [ ] All exported functions have explicit TypeScript return types (no `any`)

---

### Section B: Verify the Webhook Handler Compiles

After Section A:

- [ ] Run `deno check supabase/functions/orders-webhook/index.ts` — zero errors
- [ ] Confirm the function handles CORS preflight (`OPTIONS` → 204 with correct headers)
- [ ] Confirm Shopee signature validation uses `SHOPEE_LIVE_PUSH_PARTNER_KEY` from env
      and is skipped (accept all) when the env var is absent (development mode)
      > ⚠️ **Security check:** The dev-mode bypass (skip validation when env var absent) must
      > NEVER reach production. Confirm `SHOPEE_LIVE_PUSH_PARTNER_KEY` is set in Supabase project
      > secrets before deploying. If it's missing in production, anyone can POST fake Shopee webhooks.

---

### Section C: Test Coverage

**File:** `orders-webhook/index.test.ts`

| Test | What to verify |
|---|---|
| Valid ML webhook | Returns HTTP 200, `{ ok: true, queued: true }` |
| Invalid ML payload (missing resource) | Returns HTTP 400 |
| Valid Shopee webhook (no signature key in env) | Returns HTTP 200 |
| Valid Shopee webhook (with valid signature) | Returns HTTP 200 |
| Shopee webhook with invalid signature | Returns HTTP 401 |
| Unknown payload (neither ML nor Shopee) | Returns HTTP 400 |
| Queue enqueue fails (mocked) | Returns HTTP 500 |

#### Definition of Done — Section C
- [ ] Test file exists with all 7 cases
- [ ] All tests pass
- [ ] Queue adapter is mocked — no real pgmq calls in tests

---

### Section D: Verify Webhook URL Registration

Confirm the Vercel forwarder (`api/mercado-livre-webhook.ts`) forwards to this function's URL.

- [ ] Read `api/mercado-livre-webhook.ts` and confirm it forwards to `orders-webhook`
- [ ] Read `api/shopee-webhook.ts` and confirm it forwards to `orders-webhook`
- [ ] If either still points to the old functions, update the target URL to `orders-webhook`
      (but do NOT modify the Vercel forwarder logic — only the destination URL)

---

## 7. Definition of Done — Full Task

- [ ] All Section A, B, C, D DoD items checked
- [ ] `deno check` passes with zero errors
- [ ] Function deployed to Supabase
- [ ] Manual test: POST a fake ML webhook payload → confirm message appears in pgmq queue
- [ ] Manual test: POST a fake Shopee webhook payload → confirm message appears in pgmq queue
- [ ] Function returns `200` in under 500ms (measure with `duration_ms` if logged)

---

## 8. What NOT to Build

- **Do NOT fetch the full order inside the webhook.** That is the queue worker's job (C0-T7).
- **Do NOT emit NFe from the webhook.** NFe is a separate seller action.
- **Do NOT deduct stock from the webhook.** Stock logic belongs in the inventory service.
- **Do NOT send push notifications or emails from the webhook.** Those are side effects
  that belong in async jobs, not in the tight 2-second webhook window.
- **Do NOT register the webhook URL at ML or Shopee here.** Webhook URL registration
  happens during the OAuth callback flow (`mercado-livre-callback`, `shopee-callback`).
