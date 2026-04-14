# Warehouse Architecture — Documentação Técnica

Este documento descreve o sistema de armazéns do Novura, cobrindo schema de banco de dados, fluxo de ciclo de vida de pedidos, operações de estoque, fulfillment e relatório de auditoria.

---

## 1. Tipos de Armazém

| Tipo          | Descrição |
|---------------|-----------|
| `physical`    | Operado pelo seller. Suporta entrada, saída, reserva e consumo de estoque. |
| `fulfillment` | Operado pelo marketplace (ML Full, Shopee Full). Somente leitura — estoque sincronizado via API. |

---

## 2. Schema de Banco de Dados

### 2.1 Tabela `storage` (evoluída)

```sql
ALTER TABLE storage
  ADD COLUMN type            text    NOT NULL DEFAULT 'physical'
    CHECK (type IN ('physical', 'fulfillment')),
  ADD COLUMN integration_id  uuid    REFERENCES marketplace_integrations(id),
  ADD COLUMN marketplace_name text,
  ADD COLUMN is_auto_created boolean NOT NULL DEFAULT false,
  ADD COLUMN readonly        boolean NOT NULL DEFAULT false;
```

- `type`: distingue armazéns físicos (gerenciados pelo seller) de fulfillment (marketplace).
- `integration_id`: para armazéns fulfillment, referencia a integração que o originou.
- `readonly`: quando `true`, operações manuais de entrada/saída são bloqueadas na UI.

### 2.2 Tabela `integration_warehouse_config`

Mapeia cada integração de marketplace aos armazéns que ela deve usar.

```sql
CREATE TABLE integration_warehouse_config (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES organizations(id),
  integration_id         uuid NOT NULL REFERENCES marketplace_integrations(id),
  physical_storage_id    uuid NOT NULL REFERENCES storage(id),
  fulfillment_storage_id uuid          REFERENCES storage(id),
  marketplace_name       text,   -- denormalizado para buscas rápidas
  id_seller              text,   -- meli_user_id ou shop_id do vendedor
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, integration_id)
);
```

**Regras:**
- Uma organização pode ter múltiplas integrações do mesmo marketplace (ex: duas contas ML).
- Cada integração tem seu próprio armazém físico (`physical_storage_id`).
- `id_seller` identifica unicamente o vendedor dentro do marketplace.
- Se não houver configuração, o sistema usa o primeiro armazém físico ativo da organização como fallback.

### 2.3 Tabela `orders` (evoluída)

```sql
ALTER TABLE orders
  ADD COLUMN storage_id      uuid REFERENCES storage(id),
  ADD COLUMN integration_id  uuid REFERENCES marketplace_integrations(id);
```

- `storage_id`: armazém resolvido para este pedido (gravado por `ResolveOrderWarehouseUseCase`).
- `integration_id`: integração que originou o pedido (gravado por `orders-queue-worker`).

### 2.4 Tabela `inventory_transactions` (evoluída)

Registra cada movimentação de estoque. É a tabela central de auditoria.

```sql
ALTER TABLE inventory_transactions
  ADD COLUMN integration_id   uuid REFERENCES marketplace_integrations(id),
  ADD COLUMN marketplace_name text;
```

| Campo             | Descrição |
|-------------------|-----------|
| `organizations_id` | Tenant (organização) |
| `product_id`      | Produto movimentado |
| `storage_id`      | Armazém onde ocorreu a movimentação |
| `order_id`        | Pedido que originou a movimentação |
| `movement_type`   | `RESERVA`, `SAIDA`, `CANCELAMENTO_RESERVA`, `ENTRADA` |
| `quantity_change` | Positivo = entrada, negativo = saída/reserva |
| `integration_id`  | Integração que originou o pedido (para auditoria) |
| `marketplace_name`| Nome do marketplace (para auditoria) |
| `source_ref`      | Referência textual, ex: `PEDIDO[123]` |

### 2.5 Tabela `fulfillment_stock`

Estoque fulfillment sincronizado via API do marketplace.

