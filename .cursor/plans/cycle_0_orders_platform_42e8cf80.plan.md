---
name: ""
overview: ""
todos: []
isProject: false
---

---

name: Cycle 0 Orders Platform
overview: Rebuild the orders data model from the updated CYCLE_0 spec: 6 normalized tables (with status = internal, marketplace_status = marketplace), no enums, numeric(18,6), no raw_snapshot; migrate data from notas_fiscais to invoices and plan old-table-to-new migration; validate Shopee Auth against official doc; revisit marketplace_orders_raw; add tests for refactored functions.
todos:

- id: phase-0-docs-shopee-auth
  content: "Phase 0: Fetch Shopee Auth doc (open.shopee.com/developer-guide/20), verify shopee-start-auth and callback match official flow"
  status: pending
- id: phase-0-raw-table
  content: "Phase 0: Revisit marketplace_orders_raw — audit columns, document minimal set needed for re-sync/audit"
  status: pending
- id: phase-1-migrations
  content: "Phase 1: Create 6 SQL migration files only (do not run). Schema: status=internal, marketplace_status=marketplace, numeric(18,6), no enums, no CHECK(marketplace IN), no raw_snapshot"
  status: pending
- id: phase-1-fix-unique
  content: "Phase 1b: Migration for marketplace_integrations UNIQUE (organizations_id, marketplace_name)"
  status: pending
- id: phase-2-types-normalize
  content: "Phase 2: Shared NormalizedOrder types + orders-normalize-ml + orders-normalize-shopee (with tests)"
  status: completed
- id: phase-2-api-types-shared
  content: "Phase 2: ML/Shopee API types in shared/domain (ml-order-api.types.ts, shopee-order-api.types.ts); strong typing only, no Record<string,unknown>"
  status: completed
- id: phase-3-upsert
  content: "Phase 3: orders-upsert edge function + tests"
  status: completed
- id: phase-4-sync-ml
  content: "Phase 4a: orders-sync-ml (paginate /orders/search, GET /orders/:id, normalize + upsert + marketplace_orders_raw)"
  status: completed
- id: phase-4-sync-shopee
  content: "Phase 4b: orders-sync-shopee (HMAC, get_order_list + get_order_detail, normalize + upsert)"
  status: completed
- id: phase-4-webhook
  content: "Phase 4c: orders-webhook unified handler (ML orders_v2 + Shopee; validate → fetch full order → normalize + upsert, source webhook)"
  status: completed
- id: phase-4-sync-webhook-tests
  content: "Phase 4: Add tests for orders-sync-ml, orders-sync-shopee, orders-webhook (at least one per path)"
  status: pending
- id: phase-4-deprecate-old-sync
  content: "Phase 4: Mark mercado-livre-sync-orders and shopee-sync-orders deprecated (remove in future); keep orders-sync-ml / orders-sync-shopee"
  status: pending
- id: phase-5-emit-invoice
  content: "Phase 5: emit-invoice edge function with idempotency + tests"
  status: pending
- id: phase-6-data-migration
  content: "Phase 6a: Data migration — notas_fiscais to invoices + plan for old orders/presented to new tables"
  status: pending
- id: phase-6-triggers
  content: "Phase 6b: Drop triggers per DATABASE_TRIGGERS.md / CYCLE_0 (after new pipeline verified)"
  status: pending
- id: phase-7-frontend
  content: "Phase 7: Frontend migration — orders.service, hooks, Orders.tsx to new schema (status / marketplace_status)"
  status: pending
- id: phase-8-validate
  content: "Phase 8: Re-sync 90 days, validate Definition of Done, point Vercel forwarders to orders-webhook"
  status: pending
  isProject: false

---

# Cycle 0 — Plataforma de Pedidos (Revised Plan)

This plan is based on the **current** [CYCLE_0_ORDERS_PLATFORM.md](docs/CYCLE_0_ORDERS_PLATFORM.md) (including OAuth2 Security Model, Trigger Migration, and Frontend Premise) plus the following explicit requirements.

---

## Code Quality Premise (Mandatory)

All code written or refactored in this plan **must** follow good engineering practices. This is a non-negotiable premise to avoid unmaintainable, monolithic functions.

- **SOLID:** Single responsibility per function/class; depend on abstractions where it helps; avoid god objects.
- **DRY:** Extract repeated logic into shared helpers, adapters, or small modules; do not copy-paste blocks across edge functions.
- **OOP where it makes sense:** Use classes or clear modules when state and behavior belong together (e.g. a normalizer, a sync orchestrator); prefer small, focused units over procedural megafunctions.
- **Design patterns:** Apply patterns where they reduce complexity (e.g. Strategy for different marketplace normalizers, Adapter for external API shapes, small Factory/Builder for complex payloads). Do not over-engineer simple flows.
- **Function size:** **No function or main handler should exceed ~150 lines.** Prefer under 100 lines. If a function grows beyond that, extract private helpers, separate “parse / validate / persist” steps, or split into smaller modules. Long functions (e.g. 200+ lines) are not acceptable and must be refactored before considering a phase done.

