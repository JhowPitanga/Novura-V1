# PRD — C2-T4: Stock Intelligence Alerts

**Cycle:** 2 — Seu Caixa
**Status:** 🔴 Not Started
**Depends on:** C1-T3 (order_items.unit_cost populated), existing inventory/stock data
**Blocks:** Nothing — parallel track with C2-T1/T2/T3

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

Right now, sellers only find out they're out of stock when a buyer complains. This task
makes Novura proactive: it calculates how many days of stock each product has left based
on recent sales velocity, and surfaces alerts before the stock runs out.

It also flags "dead stock" — products that haven't sold in 45+ days and are costing the
seller money in tied-up capital. If a product costs R$50 and there are 20 units sitting
unsold, that's R$1,000 that could be used for something else.

These alerts surface in two places: "Alerta da semana" on the SeuCaixa screen and a new
alerts section at the top of the existing inventory page.

This task builds ONLY the intelligence layer (computations + service) and the display
widgets. It does NOT build a new inventory management page.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] Read `src/hooks/useStockData.ts` (or equivalent) — how does current stock data work?
- [ ] Read `src/pages/Inventory.tsx` (or `Estoque.tsx`) — what does it currently show?
- [ ] Confirm the `products_stock` or `inventory` table has a `current_quantity` or `stock` column.
- [ ] Check `order_items` table — confirm `product_id` and `unit_cost` columns exist.
- [ ] Check `src/services/` for any existing inventory service.

**Update this section with findings before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_2_SEU_CAIXA.md` section "Feature F2.3: Stock Intelligence" in full.
      Record: 3 features (stock-out, dead stock, lost sales), thresholds, edge cases.
- [ ] Read `docs/CYCLE_2_SEU_CAIXA.md` section "Stock Intelligence — Pure Functions Only" (engineering patterns).
- [ ] Read the existing inventory/stock service and hook to avoid duplication.
- [ ] Confirm minimum data requirements: `product_id` on `order_items`, `unit_cost` for dead stock.

---

## 4. Architecture Context

### Three Intelligence Features

**1. Stock-Out Prediction** (< 7 days remaining → alert)
```
days_until_stockout = current_stock / avg_daily_sales_30d
threshold: < 7 days → alert
requirement: ≥ 14 days of sales history (otherwise skip)
```

**2. Dead Stock** (0 sales in last 45 days → trapped cash alert)
```
trapped_value = unit_cost × current_stock
only shown if unit_cost is set
threshold: $0 sales in 45 days
```

**3. Lost Sales** (informational, shown on inventory page only)
```
if product had 0 stock for any period in last 30 days:
  lost_units ≈ out_of_stock_days × avg_daily_sales_before_stockout
  lost_value ≈ lost_units × net_amount_per_unit
disclaimer always shown
```

### Layer Design

```
src/utils/stock-intelligence.ts  ← pure functions, no supabase (see Cycle 2 patterns)
src/services/stock-intelligence.service.ts  ← fetches data, calls pure functions
src/hooks/useStockIntelligence.ts  ← TanStack Query wrapper
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **14-day minimum sales history rule** | < 14 days of data → prediction is noise, not signal. Skip that product. |
| **Never compute prediction for stock = 0** | That's already out of stock — show separately, not as "prediction". |
| **Dead stock only when unit_cost is set** | Without cost, dead stock value is unknown. Don't show "R$0 trapped". |
| **Lost sales always shows disclaimer** | "Estimativa baseada no histórico anterior" — never imply it's exact. |

---

## 6. What to Build

### Section A: Pure Functions

**File:** `src/utils/stock-intelligence.ts`

```typescript
export interface StockOutPrediction {
  productId: string
  productName: string
  currentStock: number
  avgDailySales: number
  daysUntilOut: number
}

export interface DeadStockItem {
  productId: string
  productName: string
  currentStock: number
  unitCost: number
  trappedValue: number
  daysSinceLastSale: number
}

// Pure: receives data arrays, returns typed results — no DB calls
export function predictStockOuts(
  products: ProductWithStock[],
  salesHistory: SalesHistoryItem[]
): StockOutPrediction[] {
  return products
    .map(p => computeStockOutPrediction(p, salesHistory))
    .filter((p): p is StockOutPrediction => p !== null && p.daysUntilOut < 7)
    .sort((a, b) => a.daysUntilOut - b.daysUntilOut)
}

function computeStockOutPrediction(
  product: ProductWithStock,
  salesHistory: SalesHistoryItem[]
): StockOutPrediction | null {
  if (product.currentStock === 0) return null  // already out of stock — not a prediction
  const recentSales = salesHistory.filter(s => s.productId === product.id)
  if (recentSales.length < 14) return null      // 14-day minimum rule
  const avgDailySales = computeAvgDailySales(recentSales)
  if (avgDailySales === 0) return null
  return {
    productId: product.id,
    productName: product.name,
    currentStock: product.currentStock,
    avgDailySales,
    daysUntilOut: Math.floor(product.currentStock / avgDailySales),
  }
}

export function computeDeadStock(
  products: ProductWithStock[],
  salesHistory: SalesHistoryItem[]
): DeadStockItem[] {
  const fortyFiveDaysAgo = new Date()
  fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45)

  return products
    .filter(p => p.unitCost !== null && p.currentStock > 0)
    .filter(p => !salesHistory.some(
      s => s.productId === p.id && new Date(s.date) >= fortyFiveDaysAgo
    ))
    .map(p => ({
      productId: p.id,
      productName: p.name,
      currentStock: p.currentStock,
      unitCost: p.unitCost!,
      trappedValue: p.unitCost! * p.currentStock,
      daysSinceLastSale: computeDaysSinceLastSale(p.id, salesHistory),
    }))
}
```

