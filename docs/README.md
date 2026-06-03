# Novura — Docs

This folder contains the three anchor documents used as stable context for migration PRDs.

---

## Documents

### [ARCHITECTURE.md](./ARCHITECTURE.md)
**What:** Describes the codebase as it is today — stack, folder layout, routing, auth, feature-by-feature inventory, database tables, RPCs, Edge Functions, external integrations, and observable patterns.

**Read when:** starting a new feature, writing a migration PRD, or onboarding to the project.

**Do not:** prescribe improvements here. This document is purely descriptive. When a feature migrates to the target structure, update this file to reflect the new state.

---

### [CONVENTIONS.md](./CONVENTIONS.md)
**What:** Defines how all new code should be written — guiding principles (SOLID, DRY, KISS, YAGNI), TypeScript targets, React 19 patterns, feature folder structure, component rules, data fetching (TanStack Query), state management, Supabase best practices, naming conventions, ESLint config, design patterns, and Git conventions.

**Read when:** writing new code, reviewing a PR, or creating a migration PRD.

**Relationship to ENGINEERING_STANDARDS.md:** `CONVENTIONS.md` is forward-looking and covers modern patterns. `ENGINEERING_STANDARDS.md` covers size limits and cycle-specific rules — those take precedence on size. Section 14 covers how to refactor legacy code (decompose by responsibility, not visual structure).

---

### [AGENT_REFACTORING_PLAYBOOK.md](./AGENT_REFACTORING_PLAYBOOK.md)
**What:** Operating procedure for AI sub-agents (Cursor / Claude Code) that refactor the codebase — the Explore → Plan → Approve → Execute → Self-check → Hand off workflow, non-negotiable invariants, least-privilege tool profiles per agent role, worktree isolation for parallel refactors, a Definition of Done checklist, and a copy-paste delegation prompt template.

**Read when:** delegating a refactor to a sub-agent, or refactoring a god page/hook yourself.

**Relationship:** This is the *process*. `CONVENTIONS.md §14` is the *rules*, `ENGINEERING_STANDARDS.md §1` is the *size limits*, and `REFACTORING_PLAN.md` (repo root) is the *target list and phases*.

---

### [TESTING.md](./TESTING.md)
**What:** Defines the testing strategy — Testing Trophy philosophy, tool stack (Vitest + RTL + MSW + Playwright), the four test levels with real Novura examples and templates, conventions, MSW setup, Playwright setup, coverage targets, CI gates, and a prioritized queue of what to test first in the current codebase.

**Read when:** writing tests, setting up CI, or deciding what to test in a migration PRD.

---

## Other docs in this folder

| File | Purpose |
|---|---|
| `ENGINEERING_STANDARDS.md` | Hard size limits (50-line function, 200-line page, etc.) and cycle rules. Supersedes CONVENTIONS on size. |
| `EDGE_FUNCTIONS.md` | Edge Function reference — inputs, outputs, auth requirements |
| `SUPABASE_RPCS.md` | RPC reference — signatures, security model |
| `DATABASE_TRIGGERS.md` | Database trigger inventory |
| `BILLING.md` | Billing and subscription model |
| `CYCLE_0_ORDERS_PLATFORM.md` | Cycle 0 scope and architecture decisions |
| `CYCLE_1_PRIMEIRO_MINUTO.md` | Cycle 1 scope |
| `CYCLE_2_SEU_CAIXA.md` | Cycle 2 scope |
| `CYCLE_3_VISIBILIDADE.md` | Cycle 3 scope |
| `FLUXO_*.md` | Business flow diagrams for each order status |
| `prds/` | Feature PRDs by cycle (C0-T*, C1-T*, C2-T*) |
| `MIGRATION/` | Step-by-step migration PRDs (created as refactoring progresses) |

---

## Migration PRD series (to be created in `MIGRATION/`)

When the three anchor documents are approved, the next step is to write migration PRDs that move the codebase from `ARCHITECTURE.md` state to `CONVENTIONS.md` state:

| PRD | What it covers |
|---|---|
| `00-upgrade-react-19.md` | React 18 → 19 upgrade; React Compiler opt-in |
| `01-tsconfig-strict.md` | Add 7 extra TS strict flags progressively |
| `02-eslint-strict.md` | ESLint flat config v9 with strict-type-checked |
| `03-layout-route.md` | Extract `AppLayout`; remove sidebar/header boilerplate from all pages |
| `04-orders-refactor.md` | Split god hook; introduce `features/orders/`; TanStack Query; server-side filtering |
| `05-companies-refactor.md` | Refactor `NewCompany.tsx`; fix bugs; `features/companies/` |
| `06-testing-foundation.md` | Install RTL + Playwright; write Priority Queue tests from `TESTING.md §10` |
| `N-<feature>-refactor.md` | One per remaining feature |
