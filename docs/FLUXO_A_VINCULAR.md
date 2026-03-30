# Fluxo Detalhado: Status "A VINCULAR"

> Documentação técnica completa do ciclo de vida de um pedido que entra no status **"A vincular"** — desde a chegada do webhook até a resolução pelo usuário no frontend.

---

## 1. Visão Geral

O status **"A vincular"** indica que um pedido chegou de um marketplace (Mercado Livre ou Shopee), mas **um ou mais itens do pedido não puderam ser automaticamente associados a um produto cadastrado no ERP (Novura)**. O sistema não sabe qual produto do catálogo interno corresponde ao anúncio vendido, e por isso o pedido fica "travado" até que o usuário faça essa vinculação manualmente.

### Condição para ser "A vincular"

Um pedido recebe `status_interno = 'A vincular'` quando **todas** as condições abaixo são verdadeiras:

1. O pedido **não está cancelado, devolvido ou em fulfillment (Full)**
2. O pedido possui **pelo menos 1 item sem vinculação** (`has_unlinked_items = true`)
3. Um item é considerado "sem vinculação" quando:
   - Não existe um registro na tabela `marketplace_item_product_links` para o par `(marketplace_item_id, variation_id)` daquela organização
   - Não existe um vínculo efêmero (ephemeral) salvo na coluna `linked_products` da tabela `marketplace_orders_presented_new`
   - O item **não possui `seller_sku`** preenchido (se o anúncio no marketplace já tem SKU, o sistema assume que consegue resolver sozinho)

---

## 2. Arquitetura de Dados — Tabelas Envolvidas

### 2.1 `marketplace_orders_raw`
- **Tipo**: Tabela de staging (dados brutos)
- **Papel**: Armazena o payload completo do marketplace (JSON) sem tratamento
- **Campos-chave**: `id` (UUID, PK), `organizations_id`, `marketplace_name`, `marketplace_order_id`, `order_items` (jsonb), `buyer`, `payments`, `shipments`, `data` (jsonb com todos os dados originais), `status`
- **Constraint única**: `(organizations_id, marketplace_name, marketplace_order_id)`

### 2.2 `marketplace_orders_presented_new`
- **Tipo**: Tabela materializada/desnormalizada (view materializada via trigger)
- **Papel**: Versão "apresentável" do pedido, com campos extraídos e calculados. **É a tabela principal que o frontend consulta.**
- **Campos-chave para vinculação**:
  - `status_interno` — o status calculado (ex: `'A vincular'`, `'Impressao'`, `'Emissao NF'`, etc.)
  - `has_unlinked_items` — boolean, `true` se houver itens sem vinculação
  - `unlinked_items_count` — integer, quantos itens não estão vinculados
  - `linked_products` — jsonb array com os vínculos atuais: `[{ marketplace_item_id, variation_id, product_id, sku, source }]`
  - `id` — **mesmo UUID** que `marketplace_orders_raw.id`

### 2.3 `marketplace_order_items`
- **Tipo**: Tabela de itens do pedido (sistema legado/fluxo antigo)
- **Campos-chave**: `id` (= order_id do presented), `row_id` (PK auto), `model_sku_externo`, `model_id_externo`, `linked_products` (UUID do produto vinculado), `has_unlinked_items`, `pack_id`

### 2.4 `marketplace_item_product_links`
- **Tipo**: Tabela de vínculos permanentes
- **Papel**: Mapeia `(organizations_id, marketplace_name, marketplace_item_id, variation_id)` → `product_id`. Se existir registro aqui para um item do pedido, ele é considerado **vinculado automaticamente** (source = `'permanent'`).
- **Constraint única**: `(organizations_id, marketplace_name, marketplace_item_id, variation_id)`

### 2.5 `orders` / `order_items` / `order_shipping` (Novo fluxo — Cycle 0)
- **Tipo**: Tabelas normalizadas do novo pipeline
- **Papel**: Armazenam dados normalizados via `orders-queue-worker`
- **Nota**: Coexistem com o fluxo legado. O `LinkOrderModal` atualiza `order_items.product_id` nesta tabela também.

