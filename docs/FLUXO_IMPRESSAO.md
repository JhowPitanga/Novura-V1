# Fluxo Detalhado: Status "IMPRESSÃO"

> Documentação técnica completa do ciclo de vida de um pedido no status **"Impressão"** — desde a chegada do webhook do marketplace, passagem por edge functions e triggers, até a exibição no frontend e impressão de etiquetas pelo usuário.

---

## 1. Visão Geral

O status **"Impressão"** (internamente `'Impressao'`) indica que um pedido de marketplace está **pronto para impressão de etiqueta de envio**. Isso significa que:

1. Todos os itens do pedido estão **vinculados a produtos do catálogo ERP** (`has_unlinked_items = false`)
2. O pedido **não está cancelado, devolvido ou em fulfillment (Full)**
3. A nota fiscal já foi emitida (se aplicável), ou o marketplace não exige NF antes da impressão
4. O marketplace reportou que o pedido está pronto para etiqueta (condições específicas por marketplace — ver Seção 4)

### Pré-condições para entrar em "Impressão"

Um pedido recebe `status_interno = 'Impressao'` quando **todas** as condições são verdadeiras:

1. O pedido não está cancelado (`v_is_cancelled = false`, `v_is_refunded = false`)
2. O pedido não está devolvido (`v_is_returned = false`)
3. O pedido não é fulfillment/Full (`v_is_full = false`)
4. **Todos os itens estão vinculados** (`has_unlinked_items = false`)
5. O status do shipment corresponde a um dos cenários de "pronto para imprimir" (varia por marketplace)

> **Se o pedido tiver itens não vinculados**, ele fica em **"A vincular"** independentemente do status do marketplace. "A vincular" tem prioridade sobre "Impressão". Ver `docs/FLUXO_A_VINCULAR.md`.

> **Se o pedido ainda precisa de NF**, ele fica em **"Emissão NF"**. "Emissão NF" tem prioridade sobre "Impressão" no Mercado Livre. Ver `docs/FLUXO_EMISSAO_NF.md`.

---

## 2. Arquitetura de Dados — Tabelas Envolvidas

### 2.1 `marketplace_orders_raw`
- **Tipo**: Tabela de staging (dados brutos)
- **Papel**: Armazena o payload completo do marketplace (JSON) sem tratamento
- **Campos-chave**: `id` (UUID, PK), `organizations_id`, `marketplace_name`, `marketplace_order_id`, `order_items` (jsonb), `buyer`, `payments`, `shipments`, `data` (jsonb com todos os dados originais), `status`
- **Constraint única**: `(organizations_id, marketplace_name, marketplace_order_id)`

### 2.2 `marketplace_orders_presented_new`
- **Tipo**: Tabela materializada/desnormalizada (via trigger sobre `marketplace_orders_raw`)
- **Papel**: Versão "apresentável" do pedido, com campos extraídos e calculados. **É a tabela principal que o frontend consulta.**
- **Campos-chave para impressão**:
  - `status_interno` — o status calculado (`'Impressao'`)
  - `has_unlinked_items` — boolean, deve ser `false` para estar em Impressão
  - `linked_products` — jsonb array com os vínculos: `[{ marketplace_item_id, variation_id, product_id, sku, source }]`
  - `printed_label` — boolean, indica se a etiqueta já foi impressa (`shipment_substatus = 'printed'`)
  - `label_cached` — boolean, indica se a etiqueta está salva localmente
  - `label_pdf_base64` — base64 do PDF da etiqueta (quando cacheada)
  - `label_content_base64` — base64 genérico do conteúdo da etiqueta
  - `label_zpl2_base64` — base64 em formato ZPL2 (para impressoras térmicas)
  - `label_fetched_at` — timestamp de quando a etiqueta foi baixada
  - `label_size_bytes` — tamanho do arquivo da etiqueta
  - `label_content_type` — MIME type da etiqueta
  - `label_response_type` — formato original retornado pela API (`'pdf'`, `'zpl'`, etc.)
  - `shipment_status`, `shipment_substatus` — status do envio no marketplace
  - `shipment_sla_expected_date` — data limite para envio (SLA)

### 2.3 `marketplace_item_product_links`
- **Tipo**: Tabela de vínculos permanentes
- **Papel**: Mapeia `(organizations_id, marketplace_name, marketplace_item_id, variation_id)` → `product_id`. Itens com registro aqui são considerados **vinculados automaticamente** para todos os pedidos futuros.
- **Relevância para Impressão**: Um pedido só chega em "Impressão" se TODOS os seus itens estão vinculados (permanente ou efêmero).

