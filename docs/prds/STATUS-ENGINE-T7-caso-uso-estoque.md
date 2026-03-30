# STATUS-ENGINE-T7 — Use Case: Side Effects de Estoque por Mudança de Status

**Ciclo:** Motor de Status de Pedidos
**Status:** 🔴 Não iniciado
**Depende de:** [T2 — Ports](./STATUS-ENGINE-T2-portas.md), [T4 — Adapters](./STATUS-ENGINE-T4-adaptadores.md)
**Bloqueia:** T9 (wiring nas edge functions)

---

## 1. Visão Geral (para não-técnicos)

O estoque de um produto precisa ser movimentado conforme um pedido avança no pipeline:

- **Pedido entra em Emissão NF / Impressão / Aguardando Coleta** → **reservar** o estoque (o produto está comprometido para este pedido)
- **Pedido é enviado** → baixar o estoque definitivamente (consumir a reserva)
- **Pedido é cancelado** → devolver o estoque que foi reservado

### Por que a reserva é diferente das outras operações?

**Reservar estoque é a única operação crítica para o negócio.** Se dois pedidos do mesmo produto chegam ao mesmo tempo e a reserva não for feita antes de confirmar o status do segundo pedido, ambos podem ser aceitos com o mesmo estoque — causando **overselling** (vender mais do que tem). Isso resulta em cancelamento forçado, reclamação no marketplace e impacto na reputação do vendedor.

**Consumir e devolver estoque são menos críticos:** o produto já foi enviado (ou o pedido já foi cancelado). Um atraso de alguns segundos não causa prejuízo adicional.

Por isso, as operações têm tratamentos diferentes:
- **Reserva:** executada **imediatamente** na mesma chamada, de forma síncrona
- **Consumo e devolução:** enfileiradas assincronamente, processadas pelo `inventory-jobs-worker`

---

## 2. Distinção Síncrono vs Assíncrono

| Transição | Operação | Modo | Por quê |
|---|---|---|---|
| → INVOICE_PENDING, READY_TO_PRINT, AWAITING_PICKUP | Reservar estoque | **Síncrono** | Se falhar, o status não deve ser confirmado — previne overselling |
| → SHIPPED | Consumir reserva | **Assíncrono** | Produto já enviado; delay de 30s não causa prejuízo |
| → CANCELLED, RETURNED | Devolver reserva | **Assíncrono** | Reversível; delay aceitável |
| → UNLINKED, PENDING | Nenhuma operação | — | Estoque não comprometido ainda |

---

## 3. Atualização do Port `IInventoryPort`

O port precisa refletir a distinção entre operações síncronas e assíncronas.

**Arquivo a atualizar:** `supabase/functions/_shared/ports/orders/IInventoryPort.ts`

```typescript
/**
 * Port: operações de estoque para pedidos.
 *
 * Duas modalidades de operação:
 * - Síncrona (reserveStockNow): executa imediatamente, lança exceção em falha
 * - Assíncrona (enqueueConsume, enqueueRefund): enfileira job para processamento posterior
 *
 * A separação é intencional: reserva deve ser garantida antes de confirmar
 * o status do pedido (evita overselling). Consumo e devolução são eventuais.
 */
export interface IInventoryPort {
  /**
   * Reserva estoque IMEDIATAMENTE para os itens vinculados do pedido.
   *
   * Chamado ANTES de confirmar o novo status no banco.
   * Se lançar exceção, o chamador deve abortar a mudança de status.
   *
   * Idempotente: se já existe reserva para este pedido, não duplica.
   * Implementação usa ON CONFLICT DO NOTHING em inventory_transactions.
   *
   * @throws Error se não for possível reservar (banco indisponível, etc.)
   */
  reserveStockNow(params: {
    orderId: string;
    organizationId: string;
  }): Promise<void>;

  /**
   * Enfileira job para consumir (baixar definitivamente) o estoque reservado.
   *
   * Chamado APÓS confirmar o status SHIPPED no banco.
   * O job é processado pelo inventory-jobs-worker em até 30 segundos.
   *
   * Idempotente: ON CONFLICT DO NOTHING em inventory_jobs.
   *
   * Não lança exceção — falha aqui não deve reverter o status SHIPPED.
   */
  enqueueConsumeStock(params: {
    orderId: string;
    organizationId: string;
  }): Promise<void>;

  /**
   * Enfileira job para devolver o estoque reservado ao disponível.
   *
   * Chamado APÓS confirmar o status CANCELLED ou RETURNED no banco.
   * O job é processado pelo inventory-jobs-worker em até 30 segundos.
   *
   * Idempotente: ON CONFLICT DO NOTHING em inventory_jobs.
   *
   * Não lança exceção — falha aqui não deve reverter o status CANCELLED.
   */
  enqueueRefundStock(params: {
    orderId: string;
    organizationId: string;
  }): Promise<void>;
}
```

