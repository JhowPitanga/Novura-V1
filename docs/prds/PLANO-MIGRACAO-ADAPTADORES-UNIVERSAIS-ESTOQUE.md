# Plano de Migração — Motor Universal de Adaptadores de Estoque

**Documento:** `PLANO-MIGRACAO-ADAPTADORES-UNIVERSAIS-ESTOQUE`  
**Versão:** 1.0  
**Data:** Junho/2026  
**Status:** Planejamento Aprovado  
**Referência:** `docs/prds/PRD-SINCRONIZACAO-UNIVERSAL-ESTOQUE.md`

---

## Sumário Executivo

Este documento define o plano de migração da implementação atual — composta por edge functions síncronas e isoladas por canal, sem propagação cruzada — para o Motor Universal de Sincronização de Estoque descrito no PRD.

A migração é **aditiva e faseada**: novos componentes são introduzidos em paralelo ao legado, com shadow mode validando o comportamento antes de qualquer corte. A função `mercado-livre-update-item-fields` é preservada em sua totalidade; apenas a responsabilidade de propagação de `available_quantity` é extraída para o Motor Universal.

---

## 1. Auditoria do Estado Atual

### 1.1 Fluxo de Estoque Interno — Core ERP (Estado: Operacional)

O Core ERP está funcionando corretamente e **não requer alteração de comportamento**. As migrações e RPCs abaixo são a base sobre a qual o Motor de Integração é construído.

| Componente | Arquivo | Estado |
|---|---|---|
| Tabela central de estoque | `products_stock` | Operacional |
| Ledger de movimentações | `inventory_transactions` | Operacional |
| RPC reserva | `reserve_stock_for_order_v2` | Operacional |
| RPC baixa | `consume_stock_for_order_v2` | Operacional |
| RPC estorno | `refund_stock_for_order_v2` | Operacional |
| Worker de pedidos | `orders-queue-worker` | Operacional |
| Fila de pedidos | `PGMQ orders_sync` | Operacional |
| Adapter de inventário | `SupabaseInventoryAdapter.ts` | Operacional |
| Porta de inventário | `IInventoryPort.ts` | Operacional |

**Migration mais recente do Core:** `20260414_000007_stock_rpcs_company_aware.sql`

### 1.2 Fluxo de Propagação para Canais — Estado Atual (Gaps Críticos)

| Componente | Arquivo/Localização | Estado Atual | Gap |
|---|---|---|---|
| Push estoque Shopee | `shopee-update-stock/index.ts` | Operacional | Síncrono, chamado apenas pelo frontend; não há propagação por pedido |
| Push estoque ML | `mercado-livre-update-item-fields` | Parcial | PUT `available_quantity` ignora contas multi-origem; responsabilidade misturada com outros campos do anúncio |
| Fan-out cross-canal | — | **Inexistente** | Gap crítico: pedido na Shopee não atualiza ML e vice-versa |
| Transactional Outbox | — | **Inexistente** | Dual-write problem não resolvido |
| Filas PGMQ de estoque | — | **Inexistentes** | Sem filas dedicadas para propagação |
| Circuit Breaker | — | **Inexistente** | Falha de um canal bloqueia ou contamina outros |
| Reconciliation Engine | — | **Inexistente** | Drifts só são percebidos manualmente |
| `shopee-sync-fulfillment-stock` | `shopee-sync-fulfillment-stock/index.ts` | Implementado, **sem caller** | Órfão — sem pg_cron, sem invocação ativa |
| Versionamento de eventos | — | **Inexistente** | Sem proteção contra escrita fora de ordem |
| Vínculo como gate de propagação | `marketplace_item_product_links` (existe) | Tabela existe; gate **não aplicado** no fluxo de propagação | Sem vínculo, propagação tentaria dados inválidos |

### 1.3 Dois Pipelines de Pedidos Coexistindo

| Pipeline | Entrada | Processamento | Estado |
|---|---|---|---|
| **Cycle 0 (atual)** | Vercel → `orders-webhook` → PGMQ `orders_sync` | `orders-queue-worker` → RPCs v2 | Ativo — caminho principal |
| **Legado** | `shopee-webhook-orders` / `mercado-livre-webhook-orders` | `*-process-presented` → `inventory_jobs` | `@deprecated`, ainda ativo, sendo descontinuado gradualmente |