### 2.4 `order_status_history`
- **Tipo**: Tabela de auditoria
- **Papel**: Registra cada transição de status (`from_status`, `to_status`, `changed_at`, `source`)
- **Relevância**: Registra quando o pedido entrou em "Impressão" e quando saiu (ex: para "Aguardando Coleta")

---

## 3. Fluxo Completo — Da Chegada do Pedido até "Impressão"

### 3.1 Fase 1: Webhook do Marketplace

```
Marketplace (ML/Shopee) → POST webhook com ID do pedido
         │
         ▼
api/mercado-livre-webhook.ts  ou  api/shopee-webhook.ts  (Vercel)
  - Valida assinatura (x-meli-signature / x-shopee-signature)
  - Encaminha para Edge Function do Supabase
```

**Arquivos**:
- `api/mercado-livre-webhook.ts` — recebe e valida webhooks do Mercado Livre
- `api/shopee-webhook.ts` — recebe e valida webhooks da Shopee

### 3.2 Fase 2: Processamento do Webhook (Edge Function)

```
Edge Function: orders-webhook/index.ts
  - Valida estrutura do payload
  - Extrai identificadores (meli_user_id + marketplace_order_id / shop_id + order_sn)
  - Enfileira mensagem na tabela orders_sync_queue
  - Retorna 200 OK imediatamente (processamento assíncrono)
```

**Arquivo**: `supabase/functions/orders-webhook/index.ts`

### 3.3 Fase 3: Sync do Pedido Completo

O worker (ou sync manual) busca os dados completos do pedido via API do marketplace:

```
mercado-livre-sync-orders/  ou  shopee-sync-orders/
  1. Resolve credenciais OAuth (refresh token se expirado)
  2. GET /orders/{id} (ML) ou equivalente Shopee
  3. Normaliza via MlOrderNormalizeService / ShopeeOrderNormalizeService
     → NormalizedOrder (status = null, marketplace_status = "paid"/"shipped"/etc.)
  4. Upsert via orders-upsert-adapter
     → INSERT/UPDATE em orders, order_items, order_shipping, order_status_history
```

**Arquivos**:
- `supabase/functions/mercado-livre-sync-orders/index.ts`
- `supabase/functions/shopee-sync-orders/index.ts`
- `supabase/functions/_shared/orders-normalize/ml-order-normalize-service.ts`
- `supabase/functions/_shared/orders-normalize/shopee-order-normalize-service.ts`
- `supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.ts`

### 3.4 Fase 4: Upsert em `marketplace_orders_raw`

Os dados brutos do marketplace são salvos (upsert) na tabela `marketplace_orders_raw`. Isso aciona o **trigger de materialização**.

### 3.5 Fase 5: Trigger de Materialização — Cálculo do `status_interno`

**Arquivo principal**: `supabase/migrations/20251205_create_materialize_orders_trigger.sql`
**Trigger**: `on_marketplace_orders_raw_change_new` → função `process_marketplace_order_presented_new()`

#### 5a. Detecção de itens não vinculados (linhas ~279-315)

Para cada item do pedido:
1. Extrai `marketplace_item_id`, `variation_id`, `seller_sku` do JSONB `order_items`
2. Verifica se existe registro em `marketplace_item_product_links` (vínculo permanente)
3. Verifica se existe vínculo efêmero na coluna `linked_products` (JSONB)
4. Se o item **não tem SKU** + **não tem vínculo permanente** + **não tem vínculo efêmero** → item é **não vinculado**

```sql
SELECT COUNT(*) AS v_unlinked_items_count
FROM (order_items_parsed oip)
WHERE (oip.product_id IS NULL AND COALESCE(oip.seller_sku_text, '') = '')
  AND COALESCE(oip.item_id_text, '') <> ''
```

Se `v_unlinked_items_count > 0` → `v_has_unlinked_items := true`

#### 5b. Cálculo do `status_interno` (linhas ~374-400)

A lógica segue uma **cadeia de prioridade** (de cima para baixo, o primeiro match ganha):

