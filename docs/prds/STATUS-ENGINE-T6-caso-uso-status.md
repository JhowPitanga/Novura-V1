# STATUS-ENGINE-T6 — Use Cases: Recalcular Status e Marcar Etiqueta Impressa

**Ciclo:** Motor de Status de Pedidos
**Status:** ✅ Implementado
**Depende de:** [T2 — Ports](./STATUS-ENGINE-T2-portas.md), [T3 — Engine](./STATUS-ENGINE-T3-calculadora.md), [T4 — Adapters](./STATUS-ENGINE-T4-adaptadores.md), [T7 — Estoque](./STATUS-ENGINE-T7-caso-uso-estoque.md)
**Bloqueia:** T5, T9

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

**Importante:** Side effects de estoque SÃO tratados aqui via injeção de `HandleStockSideEffectsUseCase` (T7). O orçamento de chamada é: reserva síncrona (bloqueia a escrita de status) + consumo/devolução assíncrono (não bloqueia).

```typescript
import { createStatusChangedEvent, type OrderStatusChangedEvent } from "../../domain/orders/OrderDomainEvents.ts";
import { createProductLinkState } from "../../domain/orders/ProductLinkState.ts";
import type { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import { HandleStockSideEffectsUseCase } from "./HandleStockSideEffectsUseCase.ts";
import { OrderStatusEngine } from "./OrderStatusEngine.ts";

export interface RecalculateOrderStatusResult {
  readonly orderId: string;
  readonly newStatus: OrderStatus;
  readonly event: OrderStatusChangedEvent;
}

/**
 * Use Case: Recalculates and persists order status when signals/items changed.
 *
 * Must be called whenever something changes in an order:
 * - Marketplace webhook received
 * - User links a product (after all items linked)
 * - Invoice issued
 * - Label printed (via MarkOrderLabelPrintedUseCase)
 *
 * Guarantees:
 * - Idempotent: returns null without DB writes when status has not changed
 * - OCC-safe: updateStatus uses currentStatus for optimistic locking
 * - Stock side effects: reserve is synchronous (blocks write); consume/refund are async
 */
export class RecalculateOrderStatusUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly engine: OrderStatusEngine,
    private readonly stockUseCase: HandleStockSideEffectsUseCase,
  ) {}

  async execute(orderId: string): Promise<RecalculateOrderStatusResult | null> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);

    // Count unlinked items directly from OrderRecord.items (no extra query)
    const unlinkedCount = order.items.filter((item) => item.productId === null).length;
    const newStatus = this.engine.calculate(order.marketplaceSignals, createProductLinkState(unlinkedCount));

    // No write if status has not changed (idempotency)
    if (newStatus === order.currentStatus) return null;

    // Reserve stock synchronously before writing status (propagates errors)
    await this.stockUseCase.reserveIfNeeded(order, newStatus);

    await this.orderRepo.updateStatus({
      orderId: order.id,
      currentStatus: order.currentStatus,
      newStatus,
    });

    const event = createStatusChangedEvent({
      orderId: order.id,
      organizationId: order.organizationId,
      previousStatus: order.currentStatus,
      newStatus,
      source: "webhook",
    });
    await this.orderRepo.addStatusHistory(order.id, event);

    // Consume/refund stock asynchronously (errors swallowed, not blocking)
    await this.stockUseCase.handleAsyncEffects(order.id, order.currentStatus, newStatus);

    return { orderId: order.id, newStatus, event };
  }
}
```

**Tamanho real:** ~50 linhas

**Diferenças em relação ao rascunho inicial:**
- Não injeta `IProductLinkRepository` — contagem de não-vinculados feita via `order.items.filter(it => it.productId === null)`
- Injeta `HandleStockSideEffectsUseCase` (T7) para side effects de estoque
- `execute(orderId: string)` — sem `organizationId` e `source` no parâmetro (simplificado; `source` hardcoded como `"webhook"`)
- Retorna `RecalculateOrderStatusResult | null` (não `RecalculateResult`) — `null` quando status não muda
- `updateStatus` usa OCC com `currentStatus`
- `addStatusHistory` separado do `updateStatus`

---

### 2.2 `supabase/functions/_shared/application/orders/MarkOrderLabelPrintedUseCase.ts`

**Responsabilidade:** Marcar etiquetas como impressas e recalcular o status dos pedidos afetados.

**Por que este use case existe:** No ML, a transição para "Aguardando Coleta" acontece quando o usuário imprime a etiqueta. O campo `is_printed_label` no pedido deve ser atualizado para `true`, e então o `RecalculateOrderStatusUseCase` deve ser chamado — o engine vai detectar que `isPrintedLabel = true` e calcular `AWAITING_PICKUP`.

**Substituição:** Hoje esta lógica está na RPC SQL `rpc_marketplace_order_print_label` que escreve diretamente `status_interno = 'Aguardando Coleta'` sem passar pelo engine. O novo use case passa pelo engine, garantindo que as pré-condições sejam verificadas.

