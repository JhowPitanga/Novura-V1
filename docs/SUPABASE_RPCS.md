# Supabase RPC Inventory

Discovery from source code — no migrations read.
All calls found via `grep -r '\.rpc('` across `src/`, `supabase/functions/`, and `api/`.

---

## Summary Table

| RPC Name | Schema | Category | Callers |
|---|---|---|---|
| `rpc_get_user_access_context` | public | Auth | `auth.service.ts` |
| `rpc_bootstrap_user_org` | public | Auth | `auth-on-signup`, `auth.service.ts` |
| `rpc_get_member_permissions` | public | Auth | `mercado-livre-sync-orders`, `mercado-livre-sync-items`, `mercado-livre-sync-stock-distribution`, `mercado-livre-sync-prices`, `manage-users`, `items.ts (WebhooksAPI)` |
| `get_user_organization_id` | public | Auth | `manage-users`, `upload-company-certificate`, `orders.service.ts` |
| `get_current_user_organization_id` | public | Auth | `InvoiceActions.tsx`, `NfeEmissionList.tsx`, `useProducts.ts`, `LinkOrderModal.tsx` |
| `is_org_member` | public | Auth | `focus-nfe-sync`, `focus-company-create`, `focus-nfe-cancel`, `mercado-livre-submit-xml`, `focus-nfe-emit`, `upload-company-certificate` |
| `current_user_has_permission` | public | Auth | `useProductForm.ts` |
| `set_user_permissions` | public | Admin | `NovuraAdmin.tsx` |
| `bulk_set_module_enabled` | public | Admin | `manage-users` |
| `set_global_module_switch` | public | Admin | `manage-users` |
| `disconnect_marketplace_cascade` | public | Marketplace | `Apps.tsx` |
| `upsert_marketplace_order_raw` | public | Orders (legacy) | `mercado-livre-webhook-orders` |
| `upsert_marketplace_order_raw_shopee` | public | Orders (legacy) | `shopee-sync-orders`, `shopee-webhook-orders` |
| `fn_order_reserva_stock_linked` | public | Inventory | `mercado-livre-process-presented`, `LinkOrderModal.tsx` |
| `fn_get_default_storage` | public | Inventory | `inventory-jobs-worker`, `linked_products_item`, `mercado-livre-process-presented` |
| `reserve_stock_for_order` | public | Inventory | `inventory-jobs-worker`, `linked_products_item` |
| `consume_reserved_stock_for_order` | public | Inventory | `inventory-jobs-worker` |
| `refund_reserved_stock_for_order` | public | Inventory | `inventory-jobs-worker` |
| `upsert_product_stock` | public | Inventory | `InventoryManagementDrawer.tsx` |
| `duplicate_product` | public | Products | `useVariations.ts`, `useKits.ts` |
| `fn_reservar_e_numerar_notas` | public | NFe | `focus-nfe-emit` |
| `rpc_queues_emit` | public | NFe Queue | `orders.service.ts`, `NfeEmissionList.tsx` |
| `q_submit_xml_send` | public | NFe Queue | `orders.service.ts` |
| `q_emit_focus_read` | public | NFe Queue | `emit-queue-consume` |
| `q_submit_xml_read` | public | NFe Queue | `emit-queue-consume` |
| `q_emit_focus_delete` | public | NFe Queue | `emit-queue-consume` |
| `q_submit_xml_delete` | public | NFe Queue | `emit-queue-consume` |
| `rpc_marketplace_order_print_label` | public | Orders | `orders.service.ts` |
| `mark_channel_read` | public | Chat | `Team.tsx`, `ChatTab.tsx` |
| `search_org_members` | public | Chat | `Team.tsx`, `ChatTab.tsx`, `useChat.ts` |
| `get_channel_messages_plain` | public | Chat | `useChat.ts` |
| `get_message_plain` | public | Chat | `useChat.ts` |
| `rpc_create_mock_orders_emissao_nf` | public | Dev/Test | `NfeEmissionList.tsx` |
| `send` | pgmq_public | Queue (PGMQ) | `orders-queue-adapter.ts` |
| `read` | pgmq_public | Queue (PGMQ) | `orders-queue-adapter.ts` |
| `archive` | pgmq_public | Queue (PGMQ) | `orders-queue-adapter.ts` |

---

## Auth & Access Control

### `rpc_get_user_access_context`

**Called by:** `src/services/auth.service.ts`

**Parameters:**
```ts
{ p_user_id: string }
```

