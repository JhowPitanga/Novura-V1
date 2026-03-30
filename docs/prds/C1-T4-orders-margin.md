# PRD — C1-T4: Orders List with Real Margin

**Cycle:** 1 — O Primeiro Minuto
**Status:** 🔴 Not Started
**Depends on:** [C1-T3 — Product Costs](./C1-T3-product-costs.md) (unit_cost populated in order_items)
**Blocks:** [C1-T5 — Freemium Gates](./C1-T5-freemium-gates.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

The orders list screen already exists and works. This task adds three new columns to it:
"Receita Líquida" (the net amount after ML fees and shipping), "Margem R$" (how much the
seller actually profited in reais), and "Margem %" (the profit as a percentage).

The margin columns are color-coded: green for good margin (> 20%), yellow for thin margin
(5–20%), and red for negative or near-zero margin (< 5%). Orders with no cost set show
"Sem custo" in gray — never R$0 or 0%.

These columns are a paid feature. Free users see the columns but they are blurred, with a
lock icon and a prompt to subscribe. This is the main conversion hook.

This task changes ONLY the service and display layer. No JSX structure changes, no new pages.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] Read `src/services/orders.service.ts` in full.
      Does `fetchAllOrders` already include `net_amount` from the `orders` table?
      Does it include `order_items` with `unit_cost`?
- [ ] Read `src/types/orders.ts` (or wherever `OrderListRow` is defined).
      Does it have `net_amount`, `unit_cost`, margin fields?
- [ ] Read `src/pages/Orders.tsx` — specifically the table column definitions.
      Identify where new columns can be inserted without changing existing ones.
- [ ] Read `src/hooks/useOrderFiltering.ts` — does it accept a margin filter?
- [ ] Check `src/utils/margin.ts` — does this file exist? If yes, read it.
      If not, it will need to be created.
- [ ] Check `src/utils/formatting.ts` — does `formatBRL`, `formatPercent` exist?

**Update this section with findings before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_1_PRIMEIRO_MINUTO.md` section "Feature F1.4: Orders List with Real Margin" in full.
- [ ] Read `src/services/orders.service.ts` in full. Note which tables are queried.
- [ ] Read `src/pages/Orders.tsx` — note the existing column structure. Do NOT change any existing column.
- [ ] Read `src/hooks/useOrderFiltering.ts` — understand how filtering works.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1 (Architecture) and 3 (Service Layer).
- [ ] Confirm `order_items.unit_cost` column exists (from C0-T1 migration).

---

## 4. Architecture Context

### Margin Computation

```
total_cost = SUM(order_items.unit_cost * order_items.quantity) for the order
            NULL if any item has unit_cost = NULL (no cost set)

margin_brl = net_amount - total_cost
             NULL if total_cost is NULL

margin_pct = (margin_brl / net_amount) * 100
             NULL if net_amount = 0 or margin_brl is NULL
```

This computation happens **client-side** from the embedded `order_items` relation already
fetched by the service. Do not add a database view or computed column — the data is already
there after C1-T3 propagates unit_cost.

### Layer Changes

```
ONLY change:
  src/services/orders.service.ts  → ensure order_items.unit_cost is included in SELECT
  src/types/orders.ts             → add marginBrl, marginPct to OrderListRow
  src/utils/margin.ts             → create pure margin computation functions
  src/pages/Orders.tsx            → add 3 new column definitions (non-destructive)

