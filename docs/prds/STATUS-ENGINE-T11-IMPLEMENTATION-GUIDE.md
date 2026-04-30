# STATUS-ENGINE-T11 — Guia de Implementação para Agente LLM

> **Objetivo**: Este documento instrui um agente LLM a implementar as correções e melhorias dos fluxos de NFe, Impressão e Coleta do Novura ERP. Ele contém todo o contexto necessário — arquitetura, princípios, contratos existentes, código atual, bugs catalogados e critérios de aceite — para que o agente produza código correto, testável e alinhado ao motor de status (`orders`).

---

## 0. Premissa Fundamental

**A tabela `orders` é a única fonte de verdade para o status de pedidos.**

Toda referência à tabela legada `marketplace_orders_presented_new` deve ser **removida** dos fluxos de status. O sistema não deve mais ler ou escrever `status_interno` nessa tabela para fins de cálculo ou exibição de status. Se uma edge function ainda faz queries em `marketplace_orders_presented_new`, o código deve ser refatorado para usar exclusivamente `orders` e `order_items`.

A tabela `marketplace_item_product_links` **NÃO é legada** — ela persiste como o repositório permanente de vínculos entre anúncios do marketplace e produtos do catálogo interno.

---

## 1. Princípios Obrigatórios

### 1.1 SOLID

| Princípio | Como aplicar neste projeto |
|---|---|
| **S — Single Responsibility** | Cada rule (`CancelledRule`, `ShippedRule`, etc.) decide apenas se ela se aplica. Cada use case (`RecalculateOrderStatusUseCase`, `HandleStockSideEffectsUseCase`) orquestra apenas uma operação. Não misturar persistência, lógica fiscal e cálculo de status numa mesma função. |
| **O — Open/Closed** | `OrderStatusEngine` aceita regras via construtor (`rules?: ReadonlyArray<OrderStatusRule>`). Novas regras são adicionadas como novas classes que implementam `OrderStatusRule` — o engine não precisa ser modificado. |
| **L — Liskov Substitution** | Toda implementação de port (`IOrderRepository`, `IProductLinkRepository`, `IInventoryPort`) é substituível por mocks nos testes sem alterar o comportamento do use case. |
| **I — Interface Segregation** | Os ports são granulares: `IOrderRepository` (persistência de pedidos), `IProductLinkRepository` (vínculos), `IInventoryPort` (estoque). Se um novo port for necessário (e.g., `INfePort`), deve ser criado separadamente. |
| **D — Dependency Inversion** | Use cases dependem de interfaces (ports), nunca de classes concretas do Supabase. A injeção de dependência é feita nos construtores dos use cases e nas factories das edge functions. |

### 1.2 Design Patterns em uso

| Pattern | Onde |
|---|---|
| **Chain of Responsibility** | `OrderStatusEngine` percorre `ReadonlyArray<OrderStatusRule>` em ordem de prioridade. A primeira regra que retorna `true` em `appliesTo()` define o status. |
| **Strategy** | Cada `OrderStatusRule` é uma strategy encapsulada que decide se se aplica a um conjunto de `MarketplaceSignals` + `ProductLinkState`. |
| **Repository** | `IOrderRepository`, `IProductLinkRepository` abstraem toda interação com o banco. |
| **Factory** | Funções `buildRecalculateUseCase(supabase)`, `buildLinkUseCase(supabase)` criam as dependências completas para as edge functions. |
| **Value Object** | `MarketplaceSignals`, `ProductLinkState`, `OrderStatusChangedEvent` são imutáveis e sem identidade. |
| **Port/Adapter (Hexagonal)** | Domínio puro em `domain/orders/`, ports em `domain/orders/ports/`, adapters em `adapters/orders/`. |

### 1.3 DRY

- Não duplicar lógica de normalização de status. Use `getOrderStatusLabel()` para labels PT-BR e `OrderStatus` enum para slugs EN.
- No frontend, o mapeamento PT↔EN para filtros de aba já existe em `matchStatus()` dentro de `useOrderFiltering.ts`. Estender essa função em vez de criar novos mapeadores.
- No backend, toda verificação de "a NF já foi emitida?" deve passar por uma query unificada (via port ou service), não por queries ad hoc em cada edge function.

### 1.4 DDD