Constraints: each function under 30 lines. No imports from React, Supabase, or any service.

#### Definition of Done — Section A
- [ ] `predictStockOuts` and `computeDeadStock` implemented as pure functions
- [ ] `computeStockOutPrediction` returns `null` for products with stock = 0
- [ ] No supabase or React imports

---

### Section B: Stock Intelligence Service

**File:** `src/services/stock-intelligence.service.ts`

```typescript
export async function fetchStockIntelligenceData(
  organizationId: string
): Promise<{ predictions: StockOutPrediction[]; deadStock: DeadStockItem[] }> {
  // 1. Fetch products with current stock
  // 2. Fetch order_items for last 30 days (for sales history)
  // 3. Call predictStockOuts(products, salesHistory)
  // 4. Call computeDeadStock(products, salesHistory)
  // 5. Return results
}

export const stockIntelligenceKeys = {
  data: (orgId: string) => ['stock-intelligence', orgId] as const,
}
```

Under 50 lines total.

---

### Section C: `useStockIntelligence` Hook

**File:** `src/hooks/useStockIntelligence.ts`

```typescript
export function useStockIntelligence() {
  const { organizationId } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: stockIntelligenceKeys.data(organizationId ?? ''),
    queryFn: () => fetchStockIntelligenceData(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })

  return {
    predictions: data?.predictions ?? [],
    deadStock: data?.deadStock ?? [],
    totalDeadStockValue: data?.deadStock.reduce((s, i) => s + i.trappedValue, 0) ?? 0,
    isLoading,
  }
}
```

---

### Section D: Alert Components

**File:** `src/components/inventory/StockAlertBanner.tsx`

A compact banner shown at the top of the inventory page when there are alerts:

```
⚠️  2 produtos vão zerar em menos de 7 dias
💰  R$3.200 parado em produtos sem venda (45+ dias)
[Ver alertas ↓]
```

Collapsible: clicking "Ver alertas" expands the list below.

Under 60 lines.

**File:** `src/components/inventory/StockOutAlertList.tsx`

List of stock-out predictions:
```
📦 Produto X — zera em 3 dias  (Estoque: 5, Média: 1.7/dia)
📦 Produto Y — zera em 6 dias  (Estoque: 12, Média: 2.1/dia)
```

Under 50 lines.

---

### Section E: Wire into Inventory Page

In `src/pages/Inventory.tsx` (or `Estoque.tsx`):
1. Import `useStockIntelligence()`
2. Add `StockAlertBanner` at the top of the page (only if `predictions.length > 0 || totalDeadStockValue > 0`)

Do NOT change any other part of the inventory page.

---

## 7. Integration Checklist

- [ ] `predictions` array feeds into `AlertData.stockOutPredictions` in `alert-priority.ts` (C2-T3)
- [ ] `totalDeadStockValue` feeds into `AlertData.deadStockValue`
- [ ] Inventory page shows `StockAlertBanner` when alerts exist

---

## 8. Definition of Done — Full Task

- [ ] All Section A–E DoD items checked
- [ ] `npm run build` passes
- [ ] Manual QA:
  - [ ] Products with < 7 days stock appear in predictions
  - [ ] Products with 0 sales in 45 days appear in dead stock (only if unit_cost is set)
  - [ ] Inventory page shows alert banner when predictions exist
  - [ ] Products with stock = 0 do NOT appear in predictions (already out of stock)
  - [ ] Products with < 14 days sales history do NOT appear in predictions

---

## 9. What NOT to Build

- **Do NOT build a new "Stock Intelligence" page** — surface alerts in existing screens only.
- **Do NOT build reorder suggestions** — stock-out alert is enough. Reorder point calculation is Cycle 3+.
- **Do NOT compute lost sales in the alerts** — lost sales is informational only, shown on inventory page.
- **Do NOT add dead stock to SeuCaixa if value is < R$500** — noise below this threshold.