O Motor de Integração de Estoque deve ser integrado **apenas ao pipeline Cycle 0**, via insert no `stock_sync_outbox` dentro das RPCs v2.

---

## 2. Fronteira Core ERP vs. Motor de Integração

Esta separação deve ser **documentada e aplicada** em todo código novo:

```
╔══════════════════════════════════════════════════════════════╗
║  CORE ERP — Livro Razão (PostgreSQL)                         ║
║                                                              ║
║  products_stock  ←  RPCs v2 (reserve / consume / refund)    ║
║  inventory_transactions  (ledger append-only)                ║
║                                                              ║
║  Regra: NENHUM componente externo escreve em products_stock  ║
╚══════════════════════════════╦═══════════════════════════════╝
                               ║ stock_sync_outbox
                               ║ (snapshot: available + version)
                               ║
╔══════════════════════════════╩═══════════════════════════════╗
║  MOTOR DE INTEGRAÇÃO — Mensageiro (Event-Driven)             ║
║                                                              ║
║  Lê: products_stock.available (apenas)                       ║
║  Propaga: o mesmo número, sem recalcular                     ║
║                                                              ║
║  Regra: NUNCA usa current, reserved, qty vendida             ║
╚══════════════════════════════════════════════════════════════╝
```

**Validação em code review:** toda PR que toca o Motor de Integração deve ser verificada para garantir que nenhum `products_stock.current` ou `products_stock.reserved` é lido pelo Motor. Apenas `products_stock.available` ou o snapshot equivalente no `stock_sync_outbox`.

---

## 3. Arquitetura-Alvo: Motor Universal de Adaptadores

### 3.1 Estrutura de Diretórios

```
supabase/functions/
├── _shared/
│   ├── domain/
│   │   └── stock/
│   │       └── ports/
│   │           └── IStockChannelAdapter.ts     [NOVO]
│   └── adapters/
│       └── stock/
│           ├── registry.ts                     [NOVO]
│           └── providers/
│               ├── shopee.ts                   [NOVO — refatoração]
│               ├── mercado-livre.ts            [NOVO — implementação crítica]
│               └── _template.ts               [NOVO — guia extensibilidade]
│
├── shopee-update-stock/
│   └── index.ts                                [REFATORADO — wrapper fino]
│
├── mercado-livre-update-stock/                 [NOVA]
│   └── index.ts                                [wrapper fino → MercadoLivreStockProvider]
│
├── stock-sync-dispatcher/                      [NOVA]
│   └── index.ts                                [lê outbox, gate de vínculo, FAN-OUT]
│
├── stock-sync-worker/                          [NOVA]
│   └── index.ts                                [worker universal, resiliência, registry]
│
└── stock-reconciliation-sweeper/               [NOVA]
    └── index.ts                                [detecta drift, injeta no outbox]
```

### 3.2 Padrão para Adicionar um Novo Canal (Extensibilidade)

O Motor Universal é extensível por design. Adicionar Amazon (ou qualquer canal futuro) segue exatamente estes passos:

**Passo 1: Implementar o provider**
```typescript
// supabase/functions/_shared/adapters/stock/providers/amazon.ts
import type { IStockChannelAdapter, StockPushContext, StockPushResult }
  from '../../../domain/stock/ports/IStockChannelAdapter.ts';

export class AmazonStockProvider implements IStockChannelAdapter {
  readonly providerKey = 'Amazon';

  async pushStock(ctx: StockPushContext): Promise<StockPushResult> {
    // Implementar chamada à API Amazon Seller Central
    // usando apenas ctx.availableQty como quantidade a propagar
  }
}
```

**Passo 2: Registrar no registry**
```typescript
// supabase/functions/_shared/adapters/stock/registry.ts
import { AmazonStockProvider } from './providers/amazon.ts';

const REGISTRY = new Map([
  ['Shopee',        new ShopeeStockProvider()],
  ['Mercado Livre', new MercadoLivreStockProvider()],
  ['Amazon',        new AmazonStockProvider()],  // ← adicionar aqui
]);
```