**Returns:** Single row with:
```ts
{
  organization_id: string | null,
  permissions: Record<string, Record<string, boolean>>,  // { module: { action: true } }
  role: string,                // e.g. "admin", "member"
  global_role: string | null,  // e.g. "super_admin"
  module_switches: Record<string, any>,
  display_name: string | null
}
```

**Purpose:** Single-call bootstrap for the auth context. Replaces 4–5 separate queries (org membership, permissions, role, module switches). Result is sessionStorage-cached for 5 minutes by `auth.service.ts`.

**Tables touched (inferred):** `organization_members`, `permissions`, `system_modules`, `organizations`

---

### `rpc_bootstrap_user_org`

**Called by:** `supabase/functions/auth-on-signup/index.ts`, `src/services/auth.service.ts`

**Parameters:**
```ts
{ p_user_id: string }
```

**Returns:** void / ignored

**Purpose:** Creates the default organization and member row for a newly signed-up user. Idempotent — safe to call more than once. Called immediately after `auth.users` INSERT (via `auth-on-signup` trigger hook) and also defensively on login if org is null.

**Tables touched (inferred):** `organizations`, `organization_members`

---

### `rpc_get_member_permissions`

**Called by:** `mercado-livre-sync-orders`, `mercado-livre-sync-items`, `mercado-livre-sync-stock-distribution`, `mercado-livre-sync-prices`, `manage-users`, `src/WebhooksAPI/marketplace/mercado-livre/items.ts`

**Parameters:**
```ts
{ p_user_id: string, p_organization_id: string }
```

**Returns:** Permissions object or row (exact shape varies by caller — callers check for specific module/action pairs).

**Purpose:** Authorization guard in edge functions. Used to verify the requesting user has the right permission before performing sensitive operations (sync, price update, stock distribution, etc.).

**Tables touched (inferred):** `organization_members`, `permissions`

---

### `get_user_organization_id`

**Called by:** `manage-users`, `upload-company-certificate`, `src/services/orders.service.ts`

**Parameters:**
```ts
{ p_user_id: string }
```

**Returns:** `string` — the organization UUID

**Purpose:** Resolves the organization for a given user. Used in edge functions that receive a `user_id` from JWT but need the `organization_id` for subsequent DB queries.

**Tables touched (inferred):** `organization_members`

---

### `get_current_user_organization_id`

**Called by:** `src/components/invoices/InvoiceActions.tsx`, `src/components/orders/NfeEmissionList.tsx`, `src/hooks/useProducts.ts`, `src/components/orders/LinkOrderModal.tsx`

**Parameters:** none (uses current auth session)

**Returns:** `string` — the organization UUID

**Purpose:** Frontend shortcut — avoids passing org_id through props by letting Postgres resolve it from `auth.uid()`. Equivalent to `get_user_organization_id` but for the currently authenticated browser user.

**Tables touched (inferred):** `organization_members`

---

### `is_org_member`

**Called by:** `focus-nfe-sync`, `focus-company-create`, `focus-nfe-cancel`, `mercado-livre-submit-xml`, `focus-nfe-emit`, `upload-company-certificate`

**Parameters:**
```ts
{ p_user_id: string, p_org_id: string }
```

**Returns:** `boolean`

**Purpose:** Authorization guard in edge functions. Confirms the requesting user belongs to the organization before performing operations like NFe emission, certificate upload, or company creation. All callers return 403 if false.

**Tables touched (inferred):** `organization_members`

---

### `current_user_has_permission`

**Called by:** `src/hooks/useProductForm.ts`

**Parameters:**
```ts
{ p_module_name: string, p_action_name: string }
// e.g. { p_module_name: 'produtos', p_action_name: 'create' }
```

**Returns:** `boolean`

**Purpose:** Fine-grained permission check from the frontend before showing UI elements or submitting forms. Differs from `rpc_get_member_permissions` in that it checks a single action instead of returning the full permission map.

**Tables touched (inferred):** `organization_members`, `permissions`

---

## Admin (Novura Super-Admin)

### `set_user_permissions`

**Called by:** `src/pages/NovuraAdmin.tsx`

**Parameters:** (exact shape not captured — called with an object of permission flags)

**Purpose:** Super-admin override to set/update user permissions. Accessible only to global admins via the internal admin panel.

**Tables touched (inferred):** `permissions`

---

### `bulk_set_module_enabled`

**Called by:** `supabase/functions/manage-users/index.ts`

