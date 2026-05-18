# PRDs — Cycle 3: Visibilidade e Conformidade

**Depends on:** Cycle 0 + 1 + 2 complete
**Appetite:** 6 weeks | **Team:** 1 designer + 2 engineers

> **Full spec:** `docs/CYCLE_3_VISIBILIDADE.md`
> **Engineering rules:** `docs/ENGINEERING_STANDARDS.md` (mandatory reading)

---

## The Core Bet

Sellers can understand why a listing isn't converting, get proactive warnings before their
ML reputation suffers, and emit tax invoices (NFe) without needing an accountant to set it up.

Cycle 3 solves two problems in one cycle:
1. **Visibilidade** — "Meu anúncio tem visitas mas ninguém compra. O que está errado?"
2. **Conformidade** — "Nota fiscal parece complicado. Quero emitir direto pelos pedidos."

Plus: Shopee UI integration, so Shopee sellers can see their Shopee data in the same interface.

---

## How to Use These PRDs

Same rules as previous cycles. Every task has an "⚠️ Agent: Mandatory Code Review" section.

**Dependency chain:**

```
C3-T1 (ML Listing Performance sync)
  └── C3-T2 (Listing Performance frontend tab)

C3-T3 (Reputation Risk Alerts sync)
  └── C3-T4 (Reputation alerts frontend)

C3-T5 (NFe Simplified Emission)    ← depends on emit-invoice from C0-T8
C3-T6 (Shopee UI Integration)      ← depends on Cycle 0 Shopee sync
```

---

## PRD Index — Cycle 3

| ID | Title | Status | Depends on |
|---|---|---|---|
| [C3-T1](./C3-T1-listing-performance-sync.md) | ML Listing Performance Sync | 🔴 Not Started | ML OAuth connected |
| [C3-T2](./C3-T2-listing-performance-ui.md) | Listing Performance Tab | 🔴 Not Started | C3-T1 |
| [C3-T3](./C3-T3-reputation-sync.md) | Reputation Risk Alerts Sync | 🔴 Not Started | ML OAuth connected |
| [C3-T4](./C3-T4-reputation-ui.md) | Reputation Alerts Frontend | 🔴 Not Started | C3-T3 |
| [C3-T5](./C3-T5-nfe-simplified.md) | NFe Simplified Emission Flow | 🔴 Not Started | C0-T8 (emit-invoice) |
| [C3-T6](./C3-T6-shopee-ui.md) | Shopee UI Integration | 🔴 Not Started | C0-T5 (Shopee sync) |

---

## Architecture Overview

```
New edge functions:
  ml-sync-listing-performance, ml-sync-reputation
New tables:
  listing_performance_snapshots, seller_reputation_snapshots
New pages:
  (tab in Listings.tsx), (section in SeuCaixa.tsx or Dashboard.tsx)
Modified pages:
  Listings.tsx (+ Performance tab), Orders.tsx (+ simplified NFe), Apps.tsx (+ Shopee)
New utils:
  src/utils/nfe-defaults.ts, src/utils/nfe-errors.ts, src/utils/listing-performance.ts
New hooks:
  useListingPerformance.ts, useReputation.ts, useNfeEmit.ts
```

**Key engineering patterns for this cycle:**
- Factory Pattern for `buildNfePayload` — pure function, no supabase calls
- Chain of Responsibility for NFe validation — array of validator functions
- Strategy Pattern for listing performance signals
- Constant map (not switch) for NFe error translation

---

## Cycle 3 Definition of Done

From `docs/CYCLE_3_VISIBILIDADE.md`:

1. Listing performance tab shows green/yellow/red signal for each listing
2. "Volume baixo" shown when visits < 20 (not a fake conversion rate)
3. Reputation alert appears before ML thermometer changes color
4. Complaint deadline shows exact date (not "em 2 dias")
5. NFe emission from orders list works for Simples Nacional in 2 clicks
6. Batch NFe emission runs sequentially (no rate limit errors)
7. NFe errors shown in plain Portuguese (not SEFAZ codes)
8. Shopee orders visible in orders list with marketplace filter
