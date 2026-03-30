# PRD — C3-T6: Shopee UI Integration

**Cycle:** 3 — Visibilidade e Conformidade
**Status:** 🔴 Not Started
**Depends on:** C0-T5 (Shopee orders syncing to `orders` table with `marketplace = 'shopee'`)
**Blocks:** Nothing — last Cycle 3 task

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

The Cycle 0 data layer already syncs Shopee orders into the same `orders` table that holds
Mercado Livre orders. But the app still only shows ML orders — the Shopee data is invisible
in the UI.

This task makes Shopee data visible in the existing screens without building new pages:
- The orders list shows Shopee orders alongside ML orders, with a marketplace filter
- The Diagnóstico page shows Shopee fees separately when Shopee is connected
- The Apps page shows the Shopee store connection status
- The "Conectar Shopee" button is added (triggering the existing `shopee-start-auth`)

This is NOT a full Shopee-specific interface. It's surfacing data that already exists in
the database into the views sellers already use.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] C0-T5 is complete — `orders` table has rows with `marketplace = 'shopee'`.
- [ ] Read `src/services/orders.service.ts` — does `fetchAllOrders` filter by `marketplace = 'mercado_livre'`? That filter must be removed.
- [ ] Read `src/pages/Apps.tsx` — is there a Shopee connect section? Does `shopee-start-auth` edge function exist?
- [ ] Check `supabase/functions/shopee-start-auth/` — does it exist?
- [ ] Read `src/hooks/useOrderFiltering.ts` — how do existing filters work? Adding marketplace filter must follow the same pattern.
- [ ] Read `src/services/diagnostico.service.ts` — does `fetchMoneyLeaks` filter by ML only?

**Update this section before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_3_VISIBILIDADE.md` section "Feature F3.4: Basic Shopee Integration" in full.
      Record: 4 things to build, what NOT to build.
- [ ] Read `src/services/orders.service.ts` in full — find every `marketplace = 'mercado_livre'` filter.
- [ ] Read `src/services/diagnostico.service.ts` — find marketplace filters.
- [ ] Read `src/pages/Apps.tsx` in full — understand existing integration card pattern.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1–3.

---

## 4. Architecture Context

### What Changes (Only Service Layer)

```
src/services/orders.service.ts
  → Remove marketplace = 'mercado_livre' filter from fetchAllOrders
  → Accept optional marketplace param: fetchAllOrders(orgId, marketplace?: string)

src/services/diagnostico.service.ts
  → fetchMoneyLeaks: accept marketplace param
  → When no marketplace specified: show combined or add selector

src/pages/Apps.tsx
  → Add Shopee integration card
```

### What Does NOT Change

```
Orders list layout/columns — no JSX changes
Diagnostico layout — no JSX changes (just data source change)
Any route paths
```

### Marketplace Filter in Orders

Add to the existing filter bar in `src/pages/Orders.tsx` or `src/hooks/useOrderFiltering.ts`:

```
[Marketplace: Todos | Mercado Livre | Shopee]
```

When "Todos" selected: no marketplace filter → shows orders from all marketplaces.
When "Mercado Livre" selected: filter `marketplace = 'mercado_livre'`.
When "Shopee" selected: filter `marketplace = 'shopee'`.

Also add a "marketplace" badge/chip on each order row to identify the source.

### Diagnóstico with Shopee

When seller has both ML and Shopee connected:
- **Block 1 (Money Leaks):** Show combined totals for both marketplaces
  OR add a marketplace selector above the Diagnóstico blocks.
- **For MVP:** Show combined totals. Add a TODO comment:
  `// TODO C3 extension: add per-marketplace selector to Diagnóstico`

Remove the `eq('marketplace', 'mercado_livre')` filter from `fetchMoneyLeaks` when both
marketplaces are connected. If only one marketplace is connected, keep the filter.

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **Remove ML-only filter — do NOT hardcode Shopee** | The service should accept an optional filter. Hardcoding Shopee is as wrong as hardcoding ML. |
| **DO NOT change the orders list visual design** | Add marketplace badges, do not rearrange columns. |
| **The marketplace filter must follow existing filter patterns** | Read `useOrderFiltering.ts` before adding — follow its exact pattern. |

---

## 6. What to Build

### Section A: Update `orders.service.ts`

