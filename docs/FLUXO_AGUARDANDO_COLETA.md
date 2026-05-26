# Fluxo Detalhado: Status "AGUARDANDO COLETA"

> Documentação técnica completa do ciclo de vida de um pedido no status **"Aguardando Coleta"** — desde a chegada do webhook do marketplace, passando por edge functions, triggers e banco de dados, até a exibição no frontend e transição para "Enviado".

---

## 1. Visão Geral

O status **"Aguardando Coleta"** indica que um pedido de marketplace já teve sua **etiqueta impressa** e está **pronto para ser coletado pela transportadora** (ou entregue pelo vendedor em um ponto de drop-off). É o último estágio antes de o pedido ser marcado como "Enviado".

### Pré-condições para entrar em "Aguardando Coleta"

Um pedido recebe `status_interno = 'Aguardando Coleta'` quando **todas** as condições são verdadeiras:

1. O pedido **não está cancelado** (`cancelled`, `in_cancel`, `refunded`)
2. O pedido **não está devolvido** (`returned_to_warehouse`)
3. O pedido **não é fulfillment/Full** (Shopee Full ou ML Flex)
4. **Todos os itens estão vinculados** (`has_unlinked_items = false`) — caso contrário fica em "A vincular"
5. A **nota fiscal já foi emitida** (quando aplicável) — caso contrário fica em "Emissão NF"
6. A **etiqueta de envio já foi impressa/cacheada** — caso contrário fica em "Impressão"

### Condição específica por marketplace

| Marketplace | Condição para "Aguardando Coleta" |
|---|---|
| **Mercado Livre** | `shipment_status = 'ready_to_ship'` AND `printed_label = true` |
| **Shopee** | `order_status = 'retry_ship'` (Shopee define esse status após impressão da etiqueta) |

> **Nota importante**: No Mercado Livre, a transição para "Aguardando Coleta" é controlada internamente pela RPC `rpc_marketplace_order_print_label`, que seta `status_interno = 'Aguardando Coleta'` + `printed_label = true` ao imprimir. No Shopee, o marketplace reporta `retry_ship` como status, e o trigger/edge function calcula o `status_interno` correspondente.

---

## 2. Como o Pedido Chega até "Aguardando Coleta"

### 2.1 Pipeline Completo (do Webhook ao Status)

```
Marketplace envia webhook
      ↓
api/shopee-webhook.ts  OU  api/mercado-livre-webhook.ts  (Vercel)
      ↓
Forward POST → /functions/v1/orders-webhook  (Supabase Edge Function)
      ↓
Valida, identifica marketplace, extrai order_id mínimo
      ↓
Enfileira na pgmq: queue "orders_sync"
      ↓
pg_cron dispara a cada 30 segundos
      ↓
/functions/v1/orders-queue-worker  (Edge Function)
      ↓
Busca detalhes completos na API do marketplace
      ↓
Normaliza via ShopeeOrderNormalizeService / MlOrderNormalizeService
      ↓
Upsert em: orders, order_items, order_shipping, order_status_history
      ↓
[Pipeline legado paralelo]:
  marketplace_orders_raw → trigger on_marketplace_orders_raw_change_new
      ↓
  process_marketplace_order_presented_new()
      ↓
  Calcula status_interno, has_unlinked_items
      ↓
  Upsert em marketplace_orders_presented_new
      ↓
  Trigger trg_presented_new_stock_flow → cria inventory_jobs
      ↓
  inventory-jobs-worker executa reserve/consume/refund de estoque
```

### 2.2 Jornada Típica de Status

```
Webhook recebido → "Pendente"
      ↓
Itens não vinculados? → "A vincular"  (bloqueante)
      ↓
Usuário vincula itens → trigger recalcula status
      ↓
NF pendente? → "Emissão NF"
      ↓
NF emitida → "Impressão"
      ↓
Etiqueta impressa → ★ "Aguardando Coleta" ★
      ↓
Pedido coletado/shipped → "Enviado"
```