Code review for Cycle 0 should explicitly check: function length, duplication, single responsibility, and clarity of module boundaries.

---

## Important: No Migration Execution

**Do not run any migration or database commands.** No `supabase db push`, `supabase db reset`, or similar. The plan only involves **creating/writing** migration `.sql` files and migration **scripts** (e.g. data migration SQL). Applying them is the user's responsibility.

---

## Schema Rules (Must Apply in All Migrations)

- **No PostgreSQL enums.** Use `text` for all status/marketplace/type columns. Do not add `CHECK (column IN (...))` for marketplace or status — use plain `text` to avoid enum-like constraints.
- **Numeric precision:** Use **6 decimal places** for all monetary and decimal columns: `numeric(18,6)` (e.g. `gross_amount`, `net_amount`, `marketplace_fee`, `unit_price`, `unit_cost`, `total_value`).
- **Primary keys:** Use `gen_random_uuid()` — it is **native in PostgreSQL 13+** (built-in; no extension required). Keep it.
- **Status semantics:**
  - `**status`** = **internal (seller workflow: e.g. printed | picked | linked | dispatched). This is what the UI and internal logic use.
  - `**marketplace_status`** = **marketplace canonical status (what ML/Shopee return: e.g. paid, shipped, cancelled). Never conflate the two.
- **Drop `raw_snapshot`** — do not add this column to `orders`. No lightweight JSONB snapshot on the orders table.
- **order_labels / order_status_history:** Do not use enum-like CHECK; use plain `text` for `label_type` and `source` if the doc currently shows CHECK — or keep CHECK only where the doc explicitly requires it and the user said “no enums” for marketplace/status (clarification: avoid CHECK for marketplace; for fixed sets like label_type/source, plain text is still safer for future values).

---

## order_items: Add organization_id or Keep Subquery RLS?

**Current (doc) pattern:** RLS on `order_items` uses a subquery:

```sql
order_id IN (
  SELECT id FROM orders WHERE organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
)
```

**Alternative:** Add `organization_id` to `order_items` (redundant) and use:

```sql
organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
```

**Arguments for adding `organization_id` to order_items:**

- Simpler RLS: one subquery (profiles) instead of two (orders + profiles). Can be slightly faster for the planner.
- Easier to partition or shard by `organization_id` later.
- Some analytics queries can filter `order_items` by `organization_id` without joining `orders`.

**Arguments against (keep only `order_id`):**

- Normalized: no redundancy. Single source of truth — org is on `orders` only.
- No risk of `organization_id` drifting between `orders` and `order_items` on bugs or manual updates.
- Inserts: one less column to set; `orders-upsert` does not need to pass `organization_id` into every `order_items` row.
- Consistent with other child tables (`order_shipping`, `order_status_history`, `order_labels`) which also use the subquery pattern.

**Recommendation:** Keep the **subquery-based RLS** for `order_items` (no `organization_id` on `order_items`) for consistency and to avoid denormalization. Revisit adding `organization_id` only if profiling shows RLS as a bottleneck.

---

## Phase 0: Doc and Table Revisit (Before Schema Work)

### Shopee Auth (Developer Guide)

