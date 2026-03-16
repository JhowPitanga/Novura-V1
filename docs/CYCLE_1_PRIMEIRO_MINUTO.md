# Cycle 1 — "O Primeiro Minuto" (MVP)
**Status:** First user-facing cycle | **Appetite:** 6 weeks | **Team:** 1 designer + 2 engineers
**Depends on:** Cycle 0 complete (orders table, order_items, net_amount pre-calculated)

---

## Purpose of This Document

This document is the complete specification for an AI agent or engineer implementing Cycle 1. It is self-contained. Do not build features from Cycle 2 or later. Do not invent requirements not listed here. The goal is a working, shippable product — not a complete product.

---

## ⚙️ Engineering Standards — Mandatory

> **Read `docs/ENGINEERING_STANDARDS.md` before writing any code for this cycle.**
> What follows are the most critical rules, with examples specific to the code you will write in Cycle 1.

### Hard Limits (Non-Negotiable)

| Unit | Limit |
|---|---|
| Function body | **50 lines** |
| File (service, hook, util) | **150 lines** |
| Page component | **200 lines** |
| Edge function handler | **80 lines** |

If you hit a limit, **split the function** — do not raise the limit.

### Layered Architecture — The Contract

```
pages/ + components/   →  UI only. No supabase calls. No business logic.
hooks/use*.ts          →  TanStack Query wrappers. Calls service functions.
services/*.service.ts  →  ONLY place that calls supabase. Returns typed data.
utils/                 →  Pure functions. No supabase. No React.
```

**Any code that violates this layering is a bug, not a style issue.**

### Applied to Cycle 1 Code

**DiagnosticoService — use a class** (multiple methods share `organizationId` + supabase):

```typescript
// src/services/diagnostico.service.ts
export class DiagnosticoService {
  constructor(private readonly organizationId: string, private readonly db = supabase) {}

  // Each method: one query + one aggregation. Max 30 lines each.
  async fetchMoneyLeaks(): Promise<MoneyLeaks> { ... }
  async fetchSimpleNacionalUsage(): Promise<SimplesNacionalUsage> { ... }
  async fetchProductFeeRanking(): Promise<ProductFeeRanking> { ... }
}

export const diagnosticoKeys = {
  all:          ['diagnostico'] as const,
  moneyLeaks:   (orgId: string) => ['diagnostico', 'money-leaks', orgId] as const,
  productRank:  (orgId: string) => ['diagnostico', 'product-fee-ranking', orgId] as const,
  simplesLimit: (orgId: string) => ['diagnostico', 'simples-nacional', orgId] as const,
}
```

**Shared formatting utils — create ONCE, import everywhere:**

```typescript
// src/utils/formatting.ts — do NOT inline formatBRL in components
export const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const formatPercent = (value: number, decimals = 1): string =>
  `${value.toFixed(decimals).replace('.', ',')}%`
```

**Margin calculation — pure function, one place:**

```typescript
// src/utils/margin.ts
export const computeMarginBRL = (netAmount: number, totalCost: number): number =>
  netAmount - totalCost

export const computeMarginPct = (netAmount: number, totalCost: number): number =>
  netAmount === 0 ? 0 : ((netAmount - totalCost) / netAmount) * 100
```

**Onboarding state machine — state as enum, not strings:**

```typescript
// src/hooks/useOnboardingStatus.ts
export const OnboardingStep = {
  CONNECT:   'connect',
  IMPORTING: 'importing',
  COMPLETE:  'complete',
  ERROR:     'error',
} as const

export type OnboardingStep = typeof OnboardingStep[keyof typeof OnboardingStep]
```

### Anti-Patterns Banned in This Cycle

```typescript
// ❌ Supabase in a component
function Diagnostico() {
  const [data, setData] = useState(null)
  useEffect(() => { supabase.from('orders').select('*').then(setData) }, [])
}

// ❌ 100-line "do everything" function in a service
export async function loadDiagnostico(orgId: string) {
  // 30 lines: fetch orders
  // 30 lines: fetch items
  // 20 lines: compute metrics
  // 20 lines: format output
}

// ❌ Formatting inline in JSX
<span>{`R$${(value / 100).toFixed(2).replace('.', ',')}`}</span>

// ❌ Silent error swallowing
try { await doSomething() } catch (e) {}
```

---

## The Core Bet

A seller connects their Mercado Livre account and sees real insights about their store in **under 5 minutes**, with **zero configuration required**.

