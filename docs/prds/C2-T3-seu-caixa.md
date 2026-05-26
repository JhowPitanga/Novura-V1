# PRD — C2-T3: "Seu Caixa" — Weekly Insight Screen

**Cycle:** 2 — Seu Caixa
**Status:** 🔴 Not Started
**Depends on:** [C2-T2 — MP Balance Sync](./C2-T2-mp-balance-sync.md) (CashTimeline component ready)
**Blocks:** Nothing — final Cycle 2 frontend task

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

"Seu Caixa" (Your Cash) is the weekly summary screen. It shows the seller three things at once:
how they did this week (revenue, fees, margin), where their Mercado Pago cash is (available now,
releasing over the next 30 days), and the single most important alert to act on this week.

Unusually, this screen opens automatically as the home screen every Monday — so the seller
gets their weekly briefing without having to remember to look. On other days, it's accessible
from the navigation.

The layout is clean and simple: three sections stacked vertically, no charts except the MP
cash timeline bars. Numbers everywhere, no generic dashboard widgets.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] `src/pages/SeuCaixa.tsx` — does this file exist?
- [ ] `src/services/seu-caixa.service.ts` — does this file exist?
- [ ] `src/hooks/useSeuCaixa.ts` — does this file exist?
- [ ] Read `src/App.tsx` — is `/seu-caixa` route registered?
- [ ] Confirm `useMPBalance` hook from C2-T2 exists.
- [ ] Confirm stock intelligence functions from C2-T4 exist (or stub them if C2-T4 is in parallel).
- [ ] Read `src/hooks/useAuth.tsx` — how to get `organizationId`.

**Update this section before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_2_SEU_CAIXA.md` section "Feature F2.2: Seu Caixa" in full.
      Record: 3 sections, behavior on Monday, alert priority order.
- [ ] Read `docs/CYCLE_2_SEU_CAIXA.md` section "Strategy Pattern — Alert Priority" (engineering patterns).
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1–3.
- [ ] Confirm `orders` table columns and the shape returned by `fetchAllOrders`.

---

## 4. Architecture Context

### The 3 Sections

```
Section 1: Resumo da Semana
  → SUM(gross_amount, marketplace_fee, shipping_cost) for last 7 days
  → If costs set: show real margin. If not: show "Margem parcial"
  → Dates: "Semana de DD/MM a DD/MM"

Section 2: Caixa Mercado Pago (only if MP connected)
  → CashTimeline component from C2-T2
  → If not connected: CTA "Conectar Mercado Pago →"

Section 3: Alerta da Semana (at most 1 alert)
  → Computed by getTopAlert() from src/utils/alert-priority.ts
  → Priority: cash_risk > stock_out_imminent > dead_stock_high > ads_negative_roi
  → If no alerts: "Nenhum alerta esta semana. Tudo parece bem 👍"
```

### Monday Home Screen Behavior

```typescript
// In App.tsx or a navigation hook:
// On first load of a new week (detected by comparing last visit date to current Monday):
//   → navigate to /seu-caixa automatically
// Use localStorage['last_caixa_visit'] to track this
```

### Alert Priority Util

```typescript
// src/utils/alert-priority.ts
// Uses Strategy Pattern (see CYCLE_2 engineering standards section)

export type AlertType = 'stock_out_imminent' | 'payment_held' | 'dead_stock_high' | 'ads_negative_roi'

export interface Alert {
  type: AlertType
  title: string
  body: string
  actionLabel: string
  actionUrl: string
}

const ALERT_PRIORITY: AlertType[] = [
  'stock_out_imminent',
  'payment_held',
  'dead_stock_high',
  'ads_negative_roi',
]

export function getTopAlert(data: AlertData): Alert | null {
  for (const type of ALERT_PRIORITY) {
    const alert = alertEvaluators[type](data)
    if (alert) return alert
  }
  return null
}
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **Each section loads independently** | If MP balance fails, the weekly summary still shows. No waterfalls. |
| **`staleTime` per section** | Weekly summary: 5min. MP balance: 30min. Alert: 5min. |
| **Never show negative margin as a computed zero** | If costs aren't set, show "Margem parcial — adicione custos para ver a margem real". |
| **Monday redirect only fires once per week** | Use `localStorage` to track. Don't redirect on every Monday page load. |

---

## 6. What to Build

### Section A: Types

**File:** `src/types/seu-caixa.ts`

```typescript
export interface WeeklySummary {
  weekStart: Date
  weekEnd: Date
  grossRevenue: number
  marketplaceFees: number
  shippingCosts: number
  productCosts: number | null   // null if no unit_cost set for any product
  realMargin: number | null     // null if productCosts is null
  orderCount: number
  hasCostData: boolean
}

export interface AlertData {
  stockOutPredictions: StockOutPrediction[]   // from C2-T4
  mpBalance: MPBalanceSnapshot | null
  deadStockValue: number | null
}
```

---

### Section B: `seu-caixa.service.ts`

**File:** `src/services/seu-caixa.service.ts`

