# Fluxo Detalhado — Status "Cancelado"

> Documentacao completa do ciclo de vida de um pedido quando atinge o status **Cancelado**, incluindo webhook, edge functions, triggers, tabelas, vinculacao de produtos, estorno de estoque e cancelamento de NF-e.

---

## 1. Visao Geral do Fluxo

```
Marketplace (Shopee / Mercado Livre)
  │  (envia notificacao de cancelamento)
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
  Normalizer detecta marketplace_status = "cancelled"
  Seta canceled_at = timestamp do cancelamento
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
  status_interno = 'Cancelado' (PRIORIDADE 1 — mais alta)
        │
        ▼
  INSERT/UPDATE em marketplace_orders_presented_new
        │
        ▼
  TRIGGER: trg_presented_new_stock_flow
        │
        ▼
  Detecta cancelamento → refund_reserved_stock_for_order()
        │
        ▼
  Estoque reservado devolvido em products_stock
        │
        ▼
  Frontend exibe pedido na aba "Cancelado"
```

**Opcional (se NF-e ja emitida)**:
```
  Usuario aciona cancelamento de NF-e
        │
        ▼
  Edge Function: focus-nfe-cancel
        │
        ▼
  API Focus NFe → DELETE /v2/nfe/{reference}
        │
        ▼
  Atualiza tabela notas_fiscais com status "cancelada"
```

---

## 2. Camada de Webhook (Entrada)

### 2.1 Vercel API Routes (proxy fino)

| Arquivo | Marketplace |
|---------|-------------|
| `api/mercado-livre-webhook.ts` | Mercado Livre |
| `api/shopee-webhook.ts` | Shopee |

Essas rotas apenas validam a assinatura do marketplace e repassam o payload para a Edge Function `orders-webhook` no Supabase. Retornam `200` imediatamente, sem fazer chamadas a API do marketplace.

### 2.2 Edge Function: `orders-webhook`

**Arquivo**: `supabase/functions/orders-webhook/index.ts`

- Recebe o payload minimo (ex: `marketplace_order_id`, `shop_id`)
- Insere uma mensagem na tabela `orders_sync_queue`
- Nao faz fetch na API do marketplace — apenas enfileira

> **Importante**: O marketplace nao envia o status "cancelado" diretamente no webhook. O webhook apenas notifica que houve uma mudanca no pedido. O status real e buscado na etapa seguinte.

---

## 3. Sincronizacao e Normalizacao

### 3.1 Worker de Fila

**Arquivo**: `supabase/functions/orders-queue-worker/index.ts`

- Roda a cada 30 segundos via `pg_cron`
- Consome ate 10 mensagens de `orders_sync_queue` por execucao
- Roteia para a funcao de sync especifica do marketplace

### 3.2 Sync por Marketplace

| Marketplace | Edge Function | Normalizer |
|-------------|---------------|------------|
| Mercado Livre | `orders-sync-ml/index.ts` | `MlOrderNormalizeService` |
| Shopee | `orders-sync-shopee/index.ts` | `ShopeeOrderNormalizeService` |

**Arquivos dos normalizers**: `supabase/functions/_shared/orders-normalize/`

### 3.3 Deteccao de Cancelamento nos Normalizers

#### Mercado Livre (`ml-order-normalize-service.ts`)

```typescript
// Linha ~158
const canceled_at = statusFromApi === "cancelled"
  ? (lastUpdated ?? created_at)
  : null;
```

**Status do ML que indicam cancelamento**:
- `status = "cancelled"` — cancelamento direto
- Pagamento `status = "refunded"` — reembolso completo

O normalizer tambem verifica o `payment_status`. Se o pagamento foi reembolsado, o pedido e tratado como cancelado.

#### Shopee (`shopee-order-normalize-service.ts`)

```typescript
// Linha ~193-194
const canceled_at =
  marketplaceStatus === "cancelled"
    ? epochSecToIso(updateTime) ?? created_at
    : null;
```