---

## 3. Arquitetura de Dados — Tabelas Envolvidas

### 3.1 `marketplace_orders_raw`
- **Tipo**: Tabela de staging (dados brutos)
- **Papel**: Armazena o payload completo do marketplace sem tratamento
- **Campos-chave**: `id` (UUID), `organizations_id`, `marketplace_name`, `marketplace_order_id`, `order_items` (jsonb), `status`, `data` (jsonb completo)
- **Constraint única**: `(organizations_id, marketplace_name, marketplace_order_id)`

### 3.2 `marketplace_orders_presented_new`
- **Tipo**: Tabela materializada/desnormalizada (view materializada via trigger)
- **Papel**: Versão "apresentável" do pedido — **tabela principal que o frontend consulta**
- **Campos-chave para "Aguardando Coleta"**:
  - `status_interno` — `'Aguardando Coleta'`
  - `printed_label` — boolean, `true` quando a etiqueta foi impressa
  - `label_printed_on` — timestamptz, quando a etiqueta foi marcada como impressa
  - `label_cached` — boolean, se a etiqueta está salva localmente (PDF)
  - `label_pdf_base64` — base64 do PDF da etiqueta
  - `label_content_base64` — base64 genérico do conteúdo da etiqueta
  - `has_unlinked_items` — boolean, deve ser `false`
  - `shipment_status` — status do envio do marketplace
  - `shipment_substatus` — substatus do envio
  - `shipping_info` — jsonb com informações de logística do Shopee (modo, endereço pickup, etc.)
  - `ship_order_planned_at` — timestamptz, quando o `ship_order` foi planejado (Shopee)

### 3.3 `marketplace_item_product_links`
- **Tipo**: Tabela de vínculos permanentes
- **Papel**: Mapeia `(marketplace_item_id, variation_id)` → `product_id`. Se existir registro aqui, o item é vinculado automaticamente e **não bloqueia** a progressão para "Aguardando Coleta".

### 3.4 `orders` (Cycle 0 — nova pipeline)
- **Tipo**: Tabela canônica de pedidos (nova arquitetura)
- **Campos-chave**: `marketplace_status` (armazenado as-is), `status` (interno, ainda `null` na nova pipeline)
- **Nota**: A nova pipeline ainda não calcula `status_interno`. O cálculo ocorre apenas na pipeline legada.

### 3.5 `order_shipping` (Cycle 0)
- **Campos-chave**: `status` (ex: `PICKUP_PENDING`, `in_transit`), `tracking_number`, `carrier`

### 3.6 `order_status_history`
- **Tipo**: Tabela de auditoria (append-only)
- **Campos**: `order_id`, `from_status`, `to_status`, `changed_at`, `source`

### 3.7 `inventory_jobs`
- **Tipo**: Fila de jobs de estoque
- **Papel**: Quando o pedido entra em "Aguardando Coleta", um job `reserve` é criado (se ainda não existir)

---

## 4. Cálculo do `status_interno` — Onde e Como

O `status_interno` é calculado em **3 locais** (redundância intencional):

### 4.1 Trigger SQL: `process_marketplace_order_presented_new()`

**Arquivo**: `supabase/migrations/20251219_update_process_marketplace_order_presented_new_remove_upsert_items.sql`
**Dispara**: Trigger `on_marketplace_orders_raw_change_new` em `marketplace_orders_raw` (AFTER INSERT/UPDATE)