### 2.6 `products` / `products_stock`
- **Tipo**: Catálogo de produtos e estoque
- **Papel**: São consultados para verificar estoque disponível no momento da vinculação

---

## 3. Fluxo Completo — Passo a Passo

### FASE 1: Recebimento do Webhook

#### 3.1 Mercado Livre

```
ML notifica → Vercel API route (api/mercado-livre-webhook.ts)
  → Forward para Supabase Edge Function
```

Existem **dois caminhos paralelos** (legado + novo):

**Caminho Legado** — `mercado-livre-webhook-orders/index.ts`:
1. Recebe a notificação (`topic: "orders_v2"`, `resource: "/orders/{id}"`)
2. Busca a integração na tabela `marketplace_integrations` pelo `meli_user_id`
3. Descriptografa o `access_token`
4. Faz fetch completo do pedido na API ML: `GET /orders/{id}`
5. Faz fetch de shipments, billing_info, labels (PDF/ZPL2)
6. Chama a RPC `upsert_marketplace_order_raw()` → insere/atualiza na tabela `marketplace_orders_raw`
7. **O trigger `on_marketplace_orders_raw_change_new` dispara** automaticamente (ver Fase 2)
8. Invoca `mercado-livre-process-presented` (edge function) como backup

**Caminho Novo** — `orders-webhook/index.ts` → `orders-queue-worker/index.ts`:
1. `orders-webhook` recebe o webhook, identifica como ML, e enfileira na fila `orders_sync_queue`
2. `orders-queue-worker` (executado a cada 30s via pg_cron) consome a fila
3. Busca integração, obtém token, faz fetch do pedido via `MlOrderApiAdapter`
4. Normaliza via `MlOrderNormalizeService` → `NormalizedOrder`
5. Faz upsert via `OrdersUpsertAdapter` → tabelas `orders`, `order_items`, `order_shipping`
6. **Este caminho NÃO calcula `status_interno` nem `has_unlinked_items`** — é o pipeline normalizado novo

#### 3.2 Shopee

**Caminho Legado** — `shopee-webhook-orders/index.ts`:
1. Recebe push notification da Shopee (code 3 = order_status_push)
2. Detecta `order_sn` e `shop_id` do payload
3. Busca integração por `shopee_shop_id` na tabela `marketplace_integrations`
4. Faz fetch de order detail, escrow detail, buyer invoice info, package details, shipment list, shipping parameters
5. Chama a RPC `upsert_marketplace_order_raw_shopee()` → insere/atualiza na `marketplace_orders_raw`
6. **O trigger `on_marketplace_orders_raw_change_new` dispara** (ver Fase 2)
7. Invoca `shopee-process-presented` como backup

**Caminho Novo** — mesmo que ML, via `orders-webhook` → fila → `orders-queue-worker` → `ShopeeOrderNormalizeService`

---

### FASE 2: Materialização e Cálculo do Status (Trigger no Banco)

Quando um registro é inserido ou atualizado em `marketplace_orders_raw`, o trigger **`on_marketplace_orders_raw_change_new`** dispara a função **`process_marketplace_order_presented_new()`**.

**Arquivo**: `supabase/migrations/20251205_create_materialize_orders_trigger.sql`

Esta function PL/pgSQL faz:

#### 2.1 Contagem de Itens Não Vinculados

```sql
-- Para cada item do pedido (order_items jsonb):
-- 1. Extrai item_id_text, variation_id_text, seller_sku_text
-- 2. Busca vínculo PERMANENTE em marketplace_item_product_links
-- 3. Busca vínculo EFÊMERO em marketplace_orders_presented_new.linked_products
-- 4. Se nenhum product_id é encontrado E seller_sku está vazio → item é "unlinked"

v_unlinked_items_count := (contagem dos itens sem vínculo)
v_has_unlinked_items := v_unlinked_items_count > 0
```

