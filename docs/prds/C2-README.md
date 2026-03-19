# PRDs — Cycle 2: Seu Caixa

**Depends on:** Cycle 0 + Cycle 1 complete (onboarding done, Diagnóstico working, orders with margin)
**Appetite:** 6 weeks | **Team:** 1 designer + 2 engineers

> **Full spec:** `docs/CYCLE_2_SEU_CAIXA.md`
> **Engineering rules:** `docs/ENGINEERING_STANDARDS.md` (mandatory reading)

---

## The Core Bet

Sellers open Novura every week because it tells them **where their cash is** and **whether their ads are working** — not because they remember to check.

Cycle 1 answered "Am I making money per order?" Cycle 2 answers two harder questions:
1. **"Quando meu dinheiro cai na conta?"** — Mercado Pago cash timeline
2. **"Estou gastando certo nos anúncios?"** — ADS efficiency per product

Plus proactive stock intelligence: you find out about a stock-out before it happens.

---

## How to Use These PRDs

Same rules as Cycle 0 and 1 (see `docs/prds/README.md`). Every task has an "⚠️ Agent: Mandatory Code Review" section — read it first, always.

**Dependency chain:**

```
C2-T1 (Mercado Pago OAuth)
  └── C2-T2 (MP Balance Sync)
        └── C2-T3 (SeuCaixa page)

C2-T4 (Stock Intelligence)  ← parallel track, depends on C1 orders + inventory data
C2-T5 (ML ADS Integration)  ← parallel track, independent OAuth + sync
```

---

## PRD Index — Cycle 2

| ID | Title | Status | Depends on |
|---|---|---|---|
| [C2-T1](./C2-T1-mercado-pago-oauth.md) | Mercado Pago OAuth Integration | 🔴 Not Started | C1 complete |
| [C2-T2](./C2-T2-mp-balance-sync.md) | MP Balance Sync + Cash Timeline | 🔴 Not Started | C2-T1 |
| [C2-T3](./C2-T3-seu-caixa.md) | "Seu Caixa" Weekly Insight Screen | 🔴 Not Started | C2-T2 |
| [C2-T4](./C2-T4-stock-intelligence.md) | Stock Intelligence Alerts | 🔴 Not Started | C1-T3 (order_items.unit_cost) |
| [C2-T5](./C2-T5-ads-efficiency.md) | ML ADS Integration + Efficiency View | 🔴 Not Started | C1 complete |

---

## Architecture Overview

```
New pages:       /seu-caixa, /oauth/mercado-pago/callback
Modified pages:  /diagnostico (add MP CTA + stock block), /estoque (add alerts section)
New edge functions:
  mercado-pago-start-auth, mercado-pago-callback, mercado-pago-refresh,
  mercado-pago-sync-balance, ml-ads-start-auth, ml-ads-callback, ml-ads-sync
New tables:
  mercado_pago_integrations, mercado_pago_balance_snapshots, ml_ads_daily_spend
New services:
  seu-caixa.service.ts, mercado-pago.service.ts, stock-intelligence.service.ts
New utils:
  src/utils/alert-priority.ts, src/utils/stock-intelligence.ts
```

**Pattern for all new OAuth integrations:** Follow the exact PKCE pattern from ML OAuth.
`code_verifier` returned separately (not in state), stored in sessionStorage with integration-specific prefix.
Full security model: `docs/CYCLE_0_ORDERS_PLATFORM.md` → "OAuth2 Security Model".

---

## Cycle 2 Definition of Done

From `docs/CYCLE_2_SEU_CAIXA.md`:

1. MP OAuth connects and stores token — no raw token in any log
2. Balance sync runs daily and on-demand from Seu Caixa
3. Seu Caixa loads in < 2 seconds (data cached, no waterfall)
4. Stock-out alerts surface products that will run out within 7 days
5. Dead stock value computed correctly from unit_cost × current_stock
6. ADS ROI calculation uses correct period (30 days, not all-time)
7. No "Custo não informado" margin shown — shows `null` as "Sem custo"
8. MP balance shows "Atualizado há X minutos" — never stale without timestamp