- **Bounded Context**: O motor de status é um bounded context (`domain/orders/`). O domínio fiscal (NFe) é outro — deveria ter seu próprio `domain/focus/` (já existe parcialmente).
- **Aggregates**: `OrderRecord` é o aggregate root para o contexto de status. Para NFe, o aggregate seria `InvoiceRecord` (a ser criado).
- **Domain Events**: `OrderStatusChangedEvent` (já existe) comunica mudanças de status. A emissão de NFe deveria disparar um `InvoiceIssuedEvent` que o motor de status consome.
- **Anti-Corruption Layer**: Os adapters de marketplace (`MlMarketplaceSignalsAdapter`, `ShopeeMarketplaceSignalsAdapter`) traduzem a linguagem do marketplace para o modelo de domínio. A emissão de NFe tem seu próprio adapter (Focus API) que precisa de refatoração similar.

---

## 2. Arquitetura Existente (Estado Atual)

### 2.1 Camada de Domínio

Localização: `supabase/functions/_shared/domain/orders/`

```
domain/orders/
├── OrderStatus.ts          # Enum: CANCELLED, RETURNED, UNLINKED, INVOICE_PENDING,
│                           #        READY_TO_PRINT, AWAITING_PICKUP, SHIPPED, PENDING
├── MarketplaceSignals.ts   # Value object: marketplace, shipmentStatus, shipmentSubstatus,
│                           #               isFulfillment, isCancelled, isRefunded, isReturned,
│                           #               isPrintedLabel, hasInvoice, isPickupDone
├── ProductLinkState.ts     # Value object: unlinkedCount, isFullyLinked
├── OrderDomainEvents.ts    # Type: OrderStatusChangedEvent + createStatusChangedEvent()
├── OrderStatusRule.ts      # Interface: name, appliesTo(signals, linkState), status
└── rules/
    ├── CancelledRule.ts
    ├── ReturnedRule.ts
    ├── FulfillmentRule.ts
    ├── UnlinkedRule.ts       # Prioridade alta: bloqueia se há items sem vínculo
    ├── InvoicePendingRule.ts # ML: shipmentSubstatus=invoice_pending; Shopee: readyToShip sem NF
    ├── ReadyToPrintRule.ts   # ML: buffered ou ready_to_print; Shopee: ready_to_ship/processed
    ├── AwaitingPickupRule.ts # ML: isPrintedLabel + ready_to_ship; Shopee: retry_ship
    ├── ShippedRule.ts        # ML: shipped/delivered/etc; Shopee: shipped/completed
    └── PendingRule.ts        # Fallback
```

### 2.2 Ports (Interfaces)

Localização: `supabase/functions/_shared/domain/orders/ports/`

**IOrderRepository** — Métodos: `findById`, `findByMarketplaceOrderId`, `updateStatus`, `markLabelPrinted`, `updateOrderItemsProductId`, `updateInternalFlags`, `addStatusHistory`.

**IProductLinkRepository** — Métodos: `findLink`, `listLinks`, `checkLinks`, `upsertPermanentLink`, `countUnlinkedItems`.

**IInventoryPort** — Métodos: `reserveStockNow`, `enqueueConsumeStock`, `enqueueRefundStock`.

### 2.3 Camada de Aplicação (Use Cases)

Localização: `supabase/functions/_shared/application/orders/`

- **OrderStatusEngine** — Chain of Responsibility. Ordem atual:
  ```
  CancelledRule → ReturnedRule → FulfillmentRule → UnlinkedRule →
  InvoicePendingRule → AwaitingPickupRule → ReadyToPrintRule →
  ShippedRule → PendingRule
  ```
- **RecalculateOrderStatusUseCase** — Busca order via `IOrderRepository`, calcula status via engine, persiste se mudou, dispara stock side effects.
- **HandleStockSideEffectsUseCase** — Reserva síncrona e consume/refund assíncronos.
- **LinkProductToOrderItemUseCase** — Batch linking + recalculate.
- **MarkOrderLabelPrintedUseCase** — Marca impressão + recalculate.

### 2.4 Camada de Infraestrutura (Adapters)

Localização: `supabase/functions/_shared/adapters/orders/`