**Passo 3: Criar fila PGMQ**
```sql
-- Migration: YYYYMMDD_HHMMSS_stock_sync_amazon_queue.sql
SELECT pgmq.create('fila.sincronizacao.amazon');

INSERT INTO public.channel_circuit_state (channel) VALUES ('Amazon')
  ON CONFLICT DO NOTHING;

INSERT INTO public.channel_rate_buckets (channel, max_tokens, refill_rate)
  VALUES ('Amazon', 60, 3)
  ON CONFLICT DO NOTHING;
```

**Passo 4: Criar edge function fina**
```typescript
// supabase/functions/amazon-update-stock/index.ts
// Wrapper HTTP idêntico ao mercado-livre-update-stock,
// apenas troca o providerKey para 'Amazon'
```

**Passo 5: Registrar no `marketplace_providers`**
```sql
-- Reusa o padrão de adding-a-marketplace-provider.md
INSERT INTO public.marketplace_providers (key, display_name, ...)
  VALUES ('amazon', 'Amazon', ...);
```

Não há alteração em nenhum worker, dispatcher ou lógica de negócio existente.

---

## 4. Novos Componentes e Migrations

### 4.1 Migrations SQL (executar em ordem)

#### Migration 1: Versão em `products_stock` + Check Constraint

```sql
-- YYYYMMDD_000001_products_stock_version_check.sql

ALTER TABLE public.products_stock
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;

ALTER TABLE public.products_stock
  ADD CONSTRAINT chk_products_stock_no_negative_available
    CHECK (current >= COALESCE(reserved, 0));

CREATE INDEX IF NOT EXISTS idx_products_stock_product_storage_available
  ON public.products_stock (product_id, storage_id)
  WHERE available > 0;

-- Incremento de version nas RPCs v2 (via ALTER FUNCTION ou nova migration de RPC)
```

#### Migration 2: Tabela `stock_sync_outbox`

```sql
-- YYYYMMDD_000002_stock_sync_outbox.sql

CREATE TABLE IF NOT EXISTS public.stock_sync_outbox (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES public.organizations(id),
  product_id         uuid        NOT NULL REFERENCES public.products(id),
  storage_id         uuid        NOT NULL REFERENCES public.storage(id),
  available_snapshot numeric     NOT NULL,
  version            bigint      NOT NULL,
  processed          boolean     NOT NULL DEFAULT false,
  processing_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, storage_id)
);

CREATE INDEX idx_stock_sync_outbox_pending
  ON public.stock_sync_outbox (created_at)
  WHERE processed = false;

ALTER TABLE public.stock_sync_outbox ENABLE ROW LEVEL SECURITY;
```

#### Migration 3: Tabelas de Resiliência

```sql
-- YYYYMMDD_000003_stock_sync_resilience.sql

CREATE TABLE IF NOT EXISTS public.channel_circuit_state (
  channel          text        PRIMARY KEY,
  state            text        NOT NULL DEFAULT 'closed'
                               CHECK (state IN ('closed', 'open', 'half_open')),
  failure_count    integer     NOT NULL DEFAULT 0,
  last_failure_at  timestamptz,
  opens_until      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.channel_rate_buckets (
  channel          text        PRIMARY KEY,
  tokens           numeric     NOT NULL DEFAULT 100,
  max_tokens       numeric     NOT NULL DEFAULT 100,
  refill_rate      numeric     NOT NULL DEFAULT 10,
  last_refill_at   timestamptz NOT NULL DEFAULT now()
);

-- Seeds iniciais
INSERT INTO public.channel_circuit_state (channel) VALUES ('Shopee'), ('Mercado Livre')
  ON CONFLICT DO NOTHING;

INSERT INTO public.channel_rate_buckets (channel, max_tokens, refill_rate) VALUES
  ('Shopee',        100, 10),
  ('Mercado Livre',  60,  3)
ON CONFLICT DO NOTHING;
```

#### Migration 4: Filas PGMQ de Estoque

```sql
-- YYYYMMDD_000004_stock_sync_queues.sql

SELECT pgmq.create('fila.sincronizacao.shopee');
SELECT pgmq.create('fila.sincronizacao.mercadolivre');
SELECT pgmq.create('fila.auditoria');
```

