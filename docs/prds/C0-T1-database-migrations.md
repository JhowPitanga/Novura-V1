# PRD — C0-T1: Database Migrations — 6 New Tables

**Cycle:** 0 — Plataforma de Pedidos
**Status:** 🟢 Done ← *Agent: verify before trusting this*
**Depends on:** Nothing
**Blocks:** All other C0 tasks

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

The existing Novura database stored all order information in a single giant table with
87 columns, mixing together the order itself, the buyer address, the items in the order,
shipping tracking, label PDFs, and invoice status. Querying it was slow and fragile.

This task creates 6 clean, purpose-built tables as the new foundation. Each table has
exactly one job:

- `orders` — one row per order, financial summary
- `order_items` — one row per product inside that order
- `order_shipping` — delivery address, tracking, SLA
- `order_status_history` — timeline of every status change (append-only, never deleted)
- `order_labels` — shipping label files (kept separate so they never slow down list queries)
- `invoices` — replaces `notas_fiscais` with an idempotency key that makes double-emission impossible

**When this task is done:** Any sync function can save a Mercado Livre or Shopee order into
the database without duplicates, and the NFe system can never emit the same invoice twice.

---

## 2. Current State & Progress

Based on a review of `supabase/migrations/`, all 6 migration files were found:
- `20260301_000000_create_orders_table.sql` — ✅ exists
- `20260301_000001_create_order_items_table.sql` — ✅ exists
- `20260301_000002_create_order_shipping_table.sql` — ✅ exists
- `20260301_000003_create_order_status_history_table.sql` — ✅ exists
- `20260301_000004_create_order_labels_table.sql` — ✅ exists
- `20260301_000005_create_invoices_table.sql` — ✅ exists

Additional related migrations also found:
- `20260301_000006_fix_marketplace_integrations_unique.sql` — ✅ exists
- `20260301_000008_create_orders_sync_queue.sql` — ✅ exists
- `20260301_000009_invoices_updated_at_trigger.sql` — ✅ exists

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

This task is believed to be complete. Your job is to **verify**, not to redo.

- [ ] For each migration file above, open it and confirm:
  - The table schema matches the spec in `docs/CYCLE_0_ORDERS_PLATFORM.md` (section "The Data Model to Build")
  - RLS is enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
  - The `org_isolation` policy exists
  - Required indexes are created
  - The UNIQUE constraint exists on `orders` for `(organization_id, marketplace, marketplace_order_id)`
  - The UNIQUE constraint exists on `invoices` for `(idempotency_key)`
  - The UNIQUE constraint exists on `order_shipping` for `(order_id)`
  - The UNIQUE constraint exists on `marketplace_integrations` for `(organizations_id, marketplace_name)`
- [ ] If any migration deviates from the spec, create a NEW migration file to fix it.
      Never edit an existing migration file — they are append-only.
- [ ] Confirm `20260301_000006_fix_marketplace_integrations_unique.sql` adds the missing UNIQUE constraint on `marketplace_integrations (organizations_id, marketplace_name)`.

If all checks pass, mark this task 🟢 Done. There is nothing to build here.

---

## 4. Safety Rules

| Rule | Why |
|---|---|
| **NEVER edit existing migration files** | Migrations are append-only. Editing an applied migration corrupts the migration history. |
| **NEVER add a `DROP TABLE` or `TRUNCATE` to any migration** | This would delete all production order data with no recovery path. |
| **NEVER apply migrations to production without running against staging first** | Data loss is irreversible. |

---

## 5. Definition of Done

- [ ] All 6 table migration files exist and match the spec
- [ ] UNIQUE constraint on `orders (organization_id, marketplace, marketplace_order_id)` is present
- [ ] UNIQUE constraint on `invoices (idempotency_key)` is present
- [ ] UNIQUE constraint on `order_shipping (order_id)` is present
- [ ] UNIQUE constraint on `marketplace_integrations (organizations_id, marketplace_name)` is present
- [ ] RLS is enabled on all 6 new tables
- [ ] `org_isolation` policy exists on all 6 new tables
- [ ] All required indexes are present (see spec)
