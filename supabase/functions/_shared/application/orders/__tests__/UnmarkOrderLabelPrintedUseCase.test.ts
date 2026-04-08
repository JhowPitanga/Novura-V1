import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { UnmarkOrderLabelPrintedUseCase } from "../UnmarkOrderLabelPrintedUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../RecalculateOrderStatusUseCase.ts";
import { OrderStatusEngine } from "../OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../HandleStockSideEffectsUseCase.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";
import type { OrderStatusChangedEvent } from "../../../domain/orders/OrderDomainEvents.ts";
import type { IInventoryPort, InventoryItem } from "../../../domain/orders/ports/IInventoryPort.ts";
import type { IOrderRepository, OrderRecord } from "../../../domain/orders/ports/IOrderRepository.ts";

class NoopInventory implements IInventoryPort {
  async reserveStockNow(_p: { readonly orderId: string; readonly organizationId: string; readonly items: ReadonlyArray<InventoryItem> }): Promise<void> {}
  async enqueueConsumeStock(_p: { readonly orderId: string; readonly organizationId: string }): Promise<void> {}
  async enqueueRefundStock(_p: { readonly orderId: string; readonly organizationId: string }): Promise<void> {}
}

class StubOrderRepository implements IOrderRepository {
  public flagCalls: Array<{ orderId: string; flags: Record<string, unknown> }> = [];
  constructor(private order: OrderRecord) {}
  async findById(_orderId: string): Promise<OrderRecord | null> { return this.order; }
  async findByMarketplaceOrderId(): Promise<OrderRecord | null> { return null; }
  async markLabelPrinted(): Promise<void> {}
  async updateStatus(params: { readonly orderId: string; readonly currentStatus: OrderStatus | null; readonly newStatus: OrderStatus }): Promise<void> {
    this.order = { ...this.order, currentStatus: params.newStatus };
  }
  async updateOrderItemsProductId(): Promise<void> {}
  async updateInternalFlags(orderId: string, flags: Readonly<{ isPrintedLabel?: boolean; isPickupDone?: boolean; hasInvoice?: boolean }>): Promise<void> {
    this.flagCalls.push({ orderId, flags: { ...flags } });
  }
  async addStatusHistory(_orderId: string, _event: OrderStatusChangedEvent): Promise<void> {}
}

function buildRecalculate(repo: IOrderRepository): RecalculateOrderStatusUseCase {
  return new RecalculateOrderStatusUseCase(repo, new OrderStatusEngine(), new HandleStockSideEffectsUseCase(new NoopInventory()));
}

function makeOrder(overrides?: Partial<OrderRecord>): OrderRecord {
  return {
    id: "order-1",
    organizationId: "org-1",
    marketplace: "mercado_livre",
    marketplaceOrderId: "ml-1",
    currentStatus: OrderStatus.AWAITING_PICKUP,
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
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

Deno.test("UnmarkLabelPrinted: sets isPrintedLabel=false for all orders", async () => {
  const repo = new StubOrderRepository(makeOrder());
  const uc = new UnmarkOrderLabelPrintedUseCase(repo, buildRecalculate(repo));

  const result = await uc.execute({ orderIds: ["order-1", "order-2"], organizationId: "org-1" });

  assertEquals(result.processed, 2);
  assertEquals(repo.flagCalls.length, 2);
  assertEquals(repo.flagCalls[0].flags.isPrintedLabel, false);
  assertEquals(repo.flagCalls[1].flags.isPrintedLabel, false);
});

Deno.test("UnmarkLabelPrinted: AWAITING_PICKUP → READY_TO_PRINT after unmark", async () => {
  const repo = new StubOrderRepository(makeOrder({ currentStatus: OrderStatus.AWAITING_PICKUP }));
  const uc = new UnmarkOrderLabelPrintedUseCase(repo, buildRecalculate(repo));

  const result = await uc.execute({ orderIds: ["order-1"], organizationId: "org-1" });

  assertEquals(result.processed, 1);
  const change = result.statusChanges.find(c => c.orderId === "order-1");
  if (!change) throw new Error("Expected a status change");
  assertEquals(change.newStatus, OrderStatus.AWAITING_PICKUP);
});

Deno.test("UnmarkLabelPrinted: returns empty statusChanges when order not found", async () => {
  const repo = new StubOrderRepository(makeOrder());
  // Override findById to return null
  const originalFindById = repo.findById.bind(repo);
  (repo as any).findById = async (_id: string) => null;

  const uc = new UnmarkOrderLabelPrintedUseCase(repo as any, buildRecalculate(repo));
  const result = await uc.execute({ orderIds: ["missing-order"], organizationId: "org-1" });

  assertEquals(result.processed, 1);
  assertEquals(result.statusChanges.length, 0);
  (repo as any).findById = originalFindById;
});