DO NOT change:
  src/hooks/useOrderFiltering.ts  → (unless adding margin filter — see Section E)
  src/components/orders/*         → existing components untouched
  Any existing column in Orders.tsx
```

### Paywall Pattern

```typescript
// In the margin column renderer:
const { isPaid } = useSubscription()

if (!isPaid) {
  return <BlurredMarginPlaceholder />  // shows "—" or blurred value + lock icon
}
return <MarginDisplay value={row.marginPct} />
```

`useSubscription` will be built in C1-T5. For now, add a stub that always returns `{ isPaid: true }`
until C1-T5 is complete. Add a comment: `// TODO C1-T5: replace stub with real useSubscription`.

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **DO NOT change existing columns or their order** | The seller is used to the current layout. Any visual change will cause confusion. |
| **DO NOT show R$0 or 0% for missing costs** | Show "Sem custo" label in gray. A zero misleads. |
| **NEVER compute margin in JSX** | Margin computation belongs in `src/utils/margin.ts` only. |
| **DO NOT block on items loading** | If `order_items` data is absent, show "Sem custo" gracefully. |
| **Add new columns at the end** | Do not insert new columns between existing ones. |

---

## 6. What to Build

### Section A: Margin Utilities

**File:** `src/utils/margin.ts`

```typescript
export const MARGIN_THRESHOLDS = {
  GREEN:  0.20,  // > 20% = green
  YELLOW: 0.05,  // > 5% = yellow
  // else: red
} as const

export type MarginColor = 'green' | 'yellow' | 'red' | 'none'

export function computeMarginBRL(
  netAmount: number,
  totalCost: number | null
): number | null {
  if (totalCost === null) return null
  return netAmount - totalCost
}

export function computeMarginPct(
  netAmount: number,
  totalCost: number | null
): number | null {
  if (totalCost === null) return null
  if (netAmount === 0) return null
  return ((netAmount - totalCost) / netAmount) * 100
}

export function computeTotalCost(
  items: Array<{ unit_cost: number | null; quantity: number }>
): number | null {
  const hasAnyCost = items.some(item => item.unit_cost !== null)
  if (!hasAnyCost) return null
  return items.reduce((sum, item) => {
    return sum + (item.unit_cost ?? 0) * item.quantity
  }, 0)
}

export function getMarginColor(marginPct: number | null): MarginColor {
  if (marginPct === null) return 'none'
  if (marginPct > MARGIN_THRESHOLDS.GREEN * 100) return 'green'
  if (marginPct > MARGIN_THRESHOLDS.YELLOW * 100) return 'yellow'
  return 'red'
}
```

#### Definition of Done — Section A
- [ ] File exists at `src/utils/margin.ts`
- [ ] All 4 functions exported
- [ ] `computeMarginPct` returns `null` when no cost (not 0)
- [ ] `getMarginColor` returns `'none'` for null (not `'red'`)
- [ ] No imports from React or Supabase (pure functions only)

---

### Section B: Update `orders.service.ts`

Ensure the order list query includes `order_items(unit_cost, quantity)` in the SELECT.

If `fetchAllOrders` already has `order_items` in its SELECT (from C0-T9), verify that
`unit_cost` is included in the items sub-select. If not, add it.

```typescript
// In the SELECT string, ensure order_items includes:
order_items (
  id,
  title,
  sku,
  quantity,
  unit_price,
  unit_cost,          ← add this if missing
  variation_name,
  product_id
)
```

#### Definition of Done — Section B
- [ ] `order_items.unit_cost` included in the SELECT used by `fetchAllOrders`
- [ ] No other changes to the service — extend only

---

### Section C: Update `OrderListRow` Type

**File:** `src/types/orders.ts`

Add computed margin fields to `OrderListRow`:

```typescript
// Add to OrderListRow interface:
marginBrl:    number | null  // null if no cost data
marginPct:    number | null  // null if no cost data
marginColor:  'green' | 'yellow' | 'red' | 'none'
```

These are computed in the `normalizeOrderListRow` function (or wherever the service maps raw
Supabase data to `OrderListRow`). Use `computeTotalCost`, `computeMarginBRL`,
`computeMarginPct`, and `getMarginColor` from `@/utils/margin`.

#### Definition of Done — Section C
- [ ] `marginBrl`, `marginPct`, `marginColor` added to `OrderListRow`
- [ ] Computed from `order_items` array using margin util functions
- [ ] No `any` types

---

### Section D: Add Margin Columns to Orders Table

**File:** `src/pages/Orders.tsx`

Locate where the "Todos os Pedidos" tab column definitions are set. Add 3 new columns
**at the end** of the existing column list:

```typescript
{
  key: 'netAmount',
  header: 'Receita Líquida',
  render: (row) => formatBRL(row.net_amount ?? 0),
},
{
  key: 'marginBrl',
  header: 'Margem R$',
  render: (row) => {
    if (!isPaid) return <BlurredMarginCell />
    if (row.marginBrl === null) return <span className="text-gray-400">Sem custo</span>
    return <span className={marginColorClass(row.marginColor)}>{formatBRL(row.marginBrl)}</span>
  },
},
{
  key: 'marginPct',
  header: 'Margem %',
  render: (row) => {
    if (!isPaid) return <BlurredMarginCell />
    if (row.marginPct === null) return <span className="text-gray-400">—</span>
    return <span className={marginColorClass(row.marginColor)}>{formatPercent(row.marginPct)}</span>
  },
},
```

Helper for color class:
```typescript
function marginColorClass(color: MarginColor): string {
  return {
    green:  'text-green-600 font-medium',
    yellow: 'text-yellow-600 font-medium',
    red:    'text-red-600 font-medium',
    none:   'text-gray-400',
  }[color]
}
```

**Stub for useSubscription** (until C1-T5):
```typescript
// TODO C1-T5: replace this stub with the real useSubscription hook
const isPaid = true
```

**BlurredMarginCell** (inline, under 10 lines):
```typescript
function BlurredMarginCell() {
  return (
    <span className="filter blur-sm select-none text-gray-500 cursor-not-allowed" title="Disponível no plano pago">
      R$ 99,99
    </span>
  )
}
```

#### Definition of Done — Section D
- [ ] 3 new columns added to the orders table
- [ ] Existing columns unchanged
- [ ] "Sem custo" shows in gray when no cost data
- [ ] Color coding applied correctly
- [ ] `isPaid = true` stub in place with TODO comment

---

### Section E: Add Margin Filter (optional, do if straightforward)

If `useOrderFiltering.ts` has a clear pattern for adding new filter options, add a "Margem"
dropdown filter to the existing filter bar:
- Options: "Todas", "Alta (>20%)", "Positiva (>0%)", "Negativa (<0%)"

If adding this filter would require significant refactoring of `useOrderFiltering.ts`,
**skip this section** — the filter is not a blocker for C1 DoD. Add a TODO comment:
`// TODO C1 extension: add margin filter to useOrderFiltering`.

#### Definition of Done — Section E (conditional)
- [ ] If added: filter options work correctly with the computed `marginPct` values
- [ ] If skipped: TODO comment added in the filter bar area

---

## 7. Integration Checklist

- [ ] `order_items.unit_cost` is fetched in the orders query (Section B)
- [ ] Margin columns only show when the "Todos os Pedidos" tab is active (not on NFe or print tabs)
- [ ] `formatBRL` and `formatPercent` imported from `@/utils/formatting`
- [ ] Margin computation functions imported from `@/utils/margin`
- [ ] `isPaid` stub in place with TODO comment for C1-T5

---

## 8. Definition of Done — Full Task

- [ ] All Section A–D DoD items checked
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Manual QA checklist:
  - [ ] Orders list shows 3 new columns: "Receita Líquida", "Margem R$", "Margem %"
  - [ ] An order with a product cost set shows correct margin in green/yellow/red
  - [ ] An order with NO cost shows "Sem custo" in gray (not R$0 or 0%)
  - [ ] Color coding is correct: >20% green, 5-20% yellow, <5% red
  - [ ] Existing columns (order ID, status, buyer, etc.) are unchanged
  - [ ] `npm run build` passes — no TypeScript errors from new fields
- [ ] No `any` types introduced
- [ ] No margin computation in JSX (only via util functions)

---

## 9. What NOT to Build

- **Do NOT change existing columns or their order** — seller muscle memory matters.
- **Do NOT show a margin summary at the top of the page** — that belongs in Diagnóstico (C1-T2).
- **Do NOT build a real `useSubscription` hook here** — use the stub. C1-T5 does billing.
- **Do NOT add margin to the order detail panel** — OrderDetails.tsx stays unchanged.
- **Do NOT compute margin server-side** — client-side computation from already-fetched items is sufficient.
