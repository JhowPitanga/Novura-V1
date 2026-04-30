# PRD — C0-T10: Legacy Cleanup — Triggers, Functions, and Old Tables

**Cycle:** 0 — Plataforma de Pedidos
**Status:** 🔴 Not Started
**Depends on:** [C0-T9 — Frontend Migration](./C0-T9-frontend-migration.md) (all queries must use new tables first)
**Blocks:** Nothing — this is the final Cycle 0 task

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

After the new orders system is live and the app is fully reading from the new tables,
there's one final step: cleaning up the old machinery that we no longer need.

The old system had automated triggers — bits of code that ran inside the database whenever
an order arrived or changed status. These triggers now conflict with the new system because
they try to do the same work. Leaving both running at the same time is like having two cooks
in a kitchen following different recipes for the same dish — the result is unpredictable.

This task safely removes those old triggers and, eventually, the old tables themselves.

**This is the most dangerous task in Cycle 0.** One wrong database command can delete
production data permanently. This PRD has extra safety steps and requires human confirmation
before any destructive operation.

**No part of this task should be done automatically by an AI agent without a human
reviewing and approving the specific SQL commands first.**

---

## 2. Current State & Progress

From `docs/DATABASE_TRIGGERS.md` and `docs/TRIGGER_MIGRATION_PLAN.md`:

**Triggers to drop (safe to remove once new pipeline is verified):**

| Trigger name | Table | Why it's being removed |
|---|---|---|
| `on_marketplace_orders_raw_change_new` | `marketplace_orders_raw` | Replaced by `orders-normalize-shopee` + `orders-upsert` |
| `trg_presented_new_items_refresh_insert` | `marketplace_orders_presented_new` | Removed with old table |
| `trg_presented_new_linked_products_refresh` | `marketplace_orders_presented_new` | Removed with old table |
| `trg_marketplace_orders_presented_new_stock_flow` | `marketplace_orders_presented_new` | Replaced by inventory job queue |
| `trg_marketplace_orders_presented_new_inventory_on_cancel` | `marketplace_orders_presented_new` | Replaced by inventory job queue |
| `trg_mipl_refresh_presented` | `marketplace_item_product_links` | Dead code — no-op body |

**Tables to eventually drop (only after ALL queries confirmed migrated):**
- `marketplace_orders_presented_new`
- `notas_fiscais`
- `marketplace_order_items` (evaluate — may have data still referenced)

**Tables to KEEP:**
- `marketplace_orders_raw` — permanent audit archive, never drop
- All new tables from C0-T1 — permanent

---

## 3. ⚠️ Agent: STOP — Human Review Required

**This is the only PRD in Cycle 0 where the AI agent MUST stop and wait for human approval
before executing any database command.**

The agent's role in this task is:
1. Read the relevant files and verify current state
2. Produce the exact SQL commands to run
3. Present the SQL to the human for review
4. Wait for explicit confirmation ("yes, run it")
5. Only execute after confirmation

Do NOT auto-execute DROP TRIGGER or DROP TABLE commands. Present them first.

### 🚨 STOP FIRST — Verify Prerequisites and Current State

```bash
# Confirm frontend no longer references old table
grep -r "marketplace_orders_presented_new" src/
# Expected: zero results. If any found → C0-T9 is incomplete. Stop here.

# Check which of the 6 target triggers actually exist (some may already be dropped)
# Run in Supabase SQL editor:
```
```sql
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN (
  'on_marketplace_orders_raw_change_new',
  'trg_presented_new_items_refresh_insert',
  'trg_presented_new_linked_products_refresh',
  'trg_marketplace_orders_presented_new_stock_flow',
  'trg_marketplace_orders_presented_new_inventory_on_cancel',
  'trg_mipl_refresh_presented'
);
```

Present this list to the human reviewer. Only include triggers that **exist** in the migration SQL —
remove `DROP TRIGGER IF EXISTS` entries for triggers already gone (this makes the migration diff cleaner).

```bash
# Check if any DROP TRIGGER migration already exists for these targets
grep -r "DROP TRIGGER" supabase/migrations/ | grep -E "on_marketplace_orders_raw|trg_presented_new|trg_mipl_refresh"
```

**Before doing anything:**
- [ ] Confirm C0-T9 is complete — `grep -r "marketplace_orders_presented_new" src/` returns zero results
- [ ] Read `docs/DATABASE_TRIGGERS.md` in full
- [ ] Read `docs/TRIGGER_MIGRATION_PLAN.md` in full
- [ ] Read all migrations in `supabase/migrations/` that contain "DROP TRIGGER" — confirm none of the targets below have already been dropped
- [ ] Verify the new pipeline is working in production (run in Supabase SQL editor):
  - `SELECT COUNT(*) FROM orders` > 0
  - `SELECT COUNT(*) FROM order_items` > 0
  - Orders list in the app is loading from new tables (confirmed in C0-T9)

---