```sql
CREATE TABLE fulfillment_stock (
  id                  uuid PRIMARY KEY,
  organization_id     uuid NOT NULL REFERENCES organizations(id),
  storage_id          uuid NOT NULL REFERENCES storage(id),
  product_id          uuid NOT NULL REFERENCES products(id),
  marketplace_item_id text NOT NULL,
  variation_id        text NOT NULL DEFAULT '',
  quantity            integer NOT NULL DEFAULT 0,
  last_synced_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_id, product_id, marketplace_item_id, variation_id)
);
```

### 2.6 View de Auditoria `v_inventory_audit`

View desnormalizada para relatórios de movimentação por produto, armazém e integração.

```sql
SELECT
  it.id, it.timestamp, it.organizations_id,
  it.product_id,   p.name  AS product_name,
  it.storage_id,   s.name  AS storage_name,   s.type AS storage_type,
  it.order_id,     o.marketplace_order_id,
  it.integration_id, mi.marketplace_name AS integration_marketplace,
  it.marketplace_name,
  it.movement_type, it.quantity_change, it.source_ref
FROM inventory_transactions it
LEFT JOIN products p              ON p.id  = it.product_id
LEFT JOIN storage s               ON s.id  = it.storage_id
LEFT JOIN orders o                ON o.id  = it.order_id
LEFT JOIN marketplace_integrations mi ON mi.id = it.integration_id;
```

---

## 3. Fluxo Completo do Ciclo de Vida do Pedido

### 3.1 Diagrama de Sequência

```
Marketplace Webhook
  → Vercel API route
    → orders-queue-worker (pg_cron, cada 30s)

orders-queue-worker:
  1. Fetch full order from marketplace API
  2. Normalize (MlOrderNormalizeService / ShopeeOrderNormalizeService)
  3. OrdersUpsertAdapter.upsert()          → persiste orders + order_items
  4. resolveAndPersistWarehouse()
       → ResolveOrderWarehouseUseCase
         → SupabaseWarehouseResolver.resolveForOrder()
           → SELECT integration_warehouse_config WHERE integration_id = ?
           → fallback: primeiro storage físico ativo da org
       → UPDATE orders SET storage_id = ?, integration_id = ?
  5. RecalculateOrderStatusUseCase.execute()
       → lê order atualizado (com storage_id e integration_id)
       → HandleStockSideEffectsUseCase.reserveIfNeeded()
           → se status ∈ {invoice_pending, ready_to_print, awaiting_pickup}:
               reserve_stock_for_order_v2(order_id, storage_id)
       → UPDATE orders SET status = ?
       → HandleStockSideEffectsUseCase.handleAsyncEffects()
           → se status = shipped:
               consume_stock_for_order_v2(order_id, NULL)
                 [RPC resolve: p_storage_id → orders.storage_id → org default]
           → se status ∈ {cancelled, returned}:
               refund_stock_for_order_v2(order_id, NULL)
                 [RPC resolve: p_storage_id → orders.storage_id → org default]
```

### 3.2 Resolução de Armazém (Priority Chain)

Para cada operação de estoque (reserve, consume, refund):

```
1. p_storage_id (parâmetro explícito) — quando chamado diretamente com storage específico
2. orders.storage_id                  — definido por ResolveOrderWarehouseUseCase
3. integration_warehouse_config       — configurado pelo usuário no módulo Aplicativos
4. Primeiro storage físico ativo da org (fallback de segurança)
```

> **Importante:** O passo 4 (resolveAndPersistWarehouse) ocorre ANTES do passo 5 (recalculate) dentro do `orders-queue-worker`. Isso garante que quando `HandleStockSideEffectsUseCase` roda, `orders.storage_id` já está definido.

### 3.3 RPCs de Estoque (v2)

Todos os RPCs são **idempotentes** — verificam existência de transação antes de agir.

| RPC | Trigger | `movement_type` |
|-----|---------|-----------------|
| `reserve_stock_for_order_v2(order_id, storage_id)` | Status → `invoice_pending`, `ready_to_print`, `awaiting_pickup` | `RESERVA` |
| `consume_stock_for_order_v2(order_id, NULL)` | Status → `shipped` | `SAIDA` |
| `refund_stock_for_order_v2(order_id, NULL)` | Status → `cancelled`, `returned` | `CANCELAMENTO_RESERVA` |

