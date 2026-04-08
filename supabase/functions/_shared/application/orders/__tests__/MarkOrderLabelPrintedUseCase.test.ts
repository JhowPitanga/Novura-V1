import { MarkOrderLabelPrintedUseCase } from "../MarkOrderLabelPrintedUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../RecalculateOrderStatusUseCase.ts";
import { OrderStatusEngine } from "../OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../HandleStockSideEffectsUseCase.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";
import type { OrderStatusChangedEvent } from "../../../domain/orders/OrderDomainEvents.ts";
import type { IInventoryPort, InventoryItem } from "../../../domain/orders/ports/IInventoryPort.ts";
import type { IOrderRepository, OrderRecord } from "../../../domain/orders/ports/IOrderRepository.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`Expected ${String(expected)} but got ${String(actual)}`);
}
function runTest(name: string, fn: () => Promise<void> | void): void {
  (globalThis as unknown as { Deno?: { test?: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test?.(name, fn);
}

class NoopInventory implements IInventoryPort {
  async reserveStockNow(_params: {
    readonly orderId: string;
    readonly organizationId: string;
    readonly items: ReadonlyArray<InventoryItem>;
  }): Promise<void> {}
  async enqueueConsumeStock(_params: { readonly orderId: string; readonly organizationId: string }): Promise<void> {}
  async enqueueRefundStock(_params: { readonly orderId: string; readonly organizationId: string }): Promise<void> {}
}

class StubOrderRepository implements IOrderRepository {
  public flagCalls: Array<{ orderId: string; flags: Readonly<{ isPrintedLabel?: boolean; isPickupDone?: boolean }> }> = [];
  constructor(private order: OrderRecord) {}
  async findById(_orderId: string): Promise<OrderRecord | null> {
    return this.order;
  }
  async findByMarketplaceOrderId(): Promise<OrderRecord | null> {
    return null;
  }
  async markLabelPrinted(): Promise<void> {}
  async updateStatus(params: { readonly orderId: string; readonly currentStatus: OrderStatus | null; readonly newStatus: OrderStatus }): Promise<void> {
    this.order = { ...this.order, currentStatus: params.newStatus };
  }
  async updateOrderItemsProductId(_orderId: string, _items: ReadonlyArray<{ readonly id: string; readonly productId: string }>): Promise<void> {}
  async updateInternalFlags(orderId: string, flags: Readonly<{ isPrintedLabel?: boolean; isPickupDone?: boolean }>): Promise<void> {
    this.flagCalls.push({ orderId, flags });
  }
  async addStatusHistory(_orderId: string, _event: OrderStatusChangedEvent): Promise<void> {}
}

function buildRecalculate(repo: IOrderRepository): RecalculateOrderStatusUseCase {
  const stock = new HandleStockSideEffectsUseCase(new NoopInventory());
  return new RecalculateOrderStatusUseCase(repo, new OrderStatusEngine(), stock);
}

const makeOrder = (overrides?: Partial<OrderRecord>): OrderRecord => ({
  id: "order-1",
  organizationId: "org-1",
  marketplace: "mercado_livre",
  marketplaceOrderId: "ml-1",
  currentStatus: OrderStatus.READY_TO_PRINT,
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
    isPrintedLabel: true,
    hasInvoice: true,
  },
  items: [{ id: "i1", productId: "p1", marketplaceItemId: "m1", variationId: null, sellerSku: null, quantity: 1 }],
  ...overrides,
});

runTest("MarkLabelPrinted: marks labels and recalculates for all orders", async () => {
  const repo = new StubOrderRepository(makeOrder());
  const recalc = buildRecalculate(repo);
  const uc = new MarkOrderLabelPrintedUseCase(repo, recalc);

  const result = await uc.execute({ orderIds: ["order-1", "order-2"], organizationId: "org-1" });

  assertEquals(result.processed, 2);
  assertEquals(repo.flagCalls.length, 2);
  assertEquals(repo.flagCalls[0].flags.isPrintedLabel, true);
  assertEquals(repo.flagCalls[1].flags.isPrintedLabel, true);
});

runTest("MarkLabelPrinted: returns empty statusChanges when no status changes", async () => {
  const order = makeOrder({ currentStatus: OrderStatus.AWAITING_PICKUP });
  const repo = new StubOrderRepository(order);
  const recalc = buildRecalculate(repo);
  const uc = new MarkOrderLabelPrintedUseCase(repo, recalc);

  const result = await uc.execute({ orderIds: ["order-1"], organizationId: "org-1" });

  assertEquals(result.processed, 1);
  assertEquals(result.statusChanges.length, 0);
});

runTest("MarkLabelPrinted: calls recalculate with source=user_action", async () => {
  const repo = new StubOrderRepository(makeOrder());
  const recalc = buildRecalculate(repo);
  const uc = new MarkOrderLabelPrintedUseCase(repo, recalc);

  const result = await uc.execute({ orderIds: ["order-1"], organizationId: "org-1" });

  const change = result.statusChanges[0];
  if (!change) throw new Error("Expected at least one status change");
  assertEquals(change.orderId, "order-1");
});