The Diagnóstico screen is the onboarding. There is no setup wizard. There is no "welcome, let's configure your account" flow. The value is the first thing the seller sees.

---

## What Already Exists (Read Before Building)

### Authentication (keep as-is)
- `src/pages/Auth.tsx` — existing signup/login page
- `src/pages/Login.tsx` — existing login
- `src/hooks/useAuth.tsx` — auth context with `user`, `organizationId`, `permissions`, `modulesSwitches`
- `supabase/functions/auth-on-signup` — creates user profile and organization on first signup

### ML OAuth (already fixed — do not change the security model)
- `supabase/functions/mercado-livre-start-auth` — generates PKCE pair, returns `{ authorization_url, state, code_verifier }`. The verifier is returned separately, **not** embedded in state.
- `supabase/functions/mercado-livre-callback` — receives `code_verifier` from request body (not from state URL param), exchanges for tokens, stores encrypted via AES-GCM, uses UPSERT.
- `supabase/functions/mercado-livre-refresh` — decrypts refresh token, gets new pair, re-encrypts, updates row.
- `src/WebhooksAPI/marketplace/mercado-livre/index.ts` — `startMercadoLivreAuth()` stores `code_verifier` in `sessionStorage['ml_pkce_verifier']` and `csrf` in `sessionStorage['ml_oauth_csrf']` before redirect.
- `src/pages/MercadoLivreCallback.tsx` — validates `state.csrf === sessionStorage['ml_oauth_csrf']`, retrieves verifier from sessionStorage, sends to callback edge function, clears sessionStorage.
- Route: `/oauth/mercado-livre/callback` already configured in App.tsx

**Security rules (do not violate):**
- Never put `code_verifier` in the `state` URL parameter — state is publicly visible
- Always validate CSRF before calling the callback edge function
- Tokens in DB are always AES-GCM encrypted — never plaintext
- Clear `ml_pkce_verifier` and `ml_oauth_csrf` from sessionStorage after callback (success or failure)

Full OAuth security model documented in `docs/CYCLE_0_ORDERS_PLATFORM.md` → "OAuth2 Security Model" section.

### Sync (from Cycle 0 — must exist before this cycle)
- `supabase/functions/orders-sync-ml` — syncs last 90 days of ML orders (built in Cycle 0)
- `orders` table with `net_amount`, `marketplace_fee`, `shipping_cost` (built in Cycle 0)
- `order_items` table with per-SKU data (built in Cycle 0)

### Existing Orders Page (do NOT delete — just supplement)
- `src/pages/Orders.tsx` — existing 1,371-line orders page. Do NOT refactor it in this cycle.
- `src/services/orders.service.ts` — existing service layer. Extend it, don't replace it.
- `src/hooks/useOrderFiltering.ts`, `useNfeStatus.ts` — existing hooks. Do not touch them.

### What Does NOT Exist Yet
- An onboarding/connection flow for new users
- `src/pages/Onboarding.tsx` — does not exist, must be created
- `src/pages/Diagnostico.tsx` — does not exist, must be created
- Product cost input UI — does not exist
- Orders list with margin columns — partially exists in Orders.tsx, needs `net_amount` + margin columns
- `src/hooks/useDiagnostico.ts` — does not exist
- `src/services/diagnostico.service.ts` — does not exist

---

## Frontend Premise (Read Before Any Frontend Work)

**Most of the UI already exists.** The visual for order details (with margin breakdown), listings, and the orders list is built and approved. The work in Cycle 1 is:
- **New screens to build from scratch:** Onboarding (CNPJ step, ML connection, loading narrative), Diagnóstico, ProductCosts
- **Existing screens to rewire:** Orders.tsx — only add margin columns and change the data source from `marketplace_orders_presented_new` to the new `orders` table
- **Rule:** Change `services/` and `hooks/` — not JSX, Tailwind classes, or component structure on existing screens

---

## User Flow (End-to-End)

