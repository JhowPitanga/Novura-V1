# Cycle 3 — "Visibilidade e Conformidade"
**Status:** Third user-facing cycle | **Appetite:** 6 weeks | **Team:** 1 designer + 2 engineers
**Depends on:** Cycle 0 + 1 + 2 complete

---

## Purpose of This Document

This document is the complete specification for Cycle 3. It is self-contained. Do not build features from other cycles. When in doubt, refer to **Rabbit Holes & No-Gos**.

---

## ⚙️ Engineering Standards — Mandatory

> **Read `docs/ENGINEERING_STANDARDS.md` before writing any code for this cycle.**
> What follows are the patterns most relevant to Cycle 3 code (NFe defaults, validation chain, listing performance signals).

### Hard Limits (Non-Negotiable)

| Unit | Limit |
|---|---|
| Function body | **50 lines** |
| File (service, hook, util) | **150 lines** |
| Page component | **200 lines** |
| Edge function handler | **80 lines** |

### Factory Pattern — NFe Payload Builder

`buildNfePayload` is the most complex data construction in this cycle. It must be a pure factory function — zero supabase calls, zero side effects, fully testable:

```typescript
// src/utils/nfe-defaults.ts

// Public API: one factory function
export function buildNfePayload(
  order: Order,
  items: OrderItem[],
  shipping: OrderShipping,
  company: Company
): NfePayload {
  return {
    cfop:      selectCfop(company.state_uf, order.buyer_state),
    recipient: buildRecipient(order, shipping),
    items:     items.map(buildNfeItem),
    totals:    buildTotals(items),
    emitter:   buildEmitter(company),
  }
}

// Private sub-builders: each < 20 lines, one job
function selectCfop(sellerUF: string, buyerUF: string): string {
  // Simple rule for Simples Nacional + physical goods to end consumer
  return sellerUF === buyerUF ? '5.102' : '6.102'
  // Note: does NOT cover services, exports, Zona Franca — by design (Simples only)
}

function buildRecipient(order: Order, shipping: OrderShipping): NfeRecipient { ... }
function buildNfeItem(item: OrderItem): NfeItem { ... }
function buildTotals(items: OrderItem[]): NfeTotals { ... }
function buildEmitter(company: Company): NfeEmitter { ... }
```

### Chain of Responsibility — NFe Validation

Pre-emission validation passes through independent validators. Each returns the same shape. Adding a new check = adding one function to the array:

```typescript
// src/utils/nfe-validation.ts

type ValidationResult = { valid: true } | { valid: false; message: string }
type Validator = (order: Order, company: Company) => ValidationResult

// Add validators in the order they should run (fast checks first)
const nfeValidators: Validator[] = [
  validateOrderNotCancelled,
  validateBuyerDocument,
  validateBuyerState,
  validateCompanyFiscalData,
  validateNoExistingInvoice,
]

export function validateNfeEmission(order: Order, company: Company): ValidationResult {
  for (const validate of nfeValidators) {
    const result = validate(order, company)
    if (!result.valid) return result  // short-circuit on first failure
  }
  return { valid: true }
}

// Each validator: one condition, one message, < 10 lines
function validateBuyerDocument(order: Order): ValidationResult {
  return order.buyer_document
    ? { valid: true }
    : { valid: false, message: 'CPF/CNPJ do comprador ausente — não é possível emitir NF-e' }
}
```

### Strategy Pattern — Listing Performance Signal

The performance signal (green/yellow/red) is a named strategy, not an if-else chain buried inside a component:

```typescript
// src/utils/listing-performance.ts

type PerformanceSignal = 'green' | 'yellow' | 'red'

type SignalStrategy = {
  condition: (conversion: number, categoryAvg: number, visits: number) => boolean
  signal: PerformanceSignal
  suggestion: string
}

// Strategies evaluated top-to-bottom — first match wins
const SIGNAL_STRATEGIES: SignalStrategy[] = [
  {
    condition: (_, __, visits) => visits < 20,
    signal: 'red',
    suggestion: 'Poucas visitas — verifique o preço vs. concorrentes',
  },
  {
    condition: (rate, avg) => rate / avg >= 0.9,
    signal: 'green',
    suggestion: 'Acima da média da categoria',
  },
  {
    condition: (rate, avg) => rate / avg >= 0.6,
    signal: 'yellow',
    suggestion: 'Verifique o título, fotos e descrição do anúncio',
  },
  {
    condition: () => true,  // default / catch-all
    signal: 'red',
    suggestion: 'As fotos ou título podem não estar alinhados com o que o comprador procura',
  },
]

export function computePerformanceSignal(
  conversionRate: number,
  categoryAvg: number,
  visits: number
): { signal: PerformanceSignal; suggestion: string } {
  const match = SIGNAL_STRATEGIES.find(s => s.condition(conversionRate, categoryAvg, visits))!
  return { signal: match.signal, suggestion: match.suggestion }
}
```

### NFe Error Translation — Constant Map, Not Switch

```typescript
// src/utils/nfe-errors.ts

export const NFE_ERROR_MESSAGES: Record<string, string> = {
  '539': 'CPF do destinatário inválido — verifique o CPF do comprador',
  '362': 'Nota já autorizada pela SEFAZ com esta chave',
  '217': 'CNPJ da empresa emitente inválido — verifique suas configurações',
  '204': 'Certificado digital expirado — renove o certificado da sua empresa',
  '206': 'Chave de acesso inválida',
  '999': 'Erro interno da SEFAZ — tente novamente em alguns minutos',
} as const

export function translateNfeError(code: string): string {
  return NFE_ERROR_MESSAGES[code]
    ?? `Erro SEFAZ ${code}: tente novamente. Se persistir, entre em contato com o suporte.`
}
```

**Never** use a `switch` statement or if-else chain for this. New error code = add one line to the map.

### Batch NFe Emission — Sequential, Not Parallel

```typescript
// src/hooks/useNfeEmit.ts
// Run emissions sequentially to avoid Focus API rate limits

async function emitBatch(orders: Order[]): Promise<BatchResult> {
  const results: OrderEmitResult[] = []

  for (const order of orders) {
    const result = await emitSingle(order)  // await each before moving on
    results.push(result)
    // Update progress UI after each emission (not at the end)
    onProgress(results.length, orders.length)
  }

  return summarizeBatchResults(results)
}

// Separate functions: emitSingle, summarizeBatchResults, onProgress
// None of them exceeds 30 lines
```

---

## The Core Bet

Sellers can understand why a listing isn't converting and emit NFe without needing an accountant to set it up.

Cycle 3 solves two different seller problems in one cycle:
1. **Visibilidade** — "Meu anúncio tem X visitas mas ninguém compra. O que está errado?"
2. **Conformidade** — "Eu precisaria de nota fiscal mas parece complicado demais."

Plus: Shopee UI integration, so Shopee sellers who've been using Novura's data layer (Cycle 0) can now see their Shopee data in the UI.

---

## Frontend Premise

**Significant UI already exists.** The NFe flow (`src/pages/Invoices.tsx`), company setup (`src/pages/Settings.tsx`, `src/pages/NewCompany.tsx`), and listing views are built. Cycle 3 work is:
- New screens: listing performance tab, reputation alert panel
- Rewiring: NFe emission flow to use `invoices` table (Cycle 0) instead of `notas_fiscais`
- Shopee UI: new screens only where Shopee data differs structurally from ML

Rule: change `services/` and `hooks/` — not JSX or Tailwind on existing screens.

---

## What Already Exists at Cycle 3 Start

- ML + Shopee order sync and data model (Cycle 0)
- `orders`, `order_items`, `order_shipping` tables populated
- `invoices` table created (Cycle 0) with idempotency_key
- `emit-invoice` edge function (Cycle 0)
- `focus-nfe-emit`, `focus-nfe-cancel`, `focus-nfe-sync`, `focus-webhook` edge functions (existing)
- `cnpj-lookup`, `focus-company-create`, `upload-company-certificate` edge functions (existing)
- `src/pages/Invoices.tsx` — existing page at `/notas-fiscais/*` route
- `src/pages/Settings.tsx` + `src/pages/NewCompany.tsx` — existing NFe company setup
- `mercado-livre-update-metrics` edge function (existing — fetches impressions/visits)
- `shopee-sync-orders`, `shopee-webhook-orders` (existing from Cycle 0)