- **SupabaseOrderRepository** → implementa `IOrderRepository`
- **SupabaseProductLinkRepository** → implementa `IProductLinkRepository`
- **SupabaseInventoryAdapter** → implementa `IInventoryPort`

### 2.5 Edge Functions (Entry Points)

- `mark-labels-printed/index.ts` → `MarkOrderLabelPrintedUseCase`
- `link-order-product/index.ts` → `LinkProductToOrderItemUseCase`
- `orders-queue-worker/index.ts` → `RecalculateOrderStatusUseCase`
- `focus-nfe-emit/index.ts` → **NÃO usa o motor de status** (bug principal)
- `emit-queue-consume/index.ts` → Agrega batch e chama `focus-nfe-emit`
- `focus-webhook/index.ts` → Recebe webhooks Focus NFe

---

## 3. Ordem de Prioridade das Regras (CORRIGIDA)

A ordem a ser implementada na Task N1 é:

```
1. CancelledRule       → cancelled        (terminal)
2. ReturnedRule        → returned         (terminal)
3. FulfillmentRule     → shipped          (short-circuit para Full)
4. UnlinkedRule        → unlinked         (bloqueante)
5. ShippedRule         → shipped          (logística confirma envio)
6. AwaitingPickupRule  → awaiting_pickup  (etiqueta impressa, aguarda coleta)
7. InvoicePendingRule  → invoice_pending  (NF pendente)
8. ReadyToPrintRule    → ready_to_print   (pronto para imprimir etiqueta)
9. PendingRule         → pending          (fallback)
```

**Mudança chave**: `ShippedRule` SOBE para antes de `AwaitingPickupRule` e `InvoicePendingRule`.

**Justificativa**: Se o marketplace já reportou `shipped`, o pedido está em trânsito independentemente do estado local de NF ou impressão. O status `shipped` do marketplace é autoritativo. `InvoicePendingRule` desce para abaixo de `AwaitingPickupRule` porque uma NF pendente é mais bloqueante que "pronto para imprimir" mas menos autoritativa que "já foi coletado/enviado".

---

## 4. Bugs a Corrigir e Tasks

### Task N1: Reordenar regras no OrderStatusEngine

**Arquivo**: `supabase/functions/_shared/application/orders/OrderStatusEngine.ts`

**Ação**: Alterar o array `defaultRules()` para a ordem descrita na Seção 3.

**Princípios**: Open/Closed — o engine não precisa mudar sua lógica, apenas a composição das regras.

**Testes**:
- Atualizar `OrderStatusEngine.test.ts` para validar que:
  - ML com `shipmentStatus=shipped` retorna `SHIPPED` mesmo se `isPrintedLabel=false`
  - ML com `isPrintedLabel=true` + `shipmentStatus=ready_to_ship` retorna `AWAITING_PICKUP`
  - ML com `shipmentSubstatus=invoice_pending` retorna `INVOICE_PENDING` (não `READY_TO_PRINT`)
  - Shopee sem invoice + `ready_to_ship` retorna `INVOICE_PENDING` (não `READY_TO_PRINT`)
  - Shopee com `retry_ship` retorna `AWAITING_PICKUP`

---

### Task N2: Enriquecer AwaitingPickupRule com sinais Shopee

**Arquivo**: `supabase/functions/_shared/domain/orders/rules/AwaitingPickupRule.ts`

**Estado atual**:
```typescript
appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
  if (signals.marketplace === 'mercado_livre') {
    return signals.isPrintedLabel && signals.shipmentStatus === 'ready_to_ship';
  }
  return signals.marketplaceStatus?.toLowerCase() === 'retry_ship';
}
```

**Ação**: Adicionar condição para Shopee `isPrintedLabel` + não-`shipped`:
```typescript
appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
  if (signals.isFulfillment) return false;
  if (signals.marketplace === 'mercado_livre') {
    return signals.isPrintedLabel && signals.shipmentStatus === 'ready_to_ship';
  }
  if (signals.marketplace === 'shopee') {
    return signals.isPrintedLabel ||
      signals.marketplaceStatus?.toLowerCase() === 'retry_ship';
  }
  return false;
}
```

**Princípio**: Single Responsibility — a regra sabe apenas sobre awaiting_pickup, não sobre shipped.