```
1. New user signs up → Google OAuth or email+password
   → Email verification sent in background (NON-BLOCKING — user continues immediately)
   → organization_id + empty company record created at signup

2. /onboarding Step 1 — CNPJ
   → User enters CNPJ (CPF not accepted — show message "Apenas CNPJ no momento")
   → API call to ReceitaWS / Minha Receita → auto-fills: razão social, nome fantasia,
     endereço, CNAE, porte, situação cadastral
   → Suggest regime tributário based on porte (user confirms or changes)
   → Try SEFAZ state APIs for IE (Inscrição Estadual) — non-blocking, field left empty if not found
   → IE not mandatory here — checklist will show it as "needed before NFe"
   → company record enriched; user advances

3. /onboarding Step 2 — Connect ML
   → "Conecte sua loja do Mercado Livre"
   → Button: "Conectar Mercado Livre" → mercado-livre-start-auth → OAuth redirect
   → ML OAuth scope: read_orders + read_listings + read_metrics + read_ads
   → On callback: tokens stored, webhook registered IMMEDIATELY (free users get real-time orders too)

4. /onboarding Step 3 — Importing (loading narrative, not spinner)
   → "✅ Conectado ao Mercado Livre"
   → "⏳ Importando seus pedidos dos últimos 90 dias... (247 pedidos encontrados)"
   → "✅ 247 pedidos importados"
   → "⏳ Analisando seus 83 anúncios..."
   → "✅ 83 anúncios importados · 12 com qualidade abaixo do ideal"
   → "⏳ Calculando suas taxas e comissões..."
   → "✅ Diagnóstico pronto!"
   Each line appears as the process advances — creates anticipation, not anxiety.

5. Auto-redirect to /diagnostico after import completes (no click needed)

6. /diagnostico shows findings automatically (zero user input needed)

7. Free user navigates app — same screens as paid, with contextual paywalls on actions

8. Paywall hit → subscription flow (14-day trial AFTER payment, card required)

9. Post-subscription:
   → Product creation via match engine (AI pre-creates from listings, user adds cost + stock)
   → Operational readiness checklist guides remaining setup
   → NFe emission available when checklist complete
```

---

## Feature F1.1: Onboarding Page

### Route
`/onboarding` — add to `src/App.tsx` as a protected route (auth required, no module permission gate)

### File to create
`src/pages/Onboarding.tsx`

### States this page must handle

**State 1: Not connected**
- Headline: "Conecte sua loja do Mercado Livre"
- Subtext: "Vamos analisar seus últimos 90 dias de vendas e te mostrar onde está o seu dinheiro."
- Button: "Conectar Mercado Livre" — calls `mercado-livre-start-auth` edge function
- No forms, no configuration fields

**State 2: Importing (after OAuth completes)**
- URL: `/onboarding?step=importing`
- Trigger: `mercado-livre-callback` should set this state after storing tokens, then trigger `orders-sync-ml`
- Shows: "Importando seus pedidos... [N] de [M]" with a progress bar
- If the total count is unknown initially, show "Importando seus pedidos..." with a spinner until count is known, then switch to "N de M"
- Do NOT use a generic spinner for this step — the number creates trust

**State 3: Import complete**
- Brief "Pronto! Encontramos [N] pedidos." message
- Auto-redirect to `/diagnostico` after 1.5 seconds (do not make the user click)

### Implementation Notes
- Detect the current state from URL params (`?step=importing`) and from Supabase real-time subscription on the sync job status
- If the user refreshes during import, they should land back on the importing state — not lose progress
- If import fails, show: "Não conseguimos importar seus pedidos. [Tentar novamente]" — never a blank screen or generic error
- Track import progress by polling `orders` table count for this organization

### Component Architecture
```
src/pages/Onboarding.tsx                — page container (state machine)
src/components/onboarding/
  ConnectML.tsx                         — "not connected" state UI
  ImportProgress.tsx                    — importing state with progress bar
  ImportComplete.tsx                    — success state before redirect
src/hooks/useOnboardingStatus.ts        — determines current state, tracks import progress
```

---

## Feature F1.2: Diagnóstico Automático

### Route
`/diagnostico` — add to App.tsx as protected route

### File to create
`src/pages/Diagnostico.tsx`

### What it displays (4 blocks, always in this order)

**Block 1 — Money Leaks (always shown)**
```
"Nos últimos 90 dias, o Mercado Livre reteve:"
  R$X em comissões
  R$Y em frete
  ─────────────────
  Total: R$X+Y retido pela plataforma

"Você recebeu líquido: R$Z de R$W em vendas brutas"

Waterfall visual: Receita Bruta → (-Comissão) → (-Frete) → Receita Líquida
```

**Block 2 — Produto com pior custo de plataforma (always shown)**
```
"Produto com maior peso de taxa:"
[Product name]
"O ML retém R$X por venda (Y% do preço de R$Z)"

"Produto com menor peso de taxa:"
[Product name]
"O ML retém R$X por venda (Y% do preço de R$Z)"
```