A lógica de matching (simplificada):
```sql
FROM order_items_parsed oip
LEFT JOIN marketplace_item_product_links mipl      -- Vínculo permanente
  ON mipl.organizations_id = NEW.organizations_id
 AND mipl.marketplace_name = NEW.marketplace_name
 AND mipl.marketplace_item_id = oip.item_id_text
 AND mipl.variation_id = oip.variation_id_text
LEFT JOIN ephemeral_links eph                       -- Vínculo efêmero
  ON eph.marketplace_item_id = oip.item_id_text
 AND eph.variation_id = oip.variation_id_text
WHERE product_id IS NULL                            -- Sem nenhum vínculo
  AND seller_sku_text = ''                          -- Sem SKU do marketplace
  AND item_id_text <> ''                            -- Item válido
```

#### 2.2 Cálculo do `status_interno`

A lógica de prioridade (PL/pgSQL) — **para Mercado Livre**:

```sql
IF v_is_cancelled OR v_is_refunded THEN
    v_status_interno := 'Cancelado';
ELSIF v_is_returned THEN
    v_status_interno := 'Devolução';
ELSIF v_shipment_status = 'pending' AND v_shipment_substatus = 'buffered' AND v_has_unlinked_items THEN
    v_status_interno := 'A vincular';          -- ← AQUI
ELSIF v_is_full THEN
    v_status_interno := 'Enviado';
ELSIF v_has_unlinked_items THEN
    v_status_interno := 'A vincular';          -- ← E AQUI (fallback genérico)
ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'invoice_pending' THEN
    v_status_interno := 'Emissao NF';
-- ... (demais estados)
ELSE
    v_status_interno := 'Pendente';
END IF;
```

**Nota importante**: "A vincular" tem **prioridade alta** — aparece antes de "Emissao NF", "Impressao", etc. Isso significa que mesmo se o pedido estiver `ready_to_ship`, se houver itens não vinculados, ele fica "A vincular".

#### 2.3 Upsert na Tabela Apresentada

O resultado é inserido/atualizado em `marketplace_orders_presented_new` via `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` com todos os campos calculados, incluindo `status_interno`, `has_unlinked_items`, `unlinked_items_count`, e `linked_products`.

---

### FASE 2.5: Process Presented (Edge Functions — Backup/Complemento)

Além do trigger, as edge functions `shopee-process-presented` e `mercado-livre-process-presented` são invocadas explicitamente após o upsert no raw. Elas fazem essencialmente o **mesmo cálculo** do trigger mas em TypeScript:

**Shopee** (`shopee-process-presented/index.ts`):
```typescript
const statusInterno =
  shpOrderStatus === "cancelled" ? "Cancelado" :
  ((shpOrderStatus === "ready_to_ship" || [...].includes(logisticsStatusLower))
    && hasUnlinkedItems) ? "A vincular" :
  // ... demais
  "Pendente";
```

**Mercado Livre** (`mercado-livre-process-presented/index.ts`):
```typescript
if (hasUnlinkedItems) statusInterno = "A vincular";
// Com checagens mais específicas:
else if (shipmentStatus === "pending" && shipmentSubstatus === "buffered" && orderHasUnlinked)
  statusInterno = "A vincular";
```

Ambas as functions também:
1. Buscam vínculos em `marketplace_item_product_links` (permanentes) e `marketplace_orders_presented_new.linked_products` (efêmeros)
2. Inserem itens na tabela `marketplace_order_items`
3. Atualizam `has_unlinked_items` e `status_interno` na tabela `marketplace_orders_presented_new`
4. Invocam `inventory-jobs-worker` para reservas de estoque (Shopee)
5. Chamam `fn_order_reserva_stock_linked` para reservar estoque dos itens permanentemente vinculados (ML)

---

### FASE 3: Frontend — Exibição e Resolução do "A Vincular"

#### 3.1 Página de Pedidos (`src/pages/Orders.tsx`)

- A página consulta `marketplace_orders_presented_new` (ou a view `orders`)
- Filtra por `status_interno`
- O hook `useOrderFiltering.ts` permite filtrar especificamente por `'A vincular'`
- O componente `LinkFilterBar` exibe badges com contadores: "Para vincular (N)" e "Sem estoque (N)"

