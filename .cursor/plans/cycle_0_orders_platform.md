# Cycle 0 — Plataforma de Pedidos (Cursor Plan)

**Full spec:** `docs/CYCLE_0_ORDERS_PLATFORM.md`  
**Status:** Pre-launch prerequisite | **Appetite:** 6 weeks

---

## Scope

- New normalized schema: `orders`, `order_items`, `order_shipping`, `order_status_history`, `invoices` (idempotency).
- Edge functions: `orders-normalize-ml`, `orders-normalize-shopee`, `orders-upsert`, `orders-sync-ml`, `orders-sync-shopee`, **`orders-webhook`**, `emit-invoice`.
- Vercel forwarders `api/mercado-livre-webhook.ts` and `api/shopee-webhook.ts` stay as-is; point them to `orders-webhook` when ready.

---

## Function 6: `orders-webhook`

**Location:** `supabase/functions/orders-webhook/index.ts`  
**Responsibility:** Unified webhook handler for ML and Shopee order updates.

### How ML notifications work (Mercado Livre)

Each topic/entity can have notifications tied to specific events and actions. Notifications are sent when those activities occur on Mercado Livre. The integrator can subscribe to specific events within a topic via the filters offered by the API.

**Orders topic (recommended):**
- **`orders_v2`** — Notifications on creation and updates of your confirmed sales.

**Notification payload:** The webhook body does **not** contain the full order; it only identifies the resource. Example:

```json
{
  "resource": "/orders/2195160686",
  "user_id": 468424240,
  "topic": "orders_v2",
  "application_id": 5503910054141466,
  "attempts": 1,
  "sent": "2019-10-30T16:19:20.129Z",
  "received": "2019-10-30T16:19:20.106Z"
}
```

**Required follow-up:** Parse `resource` (e.g. `/orders/2195160686` → order ID `2195160686`), then **GET** the full order with the seller's token:

```bash
curl -X GET -H 'Authorization: Bearer $ACCESS_TOKEN' https://api.mercadolibre.com/orders/$ORDER_ID
```

Then call `orders-normalize-ml` on the response and `orders-upsert` with `source: 'webhook'`.

### Implementation

- **Detection:** ML → `body.topic === 'orders_v2'` or header `x-source === 'mercado_livre'`; Shopee → `body.shop_id !== undefined && body.code !== undefined`.
- Validate webhook signature first → 401 if invalid.
- Fetch full order from marketplace API (webhook only has order ID).
- Normalize → upsert → return 200. No NFe, no inventory, no side effects (ML retries if > 2s).

---

## Key references

| Item | Where |
|------|--------|
| Schema (migrations, RLS) | `docs/CYCLE_0_ORDERS_PLATFORM.md` |
| ML Order API types | `supabase/functions/orders-normalize-ml/ml-order-api.types.ts` |
| Normalized types | `supabase/functions/_shared/domain/orders-types.ts` |
| Engineering standards | `docs/ENGINEERING_STANDARDS.md` (e.g. &lt; 50 lines/fn) |

---

## Definition of Done (summary)

1. ML sync idempotent (same date range → same row count).
2. Shopee sync idempotent, same tables.
3. `net_amount` accuracy ±R$0,01.
4. NFe double-emission impossible (`idempotency_key`).
5. Status changes → `order_status_history`.
6. One order, N items → N rows in `order_items`.
7. Definition of Done criteria validated; Vercel webhooks pointed to `orders-webhook`.
