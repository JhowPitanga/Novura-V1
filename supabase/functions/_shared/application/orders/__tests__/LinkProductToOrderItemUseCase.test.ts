import { LinkProductToOrderItemUseCase } from "../LinkProductToOrderItemUseCase.ts";
import type { RecalculateOrderStatusUseCase, RecalculateOrderStatusResult } from "../RecalculateOrderStatusUseCase.ts";
import { createStatusChangedEvent } from "../../../domain/orders/OrderDomainEvents.ts";
import type { OrderStatusChangedEvent } from "../../../domain/orders/OrderDomainEvents.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";
import type { IOrderRepository, OrderRecord } from "../../../domain/orders/ports/IOrderRepository.ts";
import type {
  IProductLinkRepository,
  OrderItemLink,
  OrderItemLinkQuery,
  ProductLinkResult,
} from "../../../domain/orders/ports/IProductLinkRepository.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`Expected ${String(expected)} but got ${String(actual)}`);
}
function runTest(name: string, fn: () => Promise<void> | void): void {
  (globalThis as unknown as { Deno?: { test?: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test?.(name, fn);
}

function orphanItem(id: string, marketplaceItemId: string): OrderRecord["items"][number] {
  return { id, productId: null, marketplaceItemId, variationId: null, sellerSku: null, quantity: 1 };
}

class MockOrderRepository implements IOrderRepository {
  constructor(private order: OrderRecord) {}
  public statusUpdates = 0;
  public historyWrites = 0;
  async findById(_orderId: string): Promise<OrderRecord | null> {
    return this.order;
  }
  async findByMarketplaceOrderId(): Promise<OrderRecord | null> {
    return null;
  }
  async markLabelPrinted(): Promise<void> {}
  async updateStatus(params: { readonly orderId: string; readonly currentStatus: OrderStatus | null; readonly newStatus: OrderStatus }): Promise<void> {
    this.statusUpdates += 1;
    this.order = { ...this.order, currentStatus: params.newStatus };
  }
  async updateOrderItemsProductId(_orderId: string, items: ReadonlyArray<{ readonly id: string; readonly productId: string }>): Promise<void> {
    const patch = new Map(items.map((i) => [i.id, i.productId]));
    this.order = { ...this.order, items: this.order.items.map((it) => (patch.has(it.id) ? { ...it, productId: patch.get(it.id)! } : it)) };
  }
  async updateInternalFlags(_orderId: string, _flags: Readonly<{ isPrintedLabel?: boolean; isPickupDone?: boolean }>): Promise<void> {}
  async addStatusHistory(_orderId: string, _event: OrderStatusChangedEvent): Promise<void> {
    this.historyWrites += 1;
  }
}

class MockProductLinkRepository implements IProductLinkRepository {
  public permanentLinks = 0;
  async findLink(_organizationId: string, _sku: string): Promise<OrderItemLink | null> {
    return null;
  }
  async listLinks(_organizationId: string, _skus: ReadonlyArray<string>): Promise<ReadonlyArray<OrderItemLink>> {
    return [];
  }
  async checkLinks(_params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly items: ReadonlyArray<OrderItemLinkQuery>;
  }): Promise<ReadonlyArray<ProductLinkResult>> {
    return [];
  }
  async upsertPermanentLink(_params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly marketplaceItemId: string;
    readonly variationId: string;
    readonly productId: string;
  }): Promise<void> {
    this.permanentLinks += 1;
  }
  async countUnlinkedItems(_params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly orderId: string;
    readonly items: ReadonlyArray<OrderItemLinkQuery>;
  }): Promise<number> {
    return 0;
  }
}

