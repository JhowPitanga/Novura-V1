# Fluxo Detalhado — Status "Enviado"

> Documentação completa do ciclo de vida de um pedido até atingir o status **Enviado**, incluindo webhook, edge functions, triggers, tabelas, vinculação de produtos e consumo de estoque.

---

## 1. Visão Geral do Fluxo

```
Marketplace (Shopee / Mercado Livre)
  │
  ▼
Webhook (Vercel API route)
  │
  ▼
Edge Function: orders-webhook → enfileira em orders_sync_queue
  │
  ▼
Edge Function: orders-queue-worker (pg_cron, a cada 30s)
  │
  ├─ Mercado Livre → orders-sync-ml → MlOrderNormalizeService
  └─ Shopee        → orders-sync-shopee → ShopeeOrderNormalizeService
        │
        ▼
  OrdersUpsertAdapter → upsert em orders, order_items, order_shipping
        │
        ▼
  [Paralelamente] marketplace_orders_raw upsert
        │
        ▼
  TRIGGER: process_marketplace_order_presented_new()
        │
        ▼
  Calcula status_interno (pode ser "Enviado", "A vincular", etc.)
        │
        ▼
  INSERT/UPDATE em marketplace_orders_presented_new
        │
        ▼
  TRIGGER: trg_presented_new_stock_flow
        │
        ▼
  Se status_interno = 'Enviado' → cria inventory_job (type: 'consume')
        │
        ▼
  inventory-jobs-worker → consume_reserved_stock_for_order()
        │
        ▼
  Frontend exibe pedido na aba "Enviado"
```

---

## 2. Camada de Webhook (Entrada)

### 2.1 Vercel API Routes (proxy fino)

| Arquivo | Marketplace |
|---------|-------------|
| `api/mercado-livre-webhook.ts` | Mercado Livre |
| `api/shopee-webhook.ts` | Shopee |

Essas rotas apenas validam a assinatura do marketplace e repassam o payload para a Edge Function `orders-webhook` no Supabase. Retornam `200` imediatamente, sem fazer chamadas à API do marketplace.

### 2.2 Edge Function: `orders-webhook`

**Arquivo**: `supabase/functions/orders-webhook/index.ts`

- Recebe o payload mínimo (ex: `marketplace_order_id`, `shop_id`)
- Insere uma mensagem na tabela `orders_sync_queue`
- Não faz fetch na API do marketplace — apenas enfileira

---

## 3. Sincronização e Normalização

### 3.1 Worker de Fila

**Arquivo**: `supabase/functions/orders-queue-worker/index.ts`

- Roda a cada 30 segundos via `pg_cron`
- Consome mensagens de `orders_sync_queue`
- Roteia para a função de sync específica do marketplace

### 3.2 Sync por Marketplace

| Marketplace | Edge Function | Normalizer |
|-------------|---------------|------------|
| Mercado Livre | `orders-sync-ml/index.ts` | `MlOrderNormalizeService` |
| Shopee | `orders-sync-shopee/index.ts` | `ShopeeOrderNormalizeService` |

**Arquivos dos normalizers**: `supabase/functions/_shared/orders-normalize/`

O normalizer produz um `NormalizedOrder` com campos padronizados:
- `marketplace_status` — status bruto do marketplace (ex: `"paid"`, `"shipped"`)
- `status` — status interno do seller (calculado depois, pelo trigger)
- `shipped_at` — extraído de `date_shipped` (ML) ou timestamp de status (Shopee)
- Items, shipping, buyer, valores monetários

### 3.3 Upsert nas Tabelas do Ciclo 0

**Arquivo**: `supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.ts`

Faz upsert nas seguintes tabelas (constraint único: `organization_id + marketplace + marketplace_order_id`):

| Tabela | Conteúdo |
|--------|----------|
| `orders` | Dados principais do pedido |
| `order_items` | Itens do pedido com `product_id`, `sku`, `marketplace_item_id` |
| `order_shipping` | Info de envio: `status`, `substatus`, `tracking_number`, `carrier` |
| `order_status_history` | Log append-only de mudanças de status |

**Paralelamente**, o payload bruto completo é gravado em `marketplace_orders_raw` via RPC `upsert_marketplace_order_raw()`.

---

## 4. Trigger de Materialização — O Coração do Status

### 4.1 Trigger

**Arquivo**: `supabase/migrations/20251205_create_materialize_orders_trigger.sql`

```
TRIGGER: on_marketplace_orders_raw_change_new
EVENTO: AFTER INSERT OR UPDATE em marketplace_orders_raw
FUNÇÃO: process_marketplace_order_presented_new()
```

### 4.2 Cálculo do `status_interno`

