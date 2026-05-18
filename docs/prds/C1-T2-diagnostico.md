# PRD — C1-T2: Diagnóstico Automático

**Cycle:** 1 — O Primeiro Minuto
**Status:** 🔴 Not Started
**Depends on:** [C1-T1 — Onboarding](./C1-T1-onboarding.md) (ML connected, `orders` table populated)
**Blocks:** [C1-T4 — Orders with Margin](./C1-T4-orders-margin.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

The Diagnóstico is the first real value a seller sees in Novura — and it requires zero setup.
The moment their Mercado Livre account is connected, this screen appears automatically with
findings about their store: how much ML is taking in fees and shipping, which product has the
worst fee ratio, how much of their annual Simples Nacional limit they've used, and their
account health (cancellation rate, complaints, listing quality).

Think of it like a doctor's report that writes itself the moment the patient walks in.
No questions asked. No forms filled out. Just findings.

Each block on the page loads independently — if one takes longer, the others still appear.
If a block can't be computed (e.g., no orders in 90 days), it disappears entirely.
A hidden block is always better than a block showing "R$0,00" or "Nenhum dado."

This is the screen that sells subscriptions. It must be good.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] `src/pages/Diagnostico.tsx` — does this file exist? If yes, read it.
- [ ] `src/components/diagnostico/` — does this directory exist? List files.
- [ ] `src/services/diagnostico.service.ts` — does this file exist? Read it.
- [ ] `src/hooks/useDiagnostico.ts` — does this file exist? Read it.
- [ ] `src/types/diagnostico.ts` — does this file exist? Read it.
- [ ] `src/utils/formatting.ts` — does this file exist? Read it.
  If not, it will need to be created in this task (Section A).
- [ ] Confirm `orders` table has `gross_amount`, `marketplace_fee`, `shipping_cost`, `net_amount` columns (from C0-T1).
- [ ] Confirm `/diagnostico` route is NOT already in `src/App.tsx`.
- [ ] Read `src/hooks/useAuth.tsx` — record what `organizationId` looks like.

**Update this section with findings before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_1_PRIMEIRO_MINUTO.md` section "Feature F1.2: Diagnóstico Automático" in full.
      Record: 4 blocks, data queries, design requirements, edge cases.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1 (Architecture), 2 (SOLID), 3 (Service Layer).
- [ ] Confirm `orders` table columns by reading `supabase/migrations/20260301_000000_create_orders_table.sql`.
      Record: exact column names for gross_amount, marketplace_fee, shipping_cost, net_amount.
- [ ] Read `src/hooks/useAuth.tsx` — how is `organizationId` accessed?
- [ ] Read any existing `src/utils/formatting.ts` — does `formatBRL` already exist? If so, import it, don't duplicate.
- [ ] Verify the `orders` table has data: `SELECT COUNT(*) FROM orders WHERE marketplace = 'mercado_livre'`.

---

## 4. Architecture Context

### The 4 Blocks

```
Block 1 — Money Leaks
  → fees + shipping retained by ML over 90 days
  → waterfall: Receita Bruta → (-Comissão) → (-Frete) → Receita Líquida
  → always shown if any orders exist

Block 2 — Produto com Pior/Melhor Taxa
  → worst: product with highest fee % per sale
  → best: product with lowest fee % per sale
  → only shown if ≥ 5 sales for at least 2 distinct products

Block 3 — Simples Nacional Tracker
  → revenue YTD vs R$4.800.000 annual limit
  → progress bar: green < 60%, yellow 60–80%, red > 80%
  → always shown (even with 0 revenue — then it shows R$0)
  → disclaimer always visible below

Block 4 — CTA
  → "Quer ver sua margem real por pedido?"
  → button: "Adicionar custos →" → navigates to /produtos/custos
  → always shown if Block 1 shows
```

### Service Layer

```
src/services/diagnostico.service.ts
  ├── fetchMoneyLeaks(organizationId)          → MoneyLeaks
  ├── fetchProductFeeRanking(organizationId)   → ProductFeeRanking | null
  └── fetchSimpleNacionalUsage(organizationId) → SimplesNacionalUsage

src/hooks/useDiagnostico.ts
  → wraps all 3 service functions in useQuery
  → returns { moneyLeaks, productFeeRanking, simplesNacional }

src/types/diagnostico.ts
  → MoneyLeaks, ProductFeeRanking, SimplesNacionalUsage interfaces

src/utils/formatting.ts (shared — create if missing)
  → formatBRL(value: number): string
  → formatPercent(value: number, decimals?: number): string
