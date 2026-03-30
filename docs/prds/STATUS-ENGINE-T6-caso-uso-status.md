# STATUS-ENGINE-T6 — Use Cases: Recalcular Status e Marcar Etiqueta Impressa

**Ciclo:** Motor de Status de Pedidos
**Status:** 🔴 Não iniciado
**Depende de:** [T2 — Ports](./STATUS-ENGINE-T2-portas.md), [T3 — Engine](./STATUS-ENGINE-T3-calculadora.md), [T4 — Adapters](./STATUS-ENGINE-T4-adaptadores.md)
**Bloqueia:** T5, T7, T9

---

## 1. Visão Geral (para não-técnicos)

Esta task cria dois use cases centrais:

**RecalculateOrderStatusUseCase** — É o "árbitro" do sistema. Sempre que qualquer coisa muda em um pedido (chegou webhook, usuário vinculou produto, NF foi emitida), este use case é chamado para decidir qual deve ser o novo status. Ele busca as informações necessárias, passa para o motor de cálculo (T3), e persiste o resultado.

**MarkOrderLabelPrintedUseCase** — Cuida especificamente da ação "imprimir etiqueta". No Mercado Livre, quando o vendedor imprime a etiqueta, o pedido deve mover para "Aguardando Coleta". Este use case atualiza o campo `is_printed_label`, depois imediatamente recalcula o status — garantindo que a transição aconteça de forma correta.

A diferença da abordagem atual: hoje a impressão usa uma RPC SQL que **força** o status para 'Aguardando Coleta' diretamente, sem passar pelo engine de regras. Se o pedido não estivesse nas condições certas, o status ficaria inconsistente.

---

## 2. Arquivos a Criar

### 2.1 `supabase/functions/_shared/application/orders/RecalculateOrderStatusUseCase.ts`

**Responsabilidade:** Dado um pedido, recalcular seu status interno e persistir se mudou.

**Fluxo:**
1. Buscar o pedido atual (com todos os sinais do marketplace) via `IOrderRepository`
2. Verificar o estado de vinculação dos itens via `IProductLinkRepository`
3. Chamar `OrderStatusEngine.calculate(signals, linkState)` (T3)
4. Se o status calculado é diferente do atual, persistir via `IOrderRepository.updateStatus()`
5. Emitir evento `OrderStatusChangedEvent` (para que HandleStockSideEffectsUseCase reaja)
6. Retornar resultado com statusChanged + newStatus

**Importante:** Side effects (estoque) NÃO são tratados aqui. Este use case apenas calcula e persiste. Quem orquestra os side effects é a camada acima (T9, na edge function).

```typescript
import type { IOrderRepository } from '../../ports/orders/IOrderRepository.ts';
import type { IProductLinkRepository, OrderItemLinkQuery } from '../../ports/orders/IProductLinkRepository.ts';
import { OrderStatusEngine } from './OrderStatusEngine.ts';
import { createProductLinkState } from '../../domain/orders/ProductLinkState.ts';
import { createStatusChangedEvent, type OrderStatusChangedEvent } from '../../domain/orders/OrderDomainEvents.ts';
import type { OrderStatus } from '../../domain/orders/OrderStatus.ts';

export interface RecalculateInput {
  orderId: string;
  organizationId: string;
  source: 'webhook' | 'user_action' | 'sync';
}

export interface RecalculateResult {
  orderId: string;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  /** true se o status mudou (previousStatus !== newStatus) */
  statusChanged: boolean;
  /** Evento emitido, caso o chamador queira reagir */
  event: OrderStatusChangedEvent | null;
}

/**
 * Use Case: Recalcula o status interno de um pedido.
 *
 * Deve ser chamado sempre que algo muda em um pedido:
 * - Chegada de webhook do marketplace
 * - Usuário vincula produto (após todos os itens vinculados)
 * - NF-e emitida
 * - Após qualquer operação que possa afetar o status
 *
 * Garantias:
 * - Idempotente: chamá-lo múltiplas vezes com os mesmos dados produz o mesmo resultado
 * - Se o status não muda, nenhuma escrita no banco ocorre
 * - Não trata side effects (estoque, notificações) — apenas persiste o status
 */
export class RecalculateOrderStatusUseCase {
  private readonly engine = new OrderStatusEngine();

  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly linkRepo: IProductLinkRepository,
  ) {}

  async execute(input: RecalculateInput): Promise<RecalculateResult> {
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) throw new Error(`Order ${input.orderId} not found`);

    const linkState = await this.resolveProductLinkState(order, input.organizationId);
    const newStatus = this.engine.calculate(order.marketplaceSignals, linkState);

    // Otimização: não escreve no banco se o status não mudou
    if (order.currentStatus === newStatus) {
      return {
        orderId: input.orderId,
        previousStatus: order.currentStatus,
        newStatus,
        statusChanged: false,
        event: null,
      };
    }

    const updateResult = await this.orderRepo.updateStatus({
      orderId: input.orderId,
      newStatus,
      source: input.source,
    });

    const event = createStatusChangedEvent({
      orderId: input.orderId,
      organizationId: input.organizationId,
      previousStatus: updateResult.previousStatus,
      newStatus,
      source: input.source,
    });

    return {
      orderId: input.orderId,
      previousStatus: updateResult.previousStatus,
      newStatus,
      statusChanged: true,
      event,
    };
  }

  private async resolveProductLinkState(order: any, organizationId: string) {
    // Carrega itens do pedido — precisamos saber quais não têm vínculo
    const items: OrderItemLinkQuery[] = (order.items ?? []).map((item: any) => ({
      marketplaceItemId: item.marketplaceItemId ?? '',
      variationId: item.variationId ?? '',
      sellerSku: item.sellerSku ?? '',
    }));

    if (items.length === 0) return createProductLinkState(0);

    const unlinkedCount = await this.linkRepo.countUnlinkedItems({
      organizationId,
      marketplace: order.marketplace,
      orderId: order.id,
      items,
    });
    return createProductLinkState(unlinkedCount);
  }
}
```