#### Shopee:
```sql
v_status_interno := CASE
  WHEN v_shp_order_status IN ('cancelled','in_cancel') THEN 'Cancelado'
  WHEN v_shp_order_status = 'to_return' THEN 'Devolução'
  WHEN (v_shp_order_status = 'ready_to_ship' OR v_shp_fulfillment_ready)
       AND v_has_unlinked_items THEN 'A vincular'
  WHEN v_shp_order_status = 'ready_to_ship'
       AND v_shp_invoice_pending THEN 'Emissao NF'
  WHEN v_shp_order_status IN ('ready_to_ship','processed')
       OR v_shp_fulfillment_ready THEN 'Impressao'
  WHEN v_shp_order_status = 'retry_ship' THEN 'Aguardando Coleta'     -- ★
  WHEN v_shp_order_status IN ('shipped','to_confirm_receive','completed')
       OR v_shp_pickup_done THEN 'Enviado'
  ELSE 'Pendente'
END;
```

> **Shopee**: O marketplace seta `order_status = 'retry_ship'` quando a etiqueta é gerada e o pedido está aguardando pickup.

#### Mercado Livre:
```typescript
// Em mercado-livre-process-presented/index.ts
if (shipmentStatus === "ready_to_ship" && printedLabel)
  statusInterno = "Aguardando Coleta";   // ★
```

> **ML**: O status `ready_to_ship` permanece, mas o campo `printed_label = true` (setado internamente pela RPC de impressão) determina a transição.

### 4.2 Edge Function: `shopee-process-presented/index.ts`

**Arquivo**: `supabase/functions/shopee-process-presented/index.ts`

Lógica idêntica ao trigger SQL para Shopee:
```typescript
shpOrderStatus === "retry_ship" ? "Aguardando Coleta" :
```

### 4.3 Edge Function: `mercado-livre-process-presented/index.ts`

**Arquivo**: `supabase/functions/mercado-livre-process-presented/index.ts`

Lógica para ML:
```typescript
(shipmentStatus === "ready_to_ship" && printedLabel) ? "Aguardando Coleta" :
```

---

## 5. Transição para "Aguardando Coleta" — Os 2 Caminhos

### 5.1 Caminho 1: Impressão de Etiqueta (ação do usuário)

O caminho mais comum. O usuário imprime a etiqueta na aba "Impressão" da página de Pedidos.

**Frontend** (`src/pages/Orders.tsx`):
1. Usuário seleciona pedidos na aba "Impressão"
2. Clica em "Imprimir etiquetas"
3. Frontend chama `markOrdersPrinted(orderIds)` em `src/services/orders.service.ts`

**Service** (`src/services/orders.service.ts:200-205`):
```typescript
export async function markOrdersPrinted(orderIds: string[]): Promise<void> {
  await supabase.rpc("rpc_marketplace_order_print_label", {
    p_order_ids: orderIds,
  });
}
```

**RPC SQL** (`rpc_marketplace_order_print_label`):
```sql
UPDATE marketplace_orders_presented_new
SET
  status_interno = 'Aguardando Coleta',    -- ★ Seta diretamente
  printed_label = true,
  label_printed_on = now()
WHERE id = ANY(p_order_ids)
  AND COALESCE(label_cached, true) = true;  -- Só marca se etiqueta está cacheada
```

> **Importante**: Essa RPC **seta diretamente** o `status_interno = 'Aguardando Coleta'` sem passar pelo trigger de cálculo. É uma atualização forçada.

### 5.2 Caminho 2: Webhook do Marketplace (Shopee `retry_ship`)

Quando o Shopee reporta via webhook que o pedido mudou para `retry_ship`:

1. Webhook chega → `orders-webhook` enfileira
2. `orders-queue-worker` busca detalhes na API Shopee
3. Normalização: `marketplace_status = 'retry_ship'`
4. Upsert em `marketplace_orders_raw`
5. Trigger `process_marketplace_order_presented_new()` recalcula:
   - `v_shp_order_status = 'retry_ship'` → `status_interno = 'Aguardando Coleta'`
6. Upsert em `marketplace_orders_presented_new`

---

## 6. O que Acontece quando o Pedido Entra em "Aguardando Coleta"

### 6.1 Reserva de Estoque (Trigger `trg_presented_new_stock_flow`)

**Arquivo**: `supabase/migrations/20251223_phase2_triggers_inventory_jobs.sql`