## 4. Architecture Context

### Why Triggers Must Be Dropped First

The trigger `on_marketplace_orders_raw_change_new` fires whenever a row is inserted into
`marketplace_orders_raw`. The `orders-upsert` function ALSO writes to `marketplace_orders_raw`
as an audit step. This means when the new pipeline runs, the old trigger fires too —
potentially processing the same order twice through the old pipeline.

During the transition period (C0-T1 through C0-T9), this double-processing is harmless
because both pipelines write to different tables. But it wastes resources and could cause
unexpected side effects.

The `trg_presented_new_stock_flow` trigger is particularly important to disable: it fires
on every status change in `marketplace_orders_presented_new` and creates inventory deduction
jobs. If the old table is still getting writes (from old sync functions that haven't been
retired), these stock jobs could create double-deductions.

### The Safe Order of Operations

```
Phase 1: Drop triggers (safe immediately after C0-T9)
  ↓
Phase 2: Verify no queries reference old tables (C0-T9 DoD)
  ↓
Phase 3: Rename old tables to archive names (safety net before dropping)
  ↓
Phase 4 (human decision): Drop old tables — IRREVERSIBLE
```

Phase 3 (rename before drop) is a safety net. If something breaks after renaming,
you can rename back. If something breaks after dropping, there is no recovery.

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER run `DROP TABLE` without first running `ALTER TABLE ... RENAME TO`** | Rename first, wait 48 hours, confirm nothing breaks, then drop. |
| **NEVER run `DROP TABLE marketplace_orders_raw`** | This is the permanent raw archive. It must never be dropped. |
| **NEVER run these commands directly on the production database** | Use Supabase migrations. Every change goes through `supabase/migrations/`. |
| **NEVER create a migration with `DROP TABLE` without wrapping in a transaction** | If the migration fails halfway, you want it to roll back completely. |
| **ALWAYS confirm with a human before applying any migration in this task** | No exceptions. |

---

## 6. What to Build

### Phase 1: Drop the 6 Triggers

**File to create:** `supabase/migrations/20260316_000001_drop_legacy_order_triggers.sql`

> ⚠️ **Present this SQL to a human for review before applying.**

```sql
-- Phase 1: Drop legacy triggers (safe after new pipeline is verified)
-- Run ONLY after:
--   1. orders-sync-ml and orders-sync-shopee are deployed and verified
--   2. orders-webhook and orders-queue-worker are deployed and verified
--   3. Frontend is confirmed to read from new tables (C0-T9 done)
--
-- These triggers fire on old tables and are replaced by the new edge functions.
-- The functions they call (process_marketplace_order_presented_new, etc.) are
-- dropped separately below.

BEGIN;

DROP TRIGGER IF EXISTS on_marketplace_orders_raw_change_new
  ON public.marketplace_orders_raw;

DROP TRIGGER IF EXISTS trg_presented_new_items_refresh_insert
  ON public.marketplace_orders_presented_new;

DROP TRIGGER IF EXISTS trg_presented_new_linked_products_refresh
  ON public.marketplace_orders_presented_new;

DROP TRIGGER IF EXISTS trg_marketplace_orders_presented_new_stock_flow
  ON public.marketplace_orders_presented_new;

DROP TRIGGER IF EXISTS trg_marketplace_orders_presented_new_inventory_on_cancel
  ON public.marketplace_orders_presented_new;

DROP TRIGGER IF EXISTS trg_mipl_refresh_presented
  ON public.marketplace_item_product_links;

-- Drop the underlying functions (safe to drop after their triggers are gone)
DROP FUNCTION IF EXISTS public.process_marketplace_order_presented_new();
DROP FUNCTION IF EXISTS public.refresh_presented_order(uuid);
DROP FUNCTION IF EXISTS public.trg_presented_new_items_refresh();
DROP FUNCTION IF EXISTS public.trg_presented_new_linked_products_refresh();
DROP FUNCTION IF EXISTS public.trg_presented_new_stock_flow();
DROP FUNCTION IF EXISTS public.trg_presented_new_inventory_on_cancel();

COMMIT;
```

**How to verify after applying:**
```sql
-- Confirm triggers are gone
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN (
  'on_marketplace_orders_raw_change_new',
  'trg_presented_new_items_refresh_insert',
  'trg_presented_new_linked_products_refresh',
  'trg_marketplace_orders_presented_new_stock_flow',
  'trg_marketplace_orders_presented_new_inventory_on_cancel',
  'trg_mipl_refresh_presented'
);
-- Expected: zero rows
```

#### Definition of Done — Phase 1
- [ ] SQL presented to human reviewer and approved
- [ ] Migration file created
- [ ] Migration applied to production
- [ ] Verification query confirms zero triggers returned
- [ ] App continues to work normally after trigger removal (spot-check orders, inventory)

---

### Phase 2: Rename Old Tables (Safety Net)