---

## 4. Arquivo a Criar

### `supabase/functions/_shared/application/orders/HandleStockSideEffectsUseCase.ts`

**Responsabilidade:** Dado um evento `OrderStatusChangedEvent`, executar a operação de estoque correta para a transição — síncronamente quando crítico, assincronamente quando seguro.

```typescript
import type { IInventoryPort } from '../../ports/orders/IInventoryPort.ts';
import type { OrderStatusChangedEvent } from '../../domain/orders/OrderDomainEvents.ts';
import { OrderStatus } from '../../domain/orders/OrderStatus.ts';

/**
 * Status que requerem reserva síncrona de estoque.
 *
 * Para estes status, a reserva deve acontecer ANTES da mudança de status
 * ser confirmada no banco. Se a reserva falhar, o status não deve mudar.
 *
 * Exportado para uso nos testes e no RecalculateOrderStatusUseCase.
 */
export const STATUSES_REQUIRING_SYNC_RESERVE = new Set<OrderStatus>([
  OrderStatus.INVOICE_PENDING,
  OrderStatus.READY_TO_PRINT,
  OrderStatus.AWAITING_PICKUP,
]);

/**
 * Use Case: Aplica os side effects de estoque para uma transição de status.
 *
 * IMPORTANTE — duas fases de uso:
 *
 * Fase 1 (ANTES de salvar o status):
 *   Chamar `reserveIfNeeded(newStatus, ...)` para reservar estoque de forma
 *   síncrona. Se lançar exceção, abortar a mudança de status.
 *
 * Fase 2 (APÓS salvar o status):
 *   Chamar `handle(event)` para enfileirar jobs assíncronos de consumo/devolução.
 *
 * O RecalculateOrderStatusUseCase orquestra as duas fases.
 */
export class HandleStockSideEffectsUseCase {
  constructor(private readonly inventory: IInventoryPort) {}

  /**
   * FASE 1 — Síncrona. Chame ANTES de persistir o novo status.
   *
   * Reserva estoque imediatamente para status que comprometem o produto.
   * Se não for necessário, retorna sem fazer nada.
   *
   * @throws Error se a reserva falhar — o chamador deve abortar a mudança de status
   */
  async reserveIfNeeded(params: {
    newStatus: OrderStatus;
    orderId: string;
    organizationId: string;
  }): Promise<void> {
    if (STATUSES_REQUIRING_SYNC_RESERVE.has(params.newStatus)) {
      await this.inventory.reserveStockNow({
        orderId: params.orderId,
        organizationId: params.organizationId,
      });
    }
  }

  /**
   * FASE 2 — Assíncrona. Chame APÓS persistir o novo status.
   *
   * Enfileira jobs de consumo ou devolução para processamento posterior.
   * Não lança exceção — falha aqui não deve reverter o status já salvo.
   */
  async handleAsync(event: OrderStatusChangedEvent): Promise<void> {
    const params = { orderId: event.orderId, organizationId: event.organizationId };

    if (event.newStatus === OrderStatus.SHIPPED) {
      await this.safeEnqueue(() => this.inventory.enqueueConsumeStock(params), event);
      return;
    }

    if (event.newStatus === OrderStatus.CANCELLED || event.newStatus === OrderStatus.RETURNED) {
      await this.safeEnqueue(() => this.inventory.enqueueRefundStock(params), event);
      return;
    }

    // INVOICE_PENDING, READY_TO_PRINT, AWAITING_PICKUP: já tratados na Fase 1
    // UNLINKED, PENDING: nenhuma operação
  }

  /** Enfileira sem propagar exceção — loga e segue. */
  private async safeEnqueue(fn: () => Promise<void>, event: OrderStatusChangedEvent): Promise<void> {
    try {
      await fn();
    } catch (err) {
      // Log sem relançar: o status já foi salvo, o job pode ser retentado manualmente
      console.error(
        `[HandleStockSideEffects] falha ao enfileirar job para order ${event.orderId}` +
        ` (${event.previousStatus} → ${event.newStatus}):`,
        err
      );
    }
  }
}
```