```sql
IF v_is_cancelled OR v_is_refunded THEN
    v_status_interno := 'Cancelado';

ELSIF v_is_returned THEN
    v_status_interno := 'Devolução';

ELSIF v_shipment_status = 'pending' AND v_shipment_substatus = 'buffered'
      AND v_has_unlinked_items THEN
    v_status_interno := 'A vincular';            -- ← Buffered + itens não vinculados

ELSIF v_is_full THEN
    v_status_interno := 'Enviado';               -- ← Fulfillment (Full)

ELSIF v_has_unlinked_items THEN
    v_status_interno := 'A vincular';            -- ← Qualquer status + itens não vinculados

ELSIF v_shipment_status = 'pending' AND v_shipment_substatus = 'buffered' THEN
    v_status_interno := 'Impressao';             -- ★ IMPRESSÃO (caso 1)

ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'invoice_pending' THEN
    v_status_interno := 'Emissao NF';            -- ← NF pendente

ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'ready_to_print' THEN
    v_status_interno := 'Impressao';             -- ★ IMPRESSÃO (caso 2)

ELSIF v_shipment_status = 'ready_to_ship' AND v_printed_label THEN
    v_status_interno := 'Aguardando Coleta';     -- ← Já imprimiu

ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'dropped_off'
      AND (payment_status = 'paid') THEN
    v_status_interno := 'Enviado';

ELSIF v_shipment_status IN ('shipped','dropped_off','in_transit',...) THEN
    v_status_interno := 'Enviado';

ELSE
    v_status_interno := 'Pendente';
END IF;
```

#### 5c. Resultado: Upsert em `marketplace_orders_presented_new`

O trigger insere/atualiza o registro na tabela materializada com:
- `status_interno = 'Impressao'`
- `has_unlinked_items = false`
- Campos de etiqueta inicializados como `null` (serão preenchidos depois)
- Todos os campos calculados (buyer, shipment, items, etc.)

### 3.6 Fase 6: Process-Presented (Edge Functions — caminho alternativo)

Além do trigger SQL, existem edge functions que fazem o mesmo cálculo de materialização:

#### Mercado Livre (`mercado-livre-process-presented/index.ts`, linhas 313-324)

```typescript
if (isCancelled || isRefunded) statusInterno = "Cancelado";
else if (isReturned) statusInterno = "Devolução";
else if (isFull) statusInterno = "Enviado";
else if (shipmentStatus === "ready_to_ship" && shipmentSubstatus === "invoice_pending")
    statusInterno = "Emissao NF";
else if (shipmentStatus === "ready_to_ship" && shipmentSubstatus === "ready_to_print")
    statusInterno = "Impressao";    // ★ IMPRESSÃO
else if (shipmentStatus === "ready_to_ship" && printedLabel)
    statusInterno = "Aguardando Coleta";
// ... demais condições
else if (shipmentStatus === "pending" && shipmentSubstatus === "buffered" && hasUnlinkedItems)
    statusInterno = "A vincular";
else if (hasUnlinkedItems) statusInterno = "A vincular";
else statusInterno = "Pendente";
```

#### Shopee (`shopee-process-presented/index.ts`, linhas 292-300)

```typescript
const statusInterno =
  shpOrderStatus === "cancelled" || shpOrderStatus === "in_cancel" ? "Cancelado" :
  shpOrderStatus === "to_return" ? "Devolução" :
  ((shpOrderStatus === "ready_to_ship" || ["logistics_ready","logistics_request_created"]
    .includes(logisticsStatusLower)) && hasUnlinkedItems) ? "A vincular" :
  (shpOrderStatus === "ready_to_ship" && hasNoInvoice) ? "Emissao NF" :
  (["ready_to_ship","processed"].includes(shpOrderStatus)
    || ["logistics_ready","logistics_request_created"].includes(logisticsStatusLower))
    ? "Impressao" :    // ★ IMPRESSÃO
  shpOrderStatus === "retry_ship" ? "Aguardando Coleta" :
  (["shipped","to_confirm_receive","completed"].includes(shpOrderStatus)) ? "Enviado" :
  "Pendente";
```

**Arquivos**:
- `supabase/functions/mercado-livre-process-presented/index.ts`
- `supabase/functions/shopee-process-presented/index.ts`

---

## 4. Condições de Entrada por Marketplace

### 4.1 Mercado Livre

