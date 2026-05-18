# PRD — C1-T3: Product Cost Input

**Cycle:** 1 — O Primeiro Minuto
**Status:** 🔴 Not Started
**Depends on:** C0-T9 (new tables populated with orders and order_items)
**Blocks:** [C1-T4 — Orders with Margin](./C1-T4-orders-margin.md), [C1-T6 — Match Engine](./C1-T6-product-match-engine.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

Before Novura can show sellers their real profit margin per order, it needs to know how much
each product costs to make or buy. This screen is where sellers enter those costs.

It shows a list of their products sorted from most-sold to least-sold over the last 90 days.
For each product, there's a simple text box: "R$ [enter cost here]". The seller fills it in,
presses Save, and Novura immediately updates all historical orders for that product to show
the correct margin. No batch saves, no complex setup — one product at a time.

The moment a cost is saved, the orders list and Diagnóstico refresh automatically.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] `src/pages/ProductCosts.tsx` — does this file exist? If yes, read it.
- [ ] Check if the `products` table already has a `unit_cost` or `cost` column.
      Run: `grep -r "unit_cost\|cost" supabase/migrations/ | head -30`
- [ ] Check if `product_costs` table migration already exists:
      `ls supabase/migrations/ | grep product_costs`
- [ ] Read `src/services/orders.service.ts` — does `fetchAllOrders` include `order_items.unit_cost`?
- [ ] Read `src/types/orders.ts` — does `OrderListRow` have a cost/margin field?
- [ ] Check existing `src/services/products.service.ts` if it exists — read it.
- [ ] Read `src/hooks/useAuth.tsx` — how is `organizationId` accessed?
- [ ] Confirm the `/produtos/custos` route is NOT already in `src/App.tsx`.

**Update this section with findings before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_1_PRIMEIRO_MINUTO.md` section "Feature F1.3: Product Cost Input" in full.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1–3 (Architecture, SOLID, Service Layer).
- [ ] Confirm the `products` table schema: read `supabase/migrations/` for any migration
      containing `CREATE TABLE products` or `ALTER TABLE products`.
- [ ] Confirm the `order_items` table has a `unit_cost` column (from C0-T1).
      Read `supabase/migrations/20260301_000002_create_order_items_table.sql`.
- [ ] Check if `product_variations` table exists. If so, read its migration.

---

## 4. Architecture Context

### Data Model Decision

Before writing code, determine where costs are stored:

**Option A — `products` table already has `unit_cost` column:**
→ Use it directly. No new migration needed.

**Option B — No cost column exists:**
→ Create a new `product_costs` table (migration below). This is preferred if `products`
  is already complex — keeps costs as a separate concern.

```sql
-- supabase/migrations/YYYYMMDD_000000_create_product_costs_table.sql
CREATE TABLE IF NOT EXISTS product_costs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL,
  unit_cost       numeric(18, 2) NOT NULL CHECK (unit_cost > 0),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (organization_id, product_id)
);

CREATE INDEX idx_product_costs_org ON product_costs(organization_id);
```

**The agent must decide Option A or B by reading the actual schema before writing any code.**

### Layer Rules

```
src/pages/ProductCosts.tsx
  → calls useProductCosts() hook only — no supabase calls

src/hooks/useProductCosts.ts
  → useQuery for list, useMutation for save
  → invalidates ['orders'] and ['diagnostico'] on save

src/services/products.service.ts
  → fetchProductsWithSalesVolume(orgId)
  → upsertProductCost(orgId, productId, cost)
  → updateOrderItemsCostForProduct(orgId, productId, cost)