```

### Component Architecture

```
src/pages/Diagnostico.tsx                      ← thin container, max 80 lines
  ├── MoneyLeaksBlock.tsx                      ← Block 1
  ├── ProductFeeRanking.tsx                    ← Block 2
  ├── SimplesNacionalTracker.tsx               ← Block 3
  └── DiagnosticoCallToAction.tsx              ← Block 4
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER show R$0 or 0% for missing data** | Shows as "Nenhum dado" or the block is hidden entirely. A zero is worse than nothing — it misleads. |
| **NEVER show estimated or invented numbers** | All numbers must come from real imported orders. If data is missing, hide the block. |
| **NEVER block all blocks because one fails** | Each block loads independently. One error must not affect others. |
| **Always show the Simples Nacional disclaimer** | Legal/trust reason. The disclaimer must appear on every render of Block 3. |
| **Filter out cancelled orders in all queries** | `.neq('status', 'cancelled')` must be present in every query. Including cancelled orders inflates fee numbers. |

---

## 6. What to Build

### Section A: Shared Formatting Utils

**File:** `src/utils/formatting.ts`

Create if it doesn't exist. If it exists, ADD to it (do not replace).

```typescript
export const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const formatPercent = (value: number, decimals = 1): string =>
  `${value.toFixed(decimals).replace('.', ',')}%`
```

**Important:** If `formatBRL` already exists in `src/utils/orderUtils.ts` or elsewhere, do NOT
duplicate it. Import it from wherever it exists, or add a re-export from `formatting.ts`.

#### Definition of Done — Section A
- [ ] `formatBRL` available at `@/utils/formatting`
- [ ] `formatPercent` available at `@/utils/formatting`
- [ ] No duplicate implementations exist in the codebase

---

### Section B: Types

**File:** `src/types/diagnostico.ts`

```typescript
export interface MoneyLeaks {
  totalGross: number
  totalFee: number
  totalShipping: number
  totalNet: number
  orderCount: number
}

export interface ProductFeeItem {
  title: string
  marketplaceItemId: string
  avgUnitPrice: number
  avgFeeAmount: number
  feeRatioPct: number   // (avgFeeAmount / avgUnitPrice) * 100
  saleCount: number
}

export interface ProductFeeRanking {
  worst: ProductFeeItem    // highest feeRatioPct
  best: ProductFeeItem     // lowest feeRatioPct
}

export interface SimplesNacionalUsage {
  totalRevenue: number
  limit: number           // 4_800_000
  percentage: number      // (totalRevenue / limit) * 100
  year: number
}
```

#### Definition of Done — Section B
- [ ] All 4 interfaces defined with no `any`
- [ ] `ProductFeeRanking` is nullable (service returns `null` if < 2 products with ≥ 5 sales)

---

### Section C: Diagnostico Service

**File:** `src/services/diagnostico.service.ts`

Implement 3 functions. Each function under 40 lines.

```typescript
import { supabase } from '@/integrations/supabase/client'
import type { MoneyLeaks, ProductFeeRanking, SimplesNacionalUsage } from '@/types/diagnostico'

export async function fetchMoneyLeaks(organizationId: string): Promise<MoneyLeaks> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data, error } = await supabase
    .from('orders')
    .select('gross_amount, marketplace_fee, shipping_cost, net_amount')
    .eq('organization_id', organizationId)
    .eq('marketplace', 'mercado_livre')
    .neq('marketplace_status', 'cancelled')
    .gte('created_at', ninetyDaysAgo.toISOString())

  if (error) throw error

  const orderCount = data.length
  const totalGross = data.reduce((s, o) => s + (o.gross_amount ?? 0), 0)
  const totalFee = data.reduce((s, o) => s + (o.marketplace_fee ?? 0), 0)
  const totalShipping = data.reduce((s, o) => s + (o.shipping_cost ?? 0), 0)
  const totalNet = data.reduce((s, o) => s + (o.net_amount ?? 0), 0)

  return { totalGross, totalFee, totalShipping, totalNet, orderCount }
}

export async function fetchProductFeeRanking(
  organizationId: string
): Promise<ProductFeeRanking | null> {
  // Join orders + order_items to get per-item sales data
  // Group by marketplace_item_id (or sku)
  // Only include items with >= 5 sales
  // Return null if fewer than 2 eligible items
  // Compute feeRatioPct = (marketplace_fee / unit_price) * 100 per order, then average per product
  // Note: marketplace_fee is on the order, not per item — divide by item count for approximation
}

export async function fetchSimpleNacionalUsage(
  organizationId: string
): Promise<SimplesNacionalUsage> {
  const year = new Date().getFullYear()
  const yearStart = new Date(year, 0, 1).toISOString()

  const { data, error } = await supabase
    .from('orders')
    .select('gross_amount')
    .eq('organization_id', organizationId)
    .neq('marketplace_status', 'cancelled')
    .gte('created_at', yearStart)

  if (error) throw error

  const totalRevenue = data.reduce((s, o) => s + (o.gross_amount ?? 0), 0)
  const limit = 4_800_000
  const percentage = (totalRevenue / limit) * 100

  return { totalRevenue, limit, percentage, year }
}
```