**Block 3 — Simples Nacional Tracker (always shown)**
```
"Faturamento em [ano corrente]"
R$X de R$4.800.000,00

[Progress bar: green 0-60%, yellow 60-80%, red 80-100%]

"Você usou X% do limite anual do Simples Nacional"
```

**Block 3B — Saúde da conta ML (always shown if data available)**
```
Sua reputação: 🟢 Verde (95% de avaliações positivas)
Taxa de cancelamento: 2.1% (meta ML: < 3%) ✓
Taxa de reclamações: 0.8% (meta ML: < 2%) ✓
12 anúncios com qualidade abaixo do ideal — Ver quais →
```
- Fetch from ML API: `GET /users/{user_id}/reputation` (already available in the OAuth token)
- Store snapshot in `marketplace_integrations.config` JSONB — do not create a new table for this
- If cancellation rate > 3% or complaints > 2%: show card in red with "Sua conta pode ser penalizada"
- If all metrics are green: show as a positive card — it still creates engagement

**Block 3C — ADS impact (shown only if seller has active campaigns)**
```
Seus anúncios patrocinados custaram R$ 1.240 nos últimos 90 dias
e geraram R$ 8.750 em vendas. ROAS: 7,1x

3 campanhas com ROAS abaixo de 3x → [PAGO: Ver quais estão desperdiçando]
```
- Only shown if `read_ads` scope returned campaign data during polling
- ADS full analysis (which campaigns to pause) is a paid feature — show summary free, gate the detail
- If no campaigns: hide this block entirely

**Block 4 — CTA to unlock real margin (always shown last)**
```
"Quer ver sua margem real por pedido?"
"Adicione o custo dos seus produtos — leva menos de 2 minutos."
[Botão: "Adicionar custos →"]
```

### Data Queries

**Money leaks query** (reads from `orders` table built in Cycle 0):
```typescript
// src/services/diagnostico.service.ts
export async function fetchMoneyLeaks(organizationId: string) {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data } = await supabase
    .from('orders')
    .select('gross_amount, marketplace_fee, shipping_cost, net_amount')
    .eq('organization_id', organizationId)
    .eq('marketplace', 'mercado_livre')
    .neq('status', 'cancelled')  // exclude cancelled orders
    .gte('created_at', ninetyDaysAgo.toISOString())

  const totalGross = data.reduce((sum, o) => sum + (o.gross_amount ?? 0), 0)
  const totalFee = data.reduce((sum, o) => sum + (o.marketplace_fee ?? 0), 0)
  const totalShipping = data.reduce((sum, o) => sum + (o.shipping_cost ?? 0), 0)
  const totalNet = data.reduce((sum, o) => sum + (o.net_amount ?? 0), 0)

  return { totalGross, totalFee, totalShipping, totalNet, orderCount: data.length }
}
```

**Worst/best product by fee ratio query** (reads from `orders` + `order_items`):
```typescript
export async function fetchProductFeeRanking(organizationId: string) {
  // Join orders + order_items, group by marketplace_item_id
  // Compute avg(marketplace_fee / unit_price) per item
  // Return top 1 (worst) and bottom 1 (best)
  // Only include products with at least 5 sales (avoid outliers from 1-sale products)
}
```

**Simples Nacional query**:
```typescript
export async function fetchSimpleNacionalUsage(organizationId: string) {
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()

  const { data } = await supabase
    .from('orders')
    .select('gross_amount')
    .eq('organization_id', organizationId)
    .neq('status', 'cancelled')
    .gte('created_at', yearStart)

  const totalRevenue = data.reduce((sum, o) => sum + (o.gross_amount ?? 0), 0)
  const limit = 4_800_000  // Simples Nacional MEI-expanded limit
  const percentage = (totalRevenue / limit) * 100

  return { totalRevenue, limit, percentage }
}
```

### Component Architecture
```
src/pages/Diagnostico.tsx
src/components/diagnostico/
  MoneyLeaksBlock.tsx              — Block 1: waterfall chart + summary
  ProductFeeRanking.tsx            — Block 2: worst/best products
  SimplesNacionalTracker.tsx       — Block 3: progress bar
  DiagnosticoCallToAction.tsx      — Block 4: CTA to add costs
src/hooks/useDiagnostico.ts        — TanStack Query wrapping all diagnostico service calls
src/services/diagnostico.service.ts — raw Supabase queries (never called from components directly)
```