### What Does NOT Exist Yet
- Listing performance page/tab (impressions + conversion vs category average)
- Reputation risk alert system
- Simplified NFe emission flow from the orders view (existing is complex)
- Shopee-specific UI (orders, products, diagnosis for Shopee)
- `supabase/functions/ml-listing-performance-sync` — does not exist as a dedicated function

---

## Feature F3.1: Listing Performance

### What to Build
A per-listing view showing impressions, visits, conversion rate, and comparison to the category average. Not a complex analytics dashboard — a simple signal: "is this listing healthy, mediocre, or sick?"

### Data Source
Mercado Livre's Item API provides:
- `GET /items/{item_id}` returns: health score, quality score, and some performance metrics
- `GET /items/{item_id}/visits` returns visit counts by period
- Category average data requires ML's `GET /categories/{category_id}/insights` endpoint

### New Edge Function: `ml-sync-listing-performance`
**Location:** `supabase/functions/ml-sync-listing-performance/index.ts`
**Responsibility:** For each active ML listing, fetch visits, conversion rate, and category benchmarks. Store in `listing_performance_snapshots`.

```sql
CREATE TABLE listing_performance_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  marketplace_item_id   text NOT NULL,
  title                 text,
  impressions_7d        integer DEFAULT 0,
  visits_7d             integer DEFAULT 0,
  sales_7d              integer DEFAULT 0,
  conversion_rate_7d    numeric(5,4),            -- units: 0.0523 = 5.23%
  category_avg_conversion numeric(5,4),          -- category benchmark
  category_id           text,
  health_score          text,                    -- 'good' | 'warning' | 'critical' (ML quality)
  performance_signal    text,                    -- 'green' | 'yellow' | 'red' (our computed signal)
  snapshot_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, marketplace_item_id, snapshot_at::date)
);

CREATE INDEX listing_perf_org_item ON listing_performance_snapshots (organization_id, marketplace_item_id);
CREATE INDEX listing_perf_snapshot_at ON listing_performance_snapshots (snapshot_at DESC);
```

**Performance signal logic:**
```typescript
function computePerformanceSignal(
  conversion_rate: number,
  category_avg: number
): 'green' | 'yellow' | 'red' {
  const ratio = conversion_rate / category_avg
  if (ratio >= 0.9) return 'green'    // within 10% of category avg
  if (ratio >= 0.6) return 'yellow'   // 40% below category avg
  return 'red'                         // more than 40% below
}
```

**Sync cadence:** Once per day per organization. Not on every page load.

**ML API edge cases:**
- Category average data (`/categories/{id}/insights`) may require ML's Seller Insights API — check if available for the seller's account tier. If not available: show conversion rate but hide "vs categoria" comparison. Do NOT show 0% as category average.
- Visits and impressions are DIFFERENT: impressions = times the listing appeared in search; visits = times the listing was clicked. Conversion = sales / visits (not sales / impressions).
- Some listings have < 10 visits in 7 days — showing conversion rate is misleading (2/5 visits = 40% "conversion" is noise). Show "Volume baixo" instead of a percentage when visits_7d < 20.

### Frontend: Listing Performance Tab

Add a "Performance" tab to the existing `src/pages/Listings.tsx` page.

Tab content:
```
[Filter: Todos | Saudáveis | Atenção | Críticos]

┌──────────────────────────────────────────────────────────────┐
│ 🟢 Fone Bluetooth Pro Max                                    │
│    Visitas: 234  │  Conversão: 5.2%  │  Média cat.: 4.8%   │
│    "Acima da média da categoria"                             │
│                                            [Ver no ML →]    │
├──────────────────────────────────────────────────────────────┤
│ 🟡 Carregador USB-C 65W                                      │
│    Visitas: 89   │  Conversão: 2.1%  │  Média cat.: 4.8%   │
│    "Conversão 56% abaixo da média"                          │
│    💡 Verifique o título e as fotos do anúncio              │
│                                            [Ver no ML →]    │
├──────────────────────────────────────────────────────────────┤
│ 🔴 Cabo HDMI 4K                                              │
│    Visitas: 12   │  Conversão: 0.8%  │  Volume baixo       │
│    "Poucas visitas — verifique o preço vs. concorrentes"    │
│                                            [Ver no ML →]    │
└──────────────────────────────────────────────────────────────┘
```