A função PL/pgSQL (500+ linhas) extrai dados do JSONB bruto e calcula o status interno seguindo esta **ordem de prioridade** (de cima para baixo, o primeiro match vence):

| Prioridade | Condição | status_interno |
|------------|----------|----------------|
| 1 | Cancelado ou reembolsado | `'Cancelado'` |
| 2 | Devolvido | `'Devolução'` |
| 3 | `shipment_status = 'pending'` + `substatus = 'buffered'` + **tem itens não vinculados** | `'A vincular'` |
| 4 | `logistic_type = 'fulfillment'` (ML Full) | `'Enviado'` ⚠️ |
| 5 | **Tem itens não vinculados** (qualquer outro status) | `'A vincular'` |
| 6 | `shipment_status = 'pending'` + `substatus = 'buffered'` | `'Impressao'` |
| 7 | `shipment_status = 'ready_to_ship'` + `substatus = 'invoice_pending'` | `'Emissao NF'` |
| 8 | `shipment_status = 'ready_to_ship'` + `substatus = 'ready_to_print'` | `'Impressao'` |
| 9 | `shipment_status = 'ready_to_ship'` + etiqueta impressa | `'Aguardando Coleta'` |
| 10 | `shipment_status = 'ready_to_ship'` + `substatus = 'dropped_off'` + pago | `'Enviado'` |
| 11 | `shipment_status IN ('shipped', 'dropped_off', 'in_transit', 'handed_to_carrier', 'on_route', 'out_for_delivery', 'delivery_in_progress', 'collected', 'delivered')` | `'Enviado'` |
| 12 | Nenhuma condição acima | `'Pendente'` |

**Shopee** adiciona:
- `shipment_status IN ('shipped', 'to_confirm_receive', 'completed')` → `'Enviado'`
- `pickup_done = true` → `'Enviado'`

### 4.3 Quando um pedido é "Enviado"

Um pedido recebe `status_interno = 'Enviado'` quando:

1. **Fulfillment (ML Full)** — `logistic_type = 'fulfillment'`. Pula "A vincular" mesmo com itens não vinculados (prioridade 4, acima da 5).
2. **Marketplace reportou envio** — `shipment_status` é um dos: `shipped`, `dropped_off`, `in_transit`, `handed_to_carrier`, `on_route`, `out_for_delivery`, `delivery_in_progress`, `collected`, `delivered`.
3. **Ready to ship + dropped off + pago** — Pedido pronto, já entregue ao transportador e pago.
4. **Shopee: pickup concluído** — `pickup_done = true`.

> **Importante**: Pedidos Fulfillment (ML Full) são a exceção — eles vão direto para "Enviado" sem passar por "A vincular", mesmo que tenham itens sem vínculo. Isso porque o ML Full gerencia o estoque e envio internamente.

---

## 5. Determinação de "A Vincular" — Vinculação de Produtos

### 5.1 O que é um item "não vinculado"?

Um item do pedido é considerado **não vinculado** se TODAS estas condições forem verdadeiras:
- `product_id IS NULL` (nenhum produto interno associado)
- `seller_sku_text = ''` (o anúncio no marketplace não tem SKU do vendedor)
- `item_id_text <> ''` (o item tem um ID válido)

### 5.2 Fontes de vinculação

O trigger verifica **duas fontes** para tentar vincular automaticamente:

| Fonte | Tabela | Tipo |
|-------|--------|------|
| Vínculo permanente | `marketplace_item_product_links` | Persistente entre pedidos |
| Vínculo efêmero | `marketplace_orders_presented_new.linked_products` (JSONB) | Apenas para aquele pedido |

**Lookup do vínculo permanente**: `(organizations_id, marketplace_name, marketplace_item_id, variation_id)` → retorna `product_id`.

Se o item é encontrado em qualquer uma dessas fontes, ele é considerado **vinculado** e `product_id` é preenchido.

### 5.3 Resultado

- `v_unlinked_items_count` — contagem de itens sem vínculo
- `v_has_unlinked_items` — booleano
- Se `has_unlinked_items = true` → `status_interno = 'A vincular'` (a menos que seja Fulfillment, cancelado ou devolvido)

### 5.4 Quem faz a vinculação?

**A vinculação é feita pelo usuário no frontend**, através do modal de vinculação:

**Componente**: `src/components/orders/LinkOrderModal.tsx`

Fluxo:
1. Usuário abre o pedido na aba "A vincular"
2. Modal lista itens com `has_unlinked_items = true`
3. Usuário seleciona produto do catálogo interno via `ProductPickerDialog`
4. Opcional: marca "Vincular permanente" (para que pedidos futuros com o mesmo anúncio sejam vinculados automaticamente)
5. Ao salvar:
   - Se permanente → upsert em `marketplace_item_product_links`
   - Atualiza `order_items.product_id`
   - Chama RPC `fn_order_reserva_stock_linked` → reserva estoque
   - Recalcula `status_interno` via edge function `process-presented`

