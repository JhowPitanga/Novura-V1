# PRD — C0-T9: Frontend Migration — Rewire Queries to New Tables

**Cycle:** 0 — Plataforma de Pedidos
**Status:** 🔴 Not Started
**Depends on:** [C0-T3 — `orders-upsert`](./C0-T3-orders-upsert-function.md) (new tables must be populated)
**Blocks:** [C0-T10 — Legacy Cleanup](./C0-T10-legacy-cleanup.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

The orders screen in the Novura app still reads from the old, messy 87-column table
(`marketplace_orders_presented_new`). This task rewires it to read from the new, clean
tables built in Cycle 0 — without changing anything the seller sees on screen.

Think of it like replacing the plumbing behind a wall. The sink looks exactly the same.
The water pressure might even be better. But what's flowing through the pipes is completely
different.

**Important constraint:** The design and layout of the orders screen are frozen.
Do NOT change any colors, spacing, buttons, or copy. The only things changing are the
files that fetch data from the database. If you end up editing JSX or Tailwind classes
for reasons other than fixing a bug, stop — that's out of scope.

---

## 2. Current State & Progress

The frontend currently reads from `marketplace_orders_presented_new` through:
- `src/services/orders.service.ts` — raw Supabase queries
- `src/hooks/useOrders.ts` (or equivalent) — React Query wrappers
- Several inline `supabase.from('marketplace_orders_presented_new')` calls that may exist
  in components (violations of the service layer rule)

**Before starting, the agent must:**
1. Read every file in `src/services/` and `src/hooks/` that references `marketplace_orders_presented_new`
2. Map which fields from the old table map to which fields in the new tables
3. Verify the new tables are populated (at least 90 days of ML data must be present)

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

This task involves changing production data queries. Read everything first.

- [ ] Confirm C0-T3, C0-T4, C0-T5 are complete and the `orders` table is populated.
      Run: `SELECT COUNT(*) FROM orders` — must return > 0 before starting.
- [ ] Search the entire `src/` directory for every reference to `marketplace_orders_presented_new`.
      Command: `grep -r "marketplace_orders_presented_new" src/`
      List every file found and what it does.
- [ ] Read `src/services/orders.service.ts` in full.
- [ ] Read `src/hooks/useOrders.ts` (or `useNfeStatus.ts`, `useOrderFiltering.ts`) in full.
- [ ] Read `src/pages/Orders.tsx` — note which fields it uses from the order object.
- [ ] Read `src/components/orders/OrderDetails.tsx` — note which fields it uses.
- [ ] Read `src/components/orders/LinkOrderModal.tsx` — note which fields it uses.
- [ ] Build a field mapping table (Section 4 below) BEFORE writing any code.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` in full — specifically sections 3 (Service Layer) and 2 (SOLID).
- [ ] Read `REFACTORING_PLAN.md` at the project root for context on the frontend refactoring already done.

---

## 4. Architecture Context

### The Rule: Change Services and Hooks Only

```
pages/Orders.tsx           ← DO NOT TOUCH (unless a bug is found)
  ↓ calls
hooks/useOrders.ts         ← CHANGE: update queryFn to call new service methods
  ↓ calls
services/orders.service.ts ← CHANGE: rewrite queries to use new tables
  ↓ calls
Supabase: orders, order_items, order_shipping   ← NEW TABLES
```

Any `supabase.from(...)` found in a component (not in a service) is a pre-existing bug.
Fix it by moving the query to the service layer while you're here — but do not refactor
the component structure beyond that.

### Field Mapping: Old Table → New Tables

The agent must complete this mapping before writing code. Use it as a checklist
to ensure no fields are lost in migration.

| Old field (`marketplace_orders_presented_new`) | New location | Notes |
|---|---|---|
| `id` | `orders.id` | UUID changes — new IDs, not backward compatible |
| `organization_id` | `orders.organization_id` | Same |
| `marketplace_name` | `orders.marketplace` | Renamed |
| `order_id` (marketplace) | `orders.marketplace_order_id` | Renamed |
| `status` | `orders.marketplace_status` | Renamed — canonical ML/Shopee status |
| `status_interno` | `orders.internal_status` | Renamed — seller workflow status |
| `valor_bruto` | `orders.gross_amount` | Renamed |
| `comissao_ml` | `orders.marketplace_fee` | Renamed |
| `frete` | `orders.shipping_cost` | Renamed |
| `valor_liquido` | `orders.net_amount` | Renamed |
| `nome_comprador` | `orders.buyer_name` | Renamed |
| `cpf_comprador` | `orders.buyer_document` | Renamed |
| `email_comprador` | `orders.buyer_email` | Renamed |
| `estado_comprador` | `orders.buyer_state` | Renamed |
| `data_criacao` | `orders.created_at` | Renamed |
| `data_envio` | `orders.shipped_at` | Renamed |
| `first_item_title` | `order_items.title` (first row) | JOIN required |
| `first_item_sku` | `order_items.sku` (first row) | JOIN required |
| `first_item_quantity` | `order_items.quantity` (first row) | JOIN required |
| `first_item_unit_price` | `order_items.unit_price` (first row) | JOIN required |
| `tracking_number` | `order_shipping.tracking_number` | JOIN required |
| `endereco_*` | `order_shipping.*` | JOIN required |
| `nfe_status` | `invoices.status` (JOIN on order_id) | Nullable — may not have invoice |
| `nfe_chave` | `invoices.nfe_key` | Nullable |
| Label columns (`label_pdf`, `label_zpl2`) | `order_labels.content_base64` | JOIN — fetch lazily only when printing |

> ⚠️ **Agent:** The mapping above is a starting point. The actual old table may have
> additional columns. Read the migration file at `supabase/migrations/20251204_materialize_orders_presented_new.sql`
> to see all columns and complete the mapping.

### The JOIN Pattern

The orders list query must use a JOIN to pull shipping and first item into each order row.
Here is the recommended service pattern:

```typescript
// src/services/orders.service.ts

const ORDER_LIST_SELECT = `
  id,
  organization_id,
  marketplace,
  marketplace_order_id,
  status,
  marketplace_status,
  internal_status,
  gross_amount,
  marketplace_fee,
  shipping_cost,
  net_amount,
  buyer_name,
  buyer_document,
  buyer_state,
  created_at,
  shipped_at,
  order_items (
    id,
    title,
    sku,
    quantity,
    unit_price,
    variation_name,
    product_id
  ),
  order_shipping (
    tracking_number,
    carrier,
    status,
    state_uf,
    city
  ),
  invoices (
    id,
    status,
    nfe_key,
    nfe_number,
    emission_environment
  )
`

export class OrdersService {
  constructor(private readonly organizationId: string) {}

  async fetchAll(): Promise<OrderListRow[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_LIST_SELECT)
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map(normalizeOrderListRow)
  }
}
```

The `normalizeOrderListRow` function converts the Supabase nested JOIN response into the
flat `OrderListRow` shape that the components expect. This adapter function keeps the
components clean — they never see the JOIN structure.

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **Do NOT change JSX, Tailwind classes, or component structure** | Design is frozen. Any visual change is out of scope. |
| **Do NOT drop `marketplace_orders_presented_new` in this task** | That is C0-T10. While migrating, both tables coexist. |
| **Do NOT change URL routes (`/pedidos`)** | Routes stay in Portuguese per the project convention. |
| **Do NOT migrate all queries in one PR** | Migrate screen by screen (orders list, order detail, NFe filter, print filter). Each screen migrated and tested = one PR. |
| **NEVER call `supabase.from(...)` in a component** | Move any such calls to `services/` first. |

---

## 6. What to Build

### Section A: Update `orders.service.ts`

Rewrite the methods that query `marketplace_orders_presented_new` to query the new tables.

**Approach:**
1. Add new methods alongside the existing ones (`fetchAll_v2()` naming while transitioning)
2. Test the new method returns the same data as the old one
3. Rename to final name, delete old method

Do NOT delete old methods until the calling components are confirmed to use the new ones.

**Methods to rewrite (verify this list by reading the service file):**
- `fetchAllOrders(orgId)` → queries `orders` with JOIN
- `fetchOrderByInternalId(internalId)` → queries `orders` by internal ID
- `fetchNfeStatusRows(orgIds)` → queries `invoices` JOINed to `orders`
- `syncNfeForOrder(orderId)` → may need update for new `invoices` table
- Any other methods that reference `marketplace_orders_presented_new`

#### Definition of Done — Section A
- [ ] All methods in `orders.service.ts` query new tables only
- [ ] No references to `marketplace_orders_presented_new` remain in `orders.service.ts`
- [ ] All methods have explicit TypeScript return types
- [ ] No method body exceeds 50 lines

---

### Section B: Update Type Definitions

The `OrderListRow` type (or equivalent in `src/types/orders.ts`) must be updated to reflect
the new field names.

**Important:** Change field names in the type first. TypeScript will then show errors everywhere
the old field names are used — this is the guide for what to update.

Suggested approach:
```typescript
// src/types/orders.ts