**Tamanho esperado:** ~80 linhas

---

### 2.2 `supabase/functions/_shared/application/orders/MarkOrderLabelPrintedUseCase.ts`

**Responsabilidade:** Marcar etiquetas como impressas e recalcular o status dos pedidos afetados.

**Por que este use case existe:** No ML, a transição para "Aguardando Coleta" acontece quando o usuário imprime a etiqueta. O campo `is_printed_label` no pedido deve ser atualizado para `true`, e então o `RecalculateOrderStatusUseCase` deve ser chamado — o engine vai detectar que `isPrintedLabel = true` e calcular `AWAITING_PICKUP`.

**Substituição:** Hoje esta lógica está na RPC SQL `rpc_marketplace_order_print_label` que escreve diretamente `status_interno = 'Aguardando Coleta'` sem passar pelo engine. O novo use case passa pelo engine, garantindo que as pré-condições sejam verificadas.

```typescript
import type { IOrderRepository } from '../../ports/orders/IOrderRepository.ts';
import type { RecalculateOrderStatusUseCase } from './RecalculateOrderStatusUseCase.ts';

export interface MarkLabelPrintedInput {
  orderIds: string[];
  organizationId: string;
}

export interface MarkLabelPrintedResult {
  processed: number;
  statusChanges: Array<{
    orderId: string;
    newStatus: string;
  }>;
}

/**
 * Use Case: Marca etiquetas como impressas e atualiza status dos pedidos.
 *
 * Chamado quando o usuário clica "Imprimir etiquetas" na aba Impressão.
 *
 * Para cada pedido:
 * 1. Seta is_printed_label = true no banco
 * 2. Chama RecalculateOrderStatusUseCase → o engine detectará AWAITING_PICKUP
 *
 * Diferença da abordagem legada (RPC SQL que forçava o status):
 * - A nova abordagem passa pelo engine de regras
 * - Se um pedido não está nas condições corretas para AWAITING_PICKUP,
 *   ele não terá o status alterado (sem bypass das regras)
 */
export class MarkOrderLabelPrintedUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly recalculate: RecalculateOrderStatusUseCase,
  ) {}

  async execute(input: MarkLabelPrintedInput): Promise<MarkLabelPrintedResult> {
    // 1. Atualiza is_printed_label = true para todos os pedidos
    await this.orderRepo.markLabelPrinted({
      orderIds: input.orderIds,
      organizationId: input.organizationId,
    });

    // 2. Recalcula status de cada pedido em paralelo
    const results = await Promise.all(
      input.orderIds.map(orderId =>
        this.recalculate.execute({
          orderId,
          organizationId: input.organizationId,
          source: 'user_action',
        })
      )
    );

    const statusChanges = results
      .filter(r => r.statusChanged)
      .map(r => ({ orderId: r.orderId, newStatus: r.newStatus }));

    return {
      processed: input.orderIds.length,
      statusChanges,
    };
  }
}
```

**Tamanho esperado:** ~60 linhas

---

## 3. Testes

### Arquivo: `__tests__/application/RecalculateOrderStatusUseCase.test.ts`