**Parameters:** (array of module IDs + org_id inferred from context)

**Purpose:** Enables or disables multiple system modules for an organization in a single atomic call. Used by the user management edge function to batch-toggle module visibility.

**Tables touched (inferred):** `system_modules`, `organization_modules` (or similar junction table)

---

### `set_global_module_switch`

**Called by:** `supabase/functions/manage-users/index.ts`

**Parameters:** (module name + boolean flag inferred)

**Purpose:** Platform-level toggle for a module (affects all orgs). Admin-only.

**Tables touched (inferred):** `system_modules`

---

## Marketplace

### `disconnect_marketplace_cascade`

**Called by:** `src/pages/Apps.tsx`

**Parameters:**
```ts
{ p_organizations_id: string, p_marketplace_name: string }
// e.g. { ..., p_marketplace_name: "Mercado Livre" }
```

**Returns:** void

**Purpose:** Removes a marketplace integration and cascades deletion to all dependent tables (tokens, raw orders, items, pricing data, etc.). Avoids leaving orphan rows across the 8+ tables that reference `marketplace_integrations`.

**Note:** The existing DB trigger `trg_marketplace_integrations_after_delete` also cascades on DELETE (via regex name matching). This RPC likely wraps or replaces that trigger for controlled soft deletes. See `docs/DATABASE_TRIGGERS.md` for the trigger details.

**Tables touched (inferred):** `marketplace_integrations`, `marketplace_orders_raw`, `marketplace_items`, `marketplace_item_descriptions`, `marketplace_item_prices`, `marketplace_stock_distribution`, + others matched by trigger regex

---

## Orders — Legacy Pipeline (`marketplace_orders_raw`)

These two RPCs write to the `marketplace_orders_raw` table, which is the raw archive used by the **pre-Cycle 0** pipeline. The Cycle 0 pipeline (orders-sync-ml, orders-sync-shopee) bypasses them entirely.

### `upsert_marketplace_order_raw`

**Called by:** `supabase/functions/mercado-livre-webhook-orders/index.ts` (deprecated)

**Parameters:**
```ts
{
  p_organizations_id: string,
  p_company_id: string,
  p_marketplace_name: string,          // "Mercado Livre"
  p_marketplace_order_id: string,
  p_status: string | null,
  p_status_detail: string | null,
  p_order_items: object[],
  p_buyer: object | null,
  p_seller: object | null,
  p_payments: object[],
  p_shipments: object,
  p_feedback: object | null,
  p_tags: string[],
  p_data: object,                      // full ML response
  p_date_created: string | null,
  p_date_closed: string | null,
  p_last_updated: string | null,
  p_last_synced_at: string,
}
```

**Returns:** `string` — the `marketplace_orders_raw.id` UUID

**Purpose:** Atomic upsert of a fully enriched ML order (including payments, shipments, billing info) into `marketplace_orders_raw`. The ML webhook pre-fetches all enrichment data before calling this RPC, so the function performs only one DB round-trip. After successful upsert, the webhook invokes `mercado-livre-process-presented`.

**Tables touched:** `marketplace_orders_raw`

---

### `upsert_marketplace_order_raw_shopee`

**Called by:** `supabase/functions/shopee-sync-orders/index.ts`, `supabase/functions/shopee-webhook-orders/index.ts` (deprecated)

**Parameters:**
```ts
{
  p_organizations_id: string,
  p_company_id: string,
  p_marketplace_name: string,          // "Shopee"
  p_marketplace_order_id: string,      // order_sn
  p_data: object,                      // combined Shopee order data
}
```

**Returns:** `string` — the `marketplace_orders_raw.id` UUID

**Purpose:** Shopee equivalent of `upsert_marketplace_order_raw`. Simpler parameter set — Shopee order data is passed as a single JSON blob rather than broken out into typed columns. After upsert, callers invoke `shopee-process-presented`.

**Tables touched:** `marketplace_orders_raw`

---

## Inventory / Stock

### `fn_get_default_storage`

**Called by:** `inventory-jobs-worker`, `linked_products_item`, `mercado-livre-process-presented`

**Parameters:**
```ts
{ p_org_id: string }
```

