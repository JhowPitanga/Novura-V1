# Cycle 2 — "Seu Caixa"
**Status:** Second user-facing cycle | **Appetite:** 6 weeks | **Team:** 1 designer + 2 engineers
**Depends on:** Cycle 0 + Cycle 1 complete (users onboarded, Diagnóstico working, orders list with margin)

---

## Purpose of This Document

This document is the complete specification for Cycle 2. It is self-contained. Do not build features from other cycles. When in doubt, refer to **Rabbit Holes & No-Gos**.

---

## ⚙️ Engineering Standards — Mandatory

> **Read `docs/ENGINEERING_STANDARDS.md` before writing any code for this cycle.**
> What follows are the patterns most relevant to the code you will write in Cycle 2.

### Hard Limits (Non-Negotiable)

| Unit | Limit |
|---|---|
| Function body | **50 lines** |
| File (service, hook, util) | **150 lines** |
| Page component | **200 lines** |
| Edge function handler | **80 lines** |

### Strategy Pattern — Alert Priority

The "Alerta da semana" picks the single most urgent alert. This logic must use the Strategy Pattern — each evaluator is a named, testable function:

```typescript
// src/utils/alert-priority.ts

type AlertType = 'stock_out_imminent' | 'payment_held' | 'dead_stock_high' | 'ads_negative_roi'

// Priority order: index 0 = highest priority
const ALERT_PRIORITY: AlertType[] = [
  'stock_out_imminent',
  'payment_held',
  'dead_stock_high',
  'ads_negative_roi',
]

// Each evaluator: one function, one alert type, < 20 lines
const alertEvaluators: Record<AlertType, (data: AlertData) => Alert | null> = {
  stock_out_imminent: evaluateStockOut,
  payment_held:       evaluatePaymentHeld,
  dead_stock_high:    evaluateDeadStock,
  ads_negative_roi:   evaluateAdsROI,
}

// Selector — does NOT compute alerts, just picks the top one
export function getTopAlert(data: AlertData): Alert | null {
  for (const type of ALERT_PRIORITY) {
    const alert = alertEvaluators[type](data)
    if (alert) return alert
  }
  return null
}
```

**Adding a new alert type = add one function + one entry in the map. Zero edits to `getTopAlert`.**

### Adapter Pattern — Mercado Pago API

The MP API response shape must never leak into the UI. Normalize it at the boundary:

```typescript
// src/services/mercado-pago.service.ts

// Internal shape — stable, owned by us
export type MPBalance = {
  available:    number
  held:         number
  releasing7d:  number
  releasing14d: number
  releasing30d: number
  snapshotAt:   Date
}

// Adapter: raw MP shape → our shape (called once, at the edge function boundary)
function adaptMPBalance(raw: MPBalanceRaw, releases: MPReleasesRaw): MPBalance {
  return {
    available:    raw.available_balance,
    held:         raw.total_amount - raw.available_balance,
    releasing7d:  sumReleasesUpTo(releases, 7),   // < 10 lines each
    releasing14d: sumReleasesUpTo(releases, 14),
    releasing30d: sumReleasesUpTo(releases, 30),
    snapshotAt:   new Date(),
  }
}
```

### Stock Intelligence — Pure Functions Only

Stock-out prediction and dead stock calculation are **pure functions** — no supabase calls, no side effects. They receive data arrays, return typed results:

```typescript
// src/utils/stock-intelligence.ts

export type StockOutPrediction = {
  productId:     string
  productName:   string
  currentStock:  number
  avgDailySales: number
  daysUntilOut:  number
}

// Pure: no DB, no fetch, no side effects
export function predictStockOuts(
  products: ProductWithStock[],
  salesHistory: OrderItem[]
): StockOutPrediction[] {
  return products
    .map(p => computePrediction(p, salesHistory))
    .filter(p => p !== null && p.daysUntilOut < 7)
    .sort((a, b) => a.daysUntilOut - b.daysUntilOut)
}

function computePrediction(
  product: ProductWithStock,
  salesHistory: OrderItem[]
): StockOutPrediction | null {
  const recentSales = filterSalesForProduct(salesHistory, product.id, 30)
  if (recentSales.length < 14) return null  // 14-day minimum rule
  const avgDailySales = computeAvgDailySales(recentSales)
  if (avgDailySales === 0) return null
  return {
    productId:     product.id,
    productName:   product.name,
    currentStock:  product.currentStock,
    avgDailySales,
    daysUntilOut:  Math.floor(product.currentStock / avgDailySales),
  }
}
```