| Condição (shipment) | `status_interno` |
|---|---|
| `status = 'pending'`, `substatus = 'buffered'`, sem itens não vinculados | **Impressao** |
| `status = 'ready_to_ship'`, `substatus = 'ready_to_print'` | **Impressao** |
| `status = 'ready_to_ship'`, `substatus = 'invoice_pending'` | Emissao NF (bloqueante) |
| `status = 'ready_to_ship'`, `substatus = 'printed'` | Aguardando Coleta |

> **Nota**: No Mercado Livre, um pedido pode entrar em "Impressão" antes da NF se o substatus for `buffered` (o ML ainda não pediu a NF). Quando o ML mudar para `invoice_pending`, o pedido vai para "Emissão NF", e depois de emitida a NF, volta para "Impressão" com `ready_to_print`.

### 4.2 Shopee

| Condição (order status / logistics) | `status_interno` |
|---|---|
| `order_status = 'ready_to_ship'` + NF emitida (tem `invoice_number`) | **Impressao** |
| `order_status = 'processed'` | **Impressao** |
| `logistics_status = 'logistics_ready'` ou `'logistics_request_created'` | **Impressao** |
| `order_status = 'ready_to_ship'` + sem `invoice_number` | Emissao NF (bloqueante) |

---

## 5. Vinculação — Quem Decide se é "A Vincular" ou "Impressão"?

### 5.1 Vinculação Automática (sem interação do usuário)

Um item é considerado **automaticamente vinculado** quando:

1. **Tem `seller_sku` preenchido no marketplace**: Se o anúncio no marketplace já possui um SKU, o sistema assume que o item está identificado. Itens com SKU **não são contados como "não vinculados"** (linha ~300 do trigger).

2. **Existe registro em `marketplace_item_product_links`**: Se o par `(marketplace_item_id, variation_id)` da organização tem um vínculo permanente nessa tabela, o item é resolvido automaticamente. Isso acontece quando o usuário já vinculou esse mesmo anúncio em um pedido anterior com a opção "vincular permanente".

### 5.2 Vinculação Efêmera (coluna `linked_products`)

Um vínculo efêmero salvo na coluna `linked_products` (JSONB) de `marketplace_orders_presented_new` também resolve o item, mas **apenas para aquele pedido específico**. Não persiste para pedidos futuros.

### 5.3 Vinculação Manual (usuário no frontend)

Quando nenhuma das condições acima é atendida, o pedido entra em **"A vincular"** e o usuário precisa:

1. Abrir o modal `LinkOrderModal` (`src/components/orders/LinkOrderModal.tsx`)
2. Para cada item não vinculado, selecionar o produto ERP correspondente via `ProductPickerDialog`
3. Opcionalmente marcar "Vincular permanente" (cria registro em `marketplace_item_product_links`)
4. O sistema chama a edge function `linked_products_item` que:
   - Salva o vínculo (permanente ou efêmero)
   - Reserva estoque via `fn_order_reserva_stock_linked`
   - Recalcula o `status_interno` chamando `process-presented` com `status_only=true`
5. Se todos os itens ficarem vinculados → `status_interno` muda para o próximo status (que pode ser "Impressão" se as condições de shipment forem satisfeitas)

**Arquivo**: `supabase/functions/linked_products_item/index.ts`

### 5.4 Diagrama da Decisão

```
Item do pedido chega
       │
       ▼
Tem seller_sku? ──── SIM ──→ VINCULADO (automático por SKU)
       │ NÃO
       ▼
Existe em marketplace_item_product_links? ──── SIM ──→ VINCULADO (permanente)
       │ NÃO
       ▼
Existe em linked_products (JSONB)? ──── SIM ──→ VINCULADO (efêmero)
       │ NÃO
       ▼
ITEM NÃO VINCULADO → pedido vai para "A vincular"
```

---

## 6. Reserva de Estoque na Impressão

### 6.1 Trigger de Inventário

**Arquivo**: `supabase/migrations/20251208_presented_new_inventory_on_cancel_trigger.sql`
**Trigger**: `trg_presented_new_inventory` sobre `marketplace_orders_presented_new`

Quando um pedido entra em "Impressão" (ou "Emissão NF" ou "Aguardando Coleta"), o trigger executa:

```sql
ELSIF COALESCE(NEW.status_interno, '') IN ('Emissao NF', 'Impressao', 'Aguardando Coleta')
      AND COALESCE(NEW.has_unlinked_items, false) = false THEN
    PERFORM public.reserve_stock_for_order(NEW.id, v_storage);
```