- **Task:** Fetch the official Shopee Open Platform auth doc: [https://open.shopee.com/developer-guide/20](https://open.shopee.com/developer-guide/20) (Auth step).
- **Action:** Compare current implementation in `shopee-start-auth` and `shopee-callback` (and any related auth flow) against the doc. Document any gaps (e.g. HMAC signing, redirect URI, token exchange). Fix only if the current code deviates from the official flow; otherwise document “verified against doc” and any assumptions (e.g. region, partner vs seller).
- **Note:** The page may be login-gated; if unreachable, document “Verify manually when possible” and list what to check (URL params, signature algorithm, token storage).

### marketplace_orders_raw Revisit

- **Task:** Audit the current `marketplace_orders_raw` table (columns and usage).
- **Goal:** Decide if it has **more columns than needed** for its only purpose: **raw archive of ML/Shopee API responses for re-sync and audit**. Never query it for display.
- **Action:** List current columns (from migrations and/or DB types). Propose a minimal set, e.g. `id`, `organization_id`, `marketplace`, `marketplace_order_id`, `raw_payload jsonb`, `created_at`, `last_synced_at`. If the table is already minimal (e.g. one JSONB blob per order), document “keep as-is”. If it has many redundant or derived columns, add a migration (file only) to trim or document “future migration to minimal schema” so new sync code writes only what’s needed.

---

## Phase 1: Database Migrations (Create Files Only)

Create migration files under `supabase/migrations/` following the **updated** schema rules above and the current CYCLE_0 doc. Apply these changes to the doc’s SQL:

- **orders:** `status` = internal workflow (text). Add `**marketplace_status`** = marketplace canonical status (text). Remove `internal_status`. Remove `raw_snapshot`. Use `numeric(18,6)` for all numeric columns. **Do not add `CHECK (marketplace IN (...))` — use plain `text` for `marketplace`.
- **order_items:** Use `numeric(18,6)` for `unit_price`, `unit_cost`. RLS: keep subquery pattern (no `organization_id` on `order_items`) unless the team explicitly chooses denormalization.
- **order_shipping:** No enum-like CHECK; numeric if any.
- **order_status_history:** `source` as plain `text` (no CHECK) if you want to avoid enum-like constraints.
- **order_labels:** `label_type` as plain `text` (no CHECK) for consistency.
- **invoices:** Use `numeric(18,6)` for `total_value`. No PostgreSQL enums; use `text` for `status` and `emission_environment` (no CHECK if you prefer future flexibility), and keep `idempotency_key` UNIQUE.

Files to create (names are illustrative):

- `20260301_000000_create_orders_table.sql`
- `20260301_000001_create_order_items_table.sql`
- `20260301_000002_create_order_shipping_table.sql`
- `20260301_000003_create_order_status_history_table.sql`
- `20260301_000004_create_order_labels_table.sql`
- `20260301_000005_create_invoices_table.sql`
- `20260301_000006_fix_marketplace_integrations_unique.sql` — add `UNIQUE (organizations_id, marketplace_name)` per CYCLE_0.

Preserve the advisory lock pattern from `20251231_create_fn_reservar_e_numerar_notas.sql` for NFe number sequencing.

---

## Phase 2: Shared Types + Normalize Functions + Tests

- Add `_shared/domain/orders-types.ts` with `NormalizedOrder`, `NormalizedOrderItem`, `NormalizedOrderShipping`. Field names must align with `**status`** (internal) and `**marketplace_status\*\` (marketplace).
- **orders-normalize-ml:** Raw ML API → NormalizedOrder. Output `status` = internal (if you derive one) and `marketplace_status` = ML status as-is.
- **orders-normalize-shopee:** Raw Shopee API → same shape. `marketplace_status` = Shopee status as-is.
- **Tests:** Unit tests for both normalizers (sample ML/Shopee JSON → assert normalized shape and key fields: amounts, dates, marketplace_status, items count). Add tests before or in the same PR as the refactor.

---

## Phase 3: orders-upsert + Tests

- Single function that writes to `orders`, `order_items`, `order_shipping`, `order_status_history`. Uses `**status`** and `**marketplace_status\*\` from NormalizedOrder.
- On status change, insert into `order_status_history` (append-only); use `marketplace_status` for history if that’s what changed.
- **Tests:** Unit tests with mocked Supabase: call upsert with a NormalizedOrder, assert correct upsert calls and that history row is inserted when `marketplace_status` (or status) changes.

---

## Phase 4: Sync and Webhook Functions + Tests

- **orders-sync-ml:** Pagination, token handling, normalize + upsert; write to `marketplace_orders_raw` as today.
- **orders-sync-shopee:** HMAC auth, cursor pagination, normalize + upsert.
- **orders-webhook:** Unified handler; validate signature; fetch full order; normalize + upsert with `source: 'webhook'`; return 200 quickly.

### How ML notifications work (Mercado Livre)

Each topic/entity can have notifications tied to specific events and actions. Notifications are sent when those activities occur on Mercado Livre; the integrator can subscribe to specific events within a topic via the filters offered by the API.

**Orders topic (recommended):**

- `**orders_v2` — You receive notifications on creation and updates of your confirmed sales.

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

**Required follow-up:** Parse `resource` (e.g. `/orders/2195160686` → order ID `2195160686`), then **GET** the full order with the seller's access token:

```bash
curl -X GET -H 'Authorization: Bearer $ACCESS_TOKEN' https://api.mercadolibre.com/orders/$ORDER_ID
```

Then call `orders-normalize-ml` on the response and `orders-upsert` with `source: 'webhook'`. Detection: ML → `body.topic === 'orders_v2'` or header `x-source === 'mercado_livre'`; Shopee → `body.shop_id !== undefined && body.code !== undefined`. Do not chain NFe, inventory, or other side effects — ML retries if the handler takes > 2 seconds.

- **Tests:** At least one integration-style or unit test per sync path (e.g. mock API responses, assert normalize + upsert called, no duplicate orders on double call).

---

## Phase 5: emit-invoice + Tests

- Idempotency: create `invoices` row with `idempotency_key` before calling Focus; on conflict return existing; never call Focus without a row.
- **Tests:** Assert that two calls with same idempotency_key result in one invoice and one Focus call (or mocked Focus call).

---

## Phase 6: Data Migration and Triggers

### 6a. Data Migration Plan

**notas_fiscais → invoices**

- Build a **one-off migration script** (SQL or script that uses Supabase client) that:
  - Reads from `notas_fiscais` (and `orders` / `marketplace_orders_presented_new` if order_id mapping is needed).
  - Maps to `invoices`: `idempotency_key = organization_id || ':' || order_id || ':' || emission_environment`, status mapping (e.g. autorizada → authorized, pendente → pending), and all other fields per CYCLE_0.
  - Inserts into `invoices` with conflict handling (e.g. ON CONFLICT idempotency_key DO NOTHING or UPDATE) so it is safe to run once the new table and emit-invoice are in place.
- Run only after `invoices` exists and application code uses it; keep `notas_fiscais` read-only until all NFe reads are migrated.

**Old orders/presented → new orders (and related)**

- **Preferred:** Re-sync from ML/Shopee APIs into the new tables (last 90 days or whatever the API allows). No transformation from the 87-column table.
- **When re-sync is not enough:** Document or implement a **one-off ETL** from `marketplace_orders_presented_new` (and related) into `orders`, `order_items`, `order_shipping` only for data outside API retention or when API is unavailable. Keep the script minimal and run once; prefer re-sync wherever possible.

### 6b. Trigger Migration

- Per [CYCLE_0](docs/CYCLE_0_ORDERS_PLATFORM.md) and [DATABASE_TRIGGERS.md](docs/DATABASE_TRIGGERS.md): **Drop** the listed triggers and their functions only **after** the new edge functions (orders-upsert, orders-sync-ml, orders-sync-shopee) are deployed and verified. Do not drop while the old pipeline is still in use.

---

## Phase 7: Frontend Migration

- **orders.service.ts:** Query `orders` (and joins to `order_items`, etc.). Use `**status`** for internal workflow and `**marketplace_status\*\`for display of marketplace state where needed. Simplify`parseOrderRow()`; labels from `order_labels` on demand.
- **Hooks / Orders.tsx:** Use `status` (internal) and `marketplace_status` (marketplace) consistently; real-time subscription on `orders` table.
- Per CYCLE_0 Frontend Premise: rewire data source only; do not redesign UI.

---

## Phase 8: Re-sync and Definition of Done

- Trigger 90-day re-sync (orders-sync-ml, orders-sync-shopee) for active integrations.
- Validate all 7 Definition of Done criteria from CYCLE_0.
- Point Vercel webhook forwarders to the new `orders-webhook` Edge Function.

---

## Why Webhooks Go Through Vercel

Marketplaces are configured with the app’s public URL (Vercel). The Vercel routes are forwarders that proxy to Supabase Edge Functions. The plan only updates the forward target to `orders-webhook`; it does not require switching to a direct Supabase URL.

---

## Tests Summary

When refactoring or changing any of the following, ensure tests exist or are added:

- **orders-normalize-ml** / **orders-normalize-shopee:** Unit tests with sample API JSON.
- **orders-upsert:** Mocked Supabase; assert upsert/insert behavior and status history.
- **orders-sync-ml** / **orders-sync-shopee:** At least one test per sync path (idempotency, error handling).
- **orders-webhook:** Signature validation and normalize+upsert invocation.
- **emit-invoice:** Idempotency (two calls → one invoice, one external call).

Existing tests in `src/services/__tests__/` (e.g. `orders.service.test.ts`) should be updated when the service layer switches to the new schema.

---

## Files NOT to Touch

- Auth edge functions (start-auth, callback, refresh) for ML and Shopee — except where Shopee Auth verification finds a required fix.
- Focus NFe functions (focus-nfe-emit, focus-nfe-cancel, focus-nfe-sync, focus-webhook) unless a bug is found.
- `_shared/` adapters (use as-is).
- Vercel webhook forwarders: only change the forward target URL to `orders-webhook`.

## No-Gos

- No new user-facing features; no Shopee-specific frontend; no multi-warehouse; no event-driven architecture.
- No running migrations from this plan — only creating migration and data-migration files/scripts.
