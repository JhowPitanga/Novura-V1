import { RecalculateOrderStatusUseCase } from "../RecalculateOrderStatusUseCase.ts";
import { OrderStatusEngine } from "../OrderStatusEngine.ts";
import type { OrderStatusChangedEvent } from "../../../domain/orders/OrderDomainEvents.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";
import type { IOrderRepository, OrderRecord } from "../../../domain/orders/ports/IOrderRepository.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`Expected ${String(expected)} but got ${String(actual)}`);
}
function runTest(name: string, fn: () => Promise<void> | void): void {
  (globalThis as unknown as { Deno?: { test?: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test?.(name, fn);
}

class MockOrderRepository implements IOrderRepository {
  constructor(private order: OrderRecord) {}
  public updates = 0;
  async findById(_orderId: string): Promise<OrderRecord | null> { return this.order; }
  async updateStatus(params: { readonly orderId: string; readonly currentStatus: OrderStatus | null; readonly newStatus: OrderStatus }): Promise<void> {
    this.updates += 1;
    this.order = { ...this.order, currentStatus: params.newStatus };
  }
  async updateOrderItemsProductId(_orderId: string, _items: ReadonlyArray<{ readonly id: string; readonly productId: string }>): Promise<void> {}
  async updateInternalFlags(_orderId: string, _flags: Readonly<{ isPrintedLabel?: boolean; isPickupDone?: boolean }>): Promise<void> {}
  async addStatusHistory(_orderId: string, _event: OrderStatusChangedEvent): Promise<void> {}
}

const baseSignalsOrder = (items: OrderRecord["items"]): OrderRecord => ({
  id: "order-1",
  organizationId: "org-1",
  marketplace: "mercado_livre",
  marketplaceOrderId: "ml-1",
  currentStatus: OrderStatus.PENDING,
  marketplaceSignals: {
    organizationId: "org-1",
    marketplaceOrderId: "ml-1",
    marketplace: "mercado_livre",
    marketplaceStatus: "paid",
    shipmentStatus: "ready_to_ship",
    shipmentSubstatus: "ready_to_print",
    isFulfillment: false,
    isCancelled: false,
    isRefunded: false,
    isReturned: false,
    isPrintedLabel: false,
    hasInvoice: true,
  },
  items,
});

runTest("recalculate moves to READY_TO_PRINT when all items are linked", async () => {
  const repo = new MockOrderRepository(baseSignalsOrder([{ id: "i1", productId: "p1", marketplaceItemId: "m1", quantity: 1 }]));
  const result = await new RecalculateOrderStatusUseCase(repo, new OrderStatusEngine()).execute("order-1");
  assertEquals(result?.newStatus, OrderStatus.READY_TO_PRINT);
  assertEquals(repo.updates, 1);
});

runTest("recalculate moves to UNLINKED when there are orphan items", async () => {
  const repo = new MockOrderRepository(baseSignalsOrder([
    { id: "i1", productId: "p1", marketplaceItemId: "m1", quantity: 1 },
    { id: "i2", productId: null, marketplaceItemId: "m2", quantity: 1 },
  ]));
  const result = await new RecalculateOrderStatusUseCase(repo, new OrderStatusEngine()).execute("order-1");
  assertEquals(result?.newStatus, OrderStatus.UNLINKED);
  assertEquals(repo.updates, 1);
});
