# Trigger Migration Plan — DB Triggers → Edge Functions

> **Status:** Planning only. No code has been written or migrations applied.
>
> **Rule:** All triggers except `updated_at` / `set_updated_at` move to edge functions.
> Reference: `docs/DATABASE_TRIGGERS.md` for full trigger bodies and bug details.

---

## Guiding Principles

1. **No silent side effects.** Every write to the DB must be self-contained. A developer reading an edge function must be able to understand all consequences without knowing the DB trigger layer exists.
2. **One write path per entity.** Each table that previously relied on a trigger to do follow-up work must have a single owning edge function that does both the primary write and the follow-up explicitly.
3. **Drop before adding new.** The trigger is dropped only after the replacement edge function is deployed and verified. Never both active simultaneously (double-execution risk).
4. **Triggers as a migration gate.** A trigger still in DB = migration not done. The `DATABASE_TRIGGERS.md` table is the source of truth for remaining triggers.
5. **No migrations during planning phase.** This document is planning only.

---

## Migration Phases Overview

| Phase | Scope | Depends On | Risk |
|---|---|---|---|
| **Phase 1** | Drop dead code (`trg_mipl_refresh_presented`) | Nothing | Zero — function is a no-op |
| **Phase 2** | Chat triggers → `send-message` edge function | Nothing | Medium — encryption, notifications |
| **Phase 3** | Org bootstrap → `create-organization` edge function | Nothing | Low |
| **Phase 4** | Marketplace integrations disconnect → `disconnect-marketplace` edge function | Nothing | High — cascade deletes, stock check |
| **Phase 5** | Marketplace integrations auth caps → auth callback edge functions | Phase 4 | Low |
| **Phase 6** | Order processing triggers → Cycle 0 edge functions | Cycle 0 data model | Very high — entire Shopee pipeline |
| **Phase 7** | Linked products → `link-order-product` edge function | Phase 6 | Medium — bug must be fixed |

Phases 2, 3, 4 are independent and can be parallelized. Phase 6 is blocked on the Cycle 0 `orders` table migration.

---

## Phase 1 — Drop Dead Code

**Appetite:** < 1 hour. Zero risk.

### `trg_mipl_refresh_presented`
**Table:** `marketplace_item_product_links`
**Function body:** `RETURN COALESCE(NEW, OLD);` — complete no-op.

**Action:** Drop trigger and function. No replacement needed.

```sql
-- What to run when ready:
DROP TRIGGER IF EXISTS trg_mipl_refresh_presented ON public.marketplace_item_product_links;
DROP FUNCTION IF EXISTS public.trg_mipl_refresh_presented();
```

**Verification:** Query `information_schema.triggers` to confirm trigger is gone. No functional test needed.

---

## Phase 2 — Chat Triggers → `send-message` Edge Function

**Appetite:** 1–2 days.

### Current triggers being replaced

| Trigger | Event | What it does |
|---|---|---|
| `chat_encrypt_on_insert_update` | BEFORE INSERT, UPDATE | Encrypts `content` with AES-256 via `pgp_sym_encrypt`, sets `is_encrypted = true` |
| `chat_messages_create_notifications` | AFTER INSERT | Inserts `chat_notifications` row per channel member (excluding sender) |
| `chat_messages_increment_unread` | AFTER INSERT | Upserts `chat_unread_counts`, increments by 1 per member |

### Target: new or updated `send-message` edge function

The edge function must do **all three steps** that the triggers currently do, in order:

```
1. Encrypt content
   - Fetch org encryption key (same logic as ensure_chat_org_key)
   - AES-256 encrypt: pgp_sym_encrypt equivalent in Deno
   - Set is_encrypted: true on the payload before writing

2. Write to chat_messages
   - Already encrypted payload → insert

3. Fan out notifications (AFTER the insert succeeds)
   - Fetch channel.member_ids
   - Insert chat_notifications rows (ON CONFLICT DO NOTHING)
   - Upsert chat_unread_counts (+1 per member, exclude sender)
```

### Key contracts

- Encryption must happen **before** the DB write — the plaintext must never touch the DB, even transiently. The current trigger is BEFORE, so this order is correct.
- Notifications and unread counts must be idempotent — both already use `ON CONFLICT DO NOTHING` / upsert. Keep this.
- The `ensure_chat_org_key` PL/pgSQL function generates or fetches a per-org key. This must be ported to Deno or called via `admin.rpc('ensure_chat_org_key', { organization_id })` during the transition.