**Testes**:
- Shopee `isPrintedLabel=true` → `AWAITING_PICKUP`
- Shopee `retry_ship` → `AWAITING_PICKUP`
- Shopee `isPrintedLabel=false` + `marketplaceStatus=ready_to_ship` → NÃO aplica
- Fulfillment orders → NÃO aplica

---

### Task N3: Alinhar useNfeStatus com slugs EN

**Arquivo**: `src/hooks/useNfeStatus.ts`

**Bugs**: NFE-B1, NFE-B7

**Estado atual — linha 40**:
```typescript
return si === 'emissao nf' || si === 'subir xml' || si === 'falha na emissao';
```

O hook filtra `pedidos` por `internalStatus` em strings PT. Como `orders.status` usa slugs EN (`invoice_pending`), esse filtro retorna zero pedidos no pipeline novo.

**Ação**:
1. Normalizar a comparação para aceitar tanto slugs EN quanto strings PT legacy:
   ```typescript
   const NFE_STATUSES = new Set([
     'emissao nf', 'subir xml', 'falha na emissao',
     'invoice_pending', 'nfe_error', 'nfe_xml_pending',
   ]);
   return NFE_STATUSES.has(si);
   ```
2. **Alternativamente** (preferível): ler o campo `status` do pedido (slug EN) em vez de `internalStatus`. Usar `OrderStatus.INVOICE_PENDING` como fonte de verdade.
3. Substituir `catch { }` (linha 131) por tratamento de erro com `console.error` e toast de erro para o usuário.
4. Converter de `useState` para React Query (`useQuery`) para caching, retry automático e error handling.

**Princípios**: SRP (hook faz só uma coisa: retorna status NFe), DRY (usar constantes compartilhadas para slugs).

**Testes (Vitest + React Testing Library)**:
- Mock de `fetchNfeStatusRows` retornando dados; verificar que os maps são preenchidos corretamente
- Verificar que pedidos com `status=invoice_pending` são incluídos nos pedidos ativos
- Verificar que erros de rede mostram toast (não são silenciados)

---

### Task N4: Alinhar contagens de badges em useOrderFiltering

**Arquivo**: `src/hooks/useOrderFiltering.ts`

**Bugs**: NFE-B2

**Estado atual — linhas 124-128**:
```typescript
const nfeOrdersAll = useMemo(() => orders.filter(order =>
  normStatus(order.internalStatus) === 'emissao_nf' ||
  normStatus(order.internalStatus) === 'falha_na_emissao' ||
  normStatus(order.internalStatus) === 'subir_xml'
), [orders]);
```

Não inclui `invoice_pending` (slug EN).

**Ação**:
1. O filtro deve verificar tanto o campo `status` (EN slug) quanto `internalStatus` (fallback):
   ```typescript
   const isNfeStatus = (order: Order): boolean => {
     const s = normStatus(order.status ?? order.internalStatus);
     return s === 'invoice_pending' || s === 'emissao_nf' ||
            s === 'falha_na_emissao' || s === 'subir_xml' ||
            s === 'nfe_error' || s === 'nfe_xml_pending';
   };
   ```
2. Aplicar o mesmo padrão em `badgeCountFalha`, `badgeCountProcessando`, `badgeCountEmitir`, `badgeCountSubirXml`.
3. A função `matchStatus()` já suporta dual-slug (ver linhas 24-31). Garantir que `emissao-nf` em `matchStatus` case inclui `invoice_pending` (já inclui).

**Testes (Vitest)**:
- Passar array de orders com mix de `status=invoice_pending` e `internalStatus='Emissao NF'`
- Verificar que `nfeOrdersAll` inclui ambos
- Verificar contagens de badges corretas para cada sub-status

---

### Task N5: Unificar atualização de status após emissão NFe

**Arquivo**: `supabase/functions/focus-nfe-emit/index.ts`

**Bugs**: NFE-B3, NFE-B4

Este é o bug mais crítico. A edge function `focus-nfe-emit` atualmente:
- Lê dados de `marketplace_orders_presented_new` (deve ler de `orders` + `order_items`)
- Grava em `notas_fiscais` e `marketplace_orders_presented_new.status_interno`
- **NÃO atualiza `orders.status`** nem dispara `RecalculateOrderStatusUseCase`

**Ação — Refatoração completa seguindo Hexagonal Architecture**:

1. **Criar port `INfePort`** em `domain/orders/ports/INfePort.ts`:
   ```typescript
   export interface INfePort {
     findInvoiceByOrder(params: {
       readonly companyId: string;
       readonly orderId: string;
       readonly environment: 'homologacao' | 'producao';
     }): Promise<InvoiceRecord | null>;

     upsertInvoice(invoice: InvoiceRecord): Promise<void>;
   }
   ```

2. **Criar use case `EmitNfeUseCase`** em `application/orders/EmitNfeUseCase.ts`:
   - Recebe `orderId`, `companyId`, `organizationId`, `environment`
   - Busca order via `IOrderRepository.findById(orderId)` (não mais `marketplace_orders_presented_new`)
   - Monta payload NFe usando dados de `orders` + `order_items` + `products`
   - Após emissão autorizada: chama `RecalculateOrderStatusUseCase` para que o engine recalcule o status (o campo `hasInvoice` em `MarketplaceSignals` agora será `true`)
   - Persiste resultado em `notas_fiscais` via `INfePort`

3. **Atualizar `MarketplaceSignals`**: Garantir que o campo `hasInvoice` é populado corretamente consultando `notas_fiscais` quando o pedido é carregado pelo `SupabaseOrderRepository.findById()`.

4. **Corrigir URL de polling** (NFE-B4): A URL de polling na linha 1454 usa hardcoded `https://api.focusnfe.com.br`. Deve usar `apiBase` (que já é calculado nas linhas 156-157 como `homologacao` vs `producao`).

5. **NÃO atualizar `marketplace_orders_presented_new`** em nenhum ponto. Remover todas as queries que fazem update de `status_interno` nessa tabela.

**Princípios**: SRP (edge function é só wiring/HTTP), DIP (use case depende de ports, não do Supabase), DRY (reusar `RecalculateOrderStatusUseCase` em vez de calcular status manualmente).

**Testes**:
- Unit test do `EmitNfeUseCase` com mocks de `IOrderRepository`, `INfePort`, `RecalculateOrderStatusUseCase`
- Verificar que após emissão autorizada, `RecalculateOrderStatusUseCase` é chamado
- Verificar que `marketplace_orders_presented_new` NÃO é referenciado

---

### Task N6: Corrigir agregação de batches em emit-queue-consume

**Arquivo**: `supabase/functions/emit-queue-consume/index.ts`

**Bugs**: NFE-B5, NFE-B6

**Estado atual — linhas 72-93**: Usa `orgForBatch`/`companyForBatch` do primeiro item da fila, misturando organizações se houver mensagens de orgs diferentes no mesmo batch.

**Ação**:
1. **Agrupar mensagens por `(organizationId, companyId, environment)`** antes de chamar `focus-nfe-emit`:
   ```typescript
   type BatchKey = `${string}|${string}|${string}`;
   const groups = new Map<BatchKey, { orgId: string; companyId: string; env: string; orderIds: string[]; msgIds: number[] }>();
   for (const r of pgmqRows) {
     const m = r.message ?? {};
     const key: BatchKey = `${m.organizationId}|${m.companyId}|${m.environment}`;
     // ... group into map
   }
   ```
2. **Iterar por grupo**, chamando `focus-nfe-emit` uma vez por grupo.
3. **Dead-letter**: Se `read_ct > 5` (quinta tentativa), mover a mensagem para uma fila dead-letter ou marcar como `error` e não re-processar.
4. **Não remover mensagens de pedidos que falharam** (NFE-B6): Só fazer delete das mensagens cujo `orderId` teve `ok: true` no resultado.

**Princípios**: SRP (consumer só consome e roteia), Strategy (agrupar por key), DRY (não duplicar lógica de mapeamento entre queues).

**Testes**:
- Mock de pgmq rows com 3 orgs diferentes → deve gerar 3 chamadas a `focus-nfe-emit`
- Mock de resultado parcial (1 ok, 1 fail) → só a mensagem do ok é deletada

---

### Task N7: Use case e edge para desfazer impressão

**Novo arquivo**: `supabase/functions/_shared/application/orders/UnmarkOrderLabelPrintedUseCase.ts`
**Novo arquivo**: `supabase/functions/unmark-labels-printed/index.ts`

**Bug**: COLETA-B1