#### Migration 5: pg_cron para Dispatcher e Sweeper

```sql
-- YYYYMMDD_000005_stock_sync_crons.sql

SELECT cron.schedule(
  'stock-sync-dispatcher',
  '30 seconds',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/stock-sync-dispatcher',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'stock-reconciliation-sweeper',
  '0 3 * * *',  -- Diário às 03:00 BRT
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/stock-reconciliation-sweeper',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
```

#### Migration 6: Incremento de `version` nas RPCs v2

```sql
-- YYYYMMDD_000006_rpcs_v2_version_increment.sql
-- Atualiza as 3 RPCs v2 para incluir:
--   version = version + 1  no UPDATE de products_stock
--   INSERT INTO stock_sync_outbox ... ON CONFLICT DO UPDATE  após o UPDATE
-- (corpo completo omitido aqui — requer ALTER FUNCTION das RPCs existentes)
```

#### Migration 7: View de DLQ

```sql
-- YYYYMMDD_000007_stock_dlq_view.sql

CREATE OR REPLACE VIEW public.v_stock_sync_dlq AS
SELECT
  q.msg_id,
  (q.message->>'organization_id')::uuid AS organization_id,
  q.message->>'marketplace_name'        AS marketplace_name,
  q.message->>'marketplace_item_id'     AS marketplace_item_id,
  q.message->>'variation_id'            AS variation_id,
  (q.message->>'available')::integer    AS available_attempted,
  q.message->>'error'                   AS last_error,
  q.enqueued_at,
  q.read_ct                             AS retry_count
FROM pgmq.dlq_messages q
WHERE q.queue_name LIKE 'fila.sincronizacao.%'
ORDER BY q.enqueued_at DESC;
```

### 4.2 Novas Edge Functions

| Edge Function | Tipo | Responsabilidade |
|---|---|---|
| `mercado-livre-update-stock` | Nova | Wrapper HTTP do `MercadoLivreStockProvider`; roteamento por logística |
| `stock-sync-dispatcher` | Nova | Lê `stock_sync_outbox`, gate de vínculo, FAN-OUT para filas PGMQ |
| `stock-sync-worker` | Nova | Worker universal: consome filas, Circuit Breaker, Token Bucket, Backoff, executa `pushStock` |
| `stock-reconciliation-sweeper` | Nova | Compara interno vs. canal, injeta drifts no outbox |
| `shopee-update-stock` | Refatoração | Wrapper fino — extrai lógica para `ShopeeStockProvider` |

---

## 5. Legado a Depreciar

### 5.1 Extração de Estoque de `mercado-livre-update-item-fields`

**Ação:** remover **apenas** o bloco de lógica responsável por `available_quantity` desta função.

**O que permanece na função:**
- Atualização de `title`
- Atualização de `price`
- Atualização de `pictures`
- Atualização de `description`
- Atualização de `status` (ativo/pausado)
- Quaisquer outros campos de anúncio

**O que é removido:**
```typescript
// ANTES (fragmento de mercado-livre-update-item-fields/index.ts):
if (updates.available_quantity != null) {
  mlPayload.available_quantity = Math.max(0, Number(updates.available_quantity) || 0);
}
// ↑ Este bloco é removido. A propagação de estoque passa a ser responsabilidade
// exclusiva do MercadoLivreStockProvider via Motor de Integração.
```

**Observação para callers existentes:** o frontend (`EditListingML.tsx`, `src/adapters/listings/mercadoLivre/adapter.ts`) continua chamando `mercado-livre-update-item-fields` para edições manuais de anúncio. Quando o lojista edita estoque manualmente pela UI de Anúncios, a ação deve ser **redirecionada para atualizar `products_stock` no ERP** — que por sua vez dispara o outbox e o Motor de Integração. Esta refatoração de UX é separada e documentada no rollout da Fase 3.

### 5.2 Invocação Direta de `shopee-update-stock` pelo Frontend

**Problema atual:**
```
StockEditModal.tsx → sync.service.ts → shopee-update-stock
                                        ↑ direto, sem passar pelo ERP
```