Ou seja: **ao entrar em "Impressão", o estoque dos produtos vinculados é reservado automaticamente**.

### 6.2 Reversão de Estoque

Se o pedido for cancelado, o mesmo trigger faz o estorno:

```sql
IF ... status = 'Cancelado' ... THEN
    PERFORM public.refund_reserved_stock_for_order(NEW.id, v_storage);
```

Se o pedido avançar para "Enviado", o estoque é **confirmado como saída** (baixa definitiva).

---

## 7. Etiqueta de Envio — Cache e Impressão

### 7.1 Como a Etiqueta é Obtida

A etiqueta de envio **não é gerada pelo Novura** — ela é **baixada da API do marketplace** e cacheada no banco.

#### Shopee

As edge functions `shopee-webhook-orders` e `shopee-arrange-shipment` buscam a etiqueta automaticamente:

```typescript
// shopee-arrange-shipment/index.ts (linhas ~579-593)
updLabel["label_cached"] = true;
updLabel["label_response_type"] = String(docFormat).toLowerCase();  // "pdf", "zpl"
updLabel["label_fetched_at"] = nowIso;
updLabel["label_size_bytes"] = sizeBytes;
updLabel["label_content_base64"] = chosenB64;
if (docFormat === "pdf") updLabel["label_pdf_base64"] = chosenB64;
if (docFormat.includes("zpl")) updLabel["label_zpl2_base64"] = chosenB64;

await admin.from("marketplace_orders_presented_new").update(updLabel).eq("id", it.id);
```

**Arquivos**:
- `supabase/functions/shopee-webhook-orders/index.ts` (linhas ~824-840 e ~1043-1056)
- `supabase/functions/shopee-arrange-shipment/index.ts` (linhas ~579-593)

#### Mercado Livre

No momento da materialização, os campos de label são inicializados como `null`:

```typescript
// mercado-livre-process-presented/index.ts (linhas 449-456)
label_cached: false,
label_response_type: null,
label_fetched_at: null,
label_size_bytes: null,
label_content_base64: null,
label_content_type: null,
label_pdf_base64: null,
label_zpl2_base64: null,
```

A etiqueta é cacheada quando disponível na API do Mercado Livre (tipicamente após o substatus mudar para `ready_to_print`).

### 7.2 Como a Etiqueta é Impressa no Frontend

**Arquivo**: `src/pages/Orders.tsx` (função `handlePrintLabels`, linhas ~941-960)

```typescript
const handlePrintLabels = async () => {
    const pedidosToPrint = pedidos.filter(p =>
        selectedPedidosImpressao.includes(p.id));
    if (pedidosToPrint.length === 0) return;

    // Extrai PDFs base64 dos pedidos selecionados
    const pdfs = pedidosToPrint
        .map(p => p?.label?.pdf_base64)
        .filter(Boolean);
    if (pdfs.length === 0) return;

    // Decodifica e abre cada PDF
    for (const base64 of pdfs) {
        const binStr = atob(base64);
        const bytes = new Uint8Array([...binStr].map(c => c.charCodeAt(0)));
        // Abre PDF no navegador para impressão
    }
};
```

**Verificação de disponibilidade** (`PrintFilterBar.tsx`, linha 80-83):

```typescript
const hasLabelData = selectedPedidosImpressao.length > 0
    && selectedPedidosImpressao.some(id => {
        const p = pedidos.find(pp => pp.id === id);
        return Boolean(p?.label?.pdf_base64
            || p?.label?.content_base64
            || p?.label?.zpl2_base64);
    });
```

O botão de imprimir só fica habilitado se pelo menos um pedido selecionado tem dados de etiqueta.

---

## 8. Frontend — Aba "Impressão" na Página de Pedidos

### 8.1 Blocos de Status

**Arquivo**: `src/pages/Orders.tsx` (linhas ~920-928)

A aba "Impressão" é um dos blocos de status na barra superior:

```typescript
{ id: 'impressao', title: 'Impressão',
  count: statusCountsGlobal['impressao'],
  description: 'NF e etiqueta' }
```

### 8.2 Filtragem

**Arquivo**: `src/hooks/useOrderFiltering.ts` (linhas ~23, 118, 152)

Pedidos são filtrados pelo `status_interno` normalizado:

```typescript
// matchStatus normaliza e compara
// 'Impressao', 'Impressão', 'IMPRESSÃO' → todos reconhecidos como 'impressao'
```