Also add query keys:
```typescript
export const diagnosticoKeys = {
  moneyLeaks:   (orgId: string) => ['diagnostico', 'money-leaks',   orgId] as const,
  productRank:  (orgId: string) => ['diagnostico', 'product-rank',  orgId] as const,
  simplesLimit: (orgId: string) => ['diagnostico', 'simples-limit', orgId] as const,
}
```

#### Definition of Done — Section C
- [ ] 3 functions implemented, each under 40 lines
- [ ] Query keys exported
- [ ] Cancelled orders excluded from all queries (`.neq('marketplace_status', 'cancelled')`)
- [ ] All functions throw on Supabase error (no silent swallowing)
- [ ] No `any` types

---

### Section D: `useDiagnostico` Hook

**File:** `src/hooks/useDiagnostico.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import {
  fetchMoneyLeaks,
  fetchProductFeeRanking,
  fetchSimpleNacionalUsage,
  diagnosticoKeys,
} from '@/services/diagnostico.service'

export function useDiagnostico() {
  const { organizationId } = useAuth()

  const moneyLeaks = useQuery({
    queryKey: diagnosticoKeys.moneyLeaks(organizationId ?? ''),
    queryFn: () => fetchMoneyLeaks(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })

  const productFeeRanking = useQuery({
    queryKey: diagnosticoKeys.productRank(organizationId ?? ''),
    queryFn: () => fetchProductFeeRanking(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })

  const simplesNacional = useQuery({
    queryKey: diagnosticoKeys.simplesLimit(organizationId ?? ''),
    queryFn: () => fetchSimpleNacionalUsage(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })

  return { moneyLeaks, productFeeRanking, simplesNacional }
}
```

#### Definition of Done — Section D
- [ ] File exists at `src/hooks/useDiagnostico.ts`
- [ ] 3 queries defined — all 3 run independently (not waterfall)
- [ ] `enabled: !!organizationId` on every query (no query runs without org ID)
- [ ] Returns TanStack Query result objects (not raw data — components need `isLoading`, `error`)

---

### Section E: Diagnostico Components

#### `MoneyLeaksBlock.tsx`

**File:** `src/components/diagnostico/MoneyLeaksBlock.tsx`

Props: `data: MoneyLeaks`

Renders (in order):
1. Title: `"Nos últimos 90 dias, o Mercado Livre reteve:"`
2. Fee line: `"R$X em comissões"` (formatted with `formatBRL`)
3. Shipping line: `"R$Y em frete"`
4. Divider
5. Total: `"Total: R$Z retido pela plataforma"`
6. Net: `"Você recebeu líquido: R$W de R$V em vendas brutas"`
7. A simple waterfall visualization (4 horizontal bars or a simple list with arrows is fine)

No chart library needed — a CSS-based waterfall with colored bars is sufficient.

Constraints: under 80 lines. Use `formatBRL` from `@/utils/formatting`.

#### `ProductFeeRanking.tsx`

**File:** `src/components/diagnostico/ProductFeeRanking.tsx`

Props: `data: ProductFeeRanking | null`

If `data` is null, renders nothing (component returns `null`).

Renders:
1. Title: `"Produto com maior custo de plataforma:"`
2. Worst product: name + `"R$X por venda (Y% do preço de R$Z)"`
3. Best product: name + `"R$X por venda (Y% do preço de R$Z)"`

Constraints: under 50 lines.

#### `SimplesNacionalTracker.tsx`

**File:** `src/components/diagnostico/SimplesNacionalTracker.tsx`

Props: `data: SimplesNacionalUsage`

Renders:
1. Title: `"Faturamento em ${data.year}"`
2. Amount: `"${formatBRL(data.totalRevenue)} de ${formatBRL(data.limit)}"`
3. Progress bar:
   - Width: `min(100, data.percentage)%`
   - Color: green if `< 60%`, yellow if `60–80%`, red if `> 80%`