### TanStack Query Pattern (follow existing patterns in the codebase)
```typescript
// src/hooks/useDiagnostico.ts
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { fetchMoneyLeaks, fetchProductFeeRanking, fetchSimpleNacionalUsage } from '../services/diagnostico.service'

export function useDiagnostico() {
  const { organizationId } = useAuth()

  const moneyLeaks = useQuery({
    queryKey: ['diagnostico', 'money-leaks', organizationId],
    queryFn: () => fetchMoneyLeaks(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })

  const productFeeRanking = useQuery({
    queryKey: ['diagnostico', 'product-fee-ranking', organizationId],
    queryFn: () => fetchProductFeeRanking(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })

  const simplesNacional = useQuery({
    queryKey: ['diagnostico', 'simples-nacional', organizationId],
    queryFn: () => fetchSimpleNacionalUsage(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })

  return { moneyLeaks, productFeeRanking, simplesNacional }
}
```

### Design Requirements
- **Language:** 100% Portuguese. No English labels visible to users anywhere on this page.
- **Tone:** "Dr. que dá diagnóstico" — direct, factual, not salesy. Each block: finding → implication → action.
- **No jargon:** Never use EBITDA, markup, CMV, CFOP, Receita Bruta (use "total de vendas"), NF-e (use "nota fiscal"). Exception: "Simples Nacional" — sellers already know this term.
- **Mobile-first:** The entire Diagnóstico must be usable on a phone screen. Cards stack vertically.
- **Empty states:** If a block cannot be computed (e.g., no orders in 90 days), hide the block entirely — do NOT show "R$0,00" or "Nenhum dado encontrado". A hidden block is better than a misleading zero.
- **Loading state:** Show skeleton cards while data loads. Each block loads independently — don't wait for all blocks before showing any.
- **Numbers:** Always formatted as Brazilian currency: `R$1.234,56` (period for thousands, comma for decimals). Use `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

### Edge Cases
- **Seller with 0 orders in 90 days:** Show a special "Não encontramos pedidos nos últimos 90 dias" state with a button to re-sync.
- **Seller with only cancelled orders:** Exclude cancelled orders from all calculations. If ALL orders are cancelled, show the 0-orders state.
- **Simples Nacional percentage > 100%:** Show as red, with the message "Você ultrapassou o limite do Simples Nacional este ano." Do NOT cap at 100% in the display.
- **Multi-marketplace sellers (Cycle 3 concern — but prepare for it):** The query filters by `marketplace = 'mercado_livre'` in Cycle 1. Add a comment: `// TODO Cycle 3: remove marketplace filter when Shopee is added`. Do NOT try to unify marketplaces now.
- **Disclaimer for Simples Nacional:** Always show below the tracker: "Baseado apenas nas vendas importadas para o Novura. Inclua outras fontes de receita ao calcular seu limite real."

---

## Feature F1.3: Product Cost Input

### Route
`/produtos/custos` — add to App.tsx under the existing `/produtos/*` route group

### File to create
`src/pages/ProductCosts.tsx` (or add as a sub-route of Products.tsx — team decision)

### What it displays
- List of products sorted by **number of sales in last 90 days** (most sold first)
- Each row: product image (thumbnail) | product name | units sold (90 days) | current cost input field
- Input field: `R$` prefix, numeric only, decimal allowed
- If cost is already set, show it pre-filled and editable
- "Salvar" button per row — saves immediately, no batch save needed (simplicity > efficiency here)