The service fetches the data; the util computes the prediction; the hook wires them together.

### Caching Strategy for This Cycle

```typescript
// Different data has different freshness requirements — configure explicitly:

// MP balance: changes throughout the day (payment releases)
useQuery({ staleTime: 30 * 60 * 1000 })  // 30 minutes

// ADS spend: 24-48h lag from ML — no point refreshing more often
useQuery({ staleTime: 24 * 60 * 60 * 1000 })  // 24 hours

// Weekly summary: can use the same staleTime as orders (5 minutes)
useQuery({ staleTime: 5 * 60 * 1000 })
```

---

## The Core Bet

Sellers open Novura every week because it tells them where their cash is and whether their ads are working — **not because they remember to check**.

Cycle 1 answered "Am I making money per order?" Cycle 2 answers two harder questions:
1. **"Quando meu dinheiro cai na conta?"** (Mercado Pago cash timeline)
2. **"Estou gastando certo nos anúncios?"** (ADS efficiency per product)

Plus proactive stock intelligence — you find out about a stock-out before it happens.

---

## Frontend Premise

**The visual is mostly built.** Cycle 2 work is predominantly new screens (SeuCaixa.tsx) and new edge functions (Mercado Pago OAuth, balance sync, ADS sync). When extending existing screens like Diagnóstico.tsx and Orders.tsx, only change the data source — not the visual design.

Rule: change `services/` and `hooks/` — not JSX or Tailwind on existing screens.

Full context: `docs/PRD_USER_FLOW_ONBOARDING.md` → "Premissa Fundamental" section.

---

## What Already Exists at Cycle 2 Start

- `orders` table with `net_amount`, `marketplace_fee`, `shipping_cost` — from Cycle 0
- `order_items` with `unit_cost` populated for products where seller input cost — from Cycle 1
- `src/hooks/useDiagnostico.ts`, `src/services/diagnostico.service.ts` — from Cycle 1
- `src/pages/Diagnostico.tsx` — from Cycle 1 (extend the CTA in this page to add MP connect button)
- `src/pages/Orders.tsx` with margin columns — from Cycle 1
- Existing ML auth + token storage — from before Cycle 0
- Existing `src/pages/Inventory.tsx` + `src/hooks/useStockData.ts` — existing stock management

### What Does NOT Exist Yet
- Mercado Pago OAuth integration — nothing exists for MP
- `supabase/functions/mercado-pago-start-auth` — does not exist
- `supabase/functions/mercado-pago-callback` — does not exist
- `supabase/functions/mercado-pago-sync-balance` — does not exist
- ML ADS OAuth integration — does not exist
- `src/pages/SeuCaixa.tsx` — does not exist
- Stock-out prediction logic — does not exist in useStockData

---

## Feature F2.1: Mercado Pago Integration

### Trigger: Contextual CTA, Never Forced

This integration is **optional and contextual**. It is never shown as a required setup step. The CTA appears:
- On the Diagnóstico page, after Block 1 (Money Leaks): "Quer saber quando esse dinheiro cai na sua conta? Conecte o Mercado Pago →"
- On the "Seu Caixa" screen: "Conecte o Mercado Pago para ver seu saldo e agenda de pagamentos"

**Do NOT** add Mercado Pago to the onboarding flow from Cycle 1.

### OAuth Flow (New Edge Functions)

#### `supabase/functions/mercado-pago-start-auth/index.ts`
- Initiates Mercado Pago OAuth2 PKCE flow (MP uses same API as ML but different scopes)
- Scope needed: `read` (to access payment data, no write needed)
- Redirect URI: `{SITE_URL}/oauth/mercado-pago/callback`
- **Follow the exact same PKCE pattern as `mercado-livre-start-auth`** — return `code_verifier` separately in the response, do NOT embed it in `state`. Full model in `docs/CYCLE_0_ORDERS_PLATFORM.md` → "OAuth2 Security Model".
- Store verifier in `sessionStorage['mp_pkce_verifier']` and csrf in `sessionStorage['mp_oauth_csrf']` (use `mp_` prefix to avoid collision with ML keys)