**Status da Shopee que indicam cancelamento**:
- `CANCELLED` — cancelamento confirmado
- `IN_CANCEL` — cancelamento em andamento (tratado como cancelado)

### 3.4 Saida do Normalizer

O `NormalizedOrder` produzido contem:

```typescript
{
  marketplace_status: "cancelled",    // status bruto do marketplace
  status: null,                       // preenchido pelo trigger depois
  canceled_at: "2026-03-29T10:00:00Z", // timestamp do cancelamento
  // ... demais campos
}
```

### 3.5 Upsert nas Tabelas do Ciclo 0

**Arquivo**: `supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.ts`

Faz upsert nas seguintes tabelas (constraint unico: `organization_id + marketplace + marketplace_order_id`):

| Tabela | Conteudo |
|--------|----------|
| `orders` | Dados principais com `marketplace_status = 'cancelled'` e `canceled_at` preenchido |
| `order_items` | Itens do pedido (delete + insert) |
| `order_shipping` | Info de envio |
| `order_status_history` | Registro da transicao de status anterior → `cancelled` |

**Registro no historico** (linhas 164-177):
```typescript
// Se marketplace_status mudou:
INSERT INTO order_status_history {
  order_id,
  from_status: <status_anterior>,
  to_status: "cancelled",
  changed_at: now(),
  source: "webhook" | "sync"
}
```

**Paralelamente**, o payload bruto completo e gravado em `marketplace_orders_raw` via RPC `upsert_marketplace_order_raw()`.

---

## 4. Trigger de Materializacao — Calculo do Status Interno

### 4.1 Trigger

**Arquivo**: `supabase/migrations/20251205_create_materialize_orders_trigger.sql`

```
TRIGGER: on_marketplace_orders_raw_change_new
EVENTO: AFTER INSERT OR UPDATE em marketplace_orders_raw
FUNCAO: process_marketplace_order_presented_new()
```

### 4.2 Prioridade do "Cancelado" no Calculo de `status_interno`

A funcao PL/pgSQL calcula o status interno seguindo uma **ordem de prioridade**. **"Cancelado" tem a prioridade mais alta (1)** — se o pedido esta cancelado, nenhuma outra condicao importa:

| Prioridade | Condicao | status_interno |
|------------|----------|----------------|
| **1** | **Cancelado ou reembolsado** | **`'Cancelado'`** |
| 2 | Devolvido | `'Devolucao'` |
| 3 | Itens nao vinculados | `'A vincular'` |
| 4 | Fulfillment (ML Full) | `'Enviado'` |
| 5 | `ready_to_ship` + `invoice_pending` | `'Emissao NF'` |
| 6 | `ready_to_ship` + `ready_to_print` | `'Impressao'` |
| 7 | Etiqueta impressa | `'Aguardando Coleta'` |
| 8 | `shipped`, `in_transit`, etc. | `'Enviado'` |
| 9 | Nenhuma condicao acima | `'Pendente'` |

### 4.3 Deteccao de Cancelamento no Trigger

**Arquivo**: `supabase/migrations/20251208_fix_refresh_presented_order_cte.sql` (linhas 849-853)

O trigger verifica multiplas fontes para determinar se o pedido esta cancelado:

```sql
-- 1. Status do pedido
v_is_cancelled := lower(rec.status) = 'cancelled';

-- 2. Status dos pagamentos (array de pagamentos do ML)
v_is_cancelled := v_is_cancelled OR payments_agg.is_cancelled;

-- 3. Status do envio
v_is_cancelled := v_is_cancelled OR v_shipment_status = 'cancelled';

-- Resultado final
IF v_is_cancelled OR v_is_refunded THEN
  status_interno := 'Cancelado';
END IF;
```

**Para Shopee**, o trigger tambem verifica:
```sql
IF shipment_order_status IN ('cancelled', 'in_cancel') THEN
  status_interno := 'Cancelado';
END IF;
```