**Estado-alvo:**
```
StockEditModal.tsx → products_stock (ERP) → outbox → dispatcher → fila Shopee → ShopeeStockProvider
```

A invocação direta pelo frontend deve ser mantida durante o rollout (Fase 1 e 2) e removida apenas na Fase 3, após validação completa do Motor de Integração em produção.

### 5.3 `shopee-sync-fulfillment-stock` (Órfão)

Esta edge function está implementada mas sem caller. Na Fase 3, deve ser ativada com pg_cron para sincronizar estoque de fulfillment da Shopee para `fulfillment_stock`. Não é depreciada — é ativada.

### 5.4 Pipeline Legado de Pedidos

O pipeline legado (`shopee-webhook-orders` → `*-process-presented` → `inventory_jobs`) está marcado como `@deprecated`. O Motor de Integração opera **somente** sobre o pipeline Cycle 0 (`orders-queue-worker`). Nenhuma integração entre o Motor e o pipeline legado é necessária ou desejável.

---

## 6. Regra Crítica de Vínculo — Gate de Propagação

### 6.1 O Vínculo como Pré-condição Universal

```
marketplace_item_product_links
  ├── organization_id
  ├── marketplace_name   → 'Shopee' | 'Mercado Livre'
  ├── marketplace_item_id → item_id / MLB...
  ├── variation_id        → model_id / variation.id / ''
  ├── product_id          → FK products (chave de resolução)
  └── integration_id      → qual conta do marketplace
```

**Impacto em dois fluxos:**

| Fluxo | Sem vínculo | Com vínculo |
|---|---|---|
| Core ERP (ingestão de pedido) | `product_id` não resolvido → sem reserva/baixa → pedido vai para "A Vincular" | `product_id` resolvido → reserva e baixa normais |
| Motor de Integração (propagação) | Evento descartado + auditado como `sem_vinculo` → anúncio marcado "A Vincular" | Evento enfileirado para o canal → saldo propagado |

**Consequência para o lojista:** qualquer anúncio não vinculado a um produto no ERP é essencialmente invisível para o sistema de controle de estoque. O produto pode vender no marketplace, mas o ERP não desconta o estoque e o saldo do canal não é sincronizado. Este comportamento é **intencional e correto** — o sistema não deve operar sobre dados incompletos.

### 6.2 Lógica do Gate no Dispatcher

```typescript
// Pseudocódigo do gate de vínculo em stock-sync-dispatcher

async function dispatchOutboxEntry(entry: StockSyncOutboxRow): Promise<void> {
  const links = await resolveProductLinks(entry.product_id, entry.organization_id);

  if (links.length === 0) {
    await auditNoLink(entry);      // INSERT inventory_transactions (sem_vinculo)
    await markOutboxProcessed(entry.id);
    return;                        // Sem propagação — não chama API
  }

  for (const link of links) {
    const event = buildStockEvent(entry, link);
    await pgmq.send(`fila.sincronizacao.${link.marketplaceQueue}`, event);
  }

  await pgmq.send('fila.auditoria', buildAuditEvent(entry, links));
  await markOutboxProcessed(entry.id);
}
```

---

## 7. Eliminação de Race Conditions

### 7.1 Mapa de Race Conditions e Mitigações

| Race Condition | Cenário | Mitigação |
|---|---|---|
| Dupla dedução de estoque | Dois pedidos simultâneos para o mesmo produto | `pg_advisory_xact_lock` + `SELECT FOR UPDATE` nas RPCs v2 |
| Escrita fora de ordem no canal | Evento v5 chega antes de v7 ao canal | Provider rejeita eventos com `version ≤ último processado` |
| Dupla propagação (at-least-once) | Dispatcher re-enfileira após crash parcial | Idempotência por `event_id` no provider + verificação de `version` |
| Dual-Write (banco vs. broker) | Banco atualizado mas fila não notificada | Transactional Outbox na mesma transação das RPCs v2 |
| Estoque negativo no banco | Validação aplicacional falha | CHECK CONSTRAINT `current >= COALESCE(reserved, 0)` no banco |
| Concorrência no ML `x-version` | Dois workers tentam PUT com a mesma version | 409 → re-GET → retry com nova version |
| Token inválido durante pico | Token expira entre enqueue e execução | Provider faz refresh e retry; se refresh falhar, DLQ |
| Fila de um canal trava todas | ML degradado → workers travados | Bulkhead: filas isoladas por canal; Circuit Breaker por canal |