**The "💡 suggested action" per signal:**
- Yellow (conversion low): "Verifique o título, fotos e descrição do anúncio"
- Red + low visits: "O preço pode estar acima dos concorrentes — verifique o posicionamento"
- Red + visits ok but no conversion: "As fotos ou título podem não estar alinhados com o que o comprador procura"

These are static suggestions mapped from signal type. Do NOT try to build an AI suggestion engine — that's out of scope.

### Component Architecture
```
src/components/listings/
  ListingPerformanceTab.tsx          — tab container + filter
  ListingPerformanceCard.tsx         — individual listing card with signal
  PerformanceSignalBadge.tsx         — green/yellow/red signal chip
src/hooks/useListingPerformance.ts
src/services/listing-performance.service.ts
src/types/listing-performance.ts
```

---

## Feature F3.2: Reputation Risk Alerts

### What to Build
Proactive alerts that warn the seller BEFORE their ML reputation thermometer changes color. Not reactive — the seller should find out in Novura before ML shows them the warning.

### Data Source
ML API endpoints needed:
- `GET /users/{user_id}/seller_reputation` — current thermometer status, metrics
- `GET /users/{user_id}/complaints` — open complaints
- `GET /users/{user_id}/`delayed_shipments`` — late shipments metric

### New Edge Function: `ml-sync-reputation`
**Location:** `supabase/functions/ml-sync-reputation/index.ts`

```sql
CREATE TABLE seller_reputation_snapshots (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thermometer_status          text,           -- 'green' | 'light_green' | 'yellow' | 'orange' | 'red' (ML's colors)
  sales_completed_90d         integer DEFAULT 0,
  claims_rate_90d             numeric(5,4),   -- % of orders with claims
  delayed_shipment_rate_90d   numeric(5,4),
  cancellation_rate_90d       numeric(5,4),
  open_complaints_count       integer DEFAULT 0,
  complaints_response_deadline jsonb,         -- [{ complaint_id, deadline_at }]
  risk_level                  text,           -- 'ok' | 'warning' | 'critical'
  snapshot_at                 timestamptz NOT NULL DEFAULT now()
);
```

**Risk level computation:**
```typescript
function computeRiskLevel(snapshot): 'ok' | 'warning' | 'critical' {
  // ML's thresholds for "yellow" thermometer:
  // claims_rate > 2% → warning
  // delayed_shipments > 5% → warning
  // cancellation_rate > 2% → warning
  // Any claim without response within 48h → critical
  // Two or more warning conditions → critical
}
```

**Sync cadence:** Twice per day (important data — reputation changes quickly).

### Alert Display

Reputation alerts appear in:
1. **Seu Caixa "Alerta da semana"** — if risk_level = 'critical', it takes highest priority over stock alerts
2. **A new "Reputação" section** on the Dashboard or Seu Caixa
3. **Toast notification** on login if there's a pending complaint with < 24h to respond

**Alert copy examples:**
```
⚠️ Você tem 2 reclamações aguardando resposta (prazo: amanhã às 18h)
   [Responder no ML →]

⚠️ Taxa de envios com atraso: 7,3% (limite do ML: 5%)
   Você está a 2,3% de mudar para amarelo
   [Ver pedidos atrasados →]

🔴 Reputação em risco: 3 ocorrências esta semana
   Ação urgente necessária para evitar restrições
   [Ver detalhes →]
```

**Critical edge case: ML complaint deadlines**
ML gives sellers a response window for complaints. If this deadline passes without a response, the complaint counts against the seller's thermometer. The alert must show the exact deadline in plain text: "Prazo para resposta: domingo às 23h59". NOT a relative time like "em 2 dias" — sellers need the exact date.