**Ação**:
1. **Criar `UnmarkOrderLabelPrintedUseCase`** seguindo o mesmo padrão de `MarkOrderLabelPrintedUseCase`:
   ```typescript
   export class UnmarkOrderLabelPrintedUseCase {
     constructor(
       private readonly orderRepo: IOrderRepository,
       private readonly recalculateOrderStatus: RecalculateOrderStatusUseCase,
     ) {}

     async execute(input: UnmarkOrderLabelPrintedInput): Promise<UnmarkOrderLabelPrintedResult> {
       await Promise.all(
         input.orderIds.map((id) =>
           this.orderRepo.updateInternalFlags(id, { isPrintedLabel: false })
         ),
       );
       const results = await Promise.all(
         input.orderIds.map((id) => this.recalculateOrderStatus.execute(id, "user_action")),
       );
       // ... map results
     }
   }
   ```
2. **Criar edge function** `unmark-labels-printed` com o mesmo padrão HTTP de `mark-labels-printed`.
3. O status deve voltar para `ready_to_print` (ou outro, conforme o engine recalcular).

**Princípios**: OCP (nova funcionalidade sem modificar código existente), SRP (um use case = uma operação), Liskov (mesmo contrato de IOrderRepository).

**Testes**:
- Unit test: após unmark, `RecalculateOrderStatusUseCase` é chamado com `source=user_action`
- Unit test: flags `isPrintedLabel` é setado para `false`
- Unit test: status recalculado reflete a mudança (e.g., volta para `ready_to_print`)

---

### Task N9: Corrigir NfeEmissionList com slugs EN

**Arquivo**: `src/components/orders/NfeEmissionList.tsx`

**Bugs**: NFE-B8

**Estado atual — linha 108**:
```typescript
const emisStatuses = ['Emissao NF', 'Emissão NF', 'EMISSÃO NF', 'Subir xml', 'subir xml'];
```

Consulta `orders` com strings PT — com pipeline novo, `orders.status` terá `invoice_pending`.

**Ação**:
1. Substituir a query para usar slugs EN:
   ```typescript
   const emisStatuses = ['invoice_pending'];
   ```
2. Remover referências a `marketplace_orders_presented_new` se houver.
3. Atualizar os badges (linhas 231-236) para usar `OrderStatus` values.
4. O componente tem `totalPedidos = 12` hardcoded (linha 229). Substituir pelo count real da query.
5. Converter de `useState` + `useCallback` + `useEffect` para React Query (`useQuery`) conforme boas práticas do projeto.
6. Remover o `supabase.from('orders')` direto — criar um service function em `src/services/orders.service.ts` e um hook wrapper.

**Princípios**: SRP (componente só renderiza, hook busca dados), DRY (service centraliza queries), DIP (componente depende de hook, não do Supabase client).

**Testes (Vitest + React Testing Library)**:
- Renderizar com mock de orders contendo `status=invoice_pending` → verificar que a tabela exibe os pedidos
- Verificar que o badge "Emitir" mostra contagem correta
- Verificar que o botão "Emitir" chama a RPC corretamente

---

### Task N10: Atualizar documentação

**Arquivos**: Criar/atualizar `docs/FLUXO_EMISSAO_NF.md`, `docs/FLUXO_IMPRESSAO.md`, `docs/FLUXO_AGUARDANDO_COLETA.md`

**Ação**: Documentar os fluxos usando **apenas o pipeline novo (`orders`)**. Incluir diagramas Mermaid, referências aos arquivos de código, e links para os PRDs STATUS-ENGINE.

---

## 5. Arquivos Novos a Criar

```
supabase/functions/_shared/
├── domain/orders/ports/
│   └── INfePort.ts                          # N5 — Port para persistência de invoices
├── application/orders/
│   ├── EmitNfeUseCase.ts                    # N5 — Orquestra emissão NFe via orders
│   ├── UnmarkOrderLabelPrintedUseCase.ts    # N7 — Desfazer impressão
│   └── __tests__/
│       ├── EmitNfeUseCase.test.ts           # N5
│       └── UnmarkOrderLabelPrintedUseCase.test.ts  # N7
├── adapters/orders/
│   └── SupabaseNfeAdapter.ts                # N5 — Implementa INfePort
supabase/functions/
└── unmark-labels-printed/
    ├── index.ts                             # N7
    └── config.toml                          # N7
```

