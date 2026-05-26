# PRD — C1-T6: Product Model + Listing Match Engine

**Cycle:** 1 — O Primeiro Minuto
**Status:** 🔴 Not Started
**Depends on:** [C1-T3 — Product Costs](./C1-T3-product-costs.md) (products table must exist)
**Blocks:** Nothing — independent track

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

For Novura to calculate real margins, it needs to know which Mercado Livre listing corresponds
to which internal product. Right now, `order_items` has a `product_id` field but it's often
null — because we don't know which product the listing belongs to.

This task builds two things:

1. **Product pre-creation from listings:** When a seller subscribes, the system automatically
   creates product suggestions from their imported ML listings. The seller doesn't have to
   type product names, upload photos, or fill in attributes — it's all pre-filled from ML.
   They only need to add the unit cost and initial stock count.

2. **Listing match engine:** After products exist, the system finds links between ML listings
   and internal products using SKU, GTIN, or title similarity. Matches it's confident about
   are applied automatically. Uncertain ones are shown for the seller to confirm.

This turns a tedious manual setup into a two-minute task.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] Read `src/types/products.ts` — what does the current product type look like?
- [ ] Check if `product_variations` table exists: `grep -r "product_variations" supabase/migrations/`
- [ ] Check if `product_kits` table exists: same grep.
- [ ] Check if `marketplace_item_product_links` table exists (the old product linking table).
- [ ] Read any existing `src/services/products.service.ts` in full.
- [ ] Read the migration that creates the `products` table.
- [ ] Check `order_items` table for `marketplace_item_id` and `product_id` columns.
- [ ] Check existing `src/components/orders/LinkOrderModal.tsx` — this is the current linking UI.
      How does it work? Can the match engine feed into it?
- [ ] Read `docs/CYCLE_1_PRIMEIRO_MINUTO.md` section "Feature F1.6: Product Model & Listing Match Engine" in full.

**Update this section with findings before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_1_PRIMEIRO_MINUTO.md` section "Feature F1.6" in full.
      Record: product/variation/kit model, ML mapping rules, matching algorithm priority.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1–3.
- [ ] Read `src/components/orders/LinkOrderModal.tsx` in full.
      Record: how does it currently allow linking? Can it be reused or extended?
- [ ] Confirm `order_items.marketplace_item_id` column exists.
      If not, the linking engine has no key to match on.
- [ ] Confirm `order_items.product_id` column exists (this is what gets populated by the engine).

---

## 4. Architecture Context

### The Product Hierarchy

```
products (parent entity)
  └── product_variations (at least 1 per product — even if "no variation" is the only one)
        └── products_stock (per variation per warehouse)

product_kits (bundle)
  └── kit_items (product_variation_id + quantity)
```

### ML → Product Mapping

```
ML listing (mlb_id)                    →  products row
ML listing variation (variation_id)    →  product_variations row
ML kit listing                         →  product_kits row
```

### Matching Algorithm

```
Priority 1: Exact SKU match
  order_items.sku = product_variations.sku

Priority 2: Exact GTIN/EAN match
  order_items.gtin = product_variations.barcode

Priority 3: Title similarity > 85%
  Simple token overlap: split both titles to words, count common tokens / total unique tokens
  If overlap ratio > 0.85 → tentative match (requires human confirmation)

Result per order_item:
  confidence: 'exact' | 'tentative' | 'unmatched'
  product_id: uuid | null
```

### Edge Function vs Frontend

The match engine can run in either:
- A Supabase Edge Function triggered after sync (async, recommended for large catalogs)
- A frontend service function called once (simpler, adequate for < 500 products)

**For Cycle 1 MVP:** implement as a frontend service function. The catalog is small enough
that running it client-side is fine. Add a comment: `// TODO Cycle 2: move to edge function`.

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER auto-apply 'tentative' matches** | Title similarity can have false positives. Only exact matches (SKU or GTIN) are applied automatically. |
| **NEVER overwrite existing product_id links** | If `order_items.product_id` is already set, do not change it — that would corrupt existing margin calculations. |
| **Only update `order_items.product_id` — not other fields** | The match engine's only output is the product_id link. |
| **Matches require human confirmation for tentative** | Show them in a UI for approval — never silently apply. |