// Old field names → new field names mapping (for reference):
// marketplace_name     → marketplace
// order_id             → marketplace_order_id
// status_interno       → internal_status
// valor_bruto          → gross_amount
// comissao_ml          → marketplace_fee
// valor_liquido        → net_amount
// nome_comprador       → buyer_name
// cpf_comprador        → buyer_document
// estado_comprador     → buyer_state
// data_criacao         → created_at
```

After updating types, fix all TypeScript errors that appear. Do not suppress them with `any`.

#### Definition of Done — Section B
- [ ] `src/types/orders.ts` uses new field names
- [ ] `npm run build` (or `npx tsc --noEmit`) passes with zero type errors
- [ ] No `any` types introduced to suppress errors

---

### Section C: Update Components to New Field Names

After updating types, fix all component references to old field names.

**Files likely to change:**
- `src/pages/Orders.tsx` — order list rendering
- `src/components/orders/OrderDetails.tsx` — detail panel
- `src/components/orders/LinkOrderModal.tsx` — product linking
- `src/components/orders/OrderItemsList.tsx`
- `src/components/orders/OrderFinancials.tsx`
- `src/utils/orderUtils.ts` — any status/formatting helpers

**Do NOT change:**
- Component structure
- CSS/Tailwind classes
- Text content (stays in pt-BR)
- Layout or spacing

#### Definition of Done — Section C
- [ ] `npm run build` passes
- [ ] `npm run lint` passes (no ESLint errors)
- [ ] Orders list screen renders and shows orders from new tables (manual test)
- [ ] Order detail panel opens and shows correct data (manual test)
- [ ] NFe status badges show correct status from `invoices` table (manual test)

---

### Section D: NFe Flow Update

The NFe emission flow (the button that calls `emit-invoice` from C0-T8) must be
updated to pass the correct IDs from the new tables.

Previously the frontend may have passed `marketplace_orders_presented_new.id` as the
`order_id` to NFe functions. Now it must pass `orders.id`.

- [ ] Trace how the frontend calls the NFe emission flow
- [ ] Update the `order_id` parameter to use `orders.id` from new tables
- [ ] Confirm `emit-invoice` (C0-T8) receives the correct UUID

---

## 7. Definition of Done — Full Task

- [ ] All Section A, B, C, D DoD items checked
- [ ] `grep -r "marketplace_orders_presented_new" src/` returns zero results
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Manual QA checklist:
  - [ ] Orders list loads and shows correct orders
  - [ ] Pagination/filtering works
  - [ ] Order detail opens correctly
  - [ ] NFe status shown correctly
  - [ ] Printing flow works
  - [ ] Product linking (Vincular) works
- [ ] No visual changes to any screen (pixel comparison or human review)

---

## 8. What NOT to Build

- **Do NOT redesign the orders screen.** Visual design is frozen.
- **Do NOT add new columns or filters.** That's Cycle 1 scope.
- **Do NOT drop the old table.** That's C0-T10 — happens after this task is confirmed working.
- **Do NOT migrate the `Anúncios` (Listings) screen.** That screen is separate and not
  blocked by the new orders tables.
- **Do NOT add margin calculations.** The `unit_cost` field is null until Cycle 1.
  Show "—" or "N/A" for margin when cost is null. Do not attempt to compute it.