## 6. Arquivos Existentes a Modificar

| Arquivo | Task | Tipo de Mudança |
|---|---|---|
| `application/orders/OrderStatusEngine.ts` | N1 | Reordenar array de regras |
| `domain/orders/rules/AwaitingPickupRule.ts` | N2 | Adicionar condição Shopee `isPrintedLabel` |
| `src/hooks/useNfeStatus.ts` | N3 | Aceitar slugs EN, error handling, converter para React Query |
| `src/hooks/useOrderFiltering.ts` | N4 | Incluir `invoice_pending` nos filtros NFe |
| `supabase/functions/focus-nfe-emit/index.ts` | N5 | Refatorar para usar `orders` em vez de `presented_new`, chamar `RecalculateOrderStatusUseCase` |
| `supabase/functions/emit-queue-consume/index.ts` | N6 | Agrupar por org/company/env, fix dead-letter |
| `src/components/orders/NfeEmissionList.tsx` | N9 | Queries com slugs EN, React Query |
| `domain/orders/MarketplaceSignals.ts` | N5 | Verificar se `hasInvoice` é populado corretamente |
| `adapters/orders/SupabaseOrderRepository.ts` | N5 | Carregar `hasInvoice` ao montar `MarketplaceSignals` |

---

## 7. Contratos de Tipo Existentes (Referência Rápida)

### OrderStatus enum
```typescript
enum OrderStatus {
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
  UNLINKED = 'unlinked',
  INVOICE_PENDING = 'invoice_pending',
  READY_TO_PRINT = 'ready_to_print',
  AWAITING_PICKUP = 'awaiting_pickup',
  SHIPPED = 'shipped',
  PENDING = 'pending',
}
```

### MarketplaceSignals (value object)
```typescript
interface MarketplaceSignals {
  organizationId: string;
  marketplaceOrderId: string;
  marketplace: 'mercado_livre' | 'shopee';
  marketplaceStatus: string;
  shipmentStatus?: string;
  shipmentSubstatus?: string;
  isFulfillment: boolean;
  isCancelled: boolean;
  isRefunded: boolean;
  isReturned: boolean;
  isPrintedLabel: boolean;
  hasInvoice: boolean;
  isPickupDone?: boolean;
}
```

### OrderStatusRule (interface)
```typescript
interface OrderStatusRule {
  readonly name: string;
  appliesTo(signals: MarketplaceSignals, linkState: ProductLinkState): boolean;
  readonly status: OrderStatus;
}
```

### RecalculateOrderStatusResult
```typescript
interface RecalculateOrderStatusResult {
  readonly orderId: string;
  readonly previousStatus: OrderStatus | null;
  readonly newStatus: OrderStatus;
  readonly event: OrderStatusChangedEvent;
}
```

---

## 8. Estratégia de Testes

### 8.1 Testes Unitários (Deno — backend)

Localização: `supabase/functions/_shared/application/orders/__tests__/` e `supabase/functions/_shared/domain/orders/__tests__/`

Runner: `deno test --allow-env --allow-read`

**Padrão para mocks**: Cada port tem um mock correspondente:
- `MockOrderRepository implements IOrderRepository`
- `MockProductLinkRepository implements IProductLinkRepository`
- `StubInventoryPort implements IInventoryPort`

Os mocks devem:
- Armazenar chamadas recebidas para assertions (`calls: Array<...>`)
- Retornar dados configuráveis via construtor ou método `givenOrder(order)`
- Ser imutáveis nos inputs (aceitar `readonly` arrays/objects)

**Cobertura mínima por task**:
- N1: 5 cenários de prioridade (ver Seção 4, Task N1)
- N2: 4 cenários Shopee (ver Seção 4, Task N2)
- N5: 3 cenários (emissão ok → recalculate, emissão falha → sem recalculate, order not found)
- N6: 2 cenários (multi-org grouping, partial failure)
- N7: 3 cenários (unmark → recalculate, batch, idempotency)

### 8.2 Testes Unitários (Vitest — frontend)

Localização: `src/hooks/__tests__/`, `src/components/orders/__tests__/`

Runner: `npx vitest`

**Padrão**: `@testing-library/react` + `@testing-library/react-hooks`