Quando `status_interno` muda para `'Aguardando Coleta'` (ou qualquer status entre `'Emissao NF'`, `'Impressao'`, `'Aguardando Coleta'`) e `has_unlinked_items = false`:

```sql
ELSIF COALESCE(NEW.status_interno, '') IN ('Emissao NF','Impressao','Aguardando Coleta')
      AND COALESCE(NEW.has_unlinked_items, false) = false THEN
  INSERT INTO inventory_jobs (order_id, job_type, status)
  VALUES (NEW.id, 'reserve', 'pending')
  ON CONFLICT (order_id, job_type) DO NOTHING;
```

Isso cria um job de **reserva de estoque** na tabela `inventory_jobs`, que será processado pelo `inventory-jobs-worker` edge function.

O job chama `reserve_stock_for_order(p_order_id, p_storage_id)` que:
1. Busca o armazém padrão da organização
2. Para cada item vinculado, transiciona estoque de `disponível` → `reservado`
3. Cria registros em `inventory_transactions` com `movement_type = 'RESERVA'`

> **Nota**: Se o estoque já foi reservado em um status anterior (ex: `'Impressao'`), o `ON CONFLICT DO NOTHING` impede duplicação.

### 6.2 Arrange Shipment — Shopee (ação disponível)

Na aba "Aguardando Coleta", pedidos Shopee exibem o botão **"Arranjar Envio"** que chama a edge function `shopee-arrange-shipment`.

**Frontend** (`src/pages/Orders.tsx:427-445`):
```typescript
const handleArrangeShipmentForPedido = async (pedido: any) => {
  const mk = String(pedido?.marketplace || '').toLowerCase();
  if (!mk.includes('shopee')) throw new Error('Apenas pedidos Shopee suportados.');
  const orderSn = String(pedido?.marketplaceOrderId ?? pedido?.platformId ?? '');
  await arrangeShopeeShipment(organizationId, companyId, orderSn);
};
```

**Service** (`src/services/orders.service.ts:138-151`):
```typescript
export async function arrangeShopeeShipment(organizationId, companyId, orderSn) {
  await supabase.functions.invoke("shopee-arrange-shipment", {
    body: { organizationId, companyId, orderSn },
  });
}
```

**Edge Function** (`supabase/functions/shopee-arrange-shipment/index.ts`):
1. Busca a integração Shopee e tokens de acesso
2. Obtém tracking number via `/api/v2/logistics/get_tracking_number`
3. Verifica parâmetros de envio via `/api/v2/logistics/get_shipping_document_parameter`
4. Chama `/api/v2/logistics/ship_order` para confirmar o envio à Shopee
5. Cria documento de envio via `/api/v2/logistics/create_shipping_document`
6. Salva `shipping_info` e `ship_order_planned_at` em `marketplace_orders_presented_new`

> Após o `ship_order` ser aceito pela Shopee, o próximo webhook reportará `order_status = 'shipped'`, e o pedido transicionará para "Enviado".

### 6.3 Reimpressão de Etiqueta

Pedidos em "Aguardando Coleta" podem ter suas etiquetas **reimpressas** via botão na tabela:

**Frontend** (`src/pages/Orders.tsx:969-1010`):
```typescript
// Reimprime a etiqueta para um único pedido na aba "Aguardando Coleta"
const handleReprintLabel = async (pedido: any) => {
  const cachedPdf = pedido?.label?.pdf_base64 || null;
  const cachedContent = pedido?.label?.content_base64 || null;
  // Abre PDF em nova aba para impressão
};
```

---

## 7. Vinculação: Automática vs Manual

### 7.1 Quando o pedido é vinculado automaticamente?

Um pedido **pula** o status "A vincular" e segue direto na pipeline quando **todos** os seus itens satisfazem pelo menos uma das condições:

| Condição | Fonte | Tipo de vínculo |
|---|---|---|
| Existe registro em `marketplace_item_product_links` para `(marketplace_item_id, variation_id)` | Tabela de links permanentes | **Permanente** |
| O anúncio no marketplace tem `seller_sku` preenchido | Payload do marketplace | **Implícito por SKU** |
| Existe vínculo efêmero em `linked_products` (jsonb) da tabela `marketplace_orders_presented_new` | Coluna jsonb do pedido | **Efêmero** (só deste pedido) |

#### Vínculo Permanente (o mais importante)

Quando o usuário vincula um item e marca **"Vincular permanente"** no modal de vinculação:
- Um registro é salvo em `marketplace_item_product_links`
- **Todos os pedidos futuros** com o mesmo `(marketplace_name, marketplace_item_id, variation_id)` serão automaticamente vinculados
- O item não será contado como "unlinked" no trigger

**Arquivo do trigger** (`process_marketplace_order_presented_new`):
```sql
LEFT JOIN public.marketplace_item_product_links mipl
  ON mipl.organizations_id = NEW.organizations_id
 AND mipl.marketplace_name = NEW.marketplace_name
 AND mipl.marketplace_item_id = oip.item_id_text
 AND mipl.variation_id = oip.variation_id_text
```

Se `mipl.product_id IS NOT NULL`, o item é vinculado.

#### Vínculo Implícito por SKU

Se o anúncio do marketplace tem `seller_sku` preenchido, o sistema assume que o SKU pode resolver o produto internamente:

```sql
-- Item é "unlinked" apenas quando:
WHERE o.product_id IS NULL AND COALESCE(o.seller_sku_text, '') = ''
```

> Se o `seller_sku` está preenchido, mesmo sem registro em `marketplace_item_product_links`, o item **não é contado como unlinked**.

### 7.2 Quando a vinculação é manual?

Se **nenhuma** das condições acima é satisfeita, o pedido entra em "A vincular" e o usuário deve:

1. Abrir o modal de vinculação (`src/components/orders/LinkOrderModal.tsx`)
2. Para cada item não vinculado, selecionar o produto interno correspondente
3. Opcionalmente marcar "Vincular permanente" para automatizar pedidos futuros
4. Salvar — o sistema recalcula `status_interno` e o pedido progride na pipeline

### 7.3 Quem faz a vinculação?

- **Automática**: O trigger SQL `process_marketplace_order_presented_new()` e as edge functions `*-process-presented` consultam `marketplace_item_product_links` e `seller_sku` durante o cálculo de `has_unlinked_items`
- **Manual**: O usuário via frontend (`LinkOrderModal.tsx`) → salva em `marketplace_item_product_links` (permanente) e/ou `linked_products` (efêmero) → re-invoca `*-process-presented` com `status_only: true` para recalcular

---

## 8. Saída do "Aguardando Coleta" — Transições Possíveis

| Destino | Condição | Quem dispara |
|---|---|---|
| **"Enviado"** | Marketplace reporta `shipped` / `in_transit` / `dropped_off` | Webhook → trigger recalcula |
| **"Cancelado"** | Marketplace reporta cancelamento | Webhook → trigger recalcula |
| **"Devolução"** | Marketplace reporta devolução | Webhook → trigger recalcula |

### Transição para "Enviado"

Quando o pedido é coletado pela transportadora, o marketplace envia webhook com novo status:

**Shopee**: `order_status` muda de `retry_ship` → `shipped` / `to_confirm_receive`
**Mercado Livre**: `shipment_status` muda de `ready_to_ship` → `shipped` / `in_transit`

O trigger recalcula:
```sql
-- Shopee
WHEN v_shp_order_status IN ('shipped','to_confirm_receive','completed') THEN 'Enviado'

-- ML
["shipped","dropped_off","in_transit","handed_to_carrier","delivered"].includes(shipmentStatus) → "Enviado"
```