**Returns:** `string` — storage UUID (the org's default `storages` row)

**Purpose:** Resolves the organization's default storage location. Required before any stock reservation/consumption because inventory functions operate per-storage. All callers abort if this returns null.

**Tables touched (inferred):** `storages`

---

### `fn_order_reserva_stock_linked`

**Called by:** `supabase/functions/mercado-livre-process-presented/index.ts`, `src/components/orders/LinkOrderModal.tsx`

**Parameters:**
```ts
{
  p_order_id: string,       // marketplace_orders_presented_new.id
  p_items: Array<{
    product_id: string,
    quantity: number,
    variation_id?: string
  }>,
  p_storage_id: string
}
```

**Returns:** Object indicating reservation result (callers log it but don't branch on individual item results)

**Purpose:** Reserves stock for an order's linked products. Called after linking products to a presented order, both during automated sync (`mercado-livre-process-presented`) and manual linking via the `LinkOrderModal` UI. Idempotent — subsequent calls for an already-reserved order are safe.

**Tables touched (inferred):** `inventory_transactions`, `product_stock`, `marketplace_orders_presented_new`

---

### `reserve_stock_for_order`

**Called by:** `inventory-jobs-worker`, `linked_products_item`

**Parameters:**
```ts
{ p_order_id: string, p_storage_id: string }
```

**Returns:** void

**Purpose:** Transitions order stock from `available` → `reserved`. Triggered by `inventory_jobs` rows with `job_type = 'reserve'` (created by the `trg_presented_new_stock_flow` DB trigger on status transitions like "Emissao NF"). Part of the async stock flow via `inventory_jobs_worker`.

**Tables touched (inferred):** `inventory_transactions`, `product_stock`

---

### `consume_reserved_stock_for_order`

**Called by:** `inventory-jobs-worker`

**Parameters:**
```ts
{ p_order_id: string, p_storage_id: string }
```

**Returns:** void

**Purpose:** Finalizes stock consumption — moves `reserved` → `consumed`. Triggered for orders transitioning to "shipped" or equivalent statuses (mapped to Portuguese labels by DB trigger: "Impressao", "Aguardando Coleta", "Enviado").

**Tables touched (inferred):** `inventory_transactions`, `product_stock`

---

### `refund_reserved_stock_for_order`

**Called by:** `inventory-jobs-worker`

**Parameters:**
```ts
{ p_order_id: string, p_storage_id: string }
```

**Returns:** void

**Purpose:** Returns reserved stock to `available` on order cancellation. Note: a DB trigger (`trg_presented_new_stock_flow`) also calls `refund_reserved_stock_for_order()` directly (sync) for Shopee cancellations, creating a double-execution risk. The `inventory_transactions` idempotency check prevents double-deduction, but the async job queue still runs.

**Tables touched (inferred):** `inventory_transactions`, `product_stock`

---

### `upsert_product_stock`

**Called by:** `src/components/inventory/InventoryManagementDrawer.tsx`

**Parameters:** (inferred — a stock record with product_id, storage_id, quantity)

**Returns:** void

**Purpose:** Upserts a product's stock quantity in a specific storage. Used by the inventory management UI drawer to manually set stock levels.

**Tables touched (inferred):** `product_stock`

---

## Products

### `duplicate_product`

**Called by:** `src/hooks/useVariations.ts`, `src/hooks/useKits.ts`

**Parameters:**
```ts
{ original_product_id: string }
```

**Returns:** new product UUID (inferred from hook code that navigates to the new product)

**Purpose:** Deep-copies a product (including variations, kit components, and linked marketplace items) into a new row. Used by the UI "Duplicate" action on product cards and variation groups.

**Tables touched (inferred):** `products`, `product_variations`, `product_kit_items`, `marketplace_items` (unlinks new copy from marketplace listings)

---

## NFe (Fiscal Notes)

### `fn_reservar_e_numerar_notas`

**Called by:** `supabase/functions/focus-nfe-emit/index.ts`

**Parameters:**
```ts
{
  p_company_id: string,
  p_order_id: string,
  p_emissao_ambiente: "homologacao" | "producao",
  p_payload: object,                    // Focus NFeS emission payload (mutated by RPC)
  p_marketplace: string,
  p_marketplace_order_id: string,
  p_pack_id: string | null,
  p_tipo: string,                       // "Saída"
  p_total_value: number
}
```

**Returns:**
```ts
{
  payload: object,   // updated payload with assigned NF number/series
  numero: number,    // assigned NF number
  serie: string      // assigned NF series
}
```

**Purpose:** Atomically assigns a sequential NF number and series to an order, and creates/updates the `notas_fiscais` (invoices) row. Returns the mutated payload so `focus-nfe-emit` can proceed with the correct reference. Prevents duplicate NF numbers under concurrent emission requests.

**Tables touched (inferred):** `notas_fiscais`, `companies` (for NF number counter)

---

## NFe Queue (Custom PGMQ Wrappers)

These RPCs are wrappers around PGMQ queue functions, exposed as named RPCs to the Supabase Data API. Two queues exist: `q_emit_focus` (NFe emission jobs) and `q_submit_xml` (marketplace XML submission jobs).

### `rpc_queues_emit`

**Called by:** `src/services/orders.service.ts` (via `emitNfeQueue()`), `src/components/orders/NfeEmissionList.tsx`

**Parameters:**
```ts
{
  p_message: {
    organizations_id: string,
    company_id: string,
    environment: "homologacao" | "producao",
    orderIds: string[],
    forceNewNumber: boolean,
    forceNewRef: boolean
  }
}
```

**Returns:** void

**Purpose:** Enqueues an NFe emission batch into `q_emit_focus`. The `emit-queue-consume` edge function polls this queue, dequeues messages, and calls `focus-nfe-emit`.

---

### `q_submit_xml_send`

**Called by:** `src/services/orders.service.ts` (via `submitXmlSend()`)

**Parameters:**
```ts
{
  p_message: {
    organizations_id: string,
    company_id: string,
    nota_fiscal_id: string,
    nfe_key: string,
    marketplace: string
  }
}
```

**Returns:** void

**Purpose:** Enqueues an XML submission job into `q_submit_xml`. The `emit-queue-consume` edge function polls this queue and calls `mercado-livre-submit-xml` or `shopee-submit-xml`.

---

### `q_emit_focus_read`

**Called by:** `supabase/functions/emit-queue-consume/index.ts`

**Parameters:**
```ts
{ p_vt: number, p_qty: number }
// p_vt: visibility timeout in seconds (120s)
// p_qty: batch size
```

**Returns:** Array of queue messages with `msg_id`, `vt`, `message`, `enqueued_at`, `read_ct`

**Purpose:** Dequeues up to `p_qty` messages from `q_emit_focus` with a visibility lock of `p_vt` seconds. Messages not deleted/archived within the TTL become visible again (retry).

---

### `q_submit_xml_read`

**Called by:** `supabase/functions/emit-queue-consume/index.ts`

**Parameters:** Same as `q_emit_focus_read`

**Purpose:** Same pattern for `q_submit_xml`.

---

### `q_emit_focus_delete`

**Called by:** `supabase/functions/emit-queue-consume/index.ts`

**Parameters:**
```ts
{ p_msg_id: number }
```

**Purpose:** Permanently deletes a processed message from `q_emit_focus`. Called after successful NFe emission.

---

### `q_submit_xml_delete`

**Called by:** `supabase/functions/emit-queue-consume/index.ts`

**Parameters:**
```ts
{ p_msg_id: number }
```

**Purpose:** Permanently deletes a processed message from `q_submit_xml`.

---

## Orders — UI Operations

### `rpc_marketplace_order_print_label`

**Called by:** `src/services/orders.service.ts` (via `markOrdersPrinted()`)

**Parameters:**
```ts
{ p_order_ids: string[] }
```

**Returns:** void

**Purpose:** Batch-marks orders as "label printed". Updates a printed flag or timestamp across the supplied order IDs. Used after the print dialog completes.

**Tables touched (inferred):** `marketplace_orders_presented_new` or `order_labels` (Cycle 0)

---

## Chat / Team Collaboration

### `mark_channel_read`

**Called by:** `src/pages/Team.tsx`, `src/components/team/ChatTab.tsx`

**Parameters:**
```ts
{ p_channel_id: string }
```

**Returns:** void

**Purpose:** Updates the read cursor for `auth.uid()` on a chat channel. Resets unread message count. Called on channel focus and on new message receipt by the current user.

**Tables touched (inferred):** `channel_members` or `channel_read_cursors`

---

### `search_org_members`

**Called by:** `src/pages/Team.tsx`, `src/components/team/ChatTab.tsx`, `src/hooks/useChat.ts`

**Parameters:**
```ts
{ p_org_id: string, p_term: string | null, p_limit: number }
// p_term: null or empty string returns all members (up to limit)
// p_term with 2+ chars triggers text search
```

**Returns:** Array of member rows (name, avatar, user_id, etc.)

**Purpose:** Searchable member directory for @-mention autocomplete in chat and for the team member list. Returns all members when `p_term` is null.

**Tables touched (inferred):** `organization_members`, `auth.users` or `profiles`

---

### `get_channel_messages_plain`

**Called by:** `src/hooks/useChat.ts`

**Parameters:**
```ts
{ p_channel_id: string, p_before: string, p_limit: number }
// p_before: ISO timestamp cursor for pagination
```

**Returns:** Array of message rows (plaintext — no encryption overhead)

**Purpose:** Paginated chat message history for a channel. The `_plain` suffix suggests a decrypted/readable variant (vs. an encrypted storage format). Returns messages before `p_before` for infinite-scroll backwards pagination.

**Tables touched (inferred):** `channel_messages`

---

### `get_message_plain`

**Called by:** `src/hooks/useChat.ts`

**Parameters:**
```ts
{ p_message_id: string }
```

**Returns:** Single message row

**Purpose:** Fetches a single decrypted message by ID. Used when a real-time subscription delivers a new message event — the event contains only the ID, so a follow-up fetch is needed for content.

**Tables touched (inferred):** `channel_messages`

---

## Dev / Testing

### `rpc_create_mock_orders_emissao_nf`

**Called by:** `src/components/orders/NfeEmissionList.tsx`

**Parameters:** none

**Returns:** void

**Purpose:** Seeds mock orders in the correct "Emissao NF" status for testing the NFe emission flow. Should be removed or gated behind a dev-only flag before production.

**Tables touched (inferred):** `marketplace_orders_presented_new`

---

## PGMQ — Orders Sync Queue

These are not custom Supabase RPCs but calls on the `pgmq_public` schema (Supabase Queues). They operate on the `orders_sync` queue introduced in Cycle 0.

### `pgmq_public.send`

**Called by:** `supabase/functions/_shared/adapters/orders-queue/orders-queue-adapter.ts`

**Parameters:**
```ts
{ queue_name: "orders_sync", message: OrderSyncQueueMessage }
```

**`OrderSyncQueueMessage` union:**
```ts
// ML variant
{ marketplace: "mercado_livre", marketplace_order_id: string, meli_user_id: string }
// Shopee variant
{ marketplace: "shopee", order_sn: string, shop_id: number }
```

**Returns:** `bigint` — message ID

**Purpose:** Enqueues an order sync event. Called by `orders-webhook` immediately after payload validation — no marketplace API calls, no DB writes other than the queue row.

---

### `pgmq_public.read`

**Called by:** `orders-queue-adapter.ts` (via `readBatch()`)

**Parameters:**
```ts
{ queue_name: "orders_sync", sleep_seconds: number, n: number }
```

**Returns:** Array of `QueueEnvelope` (msg_id + message payload)

**Purpose:** Dequeues up to `n` messages with a visibility lock of `sleep_seconds`. Called by `orders-queue-worker` to consume sync jobs.

---

### `pgmq_public.archive`

**Called by:** `orders-queue-adapter.ts` (via `archive()`)

**Parameters:**
```ts
{ queue_name: "orders_sync", msg_id: number }
```

**Returns:** void

**Purpose:** Archives a successfully processed message (moves it to the PGMQ archive table rather than deleting). Archive failure is logged but does not re-throw — an already-processed order must not be re-queued due to an archive error.

---

## Notes

### RPC vs Direct Table Access
Most "simple" reads (orders list, product list, integration config) use `supabase.from()` directly. RPCs are used when:
- A multi-table atomic operation is needed (stock, NF numbering)
- Business logic must be co-located with the DB for concurrency safety (NF number sequence)
- The operation crosses auth boundaries (user → org resolution)
- A PGMQ queue operation is required

### Naming Conventions
- `rpc_*` prefix — custom Supabase RPC, generally public-facing
- `fn_*` prefix — PL/pgSQL function called as RPC, more internal
- `q_*` prefix — PGMQ queue operation wrapper
- No prefix — legacy or utility (e.g. `is_org_member`, `duplicate_product`)

### Cycle 0 Impact
The new `orders` table (Cycle 0) will make several RPCs obsolete:
- `upsert_marketplace_order_raw` — replaced by `orders-sync-ml` direct upsert
- `upsert_marketplace_order_raw_shopee` — replaced by `orders-sync-shopee` direct upsert
- `rpc_marketplace_order_print_label` — will need updating to target `order_labels` table
- `fn_order_reserva_stock_linked` — will need updating to reference `order_items` instead of `marketplace_orders_presented_new` items