4. Usage line: `"Você usou ${formatPercent(data.percentage)} do limite anual do Simples Nacional"`
5. If `data.percentage > 100`: show red alert `"Você ultrapassou o limite do Simples Nacional este ano."`
6. **Disclaimer (ALWAYS visible):** `"Baseado apenas nas vendas importadas para o Novura. Inclua outras fontes de receita ao calcular seu limite real."` — smaller text, gray color

Constraints: under 80 lines.

#### `DiagnosticoCallToAction.tsx`

**File:** `src/components/diagnostico/DiagnosticoCallToAction.tsx`

Renders:
1. `"Quer ver sua margem real por pedido?"`
2. `"Adicione o custo dos seus produtos — leva menos de 2 minutos."`
3. Button `"Adicionar custos →"` — uses `useNavigate()` to go to `/produtos/custos`

Constraints: under 30 lines. Uses `useNavigate` from React Router.

#### Definition of Done — Section E
- [ ] All 4 component files exist in `src/components/diagnostico/`
- [ ] No `supabase.from(...)` in any component
- [ ] `MoneyLeaksBlock` and `SimplesNacionalTracker` never show R$0 when called with zero data
      (the page hides them — the component just renders what it receives)
- [ ] Disclaimer is always rendered in `SimplesNacionalTracker`
- [ ] All currency via `formatBRL`, all percents via `formatPercent`

---

### Section F: `Diagnostico.tsx` Page

**File:** `src/pages/Diagnostico.tsx`

```typescript
// Uses useDiagnostico() hook
// Renders each block only when its data is available AND not null
// Uses skeleton loaders while isLoading
// Each block renders independently — do NOT wait for all queries to complete
//
// Zero-orders edge case:
//   if moneyLeaks.data?.orderCount === 0, show special state:
//   "Não encontramos pedidos nos últimos 90 dias."
//   [Sincronizar novamente] button → calls orders-sync-ml (or navigates to /onboarding)
//
// Layout: stack of cards, mobile-first
```

Constraints: under 100 lines. All business logic in service/hook.

---

### Section G: Register Route in App.tsx

Add to protected routes in `src/App.tsx`:

```typescript
<Route path="/diagnostico" element={
  <Suspense fallback={<Loading />}>
    <Diagnostico />
  </Suspense>
} />
```

Route is protected (auth required) but has NO `<RestrictedRoute>` permission gate.

#### Definition of Done — Section G
- [ ] `/diagnostico` route registered
- [ ] No permission gate (all authenticated users can see their Diagnóstico)

---

## 7. Integration Checklist

- [ ] All 3 service functions use correct column names from `orders` table
- [ ] `formatBRL` is imported from a shared util — not inline
- [ ] Each block hides (renders `null`) when data is null or orderCount is 0
- [ ] Simples Nacional disclaimer is always visible regardless of percentage
- [ ] Route `/diagnostico` registered in App.tsx
- [ ] `useDiagnostico` uses query keys from `diagnosticoKeys` (same keys used in cache invalidation from C1-T3)

---

## 8. Definition of Done — Full Task

- [ ] All Section A–G DoD items checked
- [ ] `npm run build` passes with zero errors
- [ ] `npm run lint` passes
- [ ] Manual QA checklist:
  - [ ] `/diagnostico` loads with real imported data
  - [ ] Money leaks block shows correct totals (verify against ML seller center)
  - [ ] Product fee ranking shows worst and best product
  - [ ] Simples Nacional bar shows correct % and correct color
  - [ ] Disclaimer is visible below tracker
  - [ ] If `productFeeRanking` is null → block is hidden (no error, no empty div)
  - [ ] On mobile (375px width): all blocks stack cleanly, no horizontal scroll
  - [ ] Skeleton cards appear while loading (not blank screen)
- [ ] No `any` types introduced
- [ ] No supabase calls in component files

---

## 9. What NOT to Build

- **Do NOT add date range filters** — it's always the last 90 days. Always. No customization.
- **Do NOT show demo/sample data** — only real imported data.
- **Do NOT add Block 3B (ML Account Health) or Block 3C (ADS)** — those require additional
  API calls beyond the MVP scope. Add a `// TODO C1 extension: add account health block` comment
  to mark where they would go.
- **Do NOT add margin calculations here** — margin requires product costs (C1-T3). The Diagnóstico
  shows platform fees only. Margin per order is in C1-T4.
- **Do NOT unify Shopee + ML** — all queries filter `marketplace = 'mercado_livre'`.
  Add a comment: `// TODO Cycle 3: remove marketplace filter when Shopee is added`.
- **Do NOT block on `productFeeRanking` loading** — if it's slow, the rest of the page shows first.