```

### Cost Propagation (critical)

When a cost is saved:
1. UPSERT into `product_costs` (or update `products.unit_cost`)
2. UPDATE `order_items SET unit_cost = $cost WHERE product_id = $productId AND organization_id = $orgId`
   — this propagates cost to all historical orders immediately
3. Invalidate TanStack Query cache for `['orders']` and `['diagnostico']`

This means the orders list and Diagnóstico will re-fetch and show updated margins within seconds.

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER allow saving cost = 0** | 0 means "not set" in this system. Validate before save. |
| **Allow cost > sale price** | It's the seller's data — we warn but don't block. |
| **NEVER delete `product_costs` rows** | Downgrade to "no cost" means setting it to null in a future flow, not deleting the record. |
| **UPSERT, not INSERT** | Saving a cost for a product that already has one must update, not error. |
| **Paginate — never load all products** | 50 per page. A seller with 500 products must not get a 500-row query. |

---

## 6. What to Build

### Section A: Migration (if needed)

**Only create this if the `products` table does NOT have a cost column.**

**File:** `supabase/migrations/[TODAY_DATE]_000000_create_product_costs_table.sql`

Use the schema defined in Section 4. The migration filename must follow the format:
`YYYYMMDD_HHMMSS_description.sql`.

Present this migration to a human before applying it to production.

#### Definition of Done — Section A
- [ ] Agent confirmed whether Option A or B applies
- [ ] If Option B: migration file exists in `supabase/migrations/`
- [ ] If Option B: migration applied to dev environment

---

### Section B: Products Service

**File:** `src/services/products.service.ts`

Create or extend this file. Add these 3 functions:

```typescript
export async function fetchProductsWithSalesVolume(
  organizationId: string,
  page = 1,
  pageSize = 50
): Promise<{ products: ProductWithSales[]; total: number }> {
  // 1. Query order_items joined to orders for the last 90 days
  //    GROUP BY product_id (or marketplace_item_id if no product_id)
  //    SUM(quantity) as sales_count
  // 2. Join with products table to get name, image_url, existing unit_cost
  // 3. Sort by sales_count DESC
  // 4. Apply pagination
}

export async function upsertProductCost(
  organizationId: string,
  productId: string,
  cost: number
): Promise<void> {
  // UPSERT to product_costs (or UPDATE products.unit_cost)
  // onConflict: 'organization_id,product_id'
}

export async function updateOrderItemsCostForProduct(
  organizationId: string,
  productId: string,
  cost: number
): Promise<void> {
  // UPDATE order_items SET unit_cost = cost
  // WHERE product_id = productId
  // AND order_id IN (SELECT id FROM orders WHERE organization_id = orgId)
}
```

Also add query keys:
```typescript
export const productCostKeys = {
  list: (orgId: string, page: number) => ['product-costs', 'list', orgId, page] as const,
}
```

Each function under 30 lines.

#### Definition of Done — Section B
- [ ] 3 functions implemented, each under 30 lines
- [ ] `fetchProductsWithSalesVolume` returns paginated results
- [ ] `upsertProductCost` uses UPSERT (not INSERT)
- [ ] `updateOrderItemsCostForProduct` updates all historical order_items for that product
- [ ] No `any` types

---

### Section C: Types

**File:** `src/types/products.ts` (create or extend)

```typescript
export interface ProductWithSales {
  id: string
  name: string
  imageUrl: string | null
  sku: string | null
  salesCount: number        // units sold in last 90 days
  currentCost: number | null // null if no cost set yet
}

export interface ProductCostRow {
  productId: string
  cost: number
}
```

#### Definition of Done — Section C
- [ ] Both interfaces defined, no `any`

---

### Section D: `useProductCosts` Hook

**File:** `src/hooks/useProductCosts.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import {
  fetchProductsWithSalesVolume,
  upsertProductCost,
  updateOrderItemsCostForProduct,
  productCostKeys,
} from '@/services/products.service'