### Component Architecture
```
src/components/reputation/
  ReputationAlertCard.tsx
  ComplaintDeadlineAlert.tsx
src/hooks/useReputation.ts
src/services/reputation.service.ts
src/types/reputation.ts
```

---

## Feature F3.3: NFe Emission — Simplified for Simples Nacional

### Context
The existing NFe emission system in `src/pages/Invoices.tsx` (route: `/notas-fiscais/*`) already works but is complex. This feature builds a **simplified parallel path** for Simples Nacional sellers — directly from the orders view, not the invoices page.

### What to Build
A "Emitir NF-e" button directly in the orders list that:
1. Pre-fills all fields using smart defaults
2. Confirms in one click (with a review modal)
3. Emits via the `emit-invoice` edge function (Cycle 0)

This does NOT replace the existing `/notas-fiscais` page — it adds a fast path for common cases.

### Smart Defaults for Simples Nacional
The system automatically fills:
- **Regime tributário:** Simples Nacional (fixed for this feature)
- **Natureza da operação:** "Venda de mercadoria" (CFOP 6.102 for interstate, 5.102 for intrastate)
- **CFOP:** Automatically selected based on seller state (UF from company) vs buyer state (UF from `orders.buyer_state`)
- **CST/CSOSN:** 400 (sem tributação pelo Simples) — default for most Simples Nacional sellers
- **Alíquota ICMS:** 0% (Simples Nacional) — sourced from company fiscal registration
- **Valor da NF-e:** `orders.gross_amount` (sale price before deductions)
- **Itens:** Pulled from `order_items` (title, quantity, unit_price)
- **Dados do destinatário:** `buyer_name`, `buyer_document`, delivery address from `order_shipping`

### One-Click Emit Flow (from Orders list)
```
1. Seller clicks "Emitir NF-e" on an order row
2. Modal opens with pre-filled review:
   ┌─────────────────────────────────────────┐
   │ Emitir Nota Fiscal                      │
   │ Pedido #ML-12345                        │
   │                                         │
   │ Para: João Silva (CPF 123.456.789-00)  │
   │ Valor: R$189,90                         │
   │ Regime: Simples Nacional                │
   │ CFOP: 6.102 (venda interestadual)      │
   │                                         │
   │ [Alterar dados]  [Confirmar e emitir]  │
   └─────────────────────────────────────────┘
3. Seller clicks "Confirmar e emitir" → calls emit-invoice
4. Loading: "Emitindo nota fiscal..."
5. Success: "Nota emitida! NF-e 000.001" with [Baixar PDF] [Baixar XML]
6. Error: Show Focus error code translated to Portuguese
```

### "Alterar dados" modal
Opens a secondary form where the seller can:
- Change CFOP (dropdown with the most common options, with plain language labels)
- Change buyer CPF/CNPJ (if marketplace data was wrong or null)
- Add complementary description
- Change total value (for partial refund scenarios)

