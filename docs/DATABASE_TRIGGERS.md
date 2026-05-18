# Database Triggers & Functions — Novura

> **Status as of 2026-02-28** — Understanding-only. No migrations have been applied.
>
> **Intent:** The team plans to migrate business-logic triggers into application code
> (Supabase Edge Functions). This document classifies each trigger by priority and
> provides the rationale. Utility triggers (timestamps, chat infra) should stay in the DB.

---

## Table of Contents

1. [Trigger Inventory (36 rows, 26 distinct triggers)](#trigger-inventory)
2. [Category A — Utility Timestamps (keep in DB)](#category-a--utility-timestamps)
3. [Category B — Chat Infrastructure (keep in DB)](#category-b--chat-infrastructure)
4. [Category C — Organization Bootstrap (keep in DB)](#category-c--organization-bootstrap)
5. [Category D — Marketplace Integrations (move to code)](#category-d--marketplace-integrations)
6. [Category E — Order Processing (move to code — highest priority)](#category-e--order-processing)
7. [Category F — Linked Products (move to code + bugs)](#category-f--linked-products)
8. [Key Functions Called by Triggers](#key-functions-called-by-triggers)
9. [Known Bugs Discovered](#known-bugs-discovered)
10. [Migration Strategy](#migration-strategy)

---

## Trigger Inventory

| Trigger Name | Table | Event | Timing | Function Called | Category | Action |
|---|---|---|---|---|---|---|
| `update_ads_updated_at` | ads | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |
| `update_apps_updated_at` | apps | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |
| `chat_channels_updated_at` | chat_channels | UPDATE | BEFORE | `update_chat_updated_at` | B | Keep |
| `chat_encrypt_on_insert_update` | chat_messages | INSERT, UPDATE | BEFORE | `chat_encrypt_on_write` | B | Keep |
| `chat_messages_create_notifications` | chat_messages | INSERT | AFTER | `create_chat_notifications_on_message` | B | Keep |
| `chat_messages_increment_unread` | chat_messages | INSERT | AFTER | `increment_unread_on_message` | B | Keep |
| `chat_unread_counts_set_updated_at` | chat_unread_counts | UPDATE | BEFORE | `set_updated_at` | A | Keep |
| `update_companies_updated_at` | companies | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |
| `set_updated_at_company_tax_configs` | company_tax_configs | UPDATE | BEFORE | `set_updated_at` | A | Keep |
| `marketplace_drafts_updated_at` | marketplace_drafts | UPDATE | BEFORE | `set_updated_at` | A | Keep |
| `trg_marketplace_integrations_after_delete` | marketplace_integrations | DELETE | AFTER | `trg_marketplace_integrations_after_delete` | D | Move |
| `trg_marketplace_integrations_before_delete` | marketplace_integrations | DELETE | BEFORE | `trg_marketplace_integrations_before_delete` | D | Move |
| `trg_marketplace_integrations_sync_caps` | marketplace_integrations | INSERT, UPDATE | BEFORE | `marketplace_integrations_sync_caps` | D | Move |
| `trg_mipl_refresh_presented` | marketplace_item_product_links | INSERT, UPDATE, DELETE | AFTER | `trg_mipl_refresh_presented` | F | **Dead code — remove** |
| `trg_moi_linked_update` | marketplace_order_items | UPDATE | AFTER | `trg_marketplace_order_items_linked_update` | F | Move + fix bug |
| `trg_marketplace_orders_presented_new_inventory_on_cancel` | marketplace_orders_presented_new | UPDATE | AFTER | `trg_presented_new_inventory_on_cancel` | E | Move |
| `trg_marketplace_orders_presented_new_stock_flow` | marketplace_orders_presented_new | UPDATE | AFTER | `trg_presented_new_stock_flow` | E | Move |
| `trg_presented_new_items_refresh_insert` | marketplace_orders_presented_new | INSERT | AFTER | `trg_presented_new_items_refresh` | E | Move |
| `trg_presented_new_linked_products_refresh` | marketplace_orders_presented_new | UPDATE | AFTER | `trg_presented_new_linked_products_refresh` | E | Move |
| `on_marketplace_orders_raw_change_new` | marketplace_orders_raw | INSERT, UPDATE | AFTER | `process_marketplace_order_presented_new` | E | Move (Shopee pipeline) |
| `update_module_actions_updated_at` | module_actions | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |
| `update_organization_members_updated_at` | organization_members | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |
| `organization_owner_membership` | organizations | INSERT | AFTER | `add_owner_membership` | C | Keep |
| `update_product_kit_items_updated_at` | product_kit_items | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |
| `update_system_modules_updated_at` | system_modules | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |
| `tasks_set_updated_at` | tasks | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |
| `set_updated_at_tax_rules_catalog` | tax_rules_catalog | UPDATE | BEFORE | `set_updated_at` | A | Keep |
| `update_user_invitations_updated_at` | user_invitations | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |
| `update_user_organization_settings_updated_at` | user_organization_settings | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |
| `update_user_profiles_updated_at` | user_profiles | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |
| `update_users_updated_at` | users | UPDATE | BEFORE | `update_updated_at_column` | A | Keep |

---

## Category A — Utility Timestamps (keep in DB)

**Decision: KEEP.** These are pure infrastructure. No business logic. They set `updated_at = now()` on row UPDATE. Removing them would require every application write to explicitly set `updated_at`, which is error-prone.

### Functions

#### `update_updated_at_column`
Used by: ads, apps, companies, module_actions, organization_members, product_kit_items, system_modules, tasks, user_invitations, user_organization_settings, user_profiles, users.

```sql
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
```

#### `set_updated_at`
Used by: chat_unread_counts, company_tax_configs, marketplace_drafts, tax_rules_catalog.
Identical behavior to `update_updated_at_column` — the two functions exist for historical reasons only. Consider consolidating.

```sql
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
```

---

## Category B — Chat Infrastructure (keep in DB)

**Decision: KEEP.** These triggers are tightly coupled to chat message writes and need to execute atomically within the same transaction. Moving to application code would create race conditions between write and notification creation.

### `chat_encrypt_on_write`
**Table:** `chat_messages` — BEFORE INSERT, UPDATE

Encrypts `content` using `pgp_sym_encrypt` (AES-256) before the row is stored. Calls `ensure_chat_org_key(organization_id)` to retrieve or generate the per-org key. Sets `is_encrypted = true`.

```sql
BEGIN
  IF NEW.content IS NOT NULL AND length(trim(NEW.content)) > 0
     AND COALESCE(NEW.is_encrypted, false) = false THEN
    v_key := public.ensure_chat_org_key(NEW.organization_id);
    NEW.content := encode(pgp_sym_encrypt(NEW.content, v_key, 'cipher-algo=aes256,compress-algo=1'), 'base64');
    NEW.is_encrypted := true;
  END IF;
  RETURN NEW;
END;
```

**Note:** Encryption is idempotent — if `is_encrypted` is already true, the trigger skips it.

### `create_chat_notifications_on_message`
**Table:** `chat_messages` — AFTER INSERT

Inserts one `chat_notifications` row per channel member (excluding the sender). Reads `member_ids` from `chat_channels`. Falls back to `chat_channel_members` table if the array is empty (legacy compatibility).

```sql
INSERT INTO public.chat_notifications (user_id, channel_id, message_id, type, payload)
SELECT m, NEW.channel_id, NEW.id, 'message', jsonb_build_object('sender_id', NEW.sender_id, ...)
FROM unnest(v_members) AS m
WHERE m <> NEW.sender_id
ON CONFLICT (user_id, message_id) DO NOTHING;
```

### `increment_unread_on_message`
**Table:** `chat_messages` — AFTER INSERT

Increments `chat_unread_counts.unread_count` by 1 for each channel member (excluding sender). UPSERT pattern — inserts with count=1 or increments existing.

---

## Category C — Organization Bootstrap (keep in DB)

**Decision: KEEP.** Simple, one-time setup. No complex logic. Makes the owner automatically a member without requiring app-level code.

### `add_owner_membership`
**Table:** `organizations` — AFTER INSERT

When a new organization is created, inserts the `owner_user_id` into `user_invitations` with `role='owner'` and `status='ativo'`. `ON CONFLICT DO NOTHING` prevents duplicates.

```sql
BEGIN
  INSERT INTO public.user_invitations (organization_id, invited_by_user_id, user_id, role, status)
  VALUES (NEW.id, NEW.owner_user_id, NEW.owner_user_id, 'owner', 'ativo')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
```

---

## Category D — Marketplace Integrations (move to code)

**Decision: MOVE TO EDGE FUNCTIONS.** These triggers embed business logic (shipping capability detection, stock validation, cascading deletes) that belongs in `mercado-livre-disconnect` / `shopee-disconnect` edge functions. They're hard to test, hard to observe, and hide side effects.

### `trg_marketplace_integrations_sync_caps`
**Table:** `marketplace_integrations` — BEFORE INSERT, UPDATE

Parses the `shipping_preferences` JSONB column and sets three boolean convenience columns: `drop_off`, `xd_drop_off`, `self_service`. Loops through `logistics[].types[]` and checks if `status` is `active/enabled/true`.

```sql
FOR rec_l IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.shipping_preferences->'logistics', '[]')) LOOP
  FOR rec_t IN SELECT value FROM jsonb_array_elements(COALESCE(rec_l.value->'types', '[]')) LOOP
    IF lower(rec_t.value->>'status') IN ('active','enabled','true') THEN
      CASE lower(rec_t.value->>'type')
        WHEN 'drop_off'     THEN has_drop_off := true;
        WHEN 'xd_drop_off'  THEN has_xd_drop_off := true;
        WHEN 'self_service'  THEN has_self_service := true;
      END CASE;
    END IF;
  END LOOP;
END LOOP;
NEW.drop_off := has_drop_off; NEW.xd_drop_off := has_xd_drop_off; NEW.self_service := has_self_service;
```

**Migration plan:** Move this logic into `mercado-livre-callback` edge function (and any future Shopee auth callback) — compute these flags before the upsert, so the columns are populated at write time by the application, not the DB.

### `trg_marketplace_integrations_before_delete`
**Table:** `marketplace_integrations` — BEFORE DELETE

Calls `can_disconnect_marketplace(org_id, marketplace_name)`. If there is any reserved stock for products linked to that marketplace, raises `EXCEPTION 'RESERVED_STOCK_PRESENT'`.

```sql
BEGIN
  IF NOT public.can_disconnect_marketplace(OLD.organizations_id, OLD.marketplace_name) THEN
    RAISE EXCEPTION 'RESERVED_STOCK_PRESENT';
  END IF;
  RETURN OLD;
END;
```

`can_disconnect_marketplace` checks:
```sql
SELECT EXISTS (
  SELECT 1 FROM marketplace_item_product_links mipl
  JOIN products_stock ps ON ps.product_id = mipl.product_id
  WHERE mipl.organizations_id = p_organizations_id
    AND (regex-normalized marketplace_name matches)
    AND COALESCE(ps.reserved, 0) > 0
)
```

**Migration plan:** Move this check into a `disconnect-marketplace` edge function. The edge function performs the stock check first, returns a structured error if blocked, then deletes the integration row. This makes the error observable in logs and testable.

### `trg_marketplace_integrations_after_delete`
**Table:** `marketplace_integrations` — AFTER DELETE

Cascades deletion to **8 tables** using regex-normalized marketplace name matching (`regexp_replace(lower(name), '\s|-', '_', 'g')`):

1. `marketplace_item_product_links`
2. `marketplace_item_descriptions`
3. `marketplace_item_prices`
4. `marketplace_stock_distribution`
5. `marketplace_items_raw` (if table exists)
6. `marketplace_items`
7. `marketplace_orders_raw`
8. `marketplace_orders` (if table exists)
9. `marketplace_metrics` (if table exists)

**Important:** This trigger does NOT cascade to `orders`, `order_items`, `order_shipping` — the new Cycle 0 tables. When those tables are created, this trigger must be updated to cascade to them as well, OR proper `ON DELETE CASCADE` foreign keys should be added.

**Migration plan:** Replace with proper `ON DELETE CASCADE` foreign keys on the 8 related tables (using `marketplace_integration_id` FK). This is safer, faster, and correct-by-construction. The regex normalization is a smell — marketplace names should be normalized at insert time.

---

## Category E — Order Processing (move to code — highest priority)

**Decision: MOVE TO EDGE FUNCTIONS.** This is the most critical category. These triggers contain the entire Shopee order processing pipeline, the inventory state machine, and data refresh logic — all in PL/pgSQL where they are invisible to application logs, impossible to test, and fire synchronously inside the DB transaction.

### `on_marketplace_orders_raw_change_new`
**Table:** `marketplace_orders_raw` — AFTER INSERT, UPDATE

Calls `process_marketplace_order_presented_new()` on every raw order write.

**What `process_marketplace_order_presented_new` does (~400 lines, 25KB):**
- **Shopee only.** Checks `NEW.marketplace_name = 'Shopee'` and returns immediately for any other marketplace (ML orders are processed by the `mercado-livre-process-presented` edge function instead).
- Skips `UNPAID` orders (returns immediately).
- Parses 50+ JSONB paths to extract: order status, shipping status, buyer info, city/state/region/zip, order total, payment total, item count, item amounts, commission fees, service fees, SKUs, variation IDs, colors, linked products, label data.
- Resolves Brazilian state UF from name (full state→UF mapping hardcoded inside the function).
- Computes `status_interno` (the internal Portuguese status label) based on combinations of Shopee `order_status`, `logistics_status`, invoice pending flags, fulfillment ready flags, pickup done flag.
- UPSERT into `marketplace_orders_presented_new` with all ~87 columns.
- Syncs `marketplace_order_items` rows (DELETE + INSERT pattern).
- Has its own exception handler that writes error details back into the presented row.

**Why this must move to code:**
- 25KB of SQL is undebuggable — no structured logging, no retry, no alerting.
- ML and Shopee use completely different pipelines but share the same raw table — the trigger structure hides this split.
- Any Shopee API schema change breaks silently.
- Cannot be tested without a real DB.
- Cycle 0 replaces this entirely with the new `orders` table schema.

**Migration plan:** Create `shopee-process-order` edge function. The raw insert/update webhook already calls an edge function — move all the JSONB parsing there, write to the new `orders` / `order_items` / `order_shipping` tables, drop this trigger.

---

### `trg_marketplace_orders_presented_new_stock_flow`
**Table:** `marketplace_orders_presented_new` — AFTER UPDATE

Watches for changes to `status_interno`, `status`, `shipment_status`, `shipment_substatus`, or `has_unlinked_items`. Creates `inventory_jobs` rows based on Portuguese `status_interno` labels:

| Condition | Job Type | Notes |
|---|---|---|
| status contains 'cancel' OR shipment_status is 'cancelled' | `refund` | Both ML and Shopee |
| `status_interno` IN ('Emissao NF','Impressao','Aguardando Coleta') AND no unlinked items | `reserve` | Stock reservation |
| `status_interno` = 'Enviado' | `consume` | Stock consumption (shipped) |

```sql
INSERT INTO public.inventory_jobs (order_id, job_type, status)
VALUES (NEW.id, 'reserve', 'pending')
ON CONFLICT (order_id, job_type) DO NOTHING;
```

**Critical coupling:** This trigger is hardcoded to Portuguese `status_interno` values. Cycle 0 will rename or replace `status_interno` — this trigger must be updated or removed at that point.

**Double-refund risk for Shopee:** Both this trigger AND `trg_presented_new_inventory_on_cancel` fire on Shopee cancel. This trigger creates a `refund` job (async), while the other trigger calls `refund_reserved_stock_for_order` directly (sync). `refund_reserved_stock_for_order` has its own idempotency check (`inventory_transactions` table), but the `inventory_jobs` row could still be processed by the job runner after the direct refund, causing a second attempt. The `ON CONFLICT DO NOTHING` on `inventory_jobs` only deduplicates by `(order_id, job_type)` — if the job runs before the direct refund, both execute.

**Migration plan:** Replace with explicit status transition logic in an `update-order-status` edge function. The function writes the status change AND enqueues the inventory job atomically, with clear intent. Remove the direct `refund_reserved_stock_for_order` call from the cancel trigger.

---

### `trg_marketplace_orders_presented_new_inventory_on_cancel`
**Table:** `marketplace_orders_presented_new` — AFTER UPDATE

**Shopee only** (`IF NEW.marketplace <> 'Shopee' THEN RETURN NEW`).

When cancel-related fields change, immediately calls `refund_reserved_stock_for_order(order_id, storage_id)` — synchronously within the DB transaction. This bypasses the `inventory_jobs` async queue.

```sql
PERFORM public.refund_reserved_stock_for_order(NEW.id, public.fn_get_default_storage(NEW.organizations_id));
```

`refund_reserved_stock_for_order` (3.5KB):
- Looks up org_id, company_id, marketplace_name, marketplace_order_id from `marketplace_orders_raw`.
- Iterates through each item in the order's JSONB `order_items` array.
- For each item, resolves `product_id` via `marketplace_order_items.linked_products` or `marketplace_item_product_links`.
- Checks `inventory_transactions` for existing `CANCELAMENTO_RESERVA` movement to prevent double-refund.
- `UPDATE products_stock SET reserved = GREATEST(reserved - qty, 0)`.
- `INSERT INTO inventory_transactions` with `movement_type = 'CANCELAMENTO_RESERVA'`.

**Migration plan:** Consolidate into a single `handle-order-cancel` edge function that handles both ML and Shopee. The function creates the `refund` inventory job (which a separate worker processes), rather than executing the refund inline.

---

### `trg_presented_new_items_refresh_insert`
**Table:** `marketplace_orders_presented_new` — AFTER INSERT

Calls `refresh_presented_order(NEW.id)` on every new presented order row. Temporarily disables RLS (`set_config('row_security', 'off', true)`).

`refresh_presented_order` is 47KB — the largest function in the database. It rebuilds denormalized data on the presented order (linked products, item counts, financial totals, etc.) from related tables.

**Migration plan:** When Cycle 0's `orders` table replaces `marketplace_orders_presented_new`, this trigger and `refresh_presented_order` are deleted. The new schema stores data normalized — no refresh needed.

---

### `trg_presented_new_linked_products_refresh`
**Table:** `marketplace_orders_presented_new` — AFTER UPDATE

Calls `refresh_presented_order(NEW.id)` only when `linked_products` column changes.

Same migration plan as above — deleted with Cycle 0.

---

## Category F — Linked Products (move to code + bugs)

### `trg_moi_linked_update` → `trg_marketplace_order_items_linked_update`
**Table:** `marketplace_order_items` — AFTER UPDATE

Intended to update `marketplace_orders_presented_new.has_unlinked_items` when an order item's linked product changes.

**⚠️ Bug found:**

```sql
UPDATE public.marketplace_orders_presented_new p
   SET has_unlinked_items = EXISTS (
     SELECT 1
     FROM public.marketplace_order_items i
     WHERE i.id = NEW.id  -- <-- item ID
       AND (COALESCE(i.linked_products,'') = '' OR COALESCE(i.has_unlinked_items, false) = true)
   )
 WHERE p.id = NEW.id;   -- <-- using the same item ID to match the presented order!
```

`NEW.id` is a `marketplace_order_items` row ID. The query uses it to match `marketplace_orders_presented_new.id` — but those are different entities with different ID spaces. The update almost certainly hits zero rows (no presented order has the same UUID as an order item). `has_unlinked_items` is therefore never updated by this trigger.

The correct query should join on the order's foreign key (e.g., `WHERE p.marketplace_order_id = NEW.marketplace_order_id` or equivalent).

**Migration plan:** Fix the bug AND move to application code — when an order item is linked, the `link-order-product` edge function should update `has_unlinked_items` explicitly.

---

### `trg_mipl_refresh_presented` → `trg_mipl_refresh_presented`
**Table:** `marketplace_item_product_links` — AFTER INSERT, UPDATE, DELETE

**⚠️ Dead code.** The function body is:

```sql
BEGIN
  RETURN COALESCE(NEW, OLD);
END;
```

This does absolutely nothing. It returns the row unchanged. No calls to `refresh_presented_order` or any other function. The trigger fires (incurring overhead) on every product link change but has zero effect.

**Action:** Drop this trigger and its function. No migration needed.

---

## Key Functions Called by Triggers

| Function | Size | Called By | Notes |
|---|---|---|---|
| `refresh_presented_order(order_id uuid)` | 47KB | `trg_presented_new_items_refresh`, `trg_presented_new_linked_products_refresh` | Rebuilds denormalized data on presented order. Deleted with Cycle 0. |
| `process_marketplace_order_presented_new()` | 25KB | `on_marketplace_orders_raw_change_new` | Full Shopee order pipeline in SQL. Move to edge function. |
| `refund_reserved_stock_for_order(order_id, storage_id)` | 3.5KB | `trg_presented_new_inventory_on_cancel` | Shopee stock refund with idempotency. Move to edge function. |
| `can_disconnect_marketplace(org_id, marketplace)` | 553B | `trg_marketplace_integrations_before_delete` | Checks reserved stock. Move to edge function. |
| `fn_get_default_storage(org_id)` | 216B | `trg_presented_new_stock_flow`, `trg_presented_new_inventory_on_cancel` | Returns first active storage UUID. Simple helper. |

---

## Known Bugs Discovered

### Bug 1: `trg_moi_linked_update` — wrong ID join
**Severity:** High
**Effect:** `has_unlinked_items` on `marketplace_orders_presented_new` is never updated by this trigger. Items can be linked/unlinked without the presented order's flag reflecting the change.
**Root cause:** `WHERE p.id = NEW.id` uses item ID to match presented order ID — different tables, different IDs.
**Fix:** Change to join on `marketplace_order_id` or equivalent FK. Move logic to edge function.

### Bug 2: `trg_mipl_refresh_presented` — dead code
**Severity:** Low (wasted overhead only)
**Effect:** Trigger fires on every product link INSERT/UPDATE/DELETE but does nothing.
**Fix:** Drop trigger and function.

### Bug 3: Double-refund risk for Shopee cancels
**Severity:** Medium
**Effect:** Both `trg_presented_new_inventory_on_cancel` (sync, direct) and `trg_presented_new_stock_flow` (async via `inventory_jobs`) fire on Shopee cancel. The `inventory_transactions` idempotency check inside `refund_reserved_stock_for_order` prevents a true double-deduction, but the `inventory_jobs` queue may attempt the refund job redundantly after the direct refund already completed.
**Fix:** Consolidate into a single code path — either always use `inventory_jobs` (async) or always call `refund_reserved_stock_for_order` directly. Do not do both.

### Bug 4: Missing UNIQUE constraint on `marketplace_integrations`
**Severity:** Critical (blocks correct reconnect behavior)
**Effect:** The edge function `mercado-livre-callback` uses:
```typescript
admin.from("marketplace_integrations").upsert(
  { ... },
  { onConflict: "organizations_id,marketplace_name" }
);
```
But there is no `UNIQUE (organizations_id, marketplace_name)` constraint on the table. At runtime, the UPSERT will fail with a PostgreSQL error because `ON CONFLICT` requires a unique index or constraint. Until the constraint is added, reconnecting a marketplace will fail or create duplicate rows.

**Status:** Migration to add the constraint is pending — **no migration applied yet** (understanding-only phase).
**Required SQL (do not apply yet):**
```sql
ALTER TABLE public.marketplace_integrations
  ADD CONSTRAINT uq_marketplace_integrations_org_marketplace
  UNIQUE (organizations_id, marketplace_name);
```

---

## Migration Strategy

### Phase 1 — Quick wins (no functional change)
1. Drop `trg_mipl_refresh_presented` and its function (dead code, zero risk).
2. Add `UNIQUE (organizations_id, marketplace_name)` constraint (fixes reconnect bug).

### Phase 2 — Cycle 0 prep (move with Shopee order rewrite)
3. Replace `process_marketplace_order_presented_new` (~25KB SQL) with `shopee-process-order` edge function writing to new `orders`/`order_items`/`order_shipping` tables.
4. Remove `trg_presented_new_items_refresh_insert`, `trg_presented_new_linked_products_refresh`, and `refresh_presented_order` (deleted with `marketplace_orders_presented_new`).

### Phase 3 — Inventory state machine
5. Fix `trg_moi_linked_update` bug, then move logic to `link-order-product` edge function.
6. Replace `trg_presented_new_stock_flow` with explicit status transition logic in an edge function.
7. Consolidate the double-refund path: delete `trg_presented_new_inventory_on_cancel`, rely on `inventory_jobs` queue only.

### Phase 4 — Marketplace disconnect
8. Create `disconnect-marketplace` edge function that:
   - Checks `can_disconnect_marketplace()` logic (reserved stock check).
   - Deletes the `marketplace_integrations` row.
   - Cascades deletion to related tables.
9. Replace `trg_marketplace_integrations_before_delete` and `trg_marketplace_integrations_after_delete` with proper FK cascade (or edge function explicit deletes).
10. Move `trg_marketplace_integrations_sync_caps` logic into auth callback edge functions.

### What STAYS in the DB forever
- All `updated_at` / `set_updated_at` triggers (Category A) — column DEFAULT only fires on INSERT, not UPDATE. There is no Postgres-native alternative. These are infrastructure, not business logic.

### What MOVES to edge functions (everything else)
- Chat triggers (Category B) → `send-message` edge function owns the full write path
- `organization_owner_membership` (Category C) → `create-organization` edge function
- All Category D (marketplace integrations) → `disconnect-marketplace` edge function
- All Category E (order processing) → `shopee-process-order` and `update-order-status` edge functions
- `trg_moi_linked_update` (Category F) → `link-order-product` edge function (after bug fix)
- `trg_mipl_refresh_presented` (Category F) → DROP, dead code