### 8.3 Barra de Filtros Específica

**Arquivo**: `src/components/orders/PrintFilterBar.tsx`

Quando a aba "Impressão" está ativa, uma barra de filtros específica aparece com:
- **Busca**: por ID, cliente, SKU ou produto
- **Ordenação**: por tipo de envio, SLA próximo, mais recente
- **Filtro por Marketplace**: Mercado Livre, Shopee, etc.
- **Filtro por Tipo de Envio**: agrupado por tipo logístico
- **Botão "Imprimir Etiquetas"**: habilitado apenas se pedidos selecionados têm etiqueta cacheada
- **Lista de separação**: (em breve)
- **Scanner**: (em breve)

### 8.4 Cor do Badge

**Arquivo**: `src/utils/orderUtils.ts` (linha 149)

```typescript
case 'impressao':
    return 'bg-purple-600 hover:bg-purple-700 text-white';  // Roxo
```

### 8.5 Seleção de Pedidos

**Arquivo**: `src/components/orders/OrderTableRow.tsx`

Pedidos em "Impressão" podem ser selecionados individualmente via checkbox para:
- Impressão em lote de etiquetas
- Impressão de lista de separação (picking list)
- Configuração de impressão (modal `PrintConfigModal`)

---

## 9. Transições de Status

### 9.1 Como o Pedido ENTRA em "Impressão"

| Origem | Condição | Mecanismo |
|---|---|---|
| **A vincular** | Usuário vincula todos os itens + shipment compatível | `linked_products_item` → `process-presented` recalcula status |
| **Emissão NF** | NF emitida + XML submetido ao ML + substatus muda para `ready_to_print` | Webhook do ML → trigger recalcula |
| **Pendente** | Pedido chega já com `pending/buffered` + todos itens vinculados (tem SKU ou link permanente) | Trigger na inserção em `marketplace_orders_raw` |
| **Novo pedido** (Shopee) | Pedido chega com `ready_to_ship`/`processed` + NF ok + itens vinculados | Webhook → `shopee-process-presented` |

### 9.2 Como o Pedido SAI de "Impressão"

| Destino | Condição | Mecanismo |
|---|---|---|
| **Aguardando Coleta** | Etiqueta impressa → `shipment_substatus = 'printed'` | Webhook do ML atualiza raw → trigger recalcula |
| **Enviado** | Marketplace reporta `shipped`/`dropped_off`/`in_transit` | Webhook → trigger recalcula |
| **Cancelado** | Marketplace reporta cancelamento | Webhook → trigger recalcula + estorno de estoque |
| **Devolução** | Marketplace reporta devolução | Webhook → trigger recalcula |

### 9.3 Diagrama de Transições

```
                ┌─────────────┐
                │  A vincular  │
                └──────┬───────┘
                       │ (vinculação completa)
                       ▼
┌─────────────┐    ┌──────────────┐    ┌────────────────────┐
│  Emissão NF │───▶│  IMPRESSÃO   │───▶│  Aguardando Coleta │
└─────────────┘    └──────────────┘    └────────────────────┘
  (NF emitida)     │              │         │
                   │              │         ▼
                   │              │    ┌──────────┐
                   │              ├───▶│ Enviado  │
                   │              │    └──────────┘
                   │              │
                   │              │    ┌───────────┐
                   └──────────────┴───▶│ Cancelado │
                                       └───────────┘
```

---

## 10. Fluxo Completo — Diagrama End-to-End