**Edge Function alternativa**: `supabase/functions/linked_products_item/index.ts`
- Endpoint programático para vinculação
- Verifica estoque disponível antes de permitir
- Atualiza `marketplace_order_items.linked_products`
- Chama `reserve_stock_for_order()` → reserva estoque
- Dispara recálculo de status

### 5.5 Saída do "A Vincular"

Quando todos os itens são vinculados:
- `has_unlinked_items` → `false`
- Status recalcula para o próximo da fila de prioridade:
  - `'Emissao NF'` (se `ready_to_ship` + `invoice_pending`)
  - `'Impressao'` (se `ready_to_ship` + `buffered`)
  - `'Aguardando Coleta'` (se etiqueta já impressa)
  - `'Enviado'` (se marketplace já reportou envio)
  - `'Pendente'` (fallback)

---

## 6. Trigger de Estoque — O que acontece ao virar "Enviado"

### 6.1 Trigger

**Arquivo**: `supabase/migrations/20251208_presented_new_inventory_on_cancel_trigger.sql`

```
TRIGGER: trg_presented_new_stock_flow
EVENTO: AFTER UPDATE em marketplace_orders_presented_new
DETECTA: mudanças em status_interno, status, shipment_status, shipment_substatus, has_unlinked_items
```

### 6.2 Ações por Status

| Novo status_interno | Ação | job_type |
|---------------------|------|----------|
| `'Emissao NF'`, `'Impressao'`, `'Aguardando Coleta'` (sem itens não vinculados) | Reservar estoque | `'reserve'` |
| **`'Enviado'`** | **Consumir estoque reservado** | **`'consume'`** |
| Cancelado / Reembolsado | Devolver estoque reservado | `'refund'` |

### 6.3 Consumo de Estoque (Enviado)

O trigger cria um registro em `inventory_jobs` com `job_type = 'consume'`. O worker `inventory-jobs-worker` processa e chama:

**Função**: `consume_reserved_stock_for_order(p_order_id, p_storage_id)`

```sql
-- Para cada item do pedido com reserva:
products_stock.reserved  -= quantidade_reservada
products_stock.current   -= quantidade_do_item

-- Registra transação:
INSERT INTO inventory_transactions (movement_type = 'SAIDA')
```

- Idempotente: só processa se existe reserva prévia
- Usa `FOR UPDATE` lock na `products_stock` para garantir atomicidade

---

## 7. Tabelas Envolvidas

### Tabelas do Ciclo 0 (novas)

| Tabela | Finalidade | Campos-chave |
|--------|-----------|--------------|
| `orders` | Pedidos normalizados | `marketplace_status`, `status`, `shipped_at`, `marketplace_order_id` |
| `order_items` | Itens do pedido | `marketplace_item_id`, `sku`, `product_id`, `quantity` |
| `order_shipping` | Info de envio | `status`, `substatus`, `tracking_number`, `carrier` |
| `order_status_history` | Log de mudanças | `from_status`, `to_status`, `changed_at`, `source` |
| `order_labels` | Etiquetas de envio | `label_type`, `content_base64` |

### Tabelas Legacy (ainda ativas)

| Tabela | Finalidade | Campos-chave |
|--------|-----------|--------------|
| `marketplace_orders_raw` | Payload bruto JSONB | `order_items`, `shipments`, `data`, `status` |
| `marketplace_orders_presented_new` | Visão materializada | `status_interno`, `has_unlinked_items`, `linked_products`, `shipment_status` |
| `marketplace_order_items` | Itens (legacy) | `linked_products`, `has_unlinked_items`, `model_sku_externo` |

### Tabelas de Suporte

| Tabela | Finalidade |
|--------|-----------|
| `marketplace_item_product_links` | Vínculos permanentes entre anúncios e produtos internos |
| `products_stock` | Estoque: `current`, `reserved`, `available` |
| `inventory_transactions` | Log de movimentações (`RESERVA`, `SAIDA`, `CANCELAMENTO_RESERVA`) |
| `inventory_jobs` | Fila async de jobs de estoque |
| `orders_sync_queue` | Fila de pedidos para sincronizar |

---

## 8. Mapeamento de Status por Marketplace

### Mercado Livre

| shipment_status | shipment_substatus | status_interno |
|-----------------|-------------------|----------------|
| `pending` | `buffered` | `Impressao` (ou `A vincular`) |
| `ready_to_ship` | `invoice_pending` | `Emissao NF` |
| `ready_to_ship` | `ready_to_print` | `Impressao` |
| `ready_to_ship` | (etiqueta impressa) | `Aguardando Coleta` |
| `ready_to_ship` | `dropped_off` + pago | **`Enviado`** |
| `shipped` | * | **`Enviado`** |
| `delivered` | * | **`Enviado`** |
| `in_transit` | * | **`Enviado`** |
| `handed_to_carrier` | * | **`Enviado`** |
| (qualquer) | (fulfillment) | **`Enviado`** |