```typescript
export async function fetchWeeklySummary(organizationId: string): Promise<WeeklySummary>
// Query: SELECT SUM(gross_amount), SUM(marketplace_fee), SUM(shipping_cost)
// FROM orders WHERE organization_id = ... AND created_at >= last Monday
// JOIN order_items for SUM(unit_cost * quantity) where unit_cost is not null

export const seuCaixaKeys = {
  weekly: (orgId: string) => ['seu-caixa', 'weekly', orgId] as const,
  alert:  (orgId: string) => ['seu-caixa', 'alert',  orgId] as const,
}
```

Each function under 40 lines.

#### Definition of Done — Section B
- [ ] `fetchWeeklySummary` returns correct date range (Mon–Sun of current week)
- [ ] `hasCostData` is `true` only if at least one `order_item` has `unit_cost` set

---

### Section C: `useSeuCaixa` Hook

**File:** `src/hooks/useSeuCaixa.ts`

```typescript
export function useSeuCaixa() {
  const { organizationId } = useAuth()

  const weeklySummary = useQuery({
    queryKey: seuCaixaKeys.weekly(organizationId ?? ''),
    queryFn: () => fetchWeeklySummary(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })

  // mpBalance from useMPBalance() (C2-T2)
  // topAlert computed from getTopAlert(alertData) using stock + mp data
  // Returns all 3 queries independently

  return { weeklySummary, mpBalance, topAlert }
}
```

Under 50 lines.

---

### Section D: Alert Priority Util

**File:** `src/utils/alert-priority.ts`

Implement the Strategy Pattern from the CYCLE_2 engineering standards section.

4 evaluator functions (each under 20 lines):
```typescript
function evaluateStockOut(data: AlertData): Alert | null
function evaluatePaymentHeld(data: AlertData): Alert | null
function evaluateDeadStock(data: AlertData): Alert | null
function evaluateAdsROI(data: AlertData): Alert | null  // stub for now — ADS is C2-T5
```

For MVP:
- `evaluateStockOut`: returns alert if `data.stockOutPredictions[0]?.daysUntilOut < 3`
- `evaluatePaymentHeld`: returns alert if `data.mpBalance?.held_amount > 500`
- `evaluateDeadStock`: returns alert if `data.deadStockValue > 1000`
- `evaluateAdsROI`: returns `null` (stub until C2-T5)

#### Definition of Done — Section D
- [ ] File exists at `src/utils/alert-priority.ts`
- [ ] `getTopAlert` exported and follows Strategy Pattern
- [ ] No `any` types

---

### Section E: `SeuCaixa.tsx` Page

**File:** `src/pages/SeuCaixa.tsx`

```typescript
// Section 1: WeeklySummaryCard component
// Section 2: CashTimeline (from C2-T2) or ConnectMercadoPagoButton
// Section 3: AlertCard (from alert priority)
// All sections load independently via useSeuCaixa()
// Loading: skeleton cards
```

Components to create inline or extract:
- `src/components/seu-caixa/WeeklySummaryCard.tsx` — Section 1 (under 80 lines)
- `src/components/seu-caixa/AlertCard.tsx` — Section 3 (under 50 lines)

Page under 80 lines.

#### Definition of Done — Section E
- [ ] Page exists with all 3 sections
- [ ] Each section loads independently
- [ ] "Margem parcial" shown when no cost data
- [ ] CashTimeline shown if MP connected, CTA if not
- [ ] "Nenhum alerta" state handled

---

### Section F: Route + Monday Redirect

Add to `src/App.tsx`:
```typescript
<Route path="/seu-caixa" element={
  <ProtectedRoute>
    <Suspense fallback={<Loading />}><SeuCaixa /></Suspense>
  </ProtectedRoute>
} />
```

Add Monday auto-redirect logic (in root layout or `App.tsx`):
```typescript
// On mount, if today is Monday and localStorage['last_caixa_monday'] !== currentMondayISO:
//   navigate('/seu-caixa')
//   localStorage.setItem('last_caixa_monday', currentMondayISO)
```

---

## 7. Integration Checklist

- [ ] `useMPBalance()` from C2-T2 imported and used (not reimplemented)
- [ ] Stock intelligence data from C2-T4 wired into `AlertData` (or stubbed if C2-T4 not complete)
- [ ] Monday redirect fires only once per week per browser
- [ ] Route registered in App.tsx

---

## 8. Definition of Done — Full Task

- [ ] All Section A–F DoD items checked
- [ ] `npm run build` passes
- [ ] Manual QA:
  - [ ] `/seu-caixa` shows 3 sections
  - [ ] Section 1 shows correct weekly numbers
  - [ ] Section 2 shows CashTimeline if MP connected
  - [ ] Section 3 shows alert or "Nenhum alerta" message
  - [ ] Opening app on Monday automatically redirects to `/seu-caixa` (once)

---

## 9. What NOT to Build

- **Do NOT add date range pickers** — always current week, no customization.
- **Do NOT build a historical trends chart** — that's Cycle 3+.
- **Do NOT show all alerts** — exactly one alert maximum (the highest priority).
