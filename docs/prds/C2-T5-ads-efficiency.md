# PRD — C2-T5: ML ADS Integration + Efficiency View

**Cycle:** 2 — Seu Caixa
**Status:** 🔴 Not Started
**Depends on:** C1 complete (orders + margin infrastructure in place)
**Blocks:** Nothing — parallel track

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

Many sellers on Mercado Livre pay for sponsored listings (ADS) without knowing if they're
actually making money on those ads. A product can generate lots of sales from ADS while
the ad cost eats up all the margin — or worse, puts the seller in the red per unit.

This task integrates with ML's ADS API to fetch daily ad spend per product and shows
a simple efficiency table: for each product with active ads, how much was spent on ads
in the last 30 days, and what the margin looked like before and after that ad spend.

The connection to ML ADS is optional — never required. A contextual CTA appears on the
Diagnóstico page: "Conecte seus anúncios para ver se estão gerando lucro."

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] `supabase/functions/ml-ads-start-auth/` — does this directory exist?
- [ ] `supabase/functions/ml-ads-callback/` — does this exist?
- [ ] Check if `ml_ads_daily_spend` migration exists.
- [ ] Check ML developer documentation access: read `docs/CYCLE_2_SEU_CAIXA.md` for the API endpoints.
- [ ] Read `supabase/functions/mercado-livre-start-auth/index.ts` — mirror this for ADS auth.
- [ ] Check `src/pages/Listings.tsx` — is there a tab structure that an "ADS" tab can be added to?

**Update this section before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_2_SEU_CAIXA.md` section "Feature F2.4: ADS Efficiency per Product" in full.
      Record: OAuth scope, API endpoints, calculation formula, edge cases.
- [ ] Read `docs/CYCLE_0_ORDERS_PLATFORM.md` → "OAuth2 Security Model" — follow for ADS OAuth.
- [ ] Read `supabase/functions/mercado-livre-start-auth/index.ts` — mirror this.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1–3.

---

## 4. Architecture Context

### ADS OAuth (Separate Scope)

ML ADS requires a separate OAuth authorization with `write` scope (even for read-only access).
Use the same PKCE pattern with prefix `ml_ads_` for sessionStorage keys.

```
mercado-livre-start-auth  →  scope: read_orders + read_listings
ml-ads-start-auth         →  scope: write (ADS API requirement)
```

### New Edge Functions

```
supabase/functions/
  ml-ads-start-auth/index.ts     ← PKCE start, scope: write
  ml-ads-callback/index.ts       ← exchange code, store in marketplace_integrations with type='ml_ads'
  ml-ads-sync/index.ts           ← fetch campaign spend, store in ml_ads_daily_spend
```

### Database Table

```sql
CREATE TABLE IF NOT EXISTS ml_ads_daily_spend (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id         text NOT NULL,
  date            date NOT NULL,
  impressions     integer DEFAULT 0,
  clicks          integer DEFAULT 0,
  spend           numeric(18, 2) DEFAULT 0,
  UNIQUE (organization_id, item_id, date)
);

CREATE INDEX idx_ml_ads_spend_org_item ON ml_ads_daily_spend (organization_id, item_id, date DESC);
```

### ADS Efficiency Calculation

```
For each item with ADS spend in last 30 days:

period_ads_spend     = SUM(ml_ads_daily_spend.spend) where date >= 30d ago
period_units_sold    = SUM(order_items.quantity) where date >= 30d ago for this item
period_net_revenue   = period_units_sold × (orders.net_amount / order_items.quantity)
period_product_cost  = SUM(order_items.unit_cost × quantity) where date >= 30d ago

margin_before_ads = period_net_revenue - period_product_cost
margin_after_ads  = margin_before_ads - period_ads_spend
ads_cost_per_sale = period_ads_spend / period_units_sold
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **ADS data has 24-48h lag** | Always show "Dados de até 48h atrás" disclaimer near the table. |
| **Use blended attribution — but be honest** | Show "Atribuição estimada. Nem todas as vendas vêm dos anúncios." |
| **NEVER show margin_after_ads if unit_cost is null** | Without cost data, the calculation is meaningless. Show "Custo não informado". |
| **Do NOT use ACOS/ROAS terminology** | Use "custo por venda" and "retorno do anúncio" in Portuguese. |

---

## 6. What to Build

### Section A: Database Migration