Ao transicionar para "Enviado", o trigger `trg_presented_new_stock_flow` cria um job `consume`:
```sql
ELSIF COALESCE(NEW.status_interno, '') = 'Enviado' THEN
  INSERT INTO inventory_jobs (order_id, job_type, status)
  VALUES (NEW.id, 'consume', 'pending')
  ON CONFLICT (order_id, job_type) DO NOTHING;
```

Esse job chama `consume_reserved_stock_for_order()`, que reduz `reserved` e `current` no estoque.

---

## 9. Frontend — Exibição e Ações

### 9.1 Aba "Coleta" na Página de Pedidos

**Arquivo**: `src/pages/Orders.tsx`

A aba "Aguardando Coleta" é uma das abas do pipeline de pedidos:

```typescript
// Status blocks na página de pedidos (linha ~920-928)
{ id: 'aguardando-coleta', title: 'Coleta', count: ..., description: 'Prontos para envio' }
```

**URL**: `/pedidos?status=aguardando-coleta`

**Filtro**: `src/hooks/useOrderFiltering.ts`
```typescript
if (target === 'aguardando-coleta') return s === 'aguardando coleta';
```

### 9.2 Ações Disponíveis por Linha

Na tabela de pedidos (`src/components/orders/OrderTableRow.tsx`), cada pedido em "Aguardando Coleta" exibe:

| Ação | Botão | Handler | Descrição |
|---|---|---|---|
| **Reimprimir etiqueta** | FileBadge icon (roxo se tem etiqueta) | `handleReprintLabel` | Abre o PDF da etiqueta cacheada em nova aba |
| **Arranjar envio** (Shopee) | Truck icon | `handleArrangeShipmentForPedido` | Chama Shopee API ship_order |
| **Ver detalhes** | Click na linha | `handleOpenDetailsDrawer` | Abre drawer lateral com todos os dados |

### 9.3 Badge de Cor

**Arquivo**: `src/utils/orderUtils.ts:151-152`
```typescript
case 'aguardando coleta':
  return 'bg-blue-500 hover:bg-blue-500 text-white';
```

### 9.4 Indicador de Atraso

Pedidos em "Aguardando Coleta" podem mostrar indicador de atraso no SLA:
```typescript
// src/pages/Orders.tsx:909-917
const isPedidoAtrasado = (p) => {
  const slaStatusLower = String(p?.shippingSla?.status ?? '').toLowerCase();
  const ed = p?.shippingSla?.expectedDate;
  const expired = ed ? (new Date(ed).getTime() - new Date().getTime() <= 0) : false;
  return slaStatusLower === 'delayed' || expired;
};
// Tooltip com alerta aparece se há pedidos atrasados
const allowedTooltipBlocks = new Set([..., 'aguardando-coleta']);
```

### 9.5 Dashboard

**Arquivo**: `src/components/dashboard/OrderStatusGrid.tsx:32`
```typescript
{ key: 'coleta', label: 'Coleta', href: '/pedidos?status=aguardando-coleta' }
```

---

## 10. Mapa Completo de Arquivos

### Edge Functions
| Arquivo | Papel no fluxo |
|---|---|
| `supabase/functions/orders-webhook/index.ts` | Recebe webhook, valida, enfileira na pgmq |
| `supabase/functions/orders-queue-worker/index.ts` | Processa fila, busca dados no marketplace, normaliza, upsert |
| `supabase/functions/shopee-process-presented/index.ts` | Calcula `status_interno` para Shopee (inclui "Aguardando Coleta") |
| `supabase/functions/mercado-livre-process-presented/index.ts` | Calcula `status_interno` para ML (inclui "Aguardando Coleta") |
| `supabase/functions/shopee-arrange-shipment/index.ts` | Confirma envio na API Shopee (ship_order) |
| `supabase/functions/inventory-jobs-worker/index.ts` | Processa jobs de estoque (reserve/consume/refund) |