### Shopee

| order_status / logistics_status | status_interno |
|--------------------------------|----------------|
| `READY_TO_SHIP` | `Impressao` |
| `SHIPPED` | **`Enviado`** |
| `to_confirm_receive` | **`Enviado`** |
| `COMPLETED` | **`Enviado`** |
| `pickup_done = true` | **`Enviado`** |

---

## 9. Frontend — Exibição do Status

### Aba "Enviado" na página de Pedidos

**Arquivo**: `src/pages/Orders.tsx`

- Tab `enviado` com label "Enviado" e badge de contagem
- Filtros específicos: `ShippedFilterBar` com marketplace e tipo de envio
- Normalização case-insensitive via `normStatus()` em `src/hooks/useOrderFiltering.ts`

### Cores e Badges

**Arquivo**: `src/utils/orderUtils.ts`

| Status | Cor |
|--------|-----|
| `A vincular` | Amarelo (warning) |
| `Emissao NF` | Laranja |
| `Impressao` | Roxo |
| `Aguardando Coleta` | Azul |
| **`Enviado`** | **Verde (success)** |
| `Entregue` | Verde escuro |
| `Cancelado` | Vermelho |

---

## 10. Diagrama de Referência Cruzada de Arquivos

```
WEBHOOK
├── api/shopee-webhook.ts
├── api/mercado-livre-webhook.ts
└── supabase/functions/orders-webhook/index.ts

SYNC & NORMALIZAÇÃO
├── supabase/functions/orders-queue-worker/index.ts
├── supabase/functions/orders-sync-ml/index.ts
├── supabase/functions/orders-sync-shopee/index.ts
├── supabase/functions/_shared/orders-normalize/ml-order-normalize-service.ts
├── supabase/functions/_shared/orders-normalize/shopee-order-normalize-service.ts
└── supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.ts

TRIGGERS & FUNCTIONS (banco)
├── supabase/migrations/20251205_create_materialize_orders_trigger.sql
│   └── process_marketplace_order_presented_new()  ← calcula status_interno
├── supabase/migrations/20251208_presented_new_inventory_on_cancel_trigger.sql
│   ├── trg_presented_new_stock_flow  ← consume/reserve/refund estoque
│   └── trg_presented_new_inventory_on_cancel
└── supabase/migrations/20251229_fn_order_reserva_stock_linked.sql
    └── fn_order_reserva_stock_linked()  ← vincula + reserva

VINCULAÇÃO
├── supabase/functions/linked_products_item/index.ts
├── src/components/orders/LinkOrderModal.tsx
└── src/hooks/useLinkOrderStorage.ts

FRONTEND
├── src/pages/Orders.tsx
├── src/hooks/useOrderFiltering.ts
├── src/utils/orderUtils.ts
├── src/types/orders.ts
├── src/components/orders/ShippedFilterBar.tsx
└── src/components/orders/OrderGeneralInfo.tsx
```

---

## 11. Resumo Executivo

1. **Entrada**: Marketplace envia webhook → Vercel repassa → Edge Function enfileira em `orders_sync_queue`.
2. **Sync**: Worker consome fila → busca detalhes na API do marketplace → normaliza → upsert em `orders` + `order_items` + `order_shipping` + `marketplace_orders_raw`.
3. **Materialização**: Trigger `process_marketplace_order_presented_new()` dispara no INSERT/UPDATE de `marketplace_orders_raw` e calcula `status_interno` baseado em `shipment_status`, `shipment_substatus`, `logistic_type` e `has_unlinked_items`.
4. **"A vincular"**: Se itens não têm `product_id` e não têm `seller_sku`, o pedido fica como "A vincular". **A vinculação é manual**, feita pelo usuário no `LinkOrderModal`. Vínculos permanentes (tabela `marketplace_item_product_links`) fazem com que pedidos futuros do mesmo anúncio sejam vinculados automaticamente.
5. **"Enviado"**: Atingido quando o marketplace reporta envio (`shipped`, `in_transit`, `delivered`, etc.) ou quando é Fulfillment (ML Full). O trigger `trg_presented_new_stock_flow` cria um `inventory_job` de consumo que decrementa `products_stock.current` e `products_stock.reserved`.
6. **Exceção Fulfillment**: Pedidos ML Full vão direto para "Enviado" sem passar por "A vincular", pois o estoque e envio são gerenciados pelo Mercado Livre.
