# PRDs — Master Index (All Cycles)

> These documents break each product cycle into discrete implementation tasks. Each PRD is
> self-contained and can be handed to an AI agent or a developer without additional context.
> Engineering rules live in `docs/ENGINEERING_STANDARDS.md`.
> **Engineering standards are mandatory reading before implementing any PRD.**

## Cycle Navigation

| Cycle | Title | Full Spec | Index |
|---|---|---|---|
| Cycle 0 | Plataforma de Pedidos | `docs/CYCLE_0_ORDERS_PLATFORM.md` | Below |
| Cycle 1 | O Primeiro Minuto | `docs/CYCLE_1_PRIMEIRO_MINUTO.md` | [C1-README](./C1-README.md) |
| Cycle 2 | Seu Caixa | `docs/CYCLE_2_SEU_CAIXA.md` | [C2-README](./C2-README.md) |
| Cycle 3 | Visibilidade e Conformidade | `docs/CYCLE_3_VISIBILIDADE.md` | [C3-README](./C3-README.md) |
| **Status Engine** | **Motor de Status de Pedidos (Refatoração)** | `docs/prds/STATUS-ENGINE-README.md` | Below |
| **Motor Universal de Estoque** | **Sincronização Universal de Estoque nos Canais** | `docs/prds/PRD-SINCRONIZACAO-UNIVERSAL-ESTOQUE.md` | [Below](#prd-index--motor-universal-de-sincronização-de-estoque) |

---

## PRD Index — Status Engine (Motor de Status de Pedidos)

> **Motivação:** Move o cálculo de status de pedidos de triggers SQL (~500 linhas PL/pgSQL) para
> uma camada de domínio TypeScript testável, usando Arquitetura Hexagonal + DDD + Chain of Responsibility.
> Elimina duplicação entre trigger SQL e edge functions `*-process-presented`.

Tasks devem ser implementadas em ordem. Cada task depende da anterior.

| ID | Título | Status | Depende de |
|---|---|---|---|
| [SE-T1](./STATUS-ENGINE-T1-dominio.md) | Camada de Domínio: Entidades e Value Objects | 🔴 Não iniciado | — |
| [SE-T2](./STATUS-ENGINE-T2-portas.md) | Ports (Interfaces): Contratos Hexagonais | 🔴 Não iniciado | SE-T1 |
| [SE-T3](./STATUS-ENGINE-T3-calculadora.md) | OrderStatusEngine: Chain of Responsibility (9 regras) | 🔴 Não iniciado | SE-T1 |
| [SE-T4](./STATUS-ENGINE-T4-adaptadores.md) | Infrastructure Adapters: Implementações Supabase | 🔴 Não iniciado | SE-T2 |
| [SE-T5](./STATUS-ENGINE-T5-caso-uso-vincular.md) | Use Case: Vincular Produto a Item de Pedido | 🔴 Não iniciado | SE-T2, SE-T3, SE-T4 |
| [SE-T6](./STATUS-ENGINE-T6-caso-uso-status.md) | Use Cases: Recalcular Status + Marcar Etiqueta | 🔴 Não iniciado | SE-T2, SE-T3, SE-T4 |
| [SE-T7](./STATUS-ENGINE-T7-caso-uso-estoque.md) | Use Case: Side Effects de Estoque | 🔴 Não iniciado | SE-T2, SE-T4 |
| [SE-T8](./STATUS-ENGINE-T8-migracao-db.md) | Migration: Coluna `status` e Campos de Sinais | 🔴 Não iniciado | C0-T1 |
| [SE-T9](./STATUS-ENGINE-T9-edge-functions.md) | Wiring: Integrar Engine nas Edge Functions | 🔴 Não iniciado | SE-T3 a SE-T7, SE-T8 |
| [SE-T10](./STATUS-ENGINE-T10-frontend.md) | Frontend: Hooks, Componentes e LinkOrderModal | 🔴 Não iniciado | SE-T8, SE-T9 |

---

## PRD Index — Motor Universal de Sincronização de Estoque

> **Motivação:** Elimina o gap crítico de propagação cruzada de estoque entre canais de venda. Quando um
> pedido é processado em qualquer canal, o saldo disponível atualizado é propagado assincronamente para
> todos os demais canais vinculados, usando uma arquitetura Event-Driven com Bulkhead por canal, Transactional
> Outbox, Motor Universal de Adaptadores (`IStockChannelAdapter`) e resiliência nativa (Circuit Breaker, DLQ, Reconciliation Engine).
>
> **Separação fundamental:** o Core ERP calcula e persiste `available`; o Motor de Integração apenas
> consome e propaga esse valor — sem recalcular estoque ou aplicar regras de negócio internas.

| Documento | Tipo | Finalidade |
|---|---|---|
| [PRD-SINCRONIZACAO-UNIVERSAL-ESTOQUE](./PRD-SINCRONIZACAO-UNIVERSAL-ESTOQUE.md) | Especificação Técnica | Arquitetura completa: tríade de estado, Bulkhead, Outbox, Motor de Adaptadores, Resiliência, Performance |
| [PLANO-MIGRACAO-ADAPTADORES-UNIVERSAIS-ESTOQUE](./PLANO-MIGRACAO-ADAPTADORES-UNIVERSAIS-ESTOQUE.md) | Plano de Migração | Auditoria do estado atual, novos componentes, migrations, rollout faseado, checklist de aceitação |

### Componentes Introduzidos

| Componente | Localização | Status |
|---|---|---|
| `IStockChannelAdapter` (contrato) | `_shared/domain/stock/ports/` | ✅ Implementado |
| `StockAdapterRegistry` | `_shared/adapters/stock/registry.ts` | ✅ Implementado |
| `ShopeeStockProvider` | `_shared/adapters/stock/providers/shopee.ts` | ✅ Implementado |
| `MercadoLivreStockProvider` | `_shared/adapters/stock/providers/mercado-livre.ts` | ✅ Implementado |
| `stock-sync-dispatcher` | `supabase/functions/stock-sync-dispatcher/` | ✅ Deployado |
| `stock-sync-worker` | `supabase/functions/stock-sync-worker/` | ✅ Deployado |
| `mercado-livre-update-stock` | `supabase/functions/mercado-livre-update-stock/` | ✅ Deployado |
| `stock-reconciliation-sweeper` | `supabase/functions/stock-reconciliation-sweeper/` | ✅ Deployado |
| `shopee-update-stock` (refatoração) | `supabase/functions/shopee-update-stock/` | ✅ Deployado |
| `stock_sync_outbox` (migration) | `supabase/migrations/` | ✅ Aplicada |
| `channel_circuit_state` (migration) | `supabase/migrations/` | ✅ Aplicada |
| `channel_rate_buckets` (migration) | `supabase/migrations/` | ✅ Aplicada |
| Filas PGMQ de estoque (migration) | `supabase/migrations/` | ✅ Aplicada |

### Fases de Rollout

| Fase | Descrição | Pré-requisito |
|---|---|---|
| Fase 0 | Infraestrutura: migrations + providers + dispatcher em shadow mode | Aprovação do plano |
| Fase 1 | Provider Shopee em produção (canal piloto) | Fase 0 estável por 48h |
| Fase 2 | Provider Mercado Livre em produção | Fase 1 estável por 7 dias |
| Fase 3 | Reconciliation Engine + consolidação + remoção de legado | Fase 2 estável por 14 dias |

---

# Cycle 0: Plataforma de Pedidos

> The high-level "why" lives in `docs/CYCLE_0_ORDERS_PLATFORM.md`.

---

## How to Use These PRDs

**If you are a human (founder, PM):**
Read the "Plain Language Summary" section at the top of each PRD. That section tells you
what the task builds, why it matters for the product, and how to know when it's done —
in plain language, no code required.

**If you are an AI agent (LLM):**
Every PRD has an "⚠️ Agent: Mandatory Code Review" section near the top.
**Read that section first. Do not write code until you have completed the code review it asks for.**
The codebase has partial progress on Cycle 0 and the PRD status sections may be out of date.
Your job is to read the current code, update the status, then implement only what is missing.

---

## PRD Index — Cycle 0

Tasks must be implemented in order. Each task depends on the previous one.

| ID | Title | Status | Depends on |
|---|---|---|---|
| [C0-T1](./C0-T1-database-migrations.md) | Database Migrations — 6 New Tables | 🟢 Done | — |
| [C0-T2](./C0-T2-shared-orders-upsert.md) | `_shared` Layer — Move OrdersUpsertAdapter | 🟡 In Progress | C0-T1 |
| [C0-T3](./C0-T3-orders-upsert-function.md) | Edge Function: `orders-upsert` | 🟡 In Progress | C0-T2 |
| [C0-T4](./C0-T4-orders-sync-ml.md) | Edge Function: `orders-sync-ml` | 🟡 In Progress | C0-T3 |
| [C0-T5](./C0-T5-orders-sync-shopee.md) | Edge Function: `orders-sync-shopee` | 🟡 In Progress | C0-T3 |
| [C0-T6](./C0-T6-orders-webhook.md) | Edge Function: `orders-webhook` | 🟡 In Progress | C0-T3 |
| [C0-T7](./C0-T7-orders-queue-worker.md) | Edge Function: `orders-queue-worker` | 🟡 In Progress | C0-T4, C0-T5 |
| [C0-T8](./C0-T8-emit-invoice.md) | Edge Function: `emit-invoice` | 🔴 Not Started | C0-T1 |
| [C0-T9](./C0-T9-frontend-migration.md) | Frontend: Migrate Queries to New Tables | 🔴 Not Started | C0-T3 |
| [C0-T10](./C0-T10-legacy-cleanup.md) | Legacy Trigger & Table Cleanup | 🔴 Not Started | C0-T9 |

> ⚠️ **Status values here are based on a code review done in March 2026.** An AI agent
> assigned to any task MUST verify the actual state by reading the code before trusting the table above.

### What Was Found in the March 2026 Code Review

| Finding | Impact |
|---|---|
| All 6 database migration files exist and appear complete (C0-T1) | T1 likely done — verify constraints |
| `OrdersUpsertAdapter` exists in `orders-upsert/` but should be in `_shared/` | T2 is a move, not a rewrite |
| `orders-upsert`, `orders-sync-ml`, `orders-sync-shopee`, `orders-webhook`, `orders-queue-worker` all have code | T3–T7 are in progress, not started from scratch |
| `orders-sync-ml` and `orders-queue-worker` import from wrong path `../orders-upsert/orders-upsert-adapter.ts` | Fixed in T2+T3 |
| `orders-webhook` imports `ml-order-notification.types.ts` and `shopee-order-push.types.ts` which may not exist in `_shared` | May be a blocker for T6 |
| `orders-sync-shopee` imports `_shared/adapters/shopee/shopee-fetch-orders.ts` which may not exist | May be a blocker for T5 |
| `emit-invoice` edge function does not exist | T8 is fully not started |
| Frontend still queries `marketplace_orders_presented_new` | T9 is fully not started |
| Legacy triggers have not been dropped | T10 is fully not started |

---

## Architecture at a Glance

```
External Marketplaces (ML, Shopee)
        │
        ▼
  Webhooks / Periodic Sync
        │
        ▼
Edge Functions (orders-webhook, orders-sync-ml, orders-sync-shopee)
        │
        │ call
        ▼
  orders-upsert (the ONLY writer to new tables)
        │
        ▼
  _shared/adapters/orders-upsert/ (implements OrdersUpsertPort)
        │
        ▼
  PostgreSQL: orders, order_items, order_shipping,
              order_status_history, order_labels, invoices
```

**Key rule:** `orders-upsert` is the single source of truth for writes.
No other function writes directly to `orders`, `order_items`, or `order_shipping`.

---

## What Cycle 0 Does NOT Include

- No UI changes visible to sellers
- No margin calculation (that's Cycle 1)
- No NFe emission changes (existing NFe functions continue to work)
- No Mercado Pago integration (Cycle 2)
- No analytics (Cycle 1+)

---

## Glossary

| Term | Meaning |
|---|---|
| NormalizedOrder | The internal canonical order format, marketplace-agnostic. Defined in `_shared/domain/orders/orders-types.ts`. |
| marketplace_order_id | The ID the marketplace (ML or Shopee) gives to the order. Different from Novura's internal `orders.id`. |
| idempotency | Running the same sync operation twice produces the same result — no duplicates. |
| UPSERT | INSERT if new, UPDATE if already exists. Always used instead of INSERT to ensure idempotency. |
| Port | An interface (contract) that defines what a module expects from the outside world. Part of hexagonal architecture. |
| Adapter | The concrete implementation of a Port. Swappable for testing. |
| _shared | The folder at `supabase/functions/_shared/` containing all reusable code for edge functions. |