#### 3.2 Tabela de Pedidos (`src/components/orders/OrderTableRow.tsx`)

- Exibe o badge de status com cor amarela para "A vincular" (via `getStatusColor()` em `orderUtils.ts`)
- Ao clicar num pedido "A vincular", abre o `LinkOrderModal`

#### 3.3 Modal de Vinculação (`src/components/orders/LinkOrderModal.tsx`)

O modal é o coração da resolução do "A vincular". Ele:

1. **Recebe** a lista de `anunciosParaVincular` — itens do pedido que não têm produto ERP associado
2. **Exibe** cada anúncio do marketplace com seus detalhes (nome, imagem, SKU, variação, quantidade)
3. **Abre** o `ProductPickerDialog` para o usuário buscar e selecionar um produto do catálogo ERP
4. **Verifica estoque** em tempo real via `useLinkOrderStorage` hook:
   - Resolve o armazém padrão do usuário
   - Consulta `products_stock` para cada produto selecionado
   - Mostra "Estoque suficiente" ou "Sem estoque no armazém selecionado"
5. **Permite marcar "Vincular permanente"** — checkbox que, se marcado, salva o vínculo na tabela `marketplace_item_product_links` para uso futuro automático
6. **Ao salvar**:

```
a) Persiste vínculos permanentes → upsert em marketplace_item_product_links
b) Atualiza order_items.product_id na tabela `order_items` (novo fluxo)
c) Chama RPC fn_order_reserva_stock_linked → reserva estoque
d) Invoca a edge function process-presented com status_only=true → recalcula status_interno
```

#### 3.4 Edge Function `linked_products_item`

Existe também a edge function `linked_products_item/index.ts` que é um endpoint alternativo para vincular um único item:

1. Recebe `order_id`, `product_id`, `item_row_id` ou `external_item_id`
2. Verifica estoque se `source_card === "A_VINCULAR"`
3. Atualiza `marketplace_order_items.linked_products` e `has_unlinked_items`
4. Recalcula se o pedido inteiro ainda tem itens não vinculados
5. Atualiza `marketplace_orders_presented_new.has_unlinked_items`
6. Chama `reserve_stock_for_order` para reservar estoque
7. Re-invoca `process-presented` para recalcular o `status_interno`

---

## 4. O Que Faz um Pedido Sair de "A Vincular"

Quando **todos** os itens do pedido são vinculados a produtos ERP:

1. `has_unlinked_items` → `false`
2. O `status_interno` é recalculado e passa para o próximo estado na cadeia de prioridade:
   - `"Emissao NF"` (se invoice pending)
   - `"Impressao"` (se ready_to_print ou ready_to_ship)
   - `"Aguardando Coleta"` (se label já impressa)
   - `"Enviado"` (se já shipped)
   - `"Pendente"` (fallback)

---

## 5. Vinculação Automática vs Manual

### 5.1 Vinculação Automática (Permanente)

Se o usuário marcou "Vincular permanente" anteriormente, na próxima vez que um pedido chegar com o mesmo `(marketplace_item_id, variation_id)`, o sistema encontra o `product_id` automaticamente via a tabela `marketplace_item_product_links`. O item **não é contado como "unlinked"** e o pedido **não entra em "A vincular"**.

### 5.2 Vinculação Automática (por SKU)

Se o anúncio no marketplace possui um `seller_sku` preenchido, o sistema **não conta o item como "unlinked"** mesmo sem vínculo em `marketplace_item_product_links`. A lógica assume que o SKU pode ser resolvido por outros mecanismos.

```sql
WHERE (o.product_id IS NULL AND COALESCE(o.seller_sku_text, '') = '')
--                                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
-- Só é unlinked se NÃO tem SKU
```

### 5.3 Vinculação Manual (Efêmera)

Se o usuário vincula sem marcar "permanente", o vínculo é salvo apenas na coluna `linked_products` (jsonb) de `marketplace_orders_presented_new` com `source: 'ephemeral'`. Serve para aquele pedido, mas não para futuros.

