# PRD — C3-T2: Listing Performance Tab

**Cycle:** 3 — Visibilidade e Conformidade
**Status:** 🔴 Not Started
**Depends on:** [C3-T1 — Listing Performance Sync](./C3-T1-listing-performance-sync.md) (snapshots table populated)
**Blocks:** Nothing

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

This task adds a "Performance" tab to the existing Listings page. Each listing gets a colored
signal (green, yellow, or red) plus a short actionable suggestion: "Conversão acima da média
da categoria" or "Verifique o título e fotos — conversão 56% abaixo da média."

The goal is not analytics — it's triage. The seller should be able to see at a glance which
listings need attention without having to dig through numbers.

Listings with very few visits (< 20 in 7 days) show "Volume baixo" instead of a conversion
percentage, because showing "40% conversion" for 2 sales out of 5 visits would be misleading.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] C3-T1 is complete — `listing_performance_snapshots` has rows.
- [ ] Read `src/pages/Listings.tsx` — what tabs already exist? How is the tab system structured?
- [ ] Read `src/hooks/useListings.ts` — how does it currently load listings data?
- [ ] Check `src/components/listings/` — what components already exist?

**Update this section before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_3_VISIBILIDADE.md` section "Feature F3.1" — specifically the frontend
      architecture and the exact UI design (cards with signal badges).
- [ ] Read `docs/CYCLE_3_VISIBILIDADE.md` → "Strategy Pattern — Listing Performance Signal".
- [ ] Read `src/pages/Listings.tsx` in full to understand the existing tab structure.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1–4.

---

## 4. Architecture Context

### UI Specification

```
[Filter: Todos | Saudáveis | Atenção | Críticos]

┌──────────────────────────────────────────────────────────┐
│ 🟢 Fone Bluetooth Pro Max                                │
│    Visitas: 234  │  Conversão: 5.2%  │  Média cat.: 4.8% │
│    "Acima da média da categoria"                         │
│                                            [Ver no ML →] │
├──────────────────────────────────────────────────────────┤
│ 🟡 Carregador USB-C 65W                                  │
│    Visitas: 89   │  Conversão: 2.1%  │  Média cat.: 4.8% │
│    💡 Verifique o título e as fotos do anúncio           │
│                                            [Ver no ML →] │
├──────────────────────────────────────────────────────────┤
│ 🔴 Cabo HDMI 4K                                          │
│    Visitas: 12   │  Conversão: Volume baixo              │
│    "Poucas visitas — verifique o preço vs. concorrentes" │
│                                            [Ver no ML →] │
└──────────────────────────────────────────────────────────┘
```

### Component Architecture

```
src/components/listings/
  ListingPerformanceTab.tsx          ← tab container + filter (under 80 lines)
  ListingPerformanceCard.tsx         ← individual listing card (under 60 lines)
  PerformanceSignalBadge.tsx         ← 🟢/🟡/🔴 chip (under 20 lines)

src/services/listing-performance.service.ts
  → fetchListingPerformanceSnapshots(orgId)

src/hooks/useListingPerformance.ts
  → useQuery wrapper

src/types/listing-performance.ts
  → ListingPerformanceSnapshot interface
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **Show "Volume baixo" when visits < 20** | A fake conversion rate is worse than no data. |
| **Hide "Média cat." column when category_avg_conversion is null** | Never show 0% as average. |
| **DO NOT change existing tabs in Listings.tsx** | Add the new tab only — don't touch existing ones. |

---

## 6. What to Build

### Section A: Types

**File:** `src/types/listing-performance.ts`

```typescript
export interface ListingPerformanceSnapshot {
  id: string
  marketplaceItemId: string
  title: string | null
  impressions7d: number
  visits7d: number
  sales7d: number
  conversionRate7d: number | null    // null when visits < 20
  categoryAvgConversion: number | null
  healthScore: string | null
  performanceSignal: 'green' | 'yellow' | 'red'
  suggestion: string
  snapshotAt: string
}
```

---

### Section B: Service + Hook

**File:** `src/services/listing-performance.service.ts`

```typescript
export async function fetchListingPerformanceSnapshots(
  orgId: string
): Promise<ListingPerformanceSnapshot[]> {
  // Select latest snapshot per marketplace_item_id
  // (use DISTINCT ON or a subquery with MAX(snapshot_at))
}

export const listingPerformanceKeys = {
  snapshots: (orgId: string) => ['listing-performance', 'snapshots', orgId] as const,
}
```

**File:** `src/hooks/useListingPerformance.ts`

```typescript
export function useListingPerformance() {
  const { organizationId } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: listingPerformanceKeys.snapshots(organizationId ?? ''),
    queryFn: () => fetchListingPerformanceSnapshots(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })
  return { snapshots: data ?? [], isLoading }
}
```

---

### Section C: Performance Components

**`PerformanceSignalBadge.tsx`** — under 20 lines
```typescript
// Props: signal: 'green' | 'yellow' | 'red'
// Renders: 🟢 Saudável | 🟡 Atenção | 🔴 Crítico
```

**`ListingPerformanceCard.tsx`** — under 60 lines
```typescript
// Props: snapshot: ListingPerformanceSnapshot
// Shows signal badge + metrics + suggestion + "Ver no ML" link
// "Volume baixo" when snapshot.conversionRate7d === null
// Hides "Média cat." when snapshot.categoryAvgConversion === null
```

**`ListingPerformanceTab.tsx`** — under 80 lines
```typescript
// Filter bar: Todos | Saudáveis | Atenção | Críticos
// Renders filtered list of ListingPerformanceCard
// Loading: skeleton cards
// Empty: "Dados de performance serão atualizados amanhã."
```

---

### Section D: Add Tab to Listings.tsx

Add "Performance" tab to the existing tab structure in `src/pages/Listings.tsx`.

Do NOT change any existing tabs. Add only.

---

## 7. Definition of Done — Full Task

- [ ] All sections DoD items checked
- [ ] `npm run build` passes
- [ ] Manual QA:
  - [ ] "Performance" tab visible in Listings page
  - [ ] Green/yellow/red signals match the data in `listing_performance_snapshots`
  - [ ] Listings with visits < 20 show "Volume baixo" (not a percentage)
  - [ ] Filter by "Críticos" shows only red listings
  - [ ] "Ver no ML →" link opens ML listing page

---

## 9. What NOT to Build

- **Do NOT build sortable columns** — the list is sorted by signal priority (red first) by default.
- **Do NOT add date range filters** — always shows the latest snapshot (last 7 days).
- **Do NOT add AI suggestions** — suggestions are static strings mapped from signal type.