### Encryption key strategy note

`chat_encrypt_on_write` calls `public.ensure_chat_org_key(organization_id)` which is a PL/pgSQL function that reads/generates a key stored in the DB. Two options:

- **Option A (short-term):** Edge function calls `admin.rpc('ensure_chat_org_key', { ... })` to get the key, encrypts in Deno using Web Crypto API, writes the ciphertext. The PL/pgSQL key generation function stays (it's infrastructure, not business logic).
- **Option B (long-term):** Move key storage to Supabase Vault or an env-based KMS. Out of scope for this phase.

Use Option A for Phase 2.

### Drop order

1. Deploy updated `send-message` edge function with encryption + notifications.
2. Verify in staging: send a message → row is encrypted in DB → notification created → unread count incremented.
3. Drop triggers:
```sql
DROP TRIGGER IF EXISTS chat_encrypt_on_insert_update ON public.chat_messages;
DROP TRIGGER IF EXISTS chat_messages_create_notifications ON public.chat_messages;
DROP TRIGGER IF EXISTS chat_messages_increment_unread ON public.chat_messages;
DROP FUNCTION IF EXISTS public.chat_encrypt_on_write();
DROP FUNCTION IF EXISTS public.create_chat_notifications_on_message();
DROP FUNCTION IF EXISTS public.increment_unread_on_message();
```

### Risk: direct DB writes

If anything writes to `chat_messages` outside of the `send-message` edge function (admin panel, direct SQL, another edge function), encryption won't happen. Audit all write paths before dropping the trigger.

---

## Phase 3 — Org Bootstrap → `create-organization` Edge Function

**Appetite:** < 1 day. Low risk.

### Current trigger

`organization_owner_membership` — AFTER INSERT on `organizations`.

Inserts the owner into `user_invitations` with `role='owner', status='ativo'`.

```sql
INSERT INTO public.user_invitations (organization_id, invited_by_user_id, user_id, role, status)
VALUES (NEW.id, NEW.owner_user_id, NEW.owner_user_id, 'owner', 'ativo')
ON CONFLICT DO NOTHING;
```

### Target: `create-organization` edge function (or existing org creation flow)

Find where organizations are created (likely an edge function or direct client call). Add an explicit insert of the owner membership immediately after the org insert:

```typescript
// After: await admin.from("organizations").insert({ ... })
await admin.from("user_invitations").upsert({
  organization_id: org.id,
  invited_by_user_id: ownerUserId,
  user_id: ownerUserId,
  role: "owner",
  status: "ativo",
}, { onConflict: "organization_id,user_id" }); // verify the actual unique constraint
```

### Drop order

1. Find and update the org creation code path.
2. Verify: create org → owner appears in `user_invitations`.
3. Drop trigger:
```sql
DROP TRIGGER IF EXISTS organization_owner_membership ON public.organizations;
DROP FUNCTION IF EXISTS public.add_owner_membership();
```

---

## Phase 4 — Marketplace Disconnect → `disconnect-marketplace` Edge Function

**Appetite:** 2–3 days. High risk (cascade deletes).

### Current triggers being replaced

| Trigger | Event | What it does |
|---|---|---|
| `trg_marketplace_integrations_before_delete` | BEFORE DELETE | Calls `can_disconnect_marketplace()`, raises if reserved stock exists |
| `trg_marketplace_integrations_after_delete` | AFTER DELETE | Cascades delete to 8 tables using regex-normalized marketplace name |

### Target: new `disconnect-marketplace` edge function

This function must be the **only** way to delete a `marketplace_integrations` row. Direct deletes via the client must be blocked (RLS policy or removed client-side code).

**Function contract:**

```
1. Auth check — verify caller is org admin

2. Reserved stock check (replaces before_delete trigger)
   - Query marketplace_item_product_links JOIN products_stock
   - If any product has reserved > 0, return 409 with structured error:
     { error: "RESERVED_STOCK_PRESENT", count: N, products: [...] }

3. Delete marketplace_integrations row
   - Use admin client (bypasses RLS)

4. Cascade deletes (replaces after_delete trigger) — explicit, in order:
   a. marketplace_item_product_links   WHERE org + marketplace (regex-normalized)
   b. marketplace_item_descriptions    WHERE org + marketplace
   c. marketplace_item_prices          WHERE org + marketplace
   d. marketplace_stock_distribution   WHERE org + marketplace
   e. marketplace_items_raw            WHERE org + marketplace
   f. marketplace_items                WHERE org + marketplace
   g. marketplace_orders_raw           WHERE org + marketplace
   h. marketplace_orders               WHERE org + marketplace (if table exists)
   i. marketplace_metrics              WHERE org + marketplace (if table exists)
   j. orders (Cycle 0)                 WHERE org + marketplace — ADD WHEN TABLE EXISTS

5. Return { ok: true, deleted: { items: N, orders: N, ... } }
```

### Marketplace name normalization

The current trigger normalizes marketplace names with:
```sql
regexp_replace(lower(marketplace_name), '\s|-', '_', 'g')
```
Port this to TypeScript:
```typescript
const normalizeName = (name: string) => name.toLowerCase().replace(/[\s-]/g, '_');
```

Use it on both sides of every delete WHERE clause.

### Important: Cycle 0 note

The `after_delete` trigger does **not** cascade to `orders`, `order_items`, `order_shipping` (Cycle 0 tables that don't exist yet). When Cycle 0 tables are created, **step 4j must be added** to this edge function before deploying Cycle 0 data. Document this as a pre-Cycle-0 checklist item.

### Drop order

1. Add RLS policy or remove client-side delete capability (make direct DELETE impossible without the edge function).
2. Deploy `disconnect-marketplace` edge function.
3. Test: connect ML → disconnect ML → verify all 8 tables are cleared → verify reserved stock blocks disconnect.
4. Drop triggers:
```sql
DROP TRIGGER IF EXISTS trg_marketplace_integrations_before_delete ON public.marketplace_integrations;
DROP TRIGGER IF EXISTS trg_marketplace_integrations_after_delete ON public.marketplace_integrations;
DROP FUNCTION IF EXISTS public.trg_marketplace_integrations_before_delete();
DROP FUNCTION IF EXISTS public.trg_marketplace_integrations_after_delete();
DROP FUNCTION IF EXISTS public.can_disconnect_marketplace(uuid, text);
```

---

## Phase 5 — Auth Caps → Auth Callback Edge Functions

**Appetite:** < 1 day. Low risk.

### Current trigger

`trg_marketplace_integrations_sync_caps` — BEFORE INSERT, UPDATE on `marketplace_integrations`.

Parses `shipping_preferences` JSONB, sets three boolean columns: `drop_off`, `xd_drop_off`, `self_service`.

### Target: auth callback edge functions

The logic moves into `mercado-livre-callback` (and any future Shopee auth callback) — compute the booleans before the upsert, include them in the payload:

```typescript
function parseShippingCaps(shippingPreferences: unknown) {
  let drop_off = false, xd_drop_off = false, self_service = false;
  const logistics = (shippingPreferences as any)?.logistics ?? [];
  for (const l of logistics) {
    for (const t of l?.types ?? []) {
      const status = t?.status?.toLowerCase() ?? '';
      if (['active','enabled','true'].includes(status)) {
        if (t.type === 'drop_off')     drop_off = true;
        if (t.type === 'xd_drop_off')  xd_drop_off = true;
        if (t.type === 'self_service') self_service = true;
      }
    }
  }
  return { drop_off, xd_drop_off, self_service };
}
```

Include `{ ...parseShippingCaps(shippingPreferences), ... }` in the `marketplace_integrations` upsert payload.

### Also: fix the missing UNIQUE constraint

Phase 5 is the right time to add the `UNIQUE (organizations_id, marketplace_name)` constraint that makes the UPSERT in `mercado-livre-callback` work. Without it, reconnecting a marketplace will fail at runtime.

```sql
-- Apply when ready (not now):
ALTER TABLE public.marketplace_integrations
  ADD CONSTRAINT uq_marketplace_integrations_org_marketplace
  UNIQUE (organizations_id, marketplace_name);
```

### Drop order

1. Deploy updated `mercado-livre-callback` with `parseShippingCaps` included in upsert payload.
2. Apply UNIQUE constraint migration.
3. Verify: connect ML → `drop_off` / `xd_drop_off` / `self_service` columns populated correctly.
4. Drop trigger:
```sql
DROP TRIGGER IF EXISTS trg_marketplace_integrations_sync_caps ON public.marketplace_integrations;
DROP FUNCTION IF EXISTS public.marketplace_integrations_sync_caps();
```

---

## Phase 6 — Order Processing Triggers → Cycle 0 Edge Functions

**Appetite:** 2–3 weeks. Blocked on Cycle 0 data model.

> **This phase is tied to Cycle 0.** The triggers in this phase process data into `marketplace_orders_presented_new` (the 87-column table). Cycle 0 replaces that table with `orders` / `order_items` / `order_shipping`. The natural migration is: build the new edge functions writing to new tables, then drop the old triggers alongside the old table.

### Triggers being replaced

| Trigger | Table | What it does | Target |
|---|---|---|---|
| `on_marketplace_orders_raw_change_new` | `marketplace_orders_raw` | Full Shopee order pipeline (25KB SQL) | `shopee-process-order` edge function |
| `trg_presented_new_items_refresh_insert` | `marketplace_orders_presented_new` | Calls `refresh_presented_order` on INSERT | Deleted with presented_new table |
| `trg_presented_new_linked_products_refresh` | `marketplace_orders_presented_new` | Calls `refresh_presented_order` on linked_products change | Deleted with presented_new table |
| `trg_marketplace_orders_presented_new_stock_flow` | `marketplace_orders_presented_new` | Creates inventory_jobs rows based on status_interno Portuguese labels | `update-order-status` edge function |
| `trg_marketplace_orders_presented_new_inventory_on_cancel` | `marketplace_orders_presented_new` | Shopee-only direct stock refund on cancel | `handle-order-cancel` edge function |

---

### 6A — `shopee-process-order` (replaces `process_marketplace_order_presented_new`)

The current trigger is ~25KB of PL/pgSQL that parses Shopee JSONB and writes to `marketplace_orders_presented_new`. The new edge function writes to the Cycle 0 `orders` / `order_items` / `order_shipping` tables instead.

**Current trigger behavior to replicate:**

```
Input: marketplace_orders_raw row (NEW)
Guard: skip if marketplace_name != 'Shopee'
Guard: skip if order_status = 'UNPAID'

Parse from JSONB:
  - order_status (raw + lowercased)
  - logistics_status
  - invoice_pending flag (invoice_data.invoice_status == 'pending' OR no invoice_number)
  - fulfillment_ready flag (logistics_status IN ['logistics_ready','logistics_request_created'])
  - pickup_done flag (pickup_done_time IS NOT NULL)
  - shipping_carrier
  - order_total, payment_total (multiple fallback JSONB paths, numeric coercion)
  - buyer: name, id, city, town, region, state → UF mapping, zip, address_line
  - items: count, total_quantity, total_amount, total_full_amount, total_sale_fee
  - commission_fee, service_fee
  - first item: id, title, sku, variation_id, color names, has_variations
  - linked_products (from marketplace_order_items join)
  - has_unlinked_items, unlinked_items_count
  - shipping_type, shipment_status, shipment_substatus
  - is_full, is_cancelled, is_refunded, is_returned
  - label data (printed_label, printed_schedule, label_content_base64, pdf, zpl2)
  - pack_id

Compute status_interno (Portuguese internal status):
  - Based on: order_status, invoice_pending, fulfillment_ready, pickup_done, is_cancelled
  - Maps to: 'Aguardando Pagamento', 'Emissao NF', 'Aguardando Coleta', 'Pronto p/ Envio',
             'Enviado', 'Entregue', 'Cancelado', etc.

UPSERT marketplace_orders_presented_new (87 columns)
UPSERT marketplace_order_items (DELETE + INSERT pattern)

On exception: write error details back into presented row
```

**New edge function contract (Cycle 0):**

```typescript
// Input: marketplace_orders_raw row (from webhook or sync function)
// Output: writes to orders + order_items + order_shipping

interface ShopeeOrderInput {
  raw_id: string;           // marketplace_orders_raw.id
  organization_id: string;
  marketplace_order_id: string;
  data: unknown;            // raw Shopee JSONB
}

// Steps:
// 1. Parse JSONB (port existing PL/pgSQL parsing logic to TypeScript)
// 2. Map to Cycle 0 schema (orders, order_items, order_shipping)
// 3. UPSERT orders ON CONFLICT (organization_id, marketplace_order_id)
// 4. UPSERT order_items ON CONFLICT (order_id, sku)
// 5. UPSERT order_shipping ON CONFLICT (order_id)
// 6. Structured error logging (never swallow)
```

**Critical: Brazilian state UF mapping**
The current function has a hardcoded state→UF lookup table embedded in SQL. Port this to a TypeScript constant in `_shared/`.

---

### 6B — `update-order-status` (replaces `trg_presented_new_stock_flow`)

**Current trigger behavior:**

Fires on UPDATE to `marketplace_orders_presented_new` when `status_interno`, `status`, `shipment_status`, `shipment_substatus`, or `has_unlinked_items` changes. Creates `inventory_jobs` rows:

| Condition | Job |
|---|---|
| Any cancel signal in status fields | `refund` |
| `status_interno` IN ('Emissao NF','Impressao','Aguardando Coleta') AND fully linked | `reserve` |
| `status_interno` = 'Enviado' | `consume` |

**New edge function contract (Cycle 0):**

The new `orders.internal_status` replaces `status_interno`. The Portuguese labels must be mapped to an enum:

```typescript
type InternalStatus =
  | 'invoice_pending'    // was: 'Emissao NF'
  | 'printing'           // was: 'Impressao'
  | 'awaiting_pickup'    // was: 'Aguardando Coleta'
  | 'shipped'            // was: 'Enviado'
  | 'delivered'          // was: 'Entregue'
  | 'cancelled';         // was: 'Cancelado'
```

The edge function that transitions an order's status must explicitly enqueue the inventory job:

```typescript
async function transitionOrderStatus(orderId: string, newStatus: InternalStatus) {
  await admin.from("orders").update({ internal_status: newStatus }).eq("id", orderId);

  if (newStatus === 'cancelled') {
    await enqueueInventoryJob(orderId, 'refund');
  } else if (['invoice_pending','printing','awaiting_pickup'].includes(newStatus)) {
    await enqueueInventoryJob(orderId, 'reserve');
  } else if (newStatus === 'shipped') {
    await enqueueInventoryJob(orderId, 'consume');
  }
}
```

---

### 6C — `handle-order-cancel` (replaces `trg_presented_new_inventory_on_cancel`)

**Current trigger behavior:**
Shopee-only. On cancel signals, immediately calls `refund_reserved_stock_for_order(order_id, storage_id)` — synchronous, within the DB transaction.

**Double-refund issue with 6B:**
Both 6B (async `refund` job) and this trigger (sync direct refund) currently fire on Shopee cancel. After migration, there must be exactly ONE cancel handler. Decision: use the `inventory_jobs` queue (async, via 6B). Do not replicate the direct synchronous refund in the new edge function.

**Port `refund_reserved_stock_for_order` logic to the inventory job worker:**

The job worker that processes `inventory_jobs` of type `refund` should run the logic currently in `refund_reserved_stock_for_order`:
1. Fetch order items from `order_items` (Cycle 0) or `marketplace_orders_raw.order_items`
2. Resolve `product_id` for each item via `marketplace_item_product_links`
3. Check `inventory_transactions` for existing `CANCELAMENTO_RESERVA` (idempotency)
4. `UPDATE products_stock SET reserved = GREATEST(reserved - qty, 0)`
5. `INSERT INTO inventory_transactions` with `movement_type = 'CANCELAMENTO_RESERVA'`

---

### 6D — Drop `refresh_presented_order` and its callers

`trg_presented_new_items_refresh_insert` and `trg_presented_new_linked_products_refresh` both call `refresh_presented_order` (47KB function). These exist to rebuild denormalized data on `marketplace_orders_presented_new`.

When Cycle 0 replaces `marketplace_orders_presented_new` with normalized `orders` + `order_items`, there is nothing to refresh. **These triggers and `refresh_presented_order` are deleted as part of dropping the presented_new table.**

No replacement edge function needed.

---

### Phase 6 drop order

Only after ALL Cycle 0 edge functions are live and writing to new tables:

```sql
DROP TRIGGER IF EXISTS on_marketplace_orders_raw_change_new ON public.marketplace_orders_raw;
DROP TRIGGER IF EXISTS trg_presented_new_items_refresh_insert ON public.marketplace_orders_presented_new;
DROP TRIGGER IF EXISTS trg_presented_new_linked_products_refresh ON public.marketplace_orders_presented_new;
DROP TRIGGER IF EXISTS trg_marketplace_orders_presented_new_stock_flow ON public.marketplace_orders_presented_new;
DROP TRIGGER IF EXISTS trg_marketplace_orders_presented_new_inventory_on_cancel ON public.marketplace_orders_presented_new;

DROP FUNCTION IF EXISTS public.process_marketplace_order_presented_new();
DROP FUNCTION IF EXISTS public.refresh_presented_order(uuid);
DROP FUNCTION IF EXISTS public.trg_presented_new_items_refresh();
DROP FUNCTION IF EXISTS public.trg_presented_new_linked_products_refresh();
DROP FUNCTION IF EXISTS public.trg_presented_new_stock_flow();
DROP FUNCTION IF EXISTS public.trg_presented_new_inventory_on_cancel();
DROP FUNCTION IF EXISTS public.refund_reserved_stock_for_order(uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_get_default_storage(uuid);
```

---

## Phase 7 — Linked Products → `link-order-product` Edge Function

**Appetite:** 1 day. Blocked on Phase 6 (depends on Cycle 0 `order_items` table).

### Current trigger (with bug)

`trg_moi_linked_update` → `trg_marketplace_order_items_linked_update`
**Table:** `marketplace_order_items` — AFTER UPDATE

**Bug:** Uses `WHERE p.id = NEW.id` to update `marketplace_orders_presented_new` — but `NEW.id` is an `order_item` ID, not an `order` ID. The update hits zero rows. `has_unlinked_items` is never actually updated.

### Target: `link-order-product` edge function

This edge function already exists (it handles the product linking UI flow). It must be updated to explicitly set `has_unlinked_items` after linking/unlinking:

```typescript
// After updating order_items.linked_products:
const { count } = await admin
  .from("order_items")
  .select("id", { count: "exact", head: true })
  .eq("order_id", orderId)
  .is("product_id", null);  // Cycle 0: product_id null = unlinked

await admin
  .from("orders")
  .update({ has_unlinked_items: count > 0 })
  .eq("id", orderId);
```

### Drop order

1. Update `link-order-product` edge function with correct `has_unlinked_items` logic.
2. Verify: link a product → `has_unlinked_items` updates correctly on the order.
3. Drop trigger:
```sql
DROP TRIGGER IF EXISTS trg_moi_linked_update ON public.marketplace_order_items;
DROP FUNCTION IF EXISTS public.trg_marketplace_order_items_linked_update();
```

---

## What Stays in the DB (Final State)

```
updated_at / set_updated_at triggers — keep forever
All business-logic triggers — removed by end of Phase 7
```

The final `information_schema.triggers` query should return only:
- `update_ads_updated_at`
- `update_apps_updated_at`
- `chat_channels_updated_at`
- `chat_unread_counts_set_updated_at`
- `update_companies_updated_at`
- `set_updated_at_company_tax_configs`
- `marketplace_drafts_updated_at`
- `update_module_actions_updated_at`
- `update_organization_members_updated_at`
- `update_product_kit_items_updated_at`
- `update_system_modules_updated_at`
- `tasks_set_updated_at`
- `set_updated_at_tax_rules_catalog`
- `update_user_invitations_updated_at`
- `update_user_organization_settings_updated_at`
- `update_user_profiles_updated_at`
- `update_users_updated_at`

---

## Checklist Per Phase

Before dropping any trigger, confirm:

- [ ] Replacement edge function deployed to production
- [ ] All write paths to the affected table go through the new edge function (no direct client writes)
- [ ] Tested: happy path works end-to-end
- [ ] Tested: error path returns structured error (no silent failures)
- [ ] Trigger dropped via migration
- [ ] `DATABASE_TRIGGERS.md` inventory table updated (Action column → "Done")
- [ ] No remaining references to the dropped function in edge function code

---

## Open Questions Before Starting

1. **Chat write paths:** Are there any edge functions besides `send-message` that write to `chat_messages`? Must audit before Phase 2.
2. **Org creation path:** Is there a `create-organization` edge function today, or does the client write directly? Find before Phase 3.
3. **Marketplace disconnect path:** Is there an existing `disconnect-marketplace` edge function, or does the client call `supabase.from('marketplace_integrations').delete()` directly? Find before Phase 4.
4. **Inventory job worker:** Is there an existing edge function that processes `inventory_jobs` rows? The stock flow migration (Phase 6B) depends on this worker existing.
5. **`link-order-product` edge function name:** Confirm the exact function slug before Phase 7.