---

## 6. Diagrama de Fluxo

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                    MARKETPLACE (ML / Shopee)                        │
 │                     envia webhook/notificação                       │
 └─────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  Vercel API Route (api/mercado-livre-webhook.ts ou shopee)          │
 │  → Forwarda para Edge Function correspondente                       │
 └─────────────────────────┬───────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
 ┌────────────────────────┐  ┌──────────────────────────┐
 │ LEGADO                 │  │ NOVO (Cycle 0)           │
 │ shopee-webhook-orders  │  │ orders-webhook           │
 │ ml-webhook-orders      │  │  → enqueue               │
 │                        │  │ orders-queue-worker      │
 │ Fetch API completa     │  │  → normalize → upsert    │
 │ Upsert em              │  │ Em: orders,              │
 │ marketplace_orders_raw │  │ order_items,             │
 └───────────┬────────────┘  │ order_shipping           │
             │               └──────────────────────────┘
             ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  TRIGGER: on_marketplace_orders_raw_change_new                      │
 │  → process_marketplace_order_presented_new()                        │
 │                                                                     │
 │  1. Extrai itens do pedido (order_items jsonb)                      │
 │  2. Para cada item:                                                 │
 │     a. Busca vínculo PERMANENTE em marketplace_item_product_links   │
 │     b. Busca vínculo EFÊMERO em presented_new.linked_products       │
 │     c. Se não encontrou E sem seller_sku → item é "unlinked"        │
 │  3. Calcula has_unlinked_items, unlinked_items_count                │
 │  4. Calcula status_interno (prioridade: Cancelado > Devolução >     │
 │     A vincular > Full=Enviado > Emissão NF > Impressão > ...)       │
 │  5. Upsert em marketplace_orders_presented_new                      │
 └───────────┬─────────────────────────────────────────────────────────┘
             │
             ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  EDGE FUNCTION (backup): shopee-process-presented /                 │
 │                           mercado-livre-process-presented            │
 │  → Mesma lógica do trigger, mas em TypeScript                       │
 │  → Insere itens em marketplace_order_items                          │
 │  → Reserva estoque para itens com vínculo permanente                │
 └───────────┬─────────────────────────────────────────────────────────┘
             │
             ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  FRONTEND: Página de Pedidos                                        │
 │  → Consulta marketplace_orders_presented_new / orders               │
 │  → Filtra por status_interno = 'A vincular'                         │
 │  → Exibe badge amarelo, contador de itens não vinculados            │
 └───────────┬─────────────────────────────────────────────────────────┘
             │ (usuário clica)
             ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  MODAL: LinkOrderModal                                              │
 │  → Lista itens não vinculados do pedido                             │
 │  → Usuário seleciona produto ERP para cada item                     │
 │  → Verifica estoque em tempo real (useLinkOrderStorage)             │
 │  → Opção: "Vincular permanente" (checkbox)                          │
 │  → Ao salvar:                                                       │
 │     a. Upsert marketplace_item_product_links (se permanente)        │
 │     b. Update order_items.product_id                                │
 │     c. RPC fn_order_reserva_stock_linked (reserva estoque)          │
 │     d. Invoke process-presented (status_only=true)                   │
 │        → Recalcula status_interno                                   │
 │        → Se todos vinculados: sai de "A vincular"                   │
 └─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Referência de Arquivos