### Data Model
Product costs are stored on the existing `products` table (or a new `product_costs` table if the `products` table doesn't have a cost column). Check `src/types/products.ts` and `src/services/orders.service.ts` before deciding.

If `products` already has a `cost` or `unit_cost` column: use it directly.
If not: create a `product_costs` table:
```sql
CREATE TABLE product_costs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_cost       numeric(18,2) NOT NULL,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (organization_id, product_id)
);
```

### Service layer
```typescript
// src/services/products.service.ts (extend existing or create)
export async function fetchProductsWithSalesVolume(organizationId: string) {
  // Join products + order_items to get sales_count
  // Sort by sales_count DESC
}

export async function upsertProductCost(organizationId: string, productId: string, cost: number) {
  // UPSERT to product_costs
  // On success, invalidate orders query cache (margin needs recalculation)
}
```

### On cost save
When a product cost is saved:
1. Immediately update `order_items.unit_cost` for all historical orders of that product
2. Invalidate the `['orders']` TanStack Query cache so the orders list re-fetches with updated margins

```typescript
// In the mutation's onSuccess:
await queryClient.invalidateQueries({ queryKey: ['orders'] })
await queryClient.invalidateQueries({ queryKey: ['diagnostico'] })
```

### Edge Cases
- **Products with no internal SKU match:** Some marketplace items won't match to `products`. Show them but grey them out with "Produto não vinculado" — don't block the rest of the list.
- **Seller with 200+ products:** Paginate the list (50 per page). Do NOT load all products at once.
- **Cost = 0:** Treat 0 as "no cost set". Do not allow saving 0 as a cost — show validation: "O custo deve ser maior que R$0,00".
- **Cost greater than sale price:** Allow it but show a warning: "O custo é maior que o preço de venda — margem negativa." Never block saving.

---

## Feature F1.4: Orders List with Real Margin

### What to modify
The existing `src/pages/Orders.tsx` already has an orders list. Instead of rebuilding it, add margin data to the existing view.

### New columns to add
Add to the existing orders table (wherever the "Todos os Pedidos" tab is displayed):
| Column | Data source | Display |
|---|---|---|
| Receita Líquida (R$) | `orders.net_amount` | formatted currency |
| Margem (R$) | `net_amount - SUM(order_items.unit_cost * quantity)` | formatted currency, colored |
| Margem (%) | `margem / net_amount * 100` | percentage, colored |

### Margin color coding
- `> 20%` → green text
- `5% – 20%` → yellow text
- `< 5%` or negative → red text
- No cost data → grey text + "Sem custo" badge

### Data query
Add to `src/services/orders.service.ts`:
```typescript
export async function fetchOrdersWithMargin(organizationId: string) {
  // orders LEFT JOIN order_items ON order_items.order_id = orders.id
  // GROUP BY orders.id
  // Compute: SUM(unit_cost * quantity) as total_cost
  // net_amount - total_cost as margin
  // margin / net_amount * 100 as margin_pct
}
```

Or use Supabase's `.select()` with embedded relations:
```typescript
const { data } = await supabase
  .from('orders')
  .select(`
    *,
    order_items (
      unit_cost,
      quantity
    )
  `)
  .eq('organization_id', organizationId)
```

Then compute margin client-side from the items array.

### Paywall gate
Margin columns are a **paid feature**. If the seller is on the free tier (not in trial, not subscribed), show the margin columns as blurred/placeholder with a lock icon and CTA "Assinar para ver margem real".

This gate is implemented using the `useSubscription()` hook (built in Billing cycle):
```typescript
const { isPaid } = useSubscription()
// if (!isPaid) show blurred placeholder columns
```

### Filter additions
Add to the existing filter bar:
- "Margem" range filter: dropdown with "Todas", "Positiva (>0%)", "Alta (>20%)", "Negativa (<0%)"
- This filter only works if product costs have been set (otherwise all orders show "Sem custo")

---

## Feature F1.5: Freemium Feature Matrix

Cycle 1 ships with the freemium model active. Same screens for all users — contextual paywalls on actions.

### What is free vs paid

| Feature | Free | Paid (post-subscription) |
|---|---|---|
| Diagnóstico (90 days) | ✅ full | ✅ full |
| Account health (reputation, rates) | ✅ | ✅ |
| ADS impact summary | ✅ (summary only) | ✅ + campaign detail |
| Orders list (real-time via webhook) | ✅ read-only | ✅ + actions |
| Margin per order | ✅ proportional* | ✅ all orders |
| Emitir NFe | ❌ paywall | ✅ |
| Imprimir etiqueta | ❌ paywall | ✅ |
| Gestão de estoque | ❌ paywall | ✅ |
| Editar/criar anúncio | ❌ paywall | ✅ |

*Proportional margin unlock formula: `min(5, max(1, Math.floor(totalListings * 0.2)))`
- 10 listings → 2 unlocked
- 25 listings → 5 unlocked
- 30+ listings → 5 unlocked (cap)

### Paywall implementation pattern

```typescript
// useSubscription hook (to be built as part of billing infrastructure)
const { isPaid } = useSubscription()

// In components:
{isPaid ? (
  <Button onClick={emitNfe}>Emitir NFe</Button>
) : (
  <PaywallButton feature="nfe" message="Emissão de NFe disponível no Novura Pro" />
)}
```

**PaywallButton** opens a modal — never silently disabled. The modal shows:
- What the feature does
- Specific benefit: "Automatize suas notas e economize horas por semana"
- CTA: "Assinar agora" → subscription flow

### Subscription / trial model

- **Trial:** 14 days, starts AFTER payment (card required to activate trial)
- **No free trial without card** — reduces tire-kickers, maintains revenue predictability
- **Billing provider:** Stripe (subscriptions + webhooks for cancellation/renewal)
- **Single plan for MVP** — no tiers, no add-ons
- **On subscription active:** `billing_customers` + `subscriptions` tables updated → `isPaid` becomes true → all paywalls lift immediately

---

## Feature F1.6: Product Model & Listing Match Engine

### Product / Variation / Kit Model

**Standard industry model (Shopify, Bling, Tiny, ML):**

```
products (parent — the "thing" you sell)
  ├── name, description, category, photos, brand
  └── product_variations (child SKUs — each unique combination)
        ├── sku, barcode (EAN/GTIN)
        ├── attributes: size, color, voltage, etc.
        ├── unit_cost (can vary per variation)
        └── products_stock (stock per variation per warehouse)

product_kits (bundle — two distinct products sold together)
  └── kit_items
        ├── product_variation_id
        └── quantity
```

**Rules:**
- Every product has at least one variation (even if "no variation" is the only one)
- Variations share parent name and photos but have independent stock and cost
- Kit has NO stock of its own — derived from the scarcest component
- When a kit order is processed, stock is deducted from each component individually

**ML mapping:**
- 1 ML listing → 1 parent product
- 1 ML listing variation → 1 `product_variation`
- 1 ML kit listing → 1 `product_kit` with N `kit_items`

### AI Pre-creation from Listings

When the seller first subscribes, the system pre-creates product suggestions from imported ML listings:

| Field | Source |
|---|---|
| Name | Listing title (normalizable) |
| Photos | Listing photos (imported) |
| SKU | Listing SKU (if set) |
| Variations | Listing variations (size, color, etc.) |
| Sale price | Current listing price |
| Barcode | GTIN from listing (if set) |

**The seller only needs to add:** unit cost per variation + initial stock count.

### Match Engine (Listing ↔ Product)

After products are created, the system suggests links between ML listings and internal products:

**Matching algorithm (priority order):**
1. Exact SKU match
2. Exact GTIN/EAN match
3. Title similarity > 85% (Levenshtein or simple token overlap)

**UX:**
```
🔗 Encontramos 83 anúncios.
✅ 67 vinculados automaticamente
⚠️  16 precisam da sua confirmação

[Ver os 67 →]  [Confirmar os 16 →]
```

For each uncertain match: show listing + suggested product side by side → "Confirmar / Escolher outro / Criar novo produto"

---

## Feature F1.7: Operational Readiness Checklist

Visible on the orders page and settings page after subscription. Shows exactly what's missing before the seller can emit NFe.

```
Para emitir NFe você precisa:
✅ Empresa configurada (CNPJ, razão social, endereço)
✅ Regime tributário definido (Simples Nacional)
⚪ Certificado digital A1 — Fazer upload →
✅ 83 produtos com NCM
⚪ 3 produtos sem tributação configurada — Resolver agora →
⚪ Inscrição Estadual (IE) — Informar →

Progresso: 3/6 itens ✓
```

Each item is a link that goes directly to the screen to resolve it.

**Button state on orders list:**
- Checklist incomplete → "Emitir NFe" button disabled with tooltip: "Complete a configuração fiscal primeiro [Ver checklist →]"
- Checklist complete → "Emitir NFe" button active

**Note on IE:** IE was attempted during CNPJ onboarding step via SEFAZ state APIs. If not found automatically, it appears here as an open item. The seller enters it manually. It's not blocked — just shown as needed.

**Note on orders during setup gap:** Orders that arrived via webhook while the seller was still setting up appear in the list with status "Aguardando configuração fiscal". When the checklist is complete, they become actionable normally. NFes the seller already issued externally on ML are imported automatically via ML's `fiscal_key` field.

---

## App.tsx Routes to Add

```typescript
// In src/App.tsx, add these routes in the protected section:

// Onboarding (no module permission gate — all authenticated users can access)
<Route path="/onboarding" element={<Suspense fallback={<Loading />}><Onboarding /></Suspense>} />

// Diagnóstico (no module permission gate — it's the activation moment)
<Route path="/diagnostico" element={<Suspense fallback={<Loading />}><Diagnostico /></Suspense>} />

// Product costs (under existing /produtos/* group or standalone)
<Route path="/produtos/custos" element={
  <ProtectedRoute>
    <RestrictedRoute module="produtos" actions={['view']}>
      <Suspense fallback={<Loading />}><ProductCosts /></Suspense>
    </RestrictedRoute>
  </ProtectedRoute>
} />
```

---

## New Files to Create (Complete List)

### Pages
- `src/pages/Onboarding.tsx`
- `src/pages/Diagnostico.tsx`
- `src/pages/ProductCosts.tsx`

### Components
- `src/components/onboarding/ConnectML.tsx`
- `src/components/onboarding/ImportProgress.tsx`
- `src/components/onboarding/ImportComplete.tsx`
- `src/components/diagnostico/MoneyLeaksBlock.tsx`
- `src/components/diagnostico/ProductFeeRanking.tsx`
- `src/components/diagnostico/SimplesNacionalTracker.tsx`
- `src/components/diagnostico/DiagnosticoCallToAction.tsx`

### Hooks
- `src/hooks/useOnboardingStatus.ts`
- `src/hooks/useDiagnostico.ts`

### Services
- `src/services/diagnostico.service.ts`

### Types
- `src/types/diagnostico.ts` — typed interfaces for all Diagnóstico data

---

## Frontend Code Best Practices

> The full engineering standards — SOLID, DRY, OOP, Design Patterns, anti-patterns — are in **`docs/ENGINEERING_STANDARDS.md`**. The section above ("Engineering Standards — Mandatory") covers the patterns specific to Cycle 1 code.

### Quick Reference
- Architecture: `services/` → `hooks/` → `pages/components/`
- No `supabase.from(...)` outside of `services/` files
- No `useState` + `useEffect` for server data (use TanStack Query)
- No function > 50 lines, no file > 150 lines
- Use `@/` path alias for all imports
- All currency formatting via `formatBRL` from `@/utils/formatting`

---

## What NOT to Build in This Cycle

### Rabbit Holes
- **Setup wizard** — Do not build a multi-step configuration flow before showing value. The OAuth → Diagnóstico flow IS the onboarding.
- **Estimated margin before cost input** — Do not show "Margem estimada" using average margins. Either show real margin (with cost) or show "Sem custo". Never show invented numbers.
- **Complex inventory management** — This cycle shows stock count only (how many units in stock). No replenishment alerts, no dead stock analysis (those are Cycle 2).
- **Multi-user team features** — Cycle 1 is single-seller. No invite flows, no role management.
- **NFe emission** — That's Cycle 3. Do not add NFe features to this cycle.
- **Shopee integration** — That's Cycle 3. Do not add a "Connect Shopee" button to onboarding.
- **ADS integration** — That's Cycle 2.
- **Mercado Pago integration** — That's Cycle 2.

### No-Gos
- Showing sample/demo data — only real imported data, always
- Multiple marketplace connections in onboarding (ML only)
- Mobile app (responsive web only)
- Custom date ranges on Diagnóstico (it's always 90 days, always)
- Editing orders from the orders list (read-only in this cycle)

---

## Definition of Done

Cycle 1 is complete when ALL conditions are true:

1. **Time to first insight < 5 minutes** — From clicking "Conectar Mercado Livre" to seeing the Diagnóstico screen with real data, the elapsed time is under 5 minutes for a store with up to 1,000 orders.

2. **Zero configuration required** — The seller does not fill in any form before seeing the Diagnóstico. Zero fields. Zero setup steps.

3. **Money leaks are accurate** — Total marketplace_fee + shipping_cost in the Diagnóstico matches what would be computed manually from ML's seller center for the same period (tolerance ±1%).

4. **Diagnóstico hides missing blocks** — If any Diagnóstico block cannot be computed (e.g., 0 orders), that block is hidden — not shown as zero or error.

5. **Product cost saves and propagates** — When a seller saves a product cost, the margin updates on all historical orders of that product within 5 seconds.

6. **Margin coloring is correct** — Green, yellow, red thresholds are applied correctly. Orders with no cost show "Sem custo" grey — never R$0 or 0%.

7. **Import failure is handled gracefully** — If the ML API fails during import, the seller sees a clear message and a "Tentar novamente" button — never a blank screen.

8. **Simples Nacional disclaimer is always shown** — The disclaimer "Baseado apenas nas vendas importadas para o Novura" is visible below the tracker at all times.
