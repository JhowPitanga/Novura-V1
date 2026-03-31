import { LinkProductToOrderItemUseCase } from "../LinkProductToOrderItemUseCase.ts";
import { OrderStatusEngine } from "../OrderStatusEngine.ts";
import type { OrderStatusChangedEvent } from "../../../domain/orders/OrderDomainEvents.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";
import type { IOrderRepository, OrderRecord } from "../../../domain/orders/ports/IOrderRepository.ts";
import type { IProductLinkRepository, OrderItemLink } from "../../../domain/orders/ports/IProductLinkRepository.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`Expected ${String(expected)} but got ${String(actual)}`);
}
function runTest(name: string, fn: () => Promise<void> | void): void {
  (globalThis as unknown as { Deno?: { test?: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test?.(name, fn);
}

class MockOrderRepository implements IOrderRepository {
  constructor(private order: OrderRecord) {}
  public statusUpdates = 0;
  public historyWrites = 0;
  async findById(_orderId: string): Promise<OrderRecord | null> { return this.order; }
  async updateStatus(params: { readonly orderId: string; readonly currentStatus: OrderStatus | null; readonly newStatus: OrderStatus }): Promise<void> {
    this.statusUpdates += 1;
    this.order = { ...this.order, currentStatus: params.newStatus };
  }
  async updateOrderItemsProductId(_orderId: string, items: ReadonlyArray<{ readonly id: string; readonly productId: string }>): Promise<void> {
    const patch = new Map(items.map((i) => [i.id, i.productId]));
    this.order = { ...this.order, items: this.order.items.map((it) => (patch.has(it.id) ? { ...it, productId: patch.get(it.id)! } : it)) };
  }
  async addStatusHistory(_orderId: string, _event: OrderStatusChangedEvent): Promise<void> { this.historyWrites += 1; }
}

class MockProductLinkRepository implements IProductLinkRepository {
  public permanentLinks = 0;
  async findLink(_organizationId: string, _sku: string): Promise<OrderItemLink | null> { return null; }
  async listLinks(_organizationId: string, _skus: ReadonlyArray<string>): Promise<ReadonlyArray<OrderItemLink>> { return []; }
  async upsertPermanentLink(_params: { readonly organizationId: string; readonly marketplaceItemId: string; readonly productId: string }): Promise<void> {
    this.permanentLinks += 1;
  }
}

const baseOrder = (items: OrderRecord["items"]): OrderRecord => ({
  id: "order-1",
  organizationId: "org-1",
  marketplace: "mercado_livre",
  marketplaceOrderId: "ml-1",
  currentStatus: OrderStatus.UNLINKED,
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

runTest("links last orphan item and changes UNLINKED -> READY_TO_PRINT", async () => {
  const orderRepo = new MockOrderRepository(baseOrder([{ id: "i1", productId: null, marketplaceItemId: "mli-1", quantity: 1 }]));
  const linkRepo = new MockProductLinkRepository();
  const result = await new LinkProductToOrderItemUseCase(orderRepo, linkRepo, new OrderStatusEngine()).execute({
    orderId: "order-1",
    orderItemId: "i1",
    productId: "p-1",
    organizationId: "org-1",
    isPermanent: true,
  });
  assertEquals(result.newStatus, OrderStatus.READY_TO_PRINT);
  assertEquals(result.statusChanged, true);
  assertEquals(orderRepo.statusUpdates, 1);
  assertEquals(orderRepo.historyWrites, 1);
  assertEquals(linkRepo.permanentLinks, 1);
});

runTest("links one item but keeps UNLINKED when other orphans remain", async () => {
  const orderRepo = new MockOrderRepository(baseOrder([
    { id: "i1", productId: null, marketplaceItemId: "mli-1", quantity: 1 },
    { id: "i2", productId: null, marketplaceItemId: "mli-2", quantity: 1 },
  ]));
  const linkRepo = new MockProductLinkRepository();
  const result = await new LinkProductToOrderItemUseCase(orderRepo, linkRepo, new OrderStatusEngine()).execute({
    orderId: "order-1",
    orderItemId: "i1",
    productId: "p-1",
    organizationId: "org-1",
    isPermanent: false,
  });
  assertEquals(result.newStatus, OrderStatus.UNLINKED);
  assertEquals(result.statusChanged, false);
  assertEquals(orderRepo.statusUpdates, 0);
  assertEquals(orderRepo.historyWrites, 0);
  assertEquals(linkRepo.permanentLinks, 0);
});