**Tamanho esperado:** ~70 linhas

---

## 5. Como o RecalculateOrderStatusUseCase Orquestra as Duas Fases

O `RecalculateOrderStatusUseCase` (T6) precisa ser atualizado para aceitar o `HandleStockSideEffectsUseCase` e chamar a Fase 1 antes de persistir:

```typescript
// Em RecalculateOrderStatusUseCase.ts — fluxo atualizado:

async execute(input: RecalculateInput): Promise<RecalculateResult> {
  const order = await this.orderRepo.findById(input.orderId);
  if (!order) throw new Error(`Order ${input.orderId} not found`);

  const linkState = await this.resolveProductLinkState(order, input.organizationId);
  const newStatus = this.engine.calculate(order.marketplaceSignals, linkState);

  if (order.currentStatus === newStatus) {
    return { orderId: input.orderId, previousStatus: order.currentStatus, newStatus, statusChanged: false, event: null };
  }

  // ★ FASE 1: Reserva síncrona ANTES de salvar o status
  //   Se falhar, a exceção propaga e o status NÃO é salvo.
  await this.stockEffects.reserveIfNeeded({
    newStatus,
    orderId: input.orderId,
    organizationId: input.organizationId,
  });

  // ★ Só agora confirma a mudança de status no banco
  const updateResult = await this.orderRepo.updateStatus({
    orderId: input.orderId,
    newStatus,
    source: input.source,
  });

  const event = createStatusChangedEvent({ ... });

  // ★ FASE 2: Jobs assíncronos APÓS salvar o status (consume, refund)
  await this.stockEffects.handleAsync(event);

  return { orderId: input.orderId, previousStatus: updateResult.previousStatus, newStatus, statusChanged: true, event };
}
```

Isso significa que o construtor do `RecalculateOrderStatusUseCase` precisa de um parâmetro extra:

```typescript
constructor(
  private readonly orderRepo: IOrderRepository,
  private readonly linkRepo: IProductLinkRepository,
  private readonly stockEffects: HandleStockSideEffectsUseCase, // ← novo
) {}
```

---

## 6. Atualizar o Adapter: `SupabaseInventoryAdapter`

O adapter precisa implementar os três métodos novos.

**Arquivo a atualizar:** `supabase/functions/_shared/adapters/orders/SupabaseInventoryAdapter.ts`

```typescript
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { IInventoryPort } from '../../ports/orders/IInventoryPort.ts';

export class SupabaseInventoryAdapter implements IInventoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Reserva estoque diretamente via RPC — síncrono e sem fila.
   * Chama a função SQL existente reserve_stock_for_order().
   */
  async reserveStockNow(params: { orderId: string; organizationId: string }): Promise<void> {
    const { error } = await this.supabase.rpc('reserve_stock_for_order', {
      p_order_id: params.orderId,
    });
    if (error) throw new Error(`reserveStockNow failed for order ${params.orderId}: ${error.message}`);
  }

  async enqueueConsumeStock(params: { orderId: string; organizationId: string }): Promise<void> {
    await this.enqueueJob(params.orderId, 'consume');
  }

  async enqueueRefundStock(params: { orderId: string; organizationId: string }): Promise<void> {
    await this.enqueueJob(params.orderId, 'refund');
  }

  private async enqueueJob(orderId: string, jobType: 'consume' | 'refund'): Promise<void> {
    const { error } = await this.supabase
      .from('inventory_jobs')
      .upsert({ order_id: orderId, job_type: jobType, status: 'pending' }, {
        onConflict: 'order_id,job_type',
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`enqueueJob(${jobType}) failed for order ${orderId}: ${error.message}`);
  }
}
```

**Nota:** `reserve_stock_for_order()` já existe como função SQL — não precisa reescrever. O adapter apenas a chama via RPC, mantendo a lógica de reserva onde já está e evitando duplicação.

---

## 7. Testes

### Arquivo: `__tests__/application/HandleStockSideEffectsUseCase.test.ts`