---

## 6. What to Build

### Section A: Product Types (extend)

**File:** `src/types/products.ts`

Add or extend:

```typescript
export interface ProductVariation {
  id: string
  productId: string
  sku: string | null
  barcode: string | null    // EAN/GTIN
  attributes: Record<string, string> | null  // { size: 'M', color: 'Blue' }
  unitCost: number | null
  imageUrl: string | null
}

export interface ProductMatch {
  orderItemId: string
  marketplaceItemId: string
  orderItemTitle: string
  suggestedProductId: string | null
  suggestedProductName: string | null
  confidence: 'exact' | 'tentative' | 'unmatched'
  matchReason: 'sku' | 'gtin' | 'title' | null
}
```

#### Definition of Done — Section A
- [ ] Types defined with no `any`

---

### Section B: Match Engine Utility

**File:** `src/utils/matchEngine.ts`

Pure functions — no imports from React or Supabase.

```typescript
export function computeTitleSimilarity(a: string, b: string): number {
  // Token overlap: normalize both strings (lowercase, remove punctuation)
  // tokenize by whitespace
  // common tokens / total unique tokens
  // returns 0.0 to 1.0
}

export function matchOrderItemToProducts(
  orderItem: { sku: string | null; gtin: string | null; title: string },
  products: Array<{ id: string; name: string; variations: ProductVariation[] }>
): ProductMatch {
  // Priority 1: exact SKU match across all variations
  // Priority 2: exact GTIN match across all variations
  // Priority 3: title similarity > 0.85 against product names
  // Returns the best match found, or unmatched
}

export function runMatchEngine(
  orderItems: Array<{ id: string; sku: string | null; gtin: string | null; title: string; productId: string | null }>,
  products: Array<{ id: string; name: string; variations: ProductVariation[] }>
): ProductMatch[] {
  // For each orderItem where productId is null:
  //   run matchOrderItemToProducts
  //   return array of ProductMatch
  // Skip items that already have a productId
}
```

Constraints: each function under 30 lines. No external libraries.

#### Definition of Done — Section B
- [ ] `computeTitleSimilarity` returns 1.0 for identical strings, 0.0 for completely different
- [ ] `matchOrderItemToProducts` checks SKU → GTIN → title in order
- [ ] `runMatchEngine` skips items with existing `productId`
- [ ] No `any` types

---

### Section C: Match Service

**File:** `src/services/products.service.ts` (extend)

Add:

```typescript
export async function fetchUnlinkedOrderItems(
  organizationId: string
): Promise<Array<{ id: string; sku: string | null; title: string; productId: string | null }>> {
  // Query order_items where product_id is null
  // Include: id, sku, title (from order title), marketplace_item_id
  // Limit to distinct marketplace_item_id (no point matching same item 100 times)
}

export async function applyExactMatches(
  organizationId: string,
  matches: ProductMatch[]
): Promise<void> {
  // For each match where confidence = 'exact':
  //   UPDATE order_items SET product_id = match.suggestedProductId
  //   WHERE marketplace_item_id = match.marketplaceItemId
  //     AND organization_id = orgId
  // Uses batch update (separate calls per item — no batch API needed for MVP)
}

export async function confirmTentativeMatch(
  organizationId: string,
  marketplaceItemId: string,
  productId: string
): Promise<void> {
  // UPDATE order_items SET product_id = productId
  // WHERE marketplace_item_id = marketplaceItemId
  //   AND organization_id = orgId
  //   AND product_id IS NULL  // safety: never overwrite
}
```