### 7.2 Contrato de Idempotência por Provider

Cada provider deve manter, por `(integration_id, marketplace_item_id, variation_id)`, o último `version` processado com sucesso. Evento com `version ≤ último processado` é descartado **sem erro** e **sem DLQ**. Este controle pode ser mantido em memória durante a vida da invocação ou em tabela dedicada para durabilidade entre invocações.

---

## 8. Rollout Faseado

### Fase 0 — Infraestrutura (Sem impacto em produção)

**Critério de início:** aprovação deste documento.  
**Duração estimada:** 1 sprint (2 semanas).

- [ ] Migrations 1–7 aplicadas no banco.
- [ ] `IStockChannelAdapter.ts` criada em `_shared/domain/stock/ports/`.
- [ ] `StockAdapterRegistry` criado em `_shared/adapters/stock/registry.ts`.
- [ ] `providers/_template.ts` criado com guia de implementação.
- [ ] `stock_sync_outbox` populado pelas RPCs v2 (com flag `processed = false`).
- [ ] `stock-sync-dispatcher` deployed em modo **shadow** (lê outbox, loga eventos, não enfileira nas filas de canal ainda).

**Critério de conclusão:** dispatcher em shadow mode processando outbox sem erros por 48 horas.

---

### Fase 1 — Provider Shopee (Canal Piloto)

**Critério de início:** Fase 0 concluída.  
**Duração estimada:** 1 sprint (2 semanas).

- [ ] `ShopeeStockProvider` implementado em `providers/shopee.ts`.
- [ ] `shopee-update-stock/index.ts` refatorado para wrapper fino.
- [ ] `stock-sync-worker` deployed.
- [ ] Dispatcher em modo ativo para `fila.sincronizacao.shopee`.
- [ ] Validação: pedidos Shopee → estoque desconta no ERP → evento no outbox → propagação para Shopee API.
- [ ] Monitorar: taxa de sucesso > 99%, latência P99 < 90s, DLQ vazia.
- [ ] Invocação direta do `shopee-update-stock` pelo frontend mantida como fallback durante esta fase.

**Critério de conclusão:** 7 dias em produção com métricas estáveis.

---

### Fase 2 — Provider Mercado Livre

**Critério de início:** Fase 1 concluída.  
**Duração estimada:** 2 sprints (4 semanas, por complexidade do roteamento por logística).

- [ ] `MercadoLivreStockProvider` implementado em `providers/mercado-livre.ts`.
- [ ] Árvore de decisão de endpoint testada para cada cenário: sem multi-origem, `seller_warehouse`, `selling_address`, Full (skip).
- [ ] `mercado-livre-update-stock/index.ts` criado como wrapper fino.
- [ ] Bloco de `available_quantity` removido de `mercado-livre-update-item-fields`.
- [ ] Dispatcher ativo para `fila.sincronizacao.mercadolivre`.
- [ ] Teste explícito de sellers MLB com `warehouse_management`.
- [ ] Monitorar `x-version` conflicts (409) e taxa de fallback para `/items`.

**Critério de conclusão:** 14 dias em produção, taxa de sucesso > 98%, sem 400 `Missing X-Version`.

---

### Fase 3 — Consolidação e Reconciliação

**Critério de início:** Fase 2 concluída.  
**Duração estimada:** 1 sprint (2 semanas).

- [ ] `stock-reconciliation-sweeper` ativado (pg_cron diário).
- [ ] `shopee-sync-fulfillment-stock` ativado com pg_cron (órfão resolvido).
- [ ] Invocação direta de `shopee-update-stock` pelo frontend removida ou redirecionada para fluxo ERP.
- [ ] Edição de estoque por canal na UI de Anúncios redirecionada para atualizar `products_stock` (ERP), não chamar API diretamente.
- [ ] Painel de DLQ exposto no Novura (`v_stock_sync_dlq`).
- [ ] Pipelines legados de pedidos marcados para descomissionamento.