export function useProductCosts(page: number) {
  const { organizationId } = useAuth()
  const queryClient = useQueryClient()

  const productsQuery = useQuery({
    queryKey: productCostKeys.list(organizationId ?? '', page),
    queryFn: () => fetchProductsWithSalesVolume(organizationId!, page),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })

  const saveCostMutation = useMutation({
    mutationFn: ({ productId, cost }: { productId: string; cost: number }) =>
      Promise.all([
        upsertProductCost(organizationId!, productId, cost),
        updateOrderItemsCostForProduct(organizationId!, productId, cost),
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['diagnostico'] })
      queryClient.invalidateQueries({ queryKey: ['product-costs'] })
    },
  })

  return { productsQuery, saveCostMutation }
}
```

#### Definition of Done — Section D
- [ ] File exists at `src/hooks/useProductCosts.ts`
- [ ] On mutation success: `['orders']` and `['diagnostico']` query caches invalidated
- [ ] Under 60 lines

---

### Section E: `ProductCosts.tsx` Page

**File:** `src/pages/ProductCosts.tsx`

UI structure:
- Header: `"Custos dos Produtos"` with subtitle `"Adicione o custo de cada produto para calcular sua margem real."`
- Table or card list:
  - Columns: Produto (thumbnail + name) | Vendas (90d) | Custo atual | Novo custo | Ação
  - Each row has an input field (`R$` prefix) and a `"Salvar"` button
  - If cost already set: input pre-filled with current cost
  - If no cost: input placeholder `"0,00"`
- Pagination: show 50 products per page, standard prev/next controls
- Loading state: skeleton rows

**Validation before save:**
- Cost must be > 0 (show validation message: `"O custo deve ser maior que R$0,00"`)
- If cost > sale price of any order: show warning but do NOT block save:
  `"O custo é maior que o preço de venda — margem negativa."`

**After save:**
- Show success toast: `"Custo salvo com sucesso"`
- Input field updates to show new cost
- (The cache invalidation in the hook handles refreshing orders + diagnostico)

Constraints: under 150 lines. No supabase calls. Uses `useProductCosts` hook only.

#### Definition of Done — Section E
- [ ] File exists at `src/pages/ProductCosts.tsx`
- [ ] Shows products sorted by sales volume (most sold first)
- [ ] Pagination works (50 per page)
- [ ] Save button saves cost, shows success toast
- [ ] Validation prevents saving R$0
- [ ] Under 150 lines

---

### Section F: Register Route in App.tsx

Add to `src/App.tsx` under the `/produtos/*` route group:

```typescript
<Route path="/produtos/custos" element={
  <ProtectedRoute>
    <RestrictedRoute module="produtos" actions={['view']}>
      <Suspense fallback={<Loading />}>
        <ProductCosts />
      </Suspense>
    </RestrictedRoute>
  </ProtectedRoute>
} />
```

#### Definition of Done — Section F
- [ ] Route registered at `/produtos/custos`
- [ ] Uses `ProtectedRoute` + `RestrictedRoute` as other `/produtos/*` routes do

---

## 7. Integration Checklist

- [ ] When cost is saved, `order_items.unit_cost` is updated for all historical orders of that product
- [ ] `['orders']` TanStack Query cache is invalidated after save (margin column in orders list will refresh)
- [ ] `['diagnostico']` cache is invalidated after save (Diagnóstico CTA section will update)
- [ ] Products with no `product_id` on order_items (marketplace items not yet linked) are still shown, greyed out with `"Produto não vinculado"` label
- [ ] Products paginated at 50 per page

---

## 8. Definition of Done — Full Task

- [ ] All Section A–F DoD items checked
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Manual QA checklist:
  - [ ] `/produtos/custos` shows products sorted by sales volume
  - [ ] Can enter and save a cost for a product
  - [ ] Saving R$0 shows validation error
  - [ ] After saving, orders list refreshes with updated margin
  - [ ] After saving, Diagnóstico refreshes
  - [ ] Pagination works (next/prev)
  - [ ] Products with no link show "Produto não vinculado" greyed out
- [ ] No `any` types
- [ ] No supabase calls in component files

---

## 9. What NOT to Build

- **Do NOT build product creation here** — this screen is for cost input only.
  Product creation is in C1-T6 (match engine).
- **Do NOT build bulk import (CSV)** — one by one is intentional for MVP.
  The most-sold-first sort means the seller fills in the 10–20 most important products quickly.
- **Do NOT build variation-level costs here** — if `product_variations` exists,
  use the parent `product_id` for now. Variation-level cost tracking is a future enhancement.
- **Do NOT add a "calculate margin" preview column** — the margin appears in the orders list
  (C1-T4). This screen is purely for data entry.
- **Do NOT allow cost = 0** — 0 means "not configured". See validation rules above.