Cada RPC:
1. Lê `organization_id`, `storage_id`, `integration_id`, `marketplace` da tabela `orders`
2. Aplica a priority chain de storage se `p_storage_id = NULL`
3. Itera os `order_items` vinculados ao pedido
4. Atualiza `products_stock.reserved` / `products_stock.current`
5. Insere em `inventory_transactions` com `integration_id` + `marketplace_name`

---

## 4. Configuração de Armazém por Integração (Frontend)

### 4.1 Onde Configurar

O usuário configura o armazém de cada integração no **módulo Aplicativos** (`/apps`):

1. Clicar em "Configurar Estoque" (ícone Warehouse) no card do aplicativo conectado
2. `WarehouseConfigModal` abre com dropdown de armazéns da organização
3. Selecionar armazém físico e salvar
4. O sistema grava em `integration_warehouse_config` com `marketplace_name` + `id_seller`

### 4.2 Service Layer (`warehouse.service.ts`)

```typescript
// Busca config atual da integração
fetchWarehouseConfig(orgId, integrationId): Promise<WarehouseConfigFull | null>

// Salva/atualiza a config (upsert por organization_id + integration_id)
upsertWarehouseConfig(orgId, integrationId, physicalStorageId, fulfillmentStorageId)
  // Internamente: busca marketplace_name + id_seller de marketplace_integrations
  //               e inclui no payload do upsert

// Lista todos os armazéns ativos da org
fetchAllActiveStorage(orgId): Promise<StorageOption[]>
```

### 4.3 Hooks (`useWarehouseConfig.ts`)

```typescript
useWarehouseConfig(integrationId)     // Carrega config existente
useAllActiveStorage()                  // Lista armazéns para o dropdown
useWarehouseConfigMutation()           // Salva config
```

---

## 5. Estoque Fulfillment

### 5.1 Sincronização

| Marketplace | Edge Function | Fonte |
|-------------|--------------|-------|
| ML Full | `mercado-livre-sync-stock-distribution` | API ML (`logistic_type = fulfillment`) |
| Shopee Full | `shopee-sync-fulfillment-stock` | API Shopee SLS |

Ambas fazem upsert em `fulfillment_stock` via `SupabaseFulfillmentStockAdapter`.

### 5.2 Visualização Frontend

- **`FulfillmentTab`** (em `Inventory.tsx`): cards por armazém fulfillment + tabela de produtos
- **`ListingCard`**: anúncios com `shipping_tag = "full"` exibem `fulfillmentQty`

---