Remove `eq('marketplace', 'mercado_livre')` filter from `fetchAllOrders` (and any other
orders-fetching functions that have this filter).

Optionally add:
```typescript
export async function fetchAllOrders(
  orgId: string,
  filters?: { marketplace?: string }  // optional filter, null = all marketplaces
)
```

#### Definition of Done — Section A
- [ ] `fetchAllOrders` no longer filters by marketplace by default
- [ ] Shopee orders appear in the orders list

---

### Section B: Marketplace Filter in Orders

In `src/hooks/useOrderFiltering.ts`, add `marketplace` to the filter state.

In `src/pages/Orders.tsx` or the filter bar component:
- Add marketplace filter dropdown: "Todos | Mercado Livre | Shopee"
- Add a marketplace chip/badge on each order row

Follow the exact same pattern as existing filters. Do NOT refactor the filter system — only add to it.

#### Definition of Done — Section B
- [ ] Marketplace filter works correctly
- [ ] "Todos" shows all orders from all marketplaces
- [ ] Each order row shows a marketplace badge (ML / Shopee)

---

### Section C: Shopee Card in Apps.tsx

In `src/pages/Apps.tsx`, add a Shopee integration card following the exact pattern of the
existing ML integration card:

```
Shopee
[Conectar Shopee]  (if not connected)
Connected ✅        (if connected — show store name + last sync time)
[Sincronizar agora]  [Desconectar]
```

If `shopee-start-auth` edge function exists: use it.
If it does NOT exist yet: show a placeholder card with `"Em breve"` badge.

#### Definition of Done — Section C
- [ ] Shopee card appears in Apps.tsx
- [ ] If connected: shows status and sync controls
- [ ] If not connected: shows connect button

---

### Section D: Update Diagnóstico for Shopee Data

In `src/services/diagnostico.service.ts`, `fetchMoneyLeaks`:

```typescript
// If seller has ONLY ML connected: filter marketplace = 'mercado_livre' (current behavior)
// If seller has BOTH ML + Shopee: remove marketplace filter to show combined totals
// Detect via: check marketplace_integrations table for this org

// TODO C3 extension: add per-marketplace selector to Diagnóstico page
```

The connection check: query `marketplace_integrations WHERE organization_id = orgId`
and check which marketplaces exist.

#### Definition of Done — Section D
- [ ] Seller with both ML + Shopee sees combined totals in Diagnóstico Block 1
- [ ] Seller with only ML still sees ML-only totals

---

## 7. Integration Checklist

- [ ] `orders` table has `marketplace = 'shopee'` rows (prerequisite: C0-T5 done)
- [ ] Filter "Todos" shows both ML + Shopee orders
- [ ] Shopee badge visible on order rows
- [ ] Apps page shows Shopee card

---

## 8. Definition of Done — Full Task (Cycle 3 Complete)

- [ ] All Section A–D DoD items checked
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Manual QA:
  - [ ] Orders list shows Shopee orders when "Todos" or "Shopee" filter selected
  - [ ] Each Shopee order has a "Shopee" badge
  - [ ] Marketplace filter works correctly for all 3 options
  - [ ] Apps page shows Shopee card
  - [ ] Diagnóstico shows combined totals when both marketplaces connected

### Cycle 3 Final Verification

When C3-T1 through C3-T6 are complete, verify the full Cycle 3 Definition of Done:

1. ⬜ Listing performance tab shows green/yellow/red for each listing
2. ⬜ "Volume baixo" shown for listings with < 20 visits
3. ⬜ Reputation alert appears before ML thermometer changes
4. ⬜ Complaint deadline shows exact date+time
5. ⬜ NFe emission from orders list works in 2 clicks for Simples Nacional
6. ⬜ Batch NFe runs sequentially (no rate limit errors)
7. ⬜ NFe errors shown in Portuguese
8. ⬜ Shopee orders visible in orders list with marketplace filter

---

## 9. What NOT to Build

- **Do NOT build Shopee-specific pages** — the unified orders list is the correct approach.
- **Do NOT build Shopee NFe flow** — NFe for Shopee orders uses the same `emit-invoice` function.
- **Do NOT add a marketplace filter to Diagnóstico** — combined view is sufficient for MVP.
  Add a TODO comment for the future selector.
- **Do NOT build Shopee reputation or listing performance** — ML only for this cycle.