**Cobertura mínima**:
- N3: hook retorna maps corretos para slugs EN e PT
- N4: `nfeOrdersAll` inclui `invoice_pending`; badge counts corretos
- N9: componente renderiza com `status=invoice_pending`; botão Emitir funciona

### 8.3 Assertions Importantes

Para todo use case que dispara `RecalculateOrderStatusUseCase`:
```typescript
assertEquals(mockRecalculate.calls.length, 1);
assertEquals(mockRecalculate.calls[0].orderId, expectedOrderId);
assertEquals(mockRecalculate.calls[0].source, "user_action");
```

Para todo use case que chama `IOrderRepository.updateInternalFlags`:
```typescript
assertEquals(mockOrderRepo.updateInternalFlagsCalls.length, expectedCount);
assertEquals(mockOrderRepo.updateInternalFlagsCalls[0].flags, { isPrintedLabel: false });
```

---

## 9. Regras de Código

1. **Máximo 150 linhas por arquivo, 50 linhas por função**. Se uma edge function excede (como `focus-nfe-emit` com 1677 linhas), extrair para use case + services.
2. **Zero `catch {}` vazio**. Todo catch deve pelo menos `console.error`.
3. **Zero referência a `marketplace_orders_presented_new`** em código novo. Para código existente que é refatorado, remover as referências.
4. **Domínio não importa infra**. Nenhum arquivo em `domain/` pode importar de `supabase`, `deno`, ou paths fora de `domain/`.
5. **Use cases não importam adapters**. Apenas ports (interfaces).
6. **JSDoc em inglês** em toda função pública nova ou alterada no backend.
7. **Enum `OrderStatus`** é a única fonte de verdade para status. Nunca hardcodar strings.

---

## 10. Ordem de Execução

```
Fase 1 (Crítica — quebra funcionalidade):
  N1 → N3 → N4 → N9
  (N1 não tem dependências, N3→N4→N9 são sequenciais no frontend)

Fase 2 (Alta — divergência de dados):
  N5 → N6
  (N5 é o mais complexo, N6 depende do fix de N5 indiretamente)

Fase 3 (Média — funcionalidade nova):
  N2, N7
  (independentes entre si)

Fase 4 (Baixa):
  N10 (docs — fazer por último)
```

---

## 11. Definition of Done (por task)

- [ ] Testes unitários passando (Deno para backend, Vitest para frontend)
- [ ] `deno check` sem erros nos arquivos alterados
- [ ] `npm run lint` sem novos erros
- [ ] Zero referência nova a `marketplace_orders_presented_new`
- [ ] `orders.status` é atualizado via `RecalculateOrderStatusUseCase` (não manualmente)
- [ ] Nenhum `catch {}` vazio
- [ ] JSDoc em inglês em funções novas/alteradas (backend)
- [ ] Arquivo <= 150 linhas, função <= 50 linhas
- [ ] Branch criada com padrão `STATUS-ENGINE-T11-N<X>-<descricao-curta>`

---

## 12. Glossário

| Termo | Significado |
|---|---|
| `orders` | Tabela canônica de pedidos. Status calculado pelo engine. **Fonte de verdade.** |
| `marketplace_orders_presented_new` | Tabela **LEGADA**. NÃO usar para cálculo ou exibição de status. Será removida. |
| `notas_fiscais` | Tabela de invoices (NF-e). Persistida por `focus-nfe-emit` e `focus-webhook`. |
| `marketplace_item_product_links` | Tabela de vínculos permanentes SKU↔produto. **NÃO é legada.** |
| `order_items` | Itens do pedido. `product_id` é vínculo efêmero (para aquele pedido específico). |
| Slug EN | Status em inglês (e.g., `invoice_pending`, `ready_to_print`). Usado em `orders.status`. |
| String PT | Status em português (e.g., `Emissao NF`, `Impressão`). Usado no frontend para labels via `getOrderStatusLabel()`. |
| Engine | `OrderStatusEngine` — Chain of Responsibility que calcula o status correto. |
| Port | Interface que define um contrato. Vive em `domain/orders/ports/`. |
| Adapter | Implementação concreta de um port. Vive em `adapters/orders/`. |
| Use Case | Classe de aplicação que orquestra uma operação. Vive em `application/orders/`. |