NOT exposed to the seller (auto-filled, no UI for it):
- CST/CSOSN
- PIS/COFINS/IPI rates (Simples Nacional sellers don't deal with these individually)
- All fiscal codes beyond CFOP

### Batch Emission
Add a "Emitir NF-e em lote" action to the orders list (checkbox select → action button):
- Checks: all selected orders are paid (not cancelled), none already have an authorized invoice
- Shows progress: "Emitindo notas... 12 de 34 concluídas"
- Runs `emit-invoice` sequentially (not in parallel) to avoid Focus API rate limits
- Reports final: "31 emitidas, 3 com erro" with error details

### NFe Error Handling
Focus NFe returns SEFAZ error codes. These must be translated to plain Portuguese. Common ones:
```typescript
const NFE_ERRORS: Record<string, string> = {
  '539': 'CPF do destinatário inválido — verifique o CPF do comprador',
  '362': 'Nota já autorizada pela SEFAZ com esta chave',
  '217': 'CNPJ da empresa emitente inválido — verifique suas configurações',
  '204': 'Certificado digital expirado — renove o certificado da sua empresa',
  '206': 'Chave de acesso inválida',
  '999': 'Erro interno da SEFAZ — tente novamente em alguns minutos',
}

// For unknown error codes:
'Erro SEFAZ [código]: Tente novamente. Se o erro persistir, entre em contato com o suporte.'
```

### Preventing Issues: Pre-emission Validation
Before calling Focus, validate locally:
1. `buyer_document` is not null (CPF/CNPJ required for NF-e)
2. `buyer_state` is not null (needed for CFOP selection)
3. Company fiscal data is complete (CNPJ, certificate, IE if applicable)
4. Order is not cancelled
5. No existing authorized invoice for this order + environment combination

If validation fails: show specific error before even attempting emission. Never show a generic "erro ao emitir".

### Simples Nacional Only — Scope Enforcement
This simplified path is ONLY for Simples Nacional sellers. The existing `/notas-fiscais` page handles Lucro Real/Presumido. If a company is configured as Lucro Real or Presumido: hide the simplified emit button and show "Use a área de Notas Fiscais para emitir."

The tax regime is stored in `companies.regime_tributario` (check existing schema). If this column doesn't exist, add it.

### Component Architecture
```
src/components/orders/
  NfeEmitButton.tsx                  — button in orders table row
  NfeEmitModal.tsx                   — review + confirm modal
  NfeEmitAlterForm.tsx               — secondary form for changes
  NfeEmitProgress.tsx                — batch progress component
  NfeErrorMessage.tsx                — error code → Portuguese translation
src/hooks/useNfeEmit.ts              — mutation hook for emit-invoice
src/utils/nfe-defaults.ts            — CFOP selection logic, smart defaults computation
src/utils/nfe-errors.ts              — error code translation map
```

---

## Feature F3.4: Basic Shopee Integration (UI)

### Context
The Cycle 0 data layer already syncs Shopee orders to the same `orders` table with `marketplace = 'shopee'`. This feature brings Shopee data into the existing UI views — it does NOT build Shopee-specific pages.

### What to Build

**1. Shopee connection in Apps page (`/aplicativos`)**
The existing `src/pages/Apps.tsx` already shows connected integrations. Add:
- Shopee store connect button (triggers `shopee-start-auth`)
- Status of connected Shopee store
- Sync status + last synced time

**2. Orders list: show Shopee orders**
Remove the `marketplace = 'mercado_livre'` filter from the orders service. The orders list should show orders from ALL connected marketplaces by default, with a marketplace filter.

Add marketplace filter to orders filter bar:
```
Marketplace: [Todos] [Mercado Livre] [Shopee]
```

Add marketplace badge to each order row: `ML` (purple) or `Shopee` (orange).

**3. Diagnóstico extends to Shopee**
The Diagnóstico service from Cycle 1 filters by `marketplace = 'mercado_livre'`. In this cycle:
- Show a marketplace selector on Diagnóstico: "Mercado Livre" | "Shopee" | "Todos"
- "Todos" shows combined money leaks across both marketplaces
- "Shopee" shows Shopee-specific data
- Default: "Todos" (if Shopee connected) or "Mercado Livre" (if Shopee not connected)

**4. Products and inventory: no changes needed in this cycle**
The product catalog and inventory management remain ML-centric. Shopee product linking can be done via the same products table if they share SKUs. Full Shopee product management is out of scope.

### Shopee OAuth edge cases
- Shopee OAuth uses a different flow than ML (HMAC signature, not PKCE). The existing `shopee-start-auth` handles this — do NOT rewrite it.
- Some Shopee sellers have multiple shops. For Cycle 3: connect one shop. Multi-shop is out of scope.
- Shopee's API access token doesn't expire the same way as ML — check `shopee-refresh` logic for the exact expiry pattern.

### Multi-marketplace display considerations
- When showing "combined" totals across ML + Shopee: always show the breakdown by marketplace as a secondary line. Never hide which marketplace contributed what.
- `net_amount` is comparable across marketplaces because the `orders-normalize-shopee` function in Cycle 0 normalized it to the same formula. Trust this calculation.
- Orders with the same product sold on both marketplaces: these are separate orders, shown separately. Do not try to "deduplicate" across marketplaces.

---

## App.tsx Routes: Changes

No new top-level routes needed. Changes are:
- Diagnóstico page: add marketplace selector
- Orders page: remove ML-only filter, add marketplace filter
- Apps page: add Shopee section (already at `/aplicativos`)

---

## New Files to Create (Complete List)

### Components
```
src/components/listings/
  ListingPerformanceTab.tsx
  ListingPerformanceCard.tsx
  PerformanceSignalBadge.tsx

src/components/reputation/
  ReputationAlertCard.tsx
  ComplaintDeadlineAlert.tsx

src/components/orders/
  NfeEmitButton.tsx
  NfeEmitModal.tsx
  NfeEmitAlterForm.tsx
  NfeEmitProgress.tsx
  NfeErrorMessage.tsx
```

### Hooks
```
src/hooks/useListingPerformance.ts
src/hooks/useReputation.ts
src/hooks/useNfeEmit.ts
```

### Services
```
src/services/listing-performance.service.ts
src/services/reputation.service.ts
```

### Utils
```
src/utils/nfe-defaults.ts
src/utils/nfe-errors.ts
```

### Types
```
src/types/listing-performance.ts
src/types/reputation.ts
```

### Edge Functions
```
supabase/functions/ml-sync-listing-performance/index.ts
supabase/functions/ml-sync-reputation/index.ts
```

### Migrations
```
supabase/migrations/YYYYMMDD_create_listing_performance_snapshots.sql
supabase/migrations/YYYYMMDD_create_seller_reputation_snapshots.sql
supabase/migrations/YYYYMMDD_add_regime_tributario_to_companies.sql  -- if column missing
```

---

## Code Best Practices (Cycle 3 Additions)

### NFe smart defaults = pure functions
The CFOP selection logic, CST defaults, and pre-fill logic must be pure functions with no side effects. They take order data and company data as input, return the pre-filled payload. Easy to test.

```typescript
// src/utils/nfe-defaults.ts
export function computeNfeDefaults(
  order: Order,
  orderItems: OrderItem[],
  shipping: OrderShipping,
  company: Company
): NfePayload {
  const cfop = selectCfop(company.state_uf, order.buyer_state)
  return { ... }
}

function selectCfop(sellerUF: string, buyerUF: string): string {
  if (sellerUF === buyerUF) return '5.102'  // intrastate
  return '6.102'                              // interstate
  // Note: This simplification is correct for physical goods sold to end consumers.
  // It does NOT cover: services, exports, Zona Franca de Manaus, etc.
}
```

### Reputation alerts = read-only
Never write to or modify ML's complaint system from Novura. Novura is a read-only observer for reputation data. Links always open ML's seller center for the seller to take action there.

### Listing performance = stale data is OK
Performance data doesn't need to be real-time. Use `staleTime: 24 * 60 * 60 * 1000` (24 hours). If a seller navigates to the performance tab and data is from yesterday, that's fine — show "Atualizado ontem" with a "Atualizar" button.

---

## NFe Provider Integration

### Decision point (carried from Cycle 2 planning)

Before starting NFe implementation in this cycle, the NFe provider open questions (documented in `CYCLE_2_SEU_CAIXA.md` → "NFe Provider Decision" section) must be answered.

**If Nuvem Fiscal questions are resolved favorably:** integrate Nuvem Fiscal instead of Focus. The `invoices` table (Cycle 0) is provider-agnostic — only the edge function that calls the provider API changes.

**If staying with Focus:** use existing `focus-nfe-emit`, `focus-nfe-cancel`, `focus-nfe-sync` functions. Wrap them with the `emit-invoice` edge function (Cycle 0) to ensure idempotency.

### Why NOT build an NFe emitter from scratch

This question comes up. The answer is no. Reasons:
- 27 SEFAZ state endpoints with different behavior + contingency mode
- NFSe: 5,000+ municipalities each with their own API and schema
- Schema changes (Notas Técnicas) ~2x/year — mandatory, deadline-based
- Certificate management (A1 expires annually, must renew without downtime)

The annual cost of Focus/Nuvem Fiscal at 100 clients (~R$600–3,600/month) is a fraction of the engineering cost to build and maintain this. Do not build it.

### Simplified NFe setup UX (Cycle 3 scope)

The complexity of NFe configuration is the #1 reason sellers abandon ERPs before emitting their first note. The goal for Cycle 3 is to get a seller from "never configured NFe" to "first NFe authorized" in under 30 minutes.

The Operational Readiness Checklist (built in Cycle 1) is the UX mechanism:
```
Para emitir NFe você precisa:
✅ CNPJ e endereço configurados (auto-filled in onboarding)
✅ Regime tributário (auto-suggested in onboarding)
⚪ Certificado digital A1 — Fazer upload →
✅ NCM configurado (83/83 produtos)
⚪ IE (Inscrição Estadual) — Informar →
⚪ Tributação configurada (3 produtos pendentes) → Resolver agora
```

Each incomplete item is a direct link to the exact configuration screen. No hunting through Settings menus.

**Translation of Focus/NFe error codes to Portuguese:**
Fiscal API errors are cryptic (e.g., "rejeicao_227", "schema_invalido"). The edge function must translate common errors into actionable Portuguese messages:
- `rejeicao_202`: "CPF/CNPJ do destinatário inválido — verifique os dados do comprador"
- `rejeicao_227`: "Numeração de NF-e já utilizada — a numeração será ajustada automaticamente"
- `rejeicao_schema`: "Configuração fiscal incompleta — verifique o NCM e a tributação do produto"
- Generic: "Erro na emissão: [código]. Tente novamente ou contate o suporte."

Never show raw API error codes to the seller.

---

## What NOT to Build in This Cycle

### Rabbit Holes
- **Full listing editor inside Novura** — When a seller clicks "Ver no ML", it opens ML's listing editor. Do NOT replicate ML's listing edit form inside Novura. Too complex and prone to API deprecation.
- **Price comparison vs. competitors** — Requires a scraping or price intelligence service. That's Cycle 4+.
- **NFe for Lucro Real/Presumido** — The existing `/notas-fiscais` system handles this. The simplified flow is Simples Nacional ONLY.
- **Shopee-specific analytics page** — Shopee data appears in existing views (orders, diagnóstico). No standalone Shopee page.
- **Shopee ADS integration** — Out of scope completely.
- **NFe XML submission to Shopee** — `shopee-submit-xml` already exists. Check if it works with the new `invoices` table format. If not, adapt it — do not rebuild from scratch.

### No-Gos
- Lucro Real and Lucro Presumido tax regimes in the simplified NFe flow
- Multi-shop Shopee connection
- NFe for marketplace orders with DIFAL (complex tax scenario, out of scope)
- Automated repricing based on competitor data
- Reputation alert AUTO-response (never automate responses to ML complaints)

---

## Definition of Done

1. **Listing performance shows signal** — Each active ML listing shows green/yellow/red signal. Yellow and red show one suggested action.

2. **Category comparison works (or is hidden)** — If ML category data is available, show "X% vs. média da categoria". If not available for a listing, show the conversion rate without comparison. Never show 0% or "N/A" — just hide the comparison column.

3. **Reputation alert fires before thermometer change** — When seller's claims_rate exceeds 2% OR delayed_shipments exceeds 5%, the alert appears in Seu Caixa BEFORE ML shows a thermometer warning.

4. **NFe emits from orders view in < 3 clicks** — From order list → "Emitir NF-e" → confirm modal → "Confirmar e emitir" → success. Three clicks maximum for the happy path.

5. **NFe errors are in plain Portuguese** — SEFAZ error codes are translated. No raw error codes shown to the seller without explanation.

6. **Batch emission works for 10+ orders** — Emitting 10 orders in a batch completes without timeout, shows progress, and reports any individual failures without failing the entire batch.

7. **Shopee orders appear in the orders list** — After Shopee connection, Shopee orders appear alongside ML orders with a "Shopee" marketplace badge. The marketplace filter works.

8. **Diagnóstico shows combined data** — When Shopee is connected, Diagnóstico defaults to showing combined data from ML + Shopee, with a breakdown by marketplace.