## 6. Tabela de Arquivos

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `supabase/migrations/20260414_000002_warehouse_architecture.sql` | Novo | Schema base: storage evoluído, integration_warehouse_config, fulfillment_stock, orders.storage_id |
| `supabase/migrations/20260414_000004_integration_warehouse_identity.sql` | Novo | Adiciona marketplace_name + id_seller a integration_warehouse_config |
| `supabase/migrations/20260414_000005_fix_inventory_flow.sql` | Novo | Adiciona integration_id a orders + inventory_transactions; corrige FK inventory_jobs; atualiza RPCs v2 com audit columns; cria view v_inventory_audit |
| `supabase/functions/_shared/domain/warehouse/WarehouseType.ts` | Novo | Enum de tipos de armazém |
| `supabase/functions/_shared/domain/warehouse/WarehouseConfig.ts` | Novo | Tipos do domínio de warehouse |
| `supabase/functions/_shared/domain/orders/ports/IWarehouseResolverPort.ts` | Novo | Porta de resolução de armazém |
| `supabase/functions/_shared/domain/orders/ports/IInventoryPort.ts` | Modificado | Substituiu enqueueConsume/RefundStock por consumeStock/refundStock (síncronos, idempotentes) |
| `supabase/functions/_shared/domain/orders/ports/IOrderRepository.ts` | Modificado | Adicionado storageId ao OrderRecord |
| `supabase/functions/_shared/adapters/warehouse/SupabaseWarehouseResolver.ts` | Novo | Consulta integration_warehouse_config com fallback |
| `supabase/functions/_shared/adapters/warehouse/SupabaseFulfillmentStockAdapter.ts` | Novo | Upsert em fulfillment_stock |
| `supabase/functions/_shared/adapters/orders/SupabaseInventoryAdapter.ts` | Modificado | Implementa consumeStock + refundStock via RPCs v2 |
| `supabase/functions/_shared/adapters/orders/SupabaseOrderRepository.ts` | Modificado | Seleciona e mapeia storage_id do OrderRecord |
| `supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.ts` | Modificado | Removido handleStockTransition (evitava dupla execução com storage errado) |
| `supabase/functions/_shared/application/orders/ResolveOrderWarehouseUseCase.ts` | Novo | Orquestra resolução de armazém |
| `supabase/functions/_shared/application/orders/HandleStockSideEffectsUseCase.ts` | Modificado | handleAsyncEffects chama consumeStock/refundStock síncronos (não mais fila) |
| `supabase/functions/orders-queue-worker/index.ts` | Modificado | Persiste integration_id no pedido; resolveAndPersistWarehouse antes de recalculate |
| `supabase/functions/inventory-jobs-worker/index.ts` | Modificado | Dual-lookup (orders + legacy); RPCs v2 com storage_id correto |
| `supabase/functions/mercado-livre-sync-stock-distribution/index.ts` | Modificado | Popula fulfillment_stock |
| `supabase/functions/shopee-sync-fulfillment-stock/index.ts` | Novo | Sincroniza fulfillment_stock para Shopee Full |
| `src/services/warehouse.service.ts` | Novo | CRUD de integration_warehouse_config + storage |
| `src/hooks/useWarehouseConfig.ts` | Novo | React Query wrappers para warehouse service |
| `src/components/apps/WarehouseConfigModal.tsx` | Novo | Modal de configuração de armazém por integração |
| `src/components/apps/ConnectedAppCard.tsx` | Modificado | Botão "Configurar Estoque" que abre WarehouseConfigModal |
| `src/components/inventory/StorageManagementDrawer.tsx` | Modificado | Campo Tipo (Físico/Fulfillment) ao criar/editar armazém |
| `src/components/inventory/tabs/FulfillmentTab.tsx` | Modificado | Aba de estoque fulfillment |
| `src/pages/Inventory.tsx` | Modificado | FulfillmentTab integrada como aba real |
| `src/pages/Apps.tsx` | Modificado | Passa integrationId para ConnectedAppCard; removido filtro is_active inexistente |

---

## 7. Decisões de Design

### Por que consumeStock/refundStock são síncronos (não fila)?

A fila `inventory_jobs` tinha um FK para a tabela legada `marketplace_orders_presented_new`. Pedidos do novo pipeline (tabela `orders`) causavam FK violation ao tentar enfileirar. Além disso, o `inventory-jobs-worker` usava RPCs legados sem resolução de storage_id.

A solução foi chamar os RPCs v2 diretamente em `handleAsyncEffects`. Os RPCs são **idempotentes** (verificam a existência de transação antes de agir), então chamadas duplicadas são seguras. O `inventory-jobs-worker` continua ativo para processar jobs legados.

### Por que `handleStockTransition` foi removido do `orders-upsert-adapter`?

Existia dupla execução: o adapter chamava consume/refund diretamente com `fn_get_default_storage` (ignorando a config por integração), e depois `RecalculateOrderStatusUseCase` também disparava via `handleAsyncEffects`. Isso causava:
1. Dedução de estoque do armazém errado (padrão em vez do configurado)
2. Tentativa de dupla dedução

A solução é ter um único caminho: `RecalculateOrderStatusUseCase` → `HandleStockSideEffectsUseCase`, que roda DEPOIS que `orders.storage_id` já foi resolvido.

### Por que `orders.storage_id` é persistido antes do `recalculate`?

`resolveAndPersistWarehouse` grava `storage_id` e `integration_id` no pedido. O `recalculate` subsequente lê o pedido atualizado e passa `order.storageId` para `reserveStockNow`. Para consume/refund, os RPCs passam `p_storage_id = NULL` e o banco resolve via `orders.storage_id` — garantindo que mesmo o primeiro webhook de um pedido já usa o armazém correto.