**Edge case:** ML and MP OAuth use the same Mercado Libre developer platform. A seller who already connected ML may or may not have automatically authorized MP — do NOT assume they have. Always go through the full OAuth flow for MP separately.

#### `supabase/functions/mercado-pago-callback/index.ts`
- Exchange authorization code for access token
- **Read `code_verifier` from request body, not from `state`** — same rule as ML callback
- Validate CSRF: extract `state.csrf`, compare with `sessionStorage['mp_oauth_csrf']` (done on the frontend callback page before calling this function)
- Store in a new `mercado_pago_integrations` table (separate from `marketplace_integrations` for ML — they're different scopes):
```sql
CREATE TABLE mercado_pago_integrations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  mp_user_id          text NOT NULL,
  access_token        text NOT NULL,
  refresh_token       text,
  token_expires_at    timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
```
- After storing token, trigger `mercado-pago-sync-balance` immediately

#### `supabase/functions/mercado-pago-sync-balance/index.ts`
**Responsibility:** Fetch available balance and payment release schedule from Mercado Pago API.

MP API endpoints to call:
- `GET /v1/account/balance` — available balance, held amounts
- `GET /v1/account/releases` — payment release schedule (what's being released and when)

Store results in:
```sql
CREATE TABLE mercado_pago_balance_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  available_amount      numeric(18,2) NOT NULL DEFAULT 0,
  held_amount           numeric(18,2) NOT NULL DEFAULT 0,
  releasing_7_days      numeric(18,2) NOT NULL DEFAULT 0,
  releasing_14_days     numeric(18,2) NOT NULL DEFAULT 0,
  releasing_30_days     numeric(18,2) NOT NULL DEFAULT 0,
  raw_releases          jsonb,        -- full API response for debugging
  snapshot_at           timestamptz NOT NULL DEFAULT now()
);

-- Keep only last 30 snapshots per org (don't accumulate forever)
CREATE INDEX mp_balance_snapshots_org_at ON mercado_pago_balance_snapshots (organization_id, snapshot_at DESC);
```

**Sync cadence:** Trigger a sync:
1. Immediately after MP OAuth completes
2. Once per day via a Supabase cron job (when Supabase pg_cron is configured)
3. On-demand when seller clicks "Atualizar" on Seu Caixa

**Cron setup** — add to migrations:
```sql
-- Requires pg_cron extension (already available in Supabase)
SELECT cron.schedule(
  'sync-mp-balance-daily',
  '0 8 * * *',  -- 8am daily (Brazil time offset in UTC)
  $$SELECT net.http_post(url := 'https://{PROJECT_REF}.supabase.co/functions/v1/mercado-pago-sync-balance', ...)$$
);
```

**MP API edge cases:**
- MP rate limits: 200 requests/minute per user. Not a concern for balance sync (1 call), but note for future.
- `held_amount` includes chargebacks, open disputes, and incomplete verifications — these are DIFFERENT categories. For Cycle 2, aggregate them as "retido" without breakdown.
- Token refresh: MP tokens expire after 6 hours (same as ML). Create `mercado-pago-refresh` function using the same pattern as `mercado-livre-refresh`. Check token expiry before every API call.
- Some seller accounts are "Conta Mercado Pago Profissional" vs regular — both work with the same API, but professional accounts may have different release schedules (D+14 vs D+30).

### New Frontend Route
`/oauth/mercado-pago/callback` — add to App.tsx, handled by `src/pages/MercadoPagoCallback.tsx` (new file)

### Balance Display UI
This UI appears in two places:
1. On the `Seu Caixa` page (see F2.2)
2. As a small widget on the Diagnóstico page (after MP is connected)

Component: `src/components/seu-caixa/CashTimeline.tsx`

```
Visual design:
┌─────────────────────────────────────────┐
│ Seu Caixa no Mercado Pago               │
│                                         │
│ Disponível agora    R$X.XXX,XX          │
│ ──────────────────────────────────      │
│ A liberar:                              │
│   Em 7 dias         R$X.XXX,XX  ████░░ │
│   Em 14 dias        R$X.XXX,XX  ██░░░░ │
│   Em 30 dias        R$X.XXX,XX  █░░░░░ │
│ ──────────────────────────────────      │
│ Retido (disputas)   R$X.XXX,XX         │
│                                         │
│ Atualizado há X minutos [↻ Atualizar]  │
└─────────────────────────────────────────│
```

Not a table. A visual timeline. The bars represent proportions of total.

---

## Feature F2.2: "Seu Caixa" — Weekly Insight Screen

### Route
`/seu-caixa` — new route in App.tsx

### File to create
`src/pages/SeuCaixa.tsx`

### Behavior
- Shown by default as the **home screen on Mondays** (first login of the week after Sunday midnight)
- On other days: accessible via nav but not shown by default
- Not configurable — no date range picker, no settings
- Always shows the **current week** (Monday–Sunday, or last 7 days — team decision, but be consistent)

### What it displays

**Section 1: Resumo da semana**
```
Semana de [DD/MM] a [DD/MM]

Receita bruta          R$X.XXX,XX
Taxas do ML           -R$X.XXX,XX
Frete seller          -R$X.XXX,XX
Custo dos produtos    -R$X.XXX,XX   (only if costs are set)
─────────────────────────────────
Margem real            R$X.XXX,XX   X%
```

If product costs are NOT set: show "Margem parcial (sem custo do produto)" and a link to add costs.

**Section 2: Caixa Mercado Pago** (only if MP is connected)
- Show `CashTimeline` component from F2.1
- If MP is NOT connected: show a contextual CTA "Conecte o Mercado Pago para ver quando seu dinheiro chega →"

**Section 3: Alerta da semana** (one alert, maximum)
- Show the single most important alert this week
- Priority order: cash risk > stock-out > dead stock > ADS waste
- If no alerts: "Nenhum alerta esta semana. Tudo parece bem 👍"

The alert card format:
```
┌─────────────────────────────────────┐
│ ⚠️ Produto X vai zerar em 3 dias    │
│ Estoque atual: 5 unidades           │
│ Venda média: 1,7/dia               │
│                                     │
│ [Ver estoque]                       │
└─────────────────────────────────────┘
```

### Data Layer
```typescript
// src/services/seu-caixa.service.ts
export async function fetchWeeklySummary(organizationId: string) {
  // Last 7 days from orders table
  // SUM(gross_amount), SUM(marketplace_fee), SUM(shipping_cost)
  // JOIN order_items for total_cost (if unit_cost is set)
}

export async function fetchLatestMPBalance(organizationId: string) {
  // SELECT * FROM mercado_pago_balance_snapshots
  // WHERE organization_id = ...
  // ORDER BY snapshot_at DESC LIMIT 1
}

export async function fetchWeeklyTopAlert(organizationId: string) {
  // Returns the single highest-priority alert (see F2.3 for stock alerts)
  // Returns null if no alerts
}
```

### Hook
```typescript
// src/hooks/useSeuCaixa.ts
export function useSeuCaixa() {
  const { organizationId } = useAuth()

  const weeklySummary = useQuery({...})
  const mpBalance = useQuery({...})
  const topAlert = useQuery({...})

  return { weeklySummary, mpBalance, topAlert }
}
```

---

## Feature F2.3: Stock Intelligence

### What to Build
Alert-driven stock insights. NOT a new inventory management page. Surface stock alerts where the seller already is (Seu Caixa, Diagnóstico). Do not build a "Stock Intelligence" page.

### Three Intelligence Features

**1. Stock-out prediction**
```
When to show: Produto X tem estoque para menos de 7 dias no ritmo atual
Calculation: current_stock / avg_daily_sales_30d
Threshold: < 7 days → alert
Data needed: inventory.current_quantity (existing) + AVG(order_items per day, last 30 days)
```

**2. Dead stock as trapped cash**
```
When to show: Você tem R$X parado em produtos sem venda há 45+ dias
Calculation: products with 0 orders in last 45 days, valued at unit_cost * current_stock
Format: "Produto X (R$Y parado)"
Only shown if: unit_cost is set for the product
```

**3. Lost sales estimate** (shown on the product in Inventory page, not alerts)
```
When product went to 0 stock in last 30 days:
"Produto X ficou sem estoque por N dias. Estimativa de vendas perdidas: M unidades (R$Y)"
Estimation: N_days_oos * avg_daily_sales_30d_before_stockout
Note: Always show disclaimer "Estimativa baseada no histórico anterior"
```

### Service Layer
```typescript
// Extend src/services/inventory.service.ts or create src/services/stock-intelligence.service.ts

export async function fetchStockOutPredictions(organizationId: string) {
  // 1. Get all products with current_stock > 0
  // 2. For each: avg daily sales in last 30 days from order_items
  // 3. days_until_stockout = current_stock / avg_daily_sales
  // 4. Return products where days_until_stockout < 7
  // 5. Sort by days_until_stockout ASC (most urgent first)
}

export async function fetchDeadStock(organizationId: string) {
  // 1. Get products with unit_cost set
  // 2. Left join order_items for sales in last 45 days
  // 3. Products with 0 sales in 45 days = dead stock
  // 4. Value = unit_cost * current_stock
  // Return: { totalValue, products: [{ name, value, daysSinceLastSale }] }
}
```

### Where to Surface
- **Seu Caixa "Alerta da semana":** Single most urgent stock alert
- **Inventory page:** Add a "Alertas" section at the top showing all current stock alerts
- **Diagnóstico page (optional):** Add a "Estoque" block after the main Diagnóstico blocks showing dead stock value

### Edge Cases
- **Seasonal products:** avg_daily_sales over 30 days may be misleading for seasonal items. Add disclaimer: "Baseado nos últimos 30 dias de vendas".
- **Products with very low sales (< 0.1/day):** Show prediction but add "(venda esporádica)" — don't predict confidently for products with sparse data.
- **Product with stock = 0 already:** This is not a "prediction" — it's already out of stock. Show separately: "Produto X está sem estoque."
- **14-day minimum history rule:** Only compute predictions for products that have at least 14 days of sales history. Products with less than 14 days should not show predictions (not enough signal).

---

## Feature F2.4: ADS Efficiency per Product

### What to Build
ML ADS integration showing whether each advertised product is generating positive or negative ROI after ads spend.

### Trigger: Contextual CTA
The ADS integration is never forced. CTA appears:
- On the Diagnóstico page: "Conecte seus anúncios patrocinados para ver se estão gerando lucro →"
- In the Orders list (next to products with high sales volume): "Ver eficiência dos anúncios"

### New Edge Functions

#### `supabase/functions/ml-ads-start-auth/index.ts`
- ML ADS uses a separate scope: `write` on the ML developer platform
- Same PKCE OAuth pattern as `mercado-livre-start-auth`
- Scope: `write` (ADS API requires write scope even for read operations)

#### `supabase/functions/ml-ads-callback/index.ts`
- Store ADS access token in `marketplace_integrations` with `type = 'ml_ads'` or in a separate table

#### `supabase/functions/ml-ads-sync/index.ts`
- Fetch campaign spend from ML ADS API
- ML ADS API endpoint: `GET /advertising/product_ads/reports` (check latest ML ADS API docs)
- Store in:
```sql
CREATE TABLE ml_ads_daily_spend (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id         text NOT NULL,           -- ML marketplace item ID
  date            date NOT NULL,
  impressions     integer DEFAULT 0,
  clicks          integer DEFAULT 0,
  spend           numeric(18,2) DEFAULT 0, -- ADS cost in BRL
  UNIQUE (organization_id, item_id, date)
);
```

### Calculation: ADS Efficiency
```
ADS ROI per product (blended model):
  period_ads_spend = SUM(ml_ads_daily_spend.spend) for last 30 days for this item
  period_units_sold = SUM(order_items.quantity) for last 30 days for this item
  period_net_revenue = SUM(orders.net_amount) * (this_item_sales / total_sales)
  period_product_cost = SUM(order_items.unit_cost * quantity) for last 30 days

  margin_before_ads = period_net_revenue - period_product_cost
  margin_after_ads = margin_before_ads - period_ads_spend
  ads_cost_per_sale = period_ads_spend / period_units_sold
```

**Blended attribution disclaimer:** Always show: "Atribuição estimada. Nem todas as vendas vêm dos anúncios." This is honest about the limitation of the blended model — we cannot know which individual sales were driven by ads without ML's attribution data.

### Display

**ADS Efficiency table** — shown on a new tab in the Listings page (`/anuncios`) or as a section in Seu Caixa:
| Produto | Gasto em ADS (30d) | Custo por venda anunciada | Margem antes ADS | Margem depois ADS |
|---|---|---|---|---|
| Nome | R$X | R$Y | R$Z (N%) | R$W (M%) |

Color coding for "Margem depois ADS":
- Green: positive and > 10%
- Yellow: positive but < 10%
- Red: negative (ADS is destroying margin)

**Flag:** Products where `ads_cost_per_sale > 0.5 * (net_amount_per_unit - unit_cost)` → show "⚠️ ADS consumindo >50% da margem"

### Edge Cases
- **ML ADS API scope changes:** ML ADS API has been evolving. If the exact endpoint doesn't exist, fall back to `GET /advertising/advertisers/{advertiser_id}/campaigns` and aggregate manually.
- **Products not in ADS:** Show them in the table but with "Sem anúncios ativos" — don't exclude them.
- **ADS data lag:** ML ADS reports have a 24-48 hour lag. Always show "Dados de até 48h atrás" disclaimer.
- **ACOS vs ROAS:** Do not use these terms in the UI. Use "custo por venda" and "retorno do investimento em anúncio" in plain Portuguese.
- **Unit cost not set:** If `unit_cost` is null, show "Custo não informado" in the margin column — never compute partial margin as if cost = 0.

---

## Service Layer Architecture

### New Files to Create
```
src/services/seu-caixa.service.ts
src/services/stock-intelligence.service.ts
src/services/ml-ads.service.ts
src/services/mercado-pago.service.ts
```

### New Hooks to Create
```
src/hooks/useSeuCaixa.ts
src/hooks/useStockAlerts.ts
src/hooks/useMlAds.ts
src/hooks/useMercadoPago.ts
```

### New Pages to Create
```
src/pages/SeuCaixa.tsx
src/pages/MercadoPagoCallback.tsx
```

### New Components to Create
```
src/components/seu-caixa/
  WeeklySummary.tsx
  CashTimeline.tsx
  AlertCard.tsx
src/components/stock-intelligence/
  StockOutAlert.tsx
  DeadStockAlert.tsx
src/components/ml-ads/
  AdsEfficiencyTable.tsx
  AdsFlagBadge.tsx
```

### New Types to Create
```
src/types/seu-caixa.ts
src/types/ml-ads.ts
src/types/mercado-pago.ts
```

---

## Paywall Gates

All features in this cycle are **paid-only**. If seller is on free tier (after trial ended):
- `SeuCaixa` page: show a preview (blurred/placeholder) + "Assinar para ver seu caixa semanal"
- Stock alerts: do not compute or show
- ADS efficiency: do not compute or show

Use `useSubscription()` hook from the Billing cycle for all gates.

---

## App.tsx Routes to Add

```typescript
<Route path="/seu-caixa" element={
  <ProtectedRoute>
    <Suspense fallback={<Loading />}><SeuCaixa /></Suspense>
  </ProtectedRoute>
} />

<Route path="/oauth/mercado-pago/callback" element={
  <Suspense fallback={<Loading />}><MercadoPagoCallback /></Suspense>
} />
```

Navigation: Add "Seu Caixa" to the main sidebar navigation. It should appear between "Dashboard" and "Pedidos".

---

## Code Best Practices

> The full engineering standards are in **`docs/ENGINEERING_STANDARDS.md`**. The section "Engineering Standards — Mandatory" at the top of this document covers the Cycle 2-specific patterns (Strategy, Adapter, pure stock intelligence functions).

### Quick Reference
- Alert priority: Strategy Pattern (see "Engineering Standards" section above)
- MP API responses: Adapter Pattern — normalize at the boundary before touching the DB
- Stock calculations: pure functions in `src/utils/stock-intelligence.ts` — no DB calls
- Token refresh: check `token_expires_at` before every API call; refresh if within 10 minutes of expiry; never wait for a 401

---

## NFe Provider Decision (Decide Before Starting Cycle 3)

Cycle 3 requires choosing and integrating an NFe provider. This decision must be made before Cycle 2 ends — the integration takes time to validate and the open questions below need human answers.

### Focus vs Nuvem Fiscal comparison

| | Focus Growth | Nuvem Fiscal I | Nuvem Fiscal II |
|---|---|---|---|
| **Price/month** | R$548 | R$180 | R$600 |
| **CNPJs** | Unlimited | Unlimited | Unlimited |
| **Ops included** | 4,000 | 10,000 | 100,000 |
| **Extra op** | R$0,12 | ? (open) | ? (open) |
| **CNPJ queries** | ❌ | ✅ 150k | ✅ 500k |
| **CEP queries** | ❌ | ❌ | ✅ 700k |

At 100 clients × 300 NFes/month:
- Focus Growth: R$3,668/month → R$36.68/client
- Nuvem Fiscal II: R$600/month → R$6/client ← **dramatically cheaper**

Nuvem Fiscal also includes CNPJ queries that can replace ReceitaWS in the onboarding CNPJ step.

### Open questions — must be answered before committing (contact Nuvem Fiscal support)

**Question 1 — Does receiving NFe (MDe) count as an operation?**
If yes, estimated volume per client doubles. This changes which plan is right.
Answer: _______________

**Question 2 — Cost per operation above the plan limit?**
Not published on their website. Critical for peak month projections (Black Friday).
Answer: _______________

**Question 3 — Is there a free trial?**
Focus offers 30 days. Need equivalent for integration testing in homologação.
Answer: _______________

**Question 4 — Does the CNPJ query API return IE (Inscrição Estadual) and situação cadastral?**
If yes, eliminates need for SEFAZ state API calls in the CNPJ onboarding step.
Answer: _______________

Current NFe integration uses Focus API (existing edge functions: `focus-nfe-emit`, `focus-nfe-cancel`, `focus-nfe-sync`). If switching to Nuvem Fiscal, the edge functions need to be adapted — a few days of work, not a rewrite. The `invoices` table schema is provider-agnostic.

---

## What NOT to Build in This Cycle

### Rabbit Holes
- **Full cash flow projection:** "Você vai ter R$X no dia 30" — this requires predicting future sales, which is complex and error-prone. Show the known release schedule only (what MP has already committed to releasing).
- **Order-level ADS attribution:** Figuring out which individual orders came from ads requires ML's attribution API (expensive calls, complex join). Blended model is enough and honest about its limitations.
- **Configurable "Seu Caixa":** It's opinionated — one screen, curated. No date range picker, no "show/hide sections". The seller can't configure it.
- **Stock alert page:** Alerts appear contextually where the seller already is. Do NOT build a standalone "Alertas" page. Notifications should be push-over-pull.
- **Supplier integration:** That's Cycle 4.

### No-Gos
- Custom date range picker on weekly summary (always 7 days, always)
- Multi-campaign ADS breakdown (product-level is the lowest granularity in Cycle 2)
- Automated actions triggered by alerts (e.g., auto-pause ADS if negative ROI)
- Shopee ADS integration (Cycle 3+ only)

---

## Definition of Done

1. **MP OAuth completes** — Seller can connect Mercado Pago via the contextual CTA on Diagnóstico without re-entering credentials already used for ML.

2. **Balance data is accurate** — `available_amount` + `releasing_*_days` in `mercado_pago_balance_snapshots` matches what the seller sees in MP's native seller app (tolerance ±R$10).

3. **Seu Caixa shows correct weekly summary** — Gross revenue, ML fees, shipping, and net margin match what would be manually computed from the orders list for the same 7-day period.

4. **Stock-out prediction is shown** — When a product has < 7 days of stock at current sales rate, the alert appears on Seu Caixa's "Alerta da semana" section.

5. **Dead stock value is calculated** — Products with 0 sales in 45+ days and unit_cost set show their trapped cash value.

6. **ADS efficiency displays correctly** — For connected ADS accounts, the efficiency table shows spend, cost per sale, and margin before/after ADS. Products with negative margin are flagged.

7. **Seu Caixa appears on Monday** — On the first login on Monday, Seu Caixa is the default landing page (not Dashboard).

8. **Free tier sees upgrade CTAs** — Sellers past their trial see upgrade prompts, not broken/empty states.
