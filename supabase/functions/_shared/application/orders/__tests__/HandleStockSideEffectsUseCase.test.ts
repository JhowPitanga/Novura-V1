import {
  HandleStockSideEffectsUseCase,
  STATUSES_REQUIRING_SYNC_RESERVE,
} from "../HandleStockSideEffectsUseCase.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";
import type { IInventoryPort, InventoryItem } from "../../../domain/orders/ports/IInventoryPort.ts";
import type { OrderRecord } from "../../../domain/orders/ports/IOrderRepository.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`Expected ${String(expected)} but got ${String(actual)}`);
}
function runTest(name: string, fn: () => Promise<void> | void): void {
  (globalThis as unknown as { Deno?: { test?: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test?.(name, fn);
}

class MockInventoryPort implements IInventoryPort {
  public reserved = 0;
  public consumed = 0;
  public refunded = 0;
  public failReserve = false;
  async reserveStockNow(_params: {
    readonly orderId: string;
    readonly organizationId: string;
    readonly items: ReadonlyArray<InventoryItem>;
  }): Promise<void> {
    if (this.failReserve) throw new Error("reserve failed");
    this.reserved += 1;
  }
  async enqueueConsumeStock(_params: { readonly orderId: string; readonly organizationId: string }): Promise<void> {
    this.consumed += 1;
  }
  async enqueueRefundStock(_params: { readonly orderId: string; readonly organizationId: string }): Promise<void> {
    this.refunded += 1;
  }
}

const order = (status: OrderStatus | null): OrderRecord => ({
  id: "order-1",
  organizationId: "org-1",
  marketplace: "mercado_livre",
  marketplaceOrderId: "ml-1",
  currentStatus: status,
  marketplaceSignals: {
    organizationId: "org-1",
    marketplaceOrderId: "ml-1",
    marketplace: "mercado_livre",
    marketplaceStatus: "paid",
    isFulfillment: false,
    isCancelled: false,
    isRefunded: false,
    isReturned: false,
    isPrintedLabel: false,
    hasInvoice: true,
  },
  items: [{ id: "i1", productId: "p1", marketplaceItemId: "m1", variationId: null, sellerSku: null, quantity: 1 }],
});

runTest("reserve is called when new status is READY_TO_PRINT", async () => {
  const inv = new MockInventoryPort();
  const useCase = new HandleStockSideEffectsUseCase(inv);
  await useCase.reserveIfNeeded(order(OrderStatus.PENDING), OrderStatus.READY_TO_PRINT);
  assertEquals(inv.reserved, 1);
  assertEquals(STATUSES_REQUIRING_SYNC_RESERVE.has(OrderStatus.READY_TO_PRINT), true);
});

runTest("refund is enqueued when reserved status transitions to CANCELLED", async () => {
  const inv = new MockInventoryPort();
  const useCase = new HandleStockSideEffectsUseCase(inv);
  await useCase.handleAsyncEffects({
    orderId: "order-1",
    organizationId: "org-1",
    oldStatus: OrderStatus.READY_TO_PRINT,
    newStatus: OrderStatus.CANCELLED,
  });
  assertEquals(inv.refunded, 1);
});

runTest("reserve failure propagates and interrupts flow", async () => {
  const inv = new MockInventoryPort();
  inv.failReserve = true;
  const useCase = new HandleStockSideEffectsUseCase(inv);
  let threw = false;
  try {
    await useCase.reserveIfNeeded(order(OrderStatus.PENDING), OrderStatus.READY_TO_PRINT);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