Wait at least 48 hours after Phase 1 before doing this.
Monitor for any errors or unexpected behavior during this window.

**File to create:** `supabase/migrations/20260318_000000_archive_legacy_order_tables.sql`

> ⚠️ **Present this SQL to a human for review before applying.**

```sql
-- Phase 2: Rename old tables to _archive suffix
-- This is a reversible step. If anything breaks, rename back immediately.
-- Run only after 48h of Phase 1 with no incidents.
-- Confirm zero references in codebase first: grep -r "marketplace_orders_presented_new" .

BEGIN;

ALTER TABLE public.marketplace_orders_presented_new
  RENAME TO marketplace_orders_presented_new_archive;

ALTER TABLE public.notas_fiscais
  RENAME TO notas_fiscais_archive;

COMMIT;
```

**How to verify after applying:**
```sql
-- Confirm old names are gone, archive names exist
SELECT tablename FROM pg_tables
WHERE tablename IN (
  'marketplace_orders_presented_new',
  'marketplace_orders_presented_new_archive',
  'notas_fiscais',
  'notas_fiscais_archive'
);
-- Expected: only the _archive names
```

**If anything breaks after this step:**
```sql
-- Rollback: rename back (do NOT create a migration for this — run directly)
ALTER TABLE public.marketplace_orders_presented_new_archive
  RENAME TO marketplace_orders_presented_new;
ALTER TABLE public.notas_fiscais_archive
  RENAME TO notas_fiscais;
```

#### Definition of Done — Phase 2
- [ ] SQL presented to human reviewer and approved
- [ ] Migration applied
- [ ] App continues to work normally for 48 hours after rename
- [ ] No error logs referencing `marketplace_orders_presented_new` or `notas_fiscais`

---

### Phase 3: Drop Old Tables (Irreversible)

**Only proceed after Phase 2 has been stable for at least 1 week.**

This is the final, irreversible step. Do it only when there is confidence the old tables
are not needed.

**File to create:** `supabase/migrations/20260325_000000_drop_legacy_order_tables.sql`

> ⚠️ **Present this SQL to a human for review before applying. This is irreversible.**

```sql
-- Phase 3: Drop legacy archive tables
-- IRREVERSIBLE. Only run after:
--   1. Phase 2 has been stable for at least 1 week
--   2. Human has explicitly reviewed and approved
--   3. A full database backup exists and is verified

BEGIN;

-- Drop the renamed archive tables
-- (the triggers and their functions were dropped in Phase 1)
DROP TABLE IF EXISTS public.marketplace_orders_presented_new_archive;
DROP TABLE IF EXISTS public.notas_fiscais_archive;

-- Evaluate separately (may still be referenced by old linking flow):
-- DROP TABLE IF EXISTS public.marketplace_order_items;

COMMIT;
```

> **Note on `marketplace_order_items`:** This table may still be used by the product
> linking flow. Do NOT drop it until you've confirmed it is not referenced anywhere.
> Evaluate separately after investigating.

#### Definition of Done — Phase 3
- [ ] SQL presented to human reviewer and explicitly approved ("yes, drop it")
- [ ] Database backup exists and is verified before applying
- [ ] Migration applied
- [ ] `SELECT tablename FROM pg_tables WHERE tablename LIKE '%presented%' OR tablename = 'notas_fiscais_archive'` returns zero rows

---

## 7. Definition of Done — Full Task (Cycle 0 Complete)

When all phases are complete, Cycle 0 is done. Verify these final conditions:

- [ ] All 6 legacy triggers are gone from the database
- [ ] All 6 legacy trigger functions are dropped
- [ ] `marketplace_orders_presented_new` table no longer exists
- [ ] `notas_fiscais` table no longer exists (or is archived)
- [ ] `marketplace_orders_raw` table still exists (never drop this)
- [ ] `orders`, `order_items`, `order_shipping`, `order_status_history`, `order_labels`, `invoices` all exist and have data
- [ ] App works normally (orders list, detail, NFe, print)
- [ ] `SELECT COUNT(*) FROM orders` returns all expected orders
- [ ] Running `orders-sync-ml` twice produces no new rows (idempotency confirmed)
- [ ] Running `emit-invoice` twice produces no second Focus API call (idempotency confirmed)

This is the complete Cycle 0 Definition of Done from `docs/CYCLE_0_ORDERS_PLATFORM.md`.

---

## 8. What NOT to Do

- **Do NOT drop `marketplace_orders_raw`** — ever. This is the permanent audit archive.
- **Do NOT drop anything in a single step** — always rename first, wait, then drop.
- **Do NOT let an AI agent run DROP TABLE autonomously** — human review is mandatory.
- **Do NOT rush Phase 3** — a week of stability after Phase 2 is the minimum. Data lost
  is data lost. There is no recovery without a backup.
- **Do NOT clean up `marketplace_order_items` without investigating** — it may still be
  used by the product-to-order linking flow which was not part of this cycle's migration.