#### Definition of Done — Section C
- [ ] 3 functions implemented, each under 30 lines
- [ ] `applyExactMatches` only applies 'exact' confidence matches — never 'tentative'
- [ ] `confirmTentativeMatch` has the safety guard `product_id IS NULL`

---

### Section D: `useProductMatching` Hook

**File:** `src/hooks/useProductMatching.ts`

```typescript
export function useProductMatching() {
  const { organizationId } = useAuth()
  const queryClient = useQueryClient()

  const runMatching = useMutation({
    mutationFn: async () => {
      const [unlinked, products] = await Promise.all([
        fetchUnlinkedOrderItems(organizationId!),
        fetchProductsWithSalesVolume(organizationId!),
      ])
      const matches = runMatchEngine(unlinked, products.products)
      const exactMatches = matches.filter(m => m.confidence === 'exact')
      const tentativeMatches = matches.filter(m => m.confidence === 'tentative')
      await applyExactMatches(organizationId!, exactMatches)
      return { exactCount: exactMatches.length, tentativeMatches }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const confirmMatch = useMutation({
    mutationFn: ({ marketplaceItemId, productId }: { marketplaceItemId: string; productId: string }) =>
      confirmTentativeMatch(organizationId!, marketplaceItemId, productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  return { runMatching, confirmMatch }
}
```

#### Definition of Done — Section D
- [ ] `runMatching` applies exact matches and returns tentative ones for review
- [ ] On success, `['orders']` cache invalidated
- [ ] Under 60 lines

---

### Section E: Match Results UI (minimal)

**File:** `src/components/products/MatchResultsBanner.tsx`

After `runMatching` completes, show a banner on the `ProductCosts` page or Orders page:

```
🔗 Vinculação de produtos concluída:
✅ 67 anúncios vinculados automaticamente
⚠️  16 precisam da sua confirmação → [Ver os 16]
```

The "Ver os 16" link navigates to a simplified review page or opens a sheet/modal.

**For MVP:** A simple modal listing each tentative match with:
- Listing title (left) | Suggested product (right) | "Confirmar" / "Ignorar" buttons

This can reuse the existing `LinkOrderModal.tsx` pattern if applicable.

Constraints: under 80 lines.

#### Definition of Done — Section E
- [ ] Banner shows after match run with exact/tentative counts
- [ ] Tentative matches can be confirmed or ignored
- [ ] On confirm: `order_items.product_id` updated, `['orders']` cache invalidated

---

## 7. Integration Checklist

- [ ] Match engine runs against actual `order_items` data (not mock data)
- [ ] `applyExactMatches` correctly updates `order_items.product_id` in Supabase
- [ ] After applying matches, the orders list refreshes (margin appears for matched items)
- [ ] Tentative matches require explicit confirmation — never auto-applied
- [ ] Engine skips `order_items` that already have a `product_id`

---

## 8. Definition of Done — Full Task

- [ ] All Section A–E DoD items checked
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Manual QA checklist:
  - [ ] Running match engine links SKU-matching items automatically
  - [ ] Title-similar but not exact items appear for review
  - [ ] Confirming a tentative match updates the margin on that order
  - [ ] Items with existing `product_id` are not re-processed
- [ ] No `any` types
- [ ] No supabase calls in component files

---

## 9. What NOT to Build

- **Do NOT build an AI-powered matching engine** — simple SKU/GTIN/title matching is enough for MVP.
  LLM-based matching is a future enhancement.
- **Do NOT build product creation from scratch** — the product creation UI already exists
  (or is in scope of the existing products module). The match engine only creates links, not products.
- **Do NOT build variation-level matching** — match at the product level for MVP.
  Variation-level matching is a Cycle 2 enhancement.
- **Do NOT build a Shopee match engine** — ML only for this cycle.
- **Do NOT move the match engine to an edge function** — client-side is sufficient for MVP.
  Add a TODO comment for future migration.