```typescript
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { RecalculateOrderStatusUseCase } from "../RecalculateOrderStatusUseCase.ts";
import { MockOrderRepository } from "../../__mocks__/MockOrderRepository.ts";
import { MockProductLinkRepository } from "../../__mocks__/MockProductLinkRepository.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";

function createUseCase() {
  const orderRepo = new MockOrderRepository();
  const linkRepo = new MockProductLinkRepository({ remainingUnlinked: 0 });
  return { useCase: new RecalculateOrderStatusUseCase(orderRepo, linkRepo), orderRepo, linkRepo };
}

Deno.test("RecalculateStatus: não escreve no banco se status não mudou", async () => {
  const { useCase, orderRepo } = createUseCase();
  // Seed um pedido que já está SHIPPED, com signals que resultam em SHIPPED
  orderRepo.seed({
    id: 'order-1', organizationId: 'org-1', marketplace: 'mercado_livre',
    marketplaceOrderId: '123', currentStatus: OrderStatus.SHIPPED,
    marketplaceSignals: { ..., shipmentStatus: 'shipped', isCancelled: false, isRefunded: false, isReturned: false, isFulfillment: false, isPrintedLabel: false, hasInvoice: false },
    items: [],
  });
  const result = await useCase.execute({ orderId: 'order-1', organizationId: 'org-1', source: 'webhook' });
  assertEquals(result.statusChanged, false);
  assertEquals(orderRepo.updatedStatuses.length, 0); // nenhuma escrita
});

Deno.test("RecalculateStatus: muda status e emite evento", async () => {
  const { useCase, orderRepo } = createUseCase();
  orderRepo.seed({
    id: 'order-2', organizationId: 'org-1', marketplace: 'mercado_livre',
    marketplaceOrderId: '456', currentStatus: OrderStatus.PENDING,
    marketplaceSignals: { ..., shipmentStatus: 'shipped', isCancelled: false, isRefunded: false, isReturned: false, isFulfillment: false, isPrintedLabel: false, hasInvoice: false },
    items: [],
  });
  const result = await useCase.execute({ orderId: 'order-2', organizationId: 'org-1', source: 'webhook' });
  assertEquals(result.statusChanged, true);
  assertEquals(result.newStatus, OrderStatus.SHIPPED);
  assertEquals(result.event?.type, 'ORDER_STATUS_CHANGED');
});

Deno.test("RecalculateStatus: lança erro se pedido não existe", async () => {
  const { useCase } = createUseCase();
  let threw = false;
  try {
    await useCase.execute({ orderId: 'inexistente', organizationId: 'org-1', source: 'webhook' });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
```

### Arquivo: `__tests__/application/MarkOrderLabelPrintedUseCase.test.ts`

```typescript
Deno.test("MarkLabelPrinted: chama markLabelPrinted e recalcula status", async () => {
  const orderRepo = new MockOrderRepository();
  orderRepo.seed({
    id: 'order-3', organizationId: 'org-1', marketplace: 'mercado_livre',
    marketplaceOrderId: '789', currentStatus: OrderStatus.READY_TO_PRINT,
    // após marcar como impresso, signals terão isPrintedLabel=true e engine retorna AWAITING_PICKUP
    marketplaceSignals: { ..., shipmentStatus: 'ready_to_ship', isPrintedLabel: false, ... },
    items: [],
  });
  const linkRepo = new MockProductLinkRepository({ remainingUnlinked: 0 });
  const recalculate = new RecalculateOrderStatusUseCase(orderRepo, linkRepo);
  const useCase = new MarkOrderLabelPrintedUseCase(orderRepo, recalculate);

  const result = await useCase.execute({ orderIds: ['order-3'], organizationId: 'org-1' });
  assertEquals(result.processed, 1);
  assertEquals(orderRepo.labelPrintedCalledWith, ['order-3']);
});
```

---

## 4. Adições ao `IOrderRepository` (T2)

Os seguintes campos precisam ser adicionados ao `OrderRecord` (retornado por `findById`):

```typescript
export interface OrderRecord {
  // ... campos existentes ...
  /** Lista de itens do pedido — necessária para calcular linkState */
  items: Array<{
    id: string;
    marketplaceItemId: string;
    variationId: string;
    sellerSku: string;
    productId: string | null;
  }>;
}
```

E o `SupabaseOrderRepository.findById()` deve incluir `order_items` na query via join.

---

## 5. Definition of Done

- [ ] `RecalculateOrderStatusUseCase.ts` criado em `application/orders/`
- [ ] `MarkOrderLabelPrintedUseCase.ts` criado em `application/orders/`
- [ ] `RecalculateOrderStatusUseCase` é idempotente (não escreve se status não mudou)
- [ ] `RecalculateOrderStatusUseCase` retorna `event: null` quando status não muda
- [ ] `MarkOrderLabelPrintedUseCase` chama `markLabelPrinted` ANTES de recalcular
- [ ] `OrderRecord` atualizado com campo `items[]`
- [ ] `SupabaseOrderRepository.findById()` carrega `order_items` com join
- [ ] Testes unitários para `RecalculateOrderStatusUseCase` (mínimo 3 cenários)
- [ ] Testes unitários para `MarkOrderLabelPrintedUseCase` (mínimo 2 cenários)
- [ ] Todos os testes passam sem banco de dados
- [ ] Nenhum arquivo excede 150 linhas