**File:** `supabase/migrations/[DATE]_000000_create_ml_ads_daily_spend.sql`

Use schema from Section 4. Present for human review before applying.

---

### Section B: ADS OAuth Edge Functions

**Files:**
- `supabase/functions/ml-ads-start-auth/index.ts` — mirror `mercado-livre-start-auth`, scope: `write`
- `supabase/functions/ml-ads-callback/index.ts` — exchange code, store in `marketplace_integrations` with `marketplace_name = 'ml_ads'`

Follow the PKCE model exactly. Use `ml_ads_` prefix for sessionStorage keys.
Under 80 lines each.

#### Definition of Done — Section B
- [ ] Both edge functions exist and compile
- [ ] ADS token stored in `marketplace_integrations` with `marketplace_name = 'ml_ads'`

---

### Section C: `ml-ads-sync` Edge Function

**File:** `supabase/functions/ml-ads-sync/index.ts`

```
1. Fetch ADS access token from marketplace_integrations where type = 'ml_ads'
2. Call ML ADS API: GET /advertising/product_ads/reports (or fallback endpoint)
3. For each item: UPSERT into ml_ads_daily_spend
4. Schedule: once per day via pg_cron
```

Add cron migration: `supabase/migrations/[DATE]_000001_create_ml_ads_sync_cron.sql`

Under 80 lines.

#### Definition of Done — Section C
- [ ] Function fetches real ADS data from ML API
- [ ] UPSERT on `(organization_id, item_id, date)` — idempotent
- [ ] Cron migration exists

---

### Section D: ADS Efficiency Service + Hook

**File:** `src/services/ads-efficiency.service.ts`

```typescript
export interface AdsEfficiencyRow {
  itemId: string
  title: string
  periodAdSpend: number
  unitsSold: number
  netRevenue: number
  productCost: number | null
  marginBeforeAds: number | null
  marginAfterAds: number | null
  adsCostPerSale: number
  marginAfterAdsFlag: 'ok' | 'warning' | 'negative'  // flag if ADS > 50% of margin
}

export async function fetchAdsEfficiency(orgId: string): Promise<AdsEfficiencyRow[]>
export const adsKeys = { efficiency: (orgId: string) => ['ads', 'efficiency', orgId] as const }
```

**File:** `src/hooks/useAdsEfficiency.ts` — TanStack Query wrapper, `staleTime: 24 * 60 * 60 * 1000`.

---

### Section E: ADS Efficiency UI

**File:** `src/components/ads/AdsEfficiencyTable.tsx`

Table with columns:
- Produto | Gasto ADS (30d) | Custo por venda | Margem antes ADS | Margem depois ADS

Color coding for "Margem depois ADS":
- Green: positive > 10%
- Yellow: positive ≤ 10%
- Red: negative

Flag `⚠️ ADS consumindo >50% da margem` when applicable.

Show disclaimers:
- `"Dados de até 48h atrás"`
- `"Atribuição estimada. Nem todas as vendas vêm dos anúncios."`

Under 100 lines.

Add as a tab in `src/pages/Listings.tsx` labeled "Eficiência de Anúncios".

#### Definition of Done — Section E
- [ ] Table renders with correct data
- [ ] Flag shown for items where ADS > 50% of margin
- [ ] Both disclaimers always visible
- [ ] Tab added to Listings page

---

## 7. Integration Checklist

- [ ] `evaluateAdsROI` in `alert-priority.ts` (C2-T3) now returns a real alert for negative-ROI items
- [ ] ADS tab only visible when ADS integration is connected
- [ ] If ADS not connected: show CTA "Conectar ADS →" in the listings tab area

---

## 8. Definition of Done — Full Task

- [ ] All Section A–E DoD items checked
- [ ] `npm run build` passes
- [ ] Manual QA:
  - [ ] Connecting ML ADS stores token in `marketplace_integrations`
  - [ ] After sync, `ml_ads_daily_spend` has rows
  - [ ] ADS efficiency table shows correct margin before/after
  - [ ] Flag shown when ADS > 50% of margin
  - [ ] Disclaimer always visible

---

## 9. What NOT to Build

- **Do NOT build campaign management** (pause/resume campaigns) — read-only visibility only.
- **Do NOT build ADS optimization recommendations** — that's Cycle 3+.
- **Do NOT force ADS connection** — always contextual CTA.
- **Do NOT compute per-campaign ROI** — item-level blended model is sufficient for MVP.