```typescript
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { HandleStockSideEffectsUseCase, STATUSES_REQUIRING_SYNC_RESERVE } from "../HandleStockSideEffectsUseCase.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";

class MockInventoryPort {
  reserveNowCalledWith: string[] = [];
  consumeEnqueuedFor: string[] = [];
  refundEnqueuedFor: string[] = [];
  shouldReserveFail = false;

  async reserveStockNow(p: { orderId: string }) {
    if (this.shouldReserveFail) throw new Error('reserva falhou');
    this.reserveNowCalledWith.push(p.orderId);
  }
  async enqueueConsumeStock(p: { orderId: string }) { this.consumeEnqueuedFor.push(p.orderId); }
  async enqueueRefundStock(p: { orderId: string }) { this.refundEnqueuedFor.push(p.orderId); }
}

function makeEvent(newStatus: string, previousStatus = 'pendente') {
  return { type: 'ORDER_STATUS_CHANGED' as const, orderId: 'order-1', organizationId: 'org-1', previousStatus, newStatus, changedAt: new Date().toISOString(), source: 'webhook' as const };
}

// Testes da Fase 1 (reserva síncrona)

Deno.test("Fase 1: READY_TO_PRINT → reserva síncrona executada", async () => {
  const inv = new MockInventoryPort();
  const uc = new HandleStockSideEffectsUseCase(inv);
  await uc.reserveIfNeeded({ newStatus: OrderStatus.READY_TO_PRINT, orderId: 'order-1', organizationId: 'org-1' });
  assertEquals(inv.reserveNowCalledWith, ['order-1']);
});

Deno.test("Fase 1: INVOICE_PENDING → reserva síncrona executada", async () => {
  const inv = new MockInventoryPort();
  const uc = new HandleStockSideEffectsUseCase(inv);
  await uc.reserveIfNeeded({ newStatus: OrderStatus.INVOICE_PENDING, orderId: 'order-1', organizationId: 'org-1' });
  assertEquals(inv.reserveNowCalledWith.length, 1);
});

Deno.test("Fase 1: AWAITING_PICKUP → reserva síncrona executada", async () => {
  const inv = new MockInventoryPort();
  const uc = new HandleStockSideEffectsUseCase(inv);
  await uc.reserveIfNeeded({ newStatus: OrderStatus.AWAITING_PICKUP, orderId: 'order-1', organizationId: 'org-1' });
  assertEquals(inv.reserveNowCalledWith.length, 1);
});

Deno.test("Fase 1: falha na reserva propaga exceção (status NÃO deve ser salvo)", async () => {
  const inv = new MockInventoryPort();
  inv.shouldReserveFail = true;
  const uc = new HandleStockSideEffectsUseCase(inv);
  let threw = false;
  try {
    await uc.reserveIfNeeded({ newStatus: OrderStatus.READY_TO_PRINT, orderId: 'order-1', organizationId: 'org-1' });
  } catch { threw = true; }
  assertEquals(threw, true);
});

Deno.test("Fase 1: SHIPPED → NÃO reserva (não é status de reserva)", async () => {
  const inv = new MockInventoryPort();
  const uc = new HandleStockSideEffectsUseCase(inv);
  await uc.reserveIfNeeded({ newStatus: OrderStatus.SHIPPED, orderId: 'order-1', organizationId: 'org-1' });
  assertEquals(inv.reserveNowCalledWith.length, 0);
});

Deno.test("Fase 1: PENDING → nenhuma operação", async () => {
  const inv = new MockInventoryPort();
  const uc = new HandleStockSideEffectsUseCase(inv);
  await uc.reserveIfNeeded({ newStatus: OrderStatus.PENDING, orderId: 'order-1', organizationId: 'org-1' });
  assertEquals(inv.reserveNowCalledWith.length, 0);
});

// Testes da Fase 2 (assíncrona)

Deno.test("Fase 2: SHIPPED → enfileira consume (não lança exceção)", async () => {
  const inv = new MockInventoryPort();
  const uc = new HandleStockSideEffectsUseCase(inv);
  await uc.handleAsync(makeEvent(OrderStatus.SHIPPED));
  assertEquals(inv.consumeEnqueuedFor, ['order-1']);
  assertEquals(inv.refundEnqueuedFor.length, 0);
});

Deno.test("Fase 2: CANCELLED → enfileira refund", async () => {
  const inv = new MockInventoryPort();
  const uc = new HandleStockSideEffectsUseCase(inv);
  await uc.handleAsync(makeEvent(OrderStatus.CANCELLED));
  assertEquals(inv.refundEnqueuedFor, ['order-1']);
});

Deno.test("Fase 2: RETURNED → enfileira refund", async () => {
  const inv = new MockInventoryPort();
  const uc = new HandleStockSideEffectsUseCase(inv);
  await uc.handleAsync(makeEvent(OrderStatus.RETURNED));
  assertEquals(inv.refundEnqueuedFor.length, 1);
});

Deno.test("Fase 2: falha no enqueue é absorvida (não propaga)", async () => {
  // Mesmo que o enqueue falhe, handleAsync não deve lançar
  const inv = new MockInventoryPort();
  inv.enqueueConsumeStock = async () => { throw new Error('fila indisponível'); };
  const uc = new HandleStockSideEffectsUseCase(inv);
  let threw = false;
  try {
    await uc.handleAsync(makeEvent(OrderStatus.SHIPPED));
  } catch { threw = true; }
  assertEquals(threw, false); // não propagou
});

Deno.test("Fase 2: READY_TO_PRINT → nenhuma operação (já tratado na Fase 1)", async () => {
  const inv = new MockInventoryPort();
  const uc = new HandleStockSideEffectsUseCase(inv);
  await uc.handleAsync(makeEvent(OrderStatus.READY_TO_PRINT));
  assertEquals(inv.consumeEnqueuedFor.length, 0);
  assertEquals(inv.refundEnqueuedFor.length, 0);
});

Deno.test("STATUSES_REQUIRING_SYNC_RESERVE contém exatamente os 3 status corretos", () => {
  assertEquals(STATUSES_REQUIRING_SYNC_RESERVE.has(OrderStatus.INVOICE_PENDING), true);
  assertEquals(STATUSES_REQUIRING_SYNC_RESERVE.has(OrderStatus.READY_TO_PRINT), true);
  assertEquals(STATUSES_REQUIRING_SYNC_RESERVE.has(OrderStatus.AWAITING_PICKUP), true);
  assertEquals(STATUSES_REQUIRING_SYNC_RESERVE.has(OrderStatus.SHIPPED), false);
  assertEquals(STATUSES_REQUIRING_SYNC_RESERVE.has(OrderStatus.CANCELLED), false);
});
```