```
┌─────────────────────────────────────────────────────────────┐
│ MARKETPLACE (Mercado Livre / Shopee)                         │
│  - Venda confirmada, pagamento aprovado                      │
└──────────────────────────┬──────────────────────────────────┘
                           │ Webhook (order_id)
                           ▼
              ┌────────────────────────────┐
              │  api/[marketplace]-webhook │  (Vercel)
              │  Valida assinatura          │
              └────────────┬───────────────┘
                           │
              ┌────────────▼───────────────┐
              │  orders-webhook (Edge Fn)   │
              │  Enfileira na sync_queue    │
              └────────────┬───────────────┘
                           │
              ┌────────────▼───────────────┐
              │  [marketplace]-sync-orders  │
              │  Fetch dados completos      │
              │  Normaliza → NormalizedOrder│
              └────────────┬───────────────┘
                           │
              ┌────────────▼───────────────┐
              │  Upsert marketplace_orders_ │
              │  raw (tabela de staging)    │
              └────────────┬───────────────┘
                           │ (trigger dispara)
              ┌────────────▼───────────────────────────────┐
              │  process_marketplace_order_presented_new()  │
              │  1. Conta itens não vinculados              │
              │  2. Calcula status_interno                  │
              │     └─ has_unlinked? → "A vincular"        │
              │     └─ pending/buffered? → "Impressao"  ★  │
              │     └─ ready_to_ship/ready_to_print?        │
              │        → "Impressao" ★                      │
              │  3. Upsert marketplace_orders_presented_new │
              └────────────┬───────────────────────────────┘
                           │ (trigger de inventário dispara)
              ┌────────────▼───────────────────────────────┐
              │  trg_presented_new_inventory                │
              │  status_interno IN ('Impressao',...)?       │
              │  → reserve_stock_for_order()               │
              └────────────┬───────────────────────────────┘
                           │
              ┌────────────▼───────────────┐
              │  Frontend: Página Pedidos   │
              │  Aba "Impressão" (roxo)     │
              │  Lista pedidos prontos      │
              │  Usuário seleciona e imprime│
              │  etiquetas (PDF/ZPL)        │
              └────────────────────────────┘
```

---

## 11. Referência de Arquivos

| Responsabilidade | Arquivo |
|---|---|
| **Webhook ML** | `api/mercado-livre-webhook.ts` |
| **Webhook Shopee** | `api/shopee-webhook.ts` |
| **Webhook unificado** | `supabase/functions/orders-webhook/index.ts` |
| **Sync ML** | `supabase/functions/mercado-livre-sync-orders/index.ts` |
| **Sync Shopee** | `supabase/functions/shopee-sync-orders/index.ts` |
| **Normalização ML** | `supabase/functions/_shared/orders-normalize/ml-order-normalize-service.ts` |
| **Normalização Shopee** | `supabase/functions/_shared/orders-normalize/shopee-order-normalize-service.ts` |
| **Upsert adapter** | `supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.ts` |
| **Trigger status (SQL)** | `supabase/migrations/20251205_create_materialize_orders_trigger.sql` |
| **Trigger inventário** | `supabase/migrations/20251208_presented_new_inventory_on_cancel_trigger.sql` |
| **Process ML** | `supabase/functions/mercado-livre-process-presented/index.ts` |
| **Process Shopee** | `supabase/functions/shopee-process-presented/index.ts` |
| **Vinculação (Edge Fn)** | `supabase/functions/linked_products_item/index.ts` |
| **Vinculação (Frontend)** | `src/components/orders/LinkOrderModal.tsx` |
| **Reserva de estoque** | `supabase/migrations/20251229_fn_order_reserva_stock_linked.sql` |
| **Links permanentes** | `supabase/migrations/20251030120000_marketplace_item_product_links.sql` |
| **Página de pedidos** | `src/pages/Orders.tsx` |
| **Filtro Impressão** | `src/components/orders/PrintFilterBar.tsx` |
| **Linha da tabela** | `src/components/orders/OrderTableRow.tsx` |
| **Filtro de status** | `src/hooks/useOrderFiltering.ts` |
| **Cores de status** | `src/utils/orderUtils.ts` |
| **Dashboard stats** | `src/services/dashboard.service.ts` |
| **Etiqueta cache (Shopee)** | `supabase/functions/shopee-arrange-shipment/index.ts` |
| **Etiqueta cache (Shopee webhook)** | `supabase/functions/shopee-webhook-orders/index.ts` |

---

## 12. Resumo das Regras Críticas

1. **"A vincular" tem prioridade absoluta** sobre qualquer status — se houver 1 item não vinculado, o pedido nunca chega em "Impressão"
2. **"Emissão NF" tem prioridade** sobre "Impressão" quando `shipment_substatus = 'invoice_pending'`
3. **Estoque é reservado automaticamente** ao entrar em "Impressão" (trigger de inventário)
4. **Etiqueta é cacheada da API do marketplace**, não gerada internamente
5. **A impressão no frontend** decodifica o base64 do PDF e abre no navegador
6. **Após impressão**, o marketplace atualiza substatus para `'printed'`, e o trigger muda o pedido para "Aguardando Coleta"
7. **Vinculação permanente** via `marketplace_item_product_links` faz com que pedidos futuros com o mesmo anúncio pulem "A vincular" automaticamente