### 4.4 Resultado da Materializacao

O trigger faz UPSERT em `marketplace_orders_presented_new` com:

| Campo | Valor para Cancelado |
|-------|---------------------|
| `status_interno` | `'Cancelado'` |
| `status` | Status bruto do marketplace (ex: `'cancelled'`) |
| `shipment_status` | Status do envio (pode ser `'cancelled'`) |
| `has_unlinked_items` | `true/false` (irrelevante — Cancelado tem prioridade) |

> **Regra critica**: Mesmo que o pedido tenha itens nao vinculados (`has_unlinked_items = true`), se esta cancelado, o `status_interno` sera `'Cancelado'` — nunca `'A vincular'`.

---

## 5. Trigger de Estoque — Estorno Automatico

### 5.1 Trigger Principal

**Arquivo**: `supabase/migrations/20251208_presented_new_inventory_on_cancel_trigger.sql`

```
TRIGGER: trg_presented_new_stock_flow
EVENTO: AFTER UPDATE em marketplace_orders_presented_new
DETECTA: mudancas em status_interno, status, shipment_status, shipment_substatus, has_unlinked_items
```

### 5.2 Deteccao de Cancelamento no Trigger de Estoque

O trigger verifica **tres campos** para detectar cancelamento (linhas 60-82):

```sql
-- Para Shopee:
IF LOWER(COALESCE(NEW.status, '')) LIKE '%cancel%'
   OR LOWER(COALESCE(NEW.shipment_status, '')) IN ('cancelled', 'canceled')
   OR LOWER(COALESCE(NEW.shipment_substatus, '')) LIKE '%cancel%' THEN
  PERFORM refund_reserved_stock_for_order(NEW.id, v_storage);
END IF;

-- Para Mercado Livre: mesma logica
IF LOWER(COALESCE(NEW.status, '')) LIKE '%cancel%'
   OR LOWER(COALESCE(NEW.shipment_status, '')) IN ('cancelled', 'canceled')
   OR LOWER(COALESCE(NEW.shipment_substatus, '')) LIKE '%cancel%' THEN
  PERFORM refund_reserved_stock_for_order(NEW.id, v_storage);
END IF;
```

### 5.3 Trigger Legacy (ainda ativo)

**Arquivo**: `supabase/migrations/20251119160000_stock_triggers.sql` (linhas 19-50)

```
TRIGGER: trg_orders_presented_status_change
TABELA: marketplace_orders_presented (tabela antiga)
DETECTA: NEW.shipment_status LIKE '%cancel%' OR NEW.status = 'Cancelado'
ACAO: refund_reserved_stock_by_pack_id(NEW.pack_id, storage_id)
```

### 5.4 Funcao de Estorno de Estoque

**Funcao**: `refund_reserved_stock_for_order(p_order_id, p_storage_id)`

**Arquivo**: `supabase/migrations/20251119151000_inventory_transactions_functions.sql`

O que faz:
1. Itera sobre os itens do pedido em `marketplace_orders_raw`
2. Resolve `product_id` via `marketplace_item_product_links`
3. Atualiza `products_stock`:
   ```sql
   products_stock.reserved -= quantidade_reservada
   ```
4. Registra transacao de estorno:
   ```sql
   INSERT INTO inventory_transactions (
     movement_type = 'RESERVA',  -- quantidade negativa = estorno
     quantity = -quantidade_reservada,
     source_ref = 'PEDIDO[pack_id]'
   )
   ```

### 5.5 Acoes por Status (Comparacao)

| Novo status_interno | Acao de Estoque | Funcao |
|---------------------|-----------------|--------|
| `'Emissao NF'`, `'Impressao'`, `'Aguardando Coleta'` | Reservar estoque | `fn_order_reserva_stock_linked()` |
| `'Enviado'` | Consumir estoque reservado | `consume_reserved_stock_for_order()` |
| **`'Cancelado'`** | **Devolver estoque reservado** | **`refund_reserved_stock_for_order()`** |