---

## 8. Diagrama do Fluxo Completo

```
RecalculateOrderStatusUseCase.execute()
  │
  ├─ 1. Calcula novo status (engine puro, sem I/O)
  │
  ├─ 2. Status mudou?
  │     └─ NÃO → retorna sem escrever nada
  │
  ├─ 3. ★ FASE 1: stockEffects.reserveIfNeeded(newStatus)
  │     ├─ newStatus ∈ {INVOICE_PENDING, READY_TO_PRINT, AWAITING_PICKUP}?
  │     │   └─ SIM → reserveStockNow() [síncrono, lança se falhar]
  │     │         └─ FALHA → exceção propaga, status NÃO é salvo ✓
  │     └─ newStatus ∈ outros → nenhuma operação
  │
  ├─ 4. orderRepo.updateStatus() [persiste o novo status]
  │
  └─ 5. ★ FASE 2: stockEffects.handleAsync(event)
        ├─ SHIPPED      → enqueueConsumeStock() [assíncrono, absorve falha]
        ├─ CANCELLED    → enqueueRefundStock()  [assíncrono, absorve falha]
        ├─ RETURNED     → enqueueRefundStock()  [assíncrono, absorve falha]
        └─ outros       → nenhuma operação
```

---

## 9. Definition of Done

- [ ] `IInventoryPort` atualizado com 3 métodos: `reserveStockNow`, `enqueueConsumeStock`, `enqueueRefundStock`
- [ ] `HandleStockSideEffectsUseCase` criado com métodos `reserveIfNeeded` e `handleAsync`
- [ ] `reserveIfNeeded` lança exceção em falha (não absorve)
- [ ] `handleAsync` absorve exceções via `safeEnqueue` (não propaga)
- [ ] `SupabaseInventoryAdapter` implementa os 3 métodos: `reserveStockNow` chama RPC `reserve_stock_for_order`, os outros dois fazem upsert em `inventory_jobs`
- [ ] `RecalculateOrderStatusUseCase` (T6) atualizado para aceitar `HandleStockSideEffectsUseCase` no construtor
- [ ] `RecalculateOrderStatusUseCase` chama `reserveIfNeeded` ANTES de `orderRepo.updateStatus`
- [ ] `RecalculateOrderStatusUseCase` chama `handleAsync` APÓS `orderRepo.updateStatus`
- [ ] `STATUSES_REQUIRING_SYNC_RESERVE` exportado (usado em testes e documentação)
- [ ] Todos os 12 testes unitários passam sem banco de dados
- [ ] Testes cobrem explicitamente: falha na reserva aborta mudança de status, falha no enqueue não propaga
- [ ] Nenhum arquivo excede 150 linhas