class MockRecalculateUseCase {
  public calls: string[] = [];
  constructor(public result: RecalculateOrderStatusResult | null = null) {}
  async execute(
    orderId: string,
    _source?: "webhook" | "user_action" | "sync",
  ): Promise<RecalculateOrderStatusResult | null> {
    this.calls.push(orderId);
    return this.result;
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

runTest("links last orphan item and delegates recalculation", async () => {
  const orderRepo = new MockOrderRepository(baseOrder([orphanItem("i1", "mli-1")]));
  const linkRepo = new MockProductLinkRepository();
  const recalculate = new MockRecalculateUseCase({
    orderId: "order-1",
    previousStatus: OrderStatus.UNLINKED,
    newStatus: OrderStatus.READY_TO_PRINT,
    event: createStatusChangedEvent({
      orderId: "order-1",
      organizationId: "org-1",
      previousStatus: OrderStatus.UNLINKED,
      newStatus: OrderStatus.READY_TO_PRINT,
      source: "user_action",
    }),
  });

  const result = await new LinkProductToOrderItemUseCase(
    orderRepo,
    linkRepo,
    recalculate as unknown as RecalculateOrderStatusUseCase,
  ).execute({
    orderId: "order-1",
    orderItemId: "i1",
    productId: "p-1",
    organizationId: "org-1",
    isPermanent: true,
  });

  assertEquals(result.statusChanged, true);
  assertEquals(result.newStatus, OrderStatus.READY_TO_PRINT);
  assertEquals(result.remainingUnlinkedCount, 0);
  assertEquals(recalculate.calls.length, 1);
  assertEquals(recalculate.calls[0], "order-1");
  assertEquals(linkRepo.permanentLinks, 1);
});

runTest("keeps UNLINKED when other orphans remain and does NOT recalculate", async () => {
  const orderRepo = new MockOrderRepository(baseOrder([orphanItem("i1", "mli-1"), orphanItem("i2", "mli-2")]));
  const linkRepo = new MockProductLinkRepository();
  const recalculate = new MockRecalculateUseCase();

  const result = await new LinkProductToOrderItemUseCase(
    orderRepo,
    linkRepo,
    recalculate as unknown as RecalculateOrderStatusUseCase,
  ).execute({
    orderId: "order-1",
    orderItemId: "i1",
    productId: "p-1",
    organizationId: "org-1",
    isPermanent: false,
  });

  assertEquals(result.statusChanged, false);
  assertEquals(result.remainingUnlinkedCount, 1);
  assertEquals(result.newStatus, undefined);
  assertEquals(recalculate.calls.length, 0);
  assertEquals(linkRepo.permanentLinks, 0);
});

runTest("isPermanent=false does NOT save permanent link", async () => {
  const orderRepo = new MockOrderRepository(baseOrder([orphanItem("i1", "mli-1")]));
  const linkRepo = new MockProductLinkRepository();
  const recalculate = new MockRecalculateUseCase(null);

  await new LinkProductToOrderItemUseCase(
    orderRepo,
    linkRepo,
    recalculate as unknown as RecalculateOrderStatusUseCase,
  ).execute({
    orderId: "order-1",
    orderItemId: "i1",
    productId: "p-1",
    organizationId: "org-1",
    isPermanent: false,
  });

  assertEquals(linkRepo.permanentLinks, 0);
});

runTest("returns statusChanged=false when recalculation yields no change", async () => {
  const orderRepo = new MockOrderRepository(baseOrder([orphanItem("i1", "mli-1")]));
  const linkRepo = new MockProductLinkRepository();
  const recalculate = new MockRecalculateUseCase(null);

  const result = await new LinkProductToOrderItemUseCase(
    orderRepo,
    linkRepo,
    recalculate as unknown as RecalculateOrderStatusUseCase,
  ).execute({
    orderId: "order-1",
    orderItemId: "i1",
    productId: "p-1",
    organizationId: "org-1",
    isPermanent: true,
  });

  assertEquals(result.statusChanged, false);
  assertEquals(result.remainingUnlinkedCount, 0);
  assertEquals(result.newStatus, undefined);
  assertEquals(recalculate.calls.length, 1);
});

runTest("returns correct remainingUnlinkedCount with 3 items, 1 linked", async () => {
  const orderRepo = new MockOrderRepository(
    baseOrder([orphanItem("i1", "mli-1"), orphanItem("i2", "mli-2"), orphanItem("i3", "mli-3")]),
  );
  const linkRepo = new MockProductLinkRepository();
  const recalculate = new MockRecalculateUseCase();

  const result = await new LinkProductToOrderItemUseCase(
    orderRepo,
    linkRepo,
    recalculate as unknown as RecalculateOrderStatusUseCase,
  ).execute({
    orderId: "order-1",
    orderItemId: "i1",
    productId: "p-1",
    organizationId: "org-1",
    isPermanent: false,
  });

  assertEquals(result.remainingUnlinkedCount, 2);
  assertEquals(result.statusChanged, false);
  assertEquals(recalculate.calls.length, 0);
});