> **Idempotencia**: O estorno so ocorre se havia estoque previamente reservado. Se o pedido foi cancelado antes de passar por reserva (ex: cancelado enquanto ainda era "A vincular"), nao ha estoque para devolver.

---

## 6. Cancelamento de NF-e (Opcional)

Se uma Nota Fiscal ja foi emitida para o pedido antes do cancelamento, o usuario pode cancelar a NF-e manualmente.

### 6.1 Edge Function: `focus-nfe-cancel`

**Arquivo**: `supabase/functions/focus-nfe-cancel/index.ts`

**Fluxo**:
1. Autentica o usuario e valida membership na organizacao
2. Busca o pedido em `marketplace_orders_presented`
3. Chama a API do Focus NFe: `DELETE /v2/nfe/{reference}`
4. Atualiza a tabela `notas_fiscais` com status de cancelamento

### 6.2 Mapeamento de Status da NF-e

**Arquivo**: `supabase/functions/_shared/domain/focus/focus-status.ts`

```typescript
// Linhas 12-20
if (norm === "cancelado" || norm === "cancelada") return "cancelada";
```

### 6.3 Tabela `notas_fiscais` / `invoices`

Apos o cancelamento:

| Campo | Valor |
|-------|-------|
| `status` | `'cancelada'` |
| `canceled_at` | Timestamp do cancelamento |

---

## 7. Determinacao de Vinculacao — Antes do Cancelamento

Mesmo para pedidos cancelados, o sistema calcula se os itens estao vinculados. Porem, **o cancelamento tem prioridade absoluta** sobre a vinculacao.

### 7.1 O que e um item "nao vinculado"?

Um item e considerado **nao vinculado** se TODAS estas condicoes forem verdadeiras:
- `product_id IS NULL` (nenhum produto interno associado)
- `seller_sku_text = ''` (o anuncio no marketplace nao tem SKU do vendedor)
- `item_id_text <> ''` (o item tem um ID valido)

### 7.2 Fontes de vinculacao automatica

| Fonte | Tabela | Tipo |
|-------|--------|------|
| Vinculo permanente | `marketplace_item_product_links` | Persistente entre pedidos |
| Vinculo efemero | `marketplace_orders_presented_new.linked_products` (JSONB) | Apenas para aquele pedido |
| Seller SKU | Dado do marketplace | Implicito — se tem SKU, nao e "nao vinculado" |

### 7.3 Quem vincula?

**A vinculacao e feita pelo usuario no frontend**, atraves do modal:

**Componente**: `src/components/orders/LinkOrderModal.tsx`

Fluxo:
1. Usuario abre o pedido na aba "A vincular"
2. Modal lista itens sem vinculo
3. Usuario seleciona produto do catalogo via `ProductPickerDialog`
4. Opcional: marca "Vincular permanente"
5. Ao salvar:
   - Se permanente → upsert em `marketplace_item_product_links`
   - Atualiza `order_items.product_id`
   - Chama RPC `fn_order_reserva_stock_linked` → reserva estoque
   - Recalcula `status_interno` via edge function `process-presented`

> **Para pedidos cancelados**: Nao faz sentido vincular, pois o `status_interno = 'Cancelado'` tem prioridade 1. Mesmo que o usuario vinculasse todos os itens, o status continuaria "Cancelado".

---

## 8. Frontend — Exibicao de Pedidos Cancelados

### 8.1 Filtragem

**Arquivo**: `src/hooks/useOrderFiltering.ts`

```typescript
// Linhas 17-31 — matchStatus()
if (target === 'cancelado') return s === 'cancelado' || s === 'devolucao';
```

A aba "Cancelado" mostra **tanto pedidos cancelados quanto devolucoes** (chargebacks/returns).