| Camada | Arquivo | Papel |
|--------|---------|-------|
| **Webhook receiver** | `supabase/functions/orders-webhook/index.ts` | Recebe webhooks ML/Shopee, enfileira |
| **Queue worker** | `supabase/functions/orders-queue-worker/index.ts` | Processa fila, normaliza, upsert (novo fluxo) |
| **ML webhook (legado)** | `supabase/functions/mercado-livre-webhook-orders/index.ts` | Recebe ML, fetch completo, upsert raw |
| **Shopee webhook (legado)** | `supabase/functions/shopee-webhook-orders/index.ts` | Recebe Shopee, fetch completo, upsert raw |
| **ML process presented** | `supabase/functions/mercado-livre-process-presented/index.ts` | Materializa presented (ML), calcula status |
| **Shopee process presented** | `supabase/functions/shopee-process-presented/index.ts` | Materializa presented (Shopee), calcula status |
| **Link item** | `supabase/functions/linked_products_item/index.ts` | Vincula um item a um produto via API |
| **DB Trigger** | `supabase/migrations/20251205_create_materialize_orders_trigger.sql` | Trigger + functions PL/pgSQL |
| **Normalizer ML** | `supabase/functions/_shared/orders-normalize/ml-order-normalize-service.ts` | Normaliza pedido ML |
| **Normalizer Shopee** | `supabase/functions/_shared/orders-normalize/shopee-order-normalize-service.ts` | Normaliza pedido Shopee |
| **Upsert adapter** | `supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.ts` | Upsert em orders/order_items (novo) |
| **Frontend: Orders page** | `src/pages/Orders.tsx` | Página principal de pedidos |
| **Frontend: Link modal** | `src/components/orders/LinkOrderModal.tsx` | Modal de vinculação |
| **Frontend: Link filter** | `src/components/orders/LinkFilterBar.tsx` | Barra de filtros A vincular |
| **Frontend: Storage hook** | `src/hooks/useLinkOrderStorage.ts` | Resolve armazém + verifica estoque |
| **Frontend: Order utils** | `src/utils/orderUtils.ts` | Cores/labels de status |
| **Frontend: Order filtering** | `src/hooks/useOrderFiltering.ts` | Filtros de pedidos |

---

## 8. Tabelas de Banco — Resumo das Interações

```
marketplace_orders_raw           ←── Webhook insere/atualiza dados brutos
       │
       │ (TRIGGER: on_marketplace_orders_raw_change_new)
       ▼
marketplace_orders_presented_new ←── Trigger materializa + calcula status_interno
       │                              (consulta marketplace_item_product_links
       │                               para determinar vinculação)
       │
       ├── marketplace_order_items   ←── Process-presented insere itens
       │        │
       │        └── linked_products (coluna) ←── linked_products_item atualiza
       │
       ├── marketplace_item_product_links ←── LinkOrderModal faz upsert (permanente)
       │
       └── products / products_stock     ←── Consultados para verificar estoque

orders / order_items / order_shipping    ←── Pipeline novo (orders-queue-worker)
       │
       └── order_items.product_id        ←── LinkOrderModal atualiza
```

---

## 9. Notas Técnicas

### Coexistência de Dois Pipelines

O sistema mantém **dois pipelines paralelos**:

1. **Legado**: `webhook → marketplace_orders_raw → trigger → marketplace_orders_presented_new`. É o que alimenta o status "A vincular" e toda a lógica de vinculação.
2. **Novo (Cycle 0)**: `webhook → orders_sync_queue → orders-queue-worker → orders/order_items/order_shipping`. Pipeline normalizado, sem cálculo de `status_interno`.

Os webhooks `shopee-webhook-orders` e `mercado-livre-webhook-orders` estão marcados como `@deprecated` em favor de `orders-webhook`, mas ainda são usados ativamente.

### Idempotência

Tanto o trigger quanto as edge functions usam `ON CONFLICT ... DO UPDATE`, garantindo que webhooks duplicados não criem registros duplicados.

### Fullfilment (Full)

Pedidos com `logistic_type = 'fulfillment'` (Mercado Livre Full) são automaticamente marcados como "Enviado" e **nunca** passam por "A vincular", mesmo que tenham itens sem vinculação. A lógica `v_is_full → 'Enviado'` tem prioridade sobre `v_has_unlinked_items → 'A vincular'`.

### Seller SKU como "Vinculação Implícita"

Se o anúncio no marketplace tem `seller_sku` preenchido, o item **não é contado como "unlinked"**. O sistema assume que o SKU é suficiente para identificar o produto, mesmo sem um registro explícito em `marketplace_item_product_links`.