```typescript
import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import { RecalculateOrderStatusUseCase, type RecalculateOrderStatusResult } from "./RecalculateOrderStatusUseCase.ts";

export interface MarkOrderLabelPrintedInput {
  readonly orderId: string;
  readonly organizationId: string;
}

/**
 * Use Case: Marks print flag and triggers immediate status recalculation.
 *
 * Called when the user prints a shipping label from the Impressão tab.
 * After setting is_printed_label = true, the engine will recalculate
 * and detect AWAITING_PICKUP (AwaitingPickupRule checks isPrintedLabel).
 *
 * Replaces legacy RPC that directly forced status = 'Aguardando Coleta',
 * bypassing the engine rules. The new approach validates preconditions via
 * the engine before writing the new status.
 */
export class MarkOrderLabelPrintedUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly recalculateOrderStatus: RecalculateOrderStatusUseCase,
  ) {}

  async execute(input: MarkOrderLabelPrintedInput): Promise<RecalculateOrderStatusResult | null> {
    // 1. Set is_printed_label = true in DB
    await this.orderRepo.updateInternalFlags(input.orderId, { isPrintedLabel: true });
    // 2. Recalculate: engine will read isPrintedLabel from DB and return AWAITING_PICKUP
    return this.recalculateOrderStatus.execute(input.orderId);
  }
}
```

**Tamanho real:** ~35 linhas

**Diferenças em relação ao rascunho inicial:**
- `execute` recebe `{ orderId, organizationId }` (objeto com 1 pedido), **não** `{ orderIds[], organizationId }` (lista)
  - Motivo: a edge function `mark-labels-printed` itera pedido a pedido e chama este use case em loop
- Usa `orderRepo.updateInternalFlags` (não `orderRepo.markLabelPrinted`)
- Retorna `RecalculateOrderStatusResult | null` — o chamador verifica `null` para saber se o status mudou
- Sem resultado agregado (`processed`, `statusChanges`) — responsabilidade da edge function
- `recalculate.execute(input.orderId)` — string simples, não `{ orderId, organizationId, source }`

---

## 3. Testes

Os testes ficam em `supabase/functions/_shared/application/orders/__tests__/`.

### Arquivo: `RecalculateOrderStatusUseCase.test.ts`

```typescript
// Use custom assertEquals/runTest helpers (no std lib dependency)
function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`Expected ${String(expected)} but got ${String(actual)}`);
}
function runTest(name: string, fn: () => Promise<void> | void): void {
  (globalThis as any).Deno?.test?.(name, fn);
}

runTest("RecalculateStatus: retorna null sem escrita quando status não muda", async () => {
  const orderRepo = new MockOrderRepository(baseOrder(OrderStatus.SHIPPED, 'shipped'));
  const stockUseCase = new MockStockUseCase();
  const useCase = new RecalculateOrderStatusUseCase(orderRepo, new OrderStatusEngine(), stockUseCase);

  const result = await useCase.execute('order-1');
  assertEquals(result, null);
  assertEquals(orderRepo.statusUpdates, 0); // no writes
});

runTest("RecalculateStatus: muda status e retorna evento", async () => {
  const orderRepo = new MockOrderRepository(baseOrder(OrderStatus.PENDING, 'shipped'));
  const stockUseCase = new MockStockUseCase();
  const useCase = new RecalculateOrderStatusUseCase(orderRepo, new OrderStatusEngine(), stockUseCase);

  const result = await useCase.execute('order-1');
  assertEquals(result?.newStatus, OrderStatus.SHIPPED);
  assertEquals(result?.event.type, 'ORDER_STATUS_CHANGED');
  assertEquals(orderRepo.statusUpdates, 1);
});

runTest("RecalculateStatus: lança erro se pedido não existe", async () => {
  // see actual test file for full mock setup
});
```

### Arquivo: `MarkOrderLabelPrintedUseCase.test.ts`

```typescript
runTest("MarkLabelPrinted: chama updateInternalFlags e recalcula", async () => {
  const orderRepo = new MockOrderRepository(baseOrder(OrderStatus.READY_TO_PRINT, 'ready_to_ship'));
  const stockUseCase = new MockStockUseCase();
  const recalculate = new RecalculateOrderStatusUseCase(orderRepo, new OrderStatusEngine(), stockUseCase);
  const useCase = new MarkOrderLabelPrintedUseCase(orderRepo, recalculate);

  await useCase.execute({ orderId: 'order-1', organizationId: 'org-1' });
  // updateInternalFlags deve ter sido chamado com { isPrintedLabel: true }
  assertEquals(orderRepo.flagsUpdated.length, 1);
});
```

---

## 5. Definition of Done

- [x] `RecalculateOrderStatusUseCase.ts` criado em `application/orders/`
- [x] `MarkOrderLabelPrintedUseCase.ts` criado em `application/orders/`
- [x] `RecalculateOrderStatusUseCase` é idempotente (retorna `null` sem escrita quando status não muda)
- [x] `RecalculateOrderStatusUseCase` injeta `HandleStockSideEffectsUseCase` (T7) — não mais `IProductLinkRepository`
- [x] `RecalculateOrderStatusUseCase.execute(orderId: string)` — assinatura simplificada
- [x] `MarkOrderLabelPrintedUseCase.execute({ orderId, organizationId })` — 1 pedido por chamada
- [x] `MarkOrderLabelPrintedUseCase` chama `updateInternalFlags({ isPrintedLabel: true })` ANTES de recalcular
- [x] `MarkOrderLabelPrintedUseCase` retorna `RecalculateOrderStatusResult | null`
- [x] Imports usam `../../domain/orders/ports/` (não `../../ports/orders/`)
- [x] Testes unitários para `RecalculateOrderStatusUseCase` (mínimo 3 cenários)
- [x] Testes unitários para `MarkOrderLabelPrintedUseCase` (mínimo 2 cenários)
- [x] Todos os testes passam sem banco de dados
- [x] Nenhum arquivo excede 150 linhas