### 8.2 Barra de Filtros

**Arquivo**: `src/components/orders/CanceledFilterBar.tsx`

Filtros disponiveis:
- Busca por texto (ID, cliente, SKU, produto)
- Ordenacao por "Mais Recente" (padrao)
- Filtro por marketplace (Mercado Livre, Shopee)

### 8.3 Cores e Badges

**Arquivo**: `src/utils/orderUtils.ts`

| Status | Cor |
|--------|-----|
| `Cancelado` | **Vermelho** |
| `Devolucao` | Vermelho |

### 8.4 Contagem na Pagina de Pedidos

**Arquivo**: `src/pages/Orders.tsx`

- Tab `cancelado` com badge de contagem (`statusCountsGlobal['cancelado']`)
- Rota: `/pedidos?status=cancelado`

---

## 9. Tabelas Envolvidas

### Tabelas do Ciclo 0 (novas)

| Tabela | Finalidade | Campos-chave para Cancelado |
|--------|-----------|----------------------------|
| `orders` | Pedidos normalizados | `marketplace_status = 'cancelled'`, `canceled_at`, `status` |
| `order_items` | Itens do pedido | `product_id`, `marketplace_item_id` |
| `order_shipping` | Info de envio | `status`, `substatus` |
| `order_status_history` | Log de mudancas | `from_status`, `to_status = 'cancelled'`, `source` |
| `invoices` | Notas fiscais | `status = 'cancelada'`, `canceled_at` |

### Tabelas Legacy (ainda ativas)

| Tabela | Finalidade | Campos-chave para Cancelado |
|--------|-----------|----------------------------|
| `marketplace_orders_raw` | Payload bruto JSONB | `status`, `data` |
| `marketplace_orders_presented_new` | Visao materializada | `status_interno = 'Cancelado'`, `status`, `shipment_status` |
| `marketplace_orders_presented` | Visao antiga | `status = 'Cancelado'`, `shipment_status` |

### Tabelas de Suporte

| Tabela | Finalidade |
|--------|-----------|
| `marketplace_item_product_links` | Vinculos permanentes anuncio ↔ produto |
| `products_stock` | Estoque: `current`, `reserved` |
| `inventory_transactions` | Log de movimentacoes (estorno = `RESERVA` com qty negativa) |
| `notas_fiscais` / `invoices` | NF-e com status `cancelada` |
| `orders_sync_queue` | Fila de pedidos para sincronizar |

---

## 10. Mapeamento de Status por Marketplace

### Mercado Livre

| Condicao | status_interno |
|----------|----------------|
| `status = 'cancelled'` | **`Cancelado`** |
| `payment.status = 'refunded'` | **`Cancelado`** |
| `shipment_status = 'cancelled'` | **`Cancelado`** |
| `status = 'pending_cancel'` | **`Cancelado`** (em processo) |

### Shopee

| Condicao | status_interno |
|----------|----------------|
| `order_status = 'CANCELLED'` | **`Cancelado`** |
| `order_status = 'IN_CANCEL'` | **`Cancelado`** |
| `shipment_status = 'cancelled'` | **`Cancelado`** |
| `shipment_substatus LIKE '%cancel%'` | **`Cancelado`** |

---

## 11. Diagrama de Referencia Cruzada de Arquivos