**Critério de conclusão:** sweeper rodando por 30 dias sem alertas persistentes de drift.

---

## 9. Observabilidade e Métricas de Saúde

### 9.1 Métricas por Canal

| Métrica | Query de referência | Alerta se |
|---|---|---|
| Backlog de outbox | `SELECT count(*) FROM stock_sync_outbox WHERE processed = false` | > 1.000 por 5 min |
| Backlog de fila PGMQ | `SELECT * FROM pgmq.metrics('fila.sincronizacao.shopee')` | > 500 mensagens |
| Taxa de DLQ | `SELECT count(*) FROM v_stock_sync_dlq WHERE enqueued_at > now() - interval '1h'` | > 10 em 1h |
| Circuit Breaker aberto | `SELECT * FROM channel_circuit_state WHERE state != 'closed'` | Qualquer `OPEN` |
| Latência de propagação | `MAX(now() - created_at)` em `stock_sync_outbox WHERE processed = false` | > 5 min |

### 9.2 Indicadores de Qualidade da Sincronização

| Indicador | Definição | Meta |
|---|---|---|
| Taxa de sucesso de push | `pushes_ok / (pushes_ok + pushes_failed)` por canal | > 99% |
| Cobertura de vínculo | `produtos_com_vinculo / produtos_com_estoque_ativo` | > 95% |
| Latência P50 de propagação | Mediana do tempo outbox → confirmação API | < 60s |
| Latência P99 de propagação | Percentil 99 do tempo outbox → confirmação API | < 120s |

---

## 10. Checklist de Aceitação por Fase

### Fase 0
- [ ] Migrations aplicadas sem erro em staging e produção.
- [ ] `stock_sync_outbox` sendo populado pelas RPCs v2 em cada operação de estoque.
- [ ] Dispatcher em shadow mode logando eventos corretamente (vínculo presente/ausente).
- [ ] Nenhum `current` ou `reserved` lido pelo Motor de Integração.

### Fase 1 (Shopee)
- [ ] Pedido Shopee → reserva no ERP → outbox → fila Shopee → push para API Shopee confirmado.
- [ ] Pedido Shopee → sem vínculo → `sem_vinculo` no ledger → nenhuma chamada de API.
- [ ] Refresh de token funciona automaticamente sem DLQ.
- [ ] Evento com `version` inferior descartado sem erro e sem DLQ.

### Fase 2 (Mercado Livre)
- [ ] Seller sem multi-origem: `PUT /items/{id}` com `available_quantity` confirmado.
- [ ] Seller com `warehouse_management`: `PUT /user-products/{id}/stock/type/seller_warehouse` com `x-version` confirmado.
- [ ] Full (`meli_facility`): skip silencioso sem chamada de API.
- [ ] 409 version mismatch: re-GET + retry bem-sucedido.
- [ ] `mercado-livre-update-item-fields` continua atualizando título, preço e demais campos sem tocar estoque.

### Fase 3
- [ ] Sweeper detecta drift artificial criado em ambiente de teste e auto-corrige em ≤ 24h.
- [ ] DLQ exposta no painel com reprocessamento manual funcional.
- [ ] Métricas de latência dentro das metas definidas.

---

## Referências

- `docs/prds/PRD-SINCRONIZACAO-UNIVERSAL-ESTOQUE.md` — especificação técnica completa
- `docs/ENGINEERING_STANDARDS.md` — padrões obrigatórios de implementação
- `docs/WAREHOUSE_ARCHITECTURE.md` — arquitetura de armazéns e RPCs v2
- `docs/operations/adding-a-marketplace-provider.md` — padrão de provider OAuth (espelhado aqui para estoque)
- `supabase/functions/_shared/adapters/orders/SupabaseInventoryAdapter.ts` — implementação atual do Core
- `supabase/functions/shopee-update-stock/index.ts` — implementação atual a ser refatorada
- `supabase/functions/mercado-livre-update-item-fields/index.ts` — função preservada (remover apenas bloco de estoque)
- `supabase/migrations/20260414_000007_stock_rpcs_company_aware.sql` — RPCs v2 base a ser estendida