### Migrations / SQL
| Arquivo | Papel no fluxo |
|---|---|
| `supabase/migrations/20251205_create_materialize_orders_trigger.sql` | Trigger original `process_marketplace_order_presented_new` |
| `supabase/migrations/20251219_update_process_marketplace_order_presented_new_remove_upsert_items.sql` | Versão atualizada do trigger + RPC `rpc_marketplace_order_print_label` |
| `supabase/migrations/20251223_phase2_triggers_inventory_jobs.sql` | Trigger `trg_presented_new_stock_flow` (cria jobs de reserva/consumo) |
| `supabase/migrations/20251117170000_stock_reservation_functions.sql` | Funções de reserva/consumo/refund de estoque |
| `supabase/migrations/20251030120000_marketplace_item_product_links.sql` | Tabela de vínculos permanentes (auto-linking) |
| `supabase/migrations/20260301_000000_create_orders_table.sql` | Tabela `orders` (Cycle 0) |
| `supabase/migrations/20260301_000002_create_order_shipping_table.sql` | Tabela `order_shipping` (Cycle 0) |

### Frontend
| Arquivo | Papel no fluxo |
|---|---|
| `src/pages/Orders.tsx` | Página principal — abas, contadores, handlers de ação |
| `src/components/orders/OrderTableRow.tsx` | Linha da tabela — botões de reimprimir, arranjar envio |
| `src/components/orders/orderColumnDefs.tsx` | Definição de colunas da tabela |
| `src/components/orders/LinkOrderModal.tsx` | Modal de vinculação manual (resolve "A vincular") |
| `src/components/orders/OrderDetailsDrawer.tsx` | Drawer lateral com detalhes + botão "Arranjar envio" |
| `src/components/dashboard/OrderStatusGrid.tsx` | Card "Coleta" no dashboard |
| `src/hooks/useOrderFiltering.ts` | Filtro de pedidos por status (inclui `aguardando-coleta`) |
| `src/services/orders.service.ts` | RPCs: `markOrdersPrinted`, `arrangeShopeeShipment` |
| `src/utils/orderUtils.ts` | Mapeamento de cor do badge (`bg-blue-500`) |

---

## 11. Hierarquia de Prioridade de Status (Completa)

Para referência, esta é a cadeia completa de prioridade do `status_interno`:

```
1. Cancelado       — pedido cancelado/reembolsado
2. Devolução       — pedido devolvido
3. Enviado (Full)  — fulfillment (Full/Flex)
4. A vincular      — tem itens sem vínculo (BLOQUEANTE — impede progressão)
5. Emissão NF      — NF pendente (ready_to_ship + invoice_pending)
6. Impressão       — pronto para imprimir etiqueta
7. ★ Aguardando Coleta — etiqueta impressa, aguardando pickup ★
8. Enviado         — coletado/em trânsito/entregue
9. Pendente        — fallback (estado inicial)
```

> "A vincular" tem prioridade sobre todos os status de workflow (Emissão NF, Impressão, Aguardando Coleta). Um pedido com itens não vinculados **nunca** chega a "Aguardando Coleta".

---

## 12. Dual Pipeline (Legado vs Cycle 0)

Atualmente coexistem duas pipelines:

| Aspecto | Pipeline Legada | Pipeline Cycle 0 |
|---|---|---|
| **Tabela de pedidos** | `marketplace_orders_presented_new` | `orders` |
| **Tabela de itens** | `marketplace_order_items` | `order_items` |
| **Calcula `status_interno`?** | Sim (trigger + edge functions) | **Não** (campo `status` é `null`) |
| **Frontend lê de** | `marketplace_orders_presented_new` | Em migração |
| **Webhook → DB** | `marketplace_orders_raw` → trigger → presented | `orders_sync` queue → worker → `orders` |

> **Nota**: O cálculo de "Aguardando Coleta" só existe na pipeline legada. A pipeline Cycle 0 armazena `marketplace_status` as-is e o mapeamento para status internos é trabalho futuro.