```
WEBHOOK
├── api/shopee-webhook.ts
├── api/mercado-livre-webhook.ts
└── supabase/functions/orders-webhook/index.ts

SYNC & NORMALIZACAO
├── supabase/functions/orders-queue-worker/index.ts
├── supabase/functions/orders-sync-ml/index.ts
├── supabase/functions/orders-sync-shopee/index.ts
├── supabase/functions/_shared/orders-normalize/ml-order-normalize-service.ts
│   └── Detecta canceled_at quando statusFromApi === "cancelled"
├── supabase/functions/_shared/orders-normalize/shopee-order-normalize-service.ts
│   └── Detecta canceled_at quando marketplaceStatus === "cancelled"
└── supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.ts
    └── Grava canceled_at e registra order_status_history

TRIGGERS & FUNCTIONS (banco)
├── supabase/migrations/20251205_create_materialize_orders_trigger.sql
│   └── process_marketplace_order_presented_new()  ← status_interno = 'Cancelado'
├── supabase/migrations/20251208_fix_refresh_presented_order_cte.sql
│   └── Logica completa: v_is_cancelled || v_is_refunded → 'Cancelado'
├── supabase/migrations/20251208_presented_new_inventory_on_cancel_trigger.sql
│   ├── trg_presented_new_stock_flow  ← estorno de estoque
│   └── trg_presented_new_inventory_on_cancel  ← estorno legado
├── supabase/migrations/20251119160000_stock_triggers.sql
│   └── trg_orders_presented_status_change  ← estorno legado
└── supabase/migrations/20251119151000_inventory_transactions_functions.sql
    └── refund_reserved_stock_for_order()  ← devolve estoque

CANCELAMENTO NF-e
├── supabase/functions/focus-nfe-cancel/index.ts
└── supabase/functions/_shared/domain/focus/focus-status.ts
    └── "cancelado" | "cancelada" → "cancelada"

VINCULACAO (referencia — nao se aplica a cancelados)
├── supabase/functions/linked_products_item/index.ts
├── src/components/orders/LinkOrderModal.tsx
└── src/hooks/useLinkOrderStorage.ts

FRONTEND
├── src/pages/Orders.tsx
├── src/hooks/useOrderFiltering.ts
│   └── matchStatus('cancelado') inclui 'cancelado' e 'devolucao'
├── src/components/orders/CanceledFilterBar.tsx
├── src/components/orders/OrderStatusCards.tsx
├── src/utils/orderUtils.ts
├── src/types/orders.ts
└── src/services/orders.service.ts
```

---

## 12. Resumo Executivo

1. **Entrada**: Marketplace envia webhook notificando mudanca no pedido → Vercel repassa → Edge Function enfileira em `orders_sync_queue`.

2. **Sync**: Worker consome fila a cada 30s → busca detalhes na API do marketplace → normalizer detecta `marketplace_status = "cancelled"` e seta `canceled_at`.

3. **Upsert**: `OrdersUpsertAdapter` grava em `orders` (com `canceled_at`), `order_items`, `order_shipping` e registra transicao em `order_status_history`. Paralelamente grava payload bruto em `marketplace_orders_raw`.

4. **Materializacao**: Trigger `process_marketplace_order_presented_new()` dispara no INSERT/UPDATE de `marketplace_orders_raw`. Verifica tres fontes de cancelamento (status do pedido, pagamento e envio). **Cancelado tem prioridade 1** — prevalece sobre qualquer outra condicao.

5. **Estorno de Estoque**: Trigger `trg_presented_new_stock_flow` detecta cancelamento e chama `refund_reserved_stock_for_order()`, que devolve o estoque reservado em `products_stock` e registra a movimentacao em `inventory_transactions`.

6. **NF-e (opcional)**: Se uma NF-e ja foi emitida, o usuario pode cancelar manualmente via `focus-nfe-cancel`, que chama a API do Focus e atualiza `notas_fiscais.status = 'cancelada'`.

7. **Vinculacao**: Nao se aplica a pedidos cancelados. Mesmo com itens nao vinculados, o status "Cancelado" tem prioridade absoluta. A vinculacao e sempre manual (feita pelo usuario no `LinkOrderModal`) ou automatica via `marketplace_item_product_links` para pedidos que tenham seller_sku ou vinculo permanente pre-existente.

8. **Frontend**: Aba "Cancelado" em `/pedidos?status=cancelado` mostra pedidos cancelados e devolucoes, com filtros por texto, marketplace e ordenacao.
