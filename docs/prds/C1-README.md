# PRDs — Cycle 1: O Primeiro Minuto (MVP)

**Depends on:** Cycle 0 complete (all C0 tasks done, `orders` table populated)
**Appetite:** 6 weeks | **Team:** 1 designer + 2 engineers

> **Full spec:** `docs/CYCLE_1_PRIMEIRO_MINUTO.md`
> **Engineering rules:** `docs/ENGINEERING_STANDARDS.md` (mandatory reading)

---

## The Core Bet

A seller connects their Mercado Livre account and sees real insights in **under 5 minutes** with **zero configuration required**. The Diagnóstico IS the onboarding. No setup wizard.

---

## How to Use These PRDs

Same rules as Cycle 0 (see `docs/prds/README.md`). Every task has a "⚠️ Agent: Code Review" section — read it first, always.

**Dependency chain:**

```
C1-T1 (Onboarding + ML OAuth flow)
  └── C1-T2 (Diagnóstico page)
        └── C1-T4 (Orders with margin)
              └── C1-T5 (Freemium gates)
                    └── C1-T7 (NFe readiness checklist)

C1-T3 (Product costs)  ← depends on orders table from C0
C1-T6 (Product model + match engine)  ← depends on C1-T3
```

---

## PRD Index — Cycle 1

| ID | Title | Status | Depends on |
|---|---|---|---|
| [C1-T1](./C1-T1-onboarding.md) | Onboarding Page + ML Connection Flow | 🔴 Not Started | C0 complete |
| [C1-T2](./C1-T2-diagnostico.md) | Diagnóstico Automático | 🔴 Not Started | C1-T1 |
| [C1-T3](./C1-T3-product-costs.md) | Product Cost Input | 🔴 Not Started | C0-T9 (new tables) |
| [C1-T4](./C1-T4-orders-margin.md) | Orders List with Real Margin | 🔴 Not Started | C1-T3 |
| [C1-T5](./C1-T5-freemium-gates.md) | Freemium Feature Matrix + Paywall Gates | 🔴 Not Started | C1-T4 |
| [C1-T6](./C1-T6-product-match-engine.md) | Product Model + Listing Match Engine | 🔴 Not Started | C1-T3 |
| [C1-T7](./C1-T7-nfe-readiness-checklist.md) | Operational Readiness Checklist (NFe) | 🔴 Not Started | C1-T5 |

---

## Architecture Overview

```
New pages:        /onboarding, /diagnostico, /produtos/custos
Modified pages:   /pedidos (add margin columns)
New services:     diagnostico.service.ts, products.service.ts (extend)
New hooks:        useOnboardingStatus.ts, useDiagnostico.ts
New utils:        src/utils/formatting.ts, src/utils/margin.ts
New components:   onboarding/*, diagnostico/*
```

**Layer rule (no exceptions):**
```
pages/ + components/  →  UI only, no supabase calls
hooks/use*.ts         →  TanStack Query wrappers
services/*.service.ts →  Only place with supabase.from(...)
utils/                →  Pure functions, no supabase, no React
```

---

## Cycle 1 Definition of Done

All 8 conditions from `docs/CYCLE_1_PRIMEIRO_MINUTO.md`:

1. Time from "Conectar ML" to Diagnóstico < 5 minutes
2. Zero configuration required before seeing Diagnóstico
3. Money leaks accurate (±1% vs ML seller center)
4. Diagnóstico hides blocks when data is missing (never shows zero)
5. Product cost saves and propagates to orders within 5 seconds
6. Margin color coding correct (green/yellow/red thresholds)
7. Import failure handled gracefully (never blank screen)
8. Simples Nacional disclaimer always visible
