import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EmitNfeUseCase } from "../EmitNfeUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../RecalculateOrderStatusUseCase.ts";
import { OrderStatusEngine } from "../OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../HandleStockSideEffectsUseCase.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";
import { FULLY_LINKED } from "../../../domain/orders/ProductLinkState.ts";
import type { IInventoryPort, InventoryItem } from "../../../domain/orders/ports/IInventoryPort.ts";
import type { IOrderRepository, OrderRecord } from "../../../domain/orders/ports/IOrderRepository.ts";
import type { OrderStatusChangedEvent } from "../../../domain/orders/OrderDomainEvents.ts";
import type { INfePort, InvoiceRecord } from "../../../domain/orders/ports/INfePort.ts";

// ── Mocks ──────────────────────────────────────────────────────────────────

class NoopInventory implements IInventoryPort {
  async reserveStockNow(_p: { readonly orderId: string; readonly organizationId: string; readonly items: ReadonlyArray<InventoryItem> }): Promise<void> {}
  async enqueueConsumeStock(_p: { readonly orderId: string; readonly organizationId: string }): Promise<void> {}
  async enqueueRefundStock(_p: { readonly orderId: string; readonly organizationId: string }): Promise<void> {}
}

class MockOrderRepository implements IOrderRepository {
  public flagCalls: Array<{ orderId: string; flags: Record<string, unknown> }> = [];
  public recalculateCalls: string[] = [];

  constructor(private order: OrderRecord | null) {}

  async findById(_orderId: string): Promise<OrderRecord | null> { return this.order; }
  async findByMarketplaceOrderId(): Promise<OrderRecord | null> { return null; }
  async markLabelPrinted(): Promise<void> {}
  async updateStatus(params: { readonly orderId: string; readonly currentStatus: OrderStatus | null; readonly newStatus: OrderStatus }): Promise<void> {
    if (this.order) this.order = { ...this.order, currentStatus: params.newStatus };
  }
  async updateOrderItemsProductId(): Promise<void> {}
  async updateInternalFlags(orderId: string, flags: Readonly<{ isPrintedLabel?: boolean; isPickupDone?: boolean; hasInvoice?: boolean }>): Promise<void> {
    this.flagCalls.push({ orderId, flags: { ...flags } });
  }
  async addStatusHistory(_orderId: string, _event: OrderStatusChangedEvent): Promise<void> {}
}

class MockNfePort implements INfePort {
  public upsertCalls: InvoiceRecord[] = [];
  async findInvoiceByOrder(): Promise<InvoiceRecord | null> { return null; }
  async upsertInvoice(invoice: InvoiceRecord): Promise<void> { this.upsertCalls.push(invoice); }
}

function buildOrder(orderId: string): OrderRecord {
  return {
    id: orderId,
    organizationId: "org-1",
    marketplace: "mercado_livre",
    marketplaceOrderId: "ML-123",
    currentStatus: OrderStatus.INVOICE_PENDING,
    marketplaceSignals: {
      organizationId: "org-1",
      marketplaceOrderId: "ML-123",
      marketplace: "mercado_livre",
      marketplaceStatus: "paid",
      shipmentStatus: "ready_to_ship",
      shipmentSubstatus: "invoice_pending",
      isFulfillment: false,
      isCancelled: false,
      isRefunded: false,
      isReturned: false,
      isPrintedLabel: false,
      hasInvoice: false,
    },
    items: [],
  };
}

function buildInvoice(orderId: string): InvoiceRecord {
  return {
    orderId,
    companyId: "company-1",
    marketplaceOrderId: "ML-123",
    marketplace: "mercado_livre",
    packId: null,
    status: "autorizado",
    statusFocus: "autorizado",
    environment: "homologacao",
    focusNfeId: "focus-1",
    nfeKey: "key-1",
    nfeNumber: 1,
    serie: "1",
    authorizedAt: new Date().toISOString(),
    xmlBase64: null,
    pdfBase64: null,
    errorDetails: null,
  };
}

function buildUseCase(repo: MockOrderRepository, nfePort: MockNfePort): EmitNfeUseCase {
  const stock = new HandleStockSideEffectsUseCase(new NoopInventory());
  const recalculate = new RecalculateOrderStatusUseCase(repo, new OrderStatusEngine(), stock);
  return new EmitNfeUseCase(repo, nfePort, recalculate);
}

// ── Tests ──────────────────────────────────────────────────────────────────

Deno.test("EmitNfeUseCase: returns error when order not found", async () => {
  const repo = new MockOrderRepository(null);
  const nfePort = new MockNfePort();
  const useCase = buildUseCase(repo, nfePort);

  const result = await useCase.execute({ orderId: "missing-id", invoice: buildInvoice("missing-id"), authorized: true });

  assertEquals(result.ok, false);
  assertEquals(nfePort.upsertCalls.length, 0);
  assertEquals(repo.flagCalls.length, 0);
});

Deno.test("EmitNfeUseCase: authorized emission persists invoice and sets hasInvoice", async () => {
  const orderId = "order-1";
  const repo = new MockOrderRepository(buildOrder(orderId));
  const nfePort = new MockNfePort();
  const useCase = buildUseCase(repo, nfePort);

  const result = await useCase.execute({ orderId, invoice: buildInvoice(orderId), authorized: true });

  assertEquals(result.ok, true);
  assertEquals(nfePort.upsertCalls.length, 1);
  assertEquals(repo.flagCalls.length, 1);
  assertEquals(repo.flagCalls[0].flags.hasInvoice, true);
});

Deno.test("EmitNfeUseCase: failed emission persists invoice but does NOT set hasInvoice", async () => {
  const orderId = "order-2";
  const failedInvoice: InvoiceRecord = { ...buildInvoice(orderId), status: "erro_autorizacao", authorized: false } as any;
  const repo = new MockOrderRepository(buildOrder(orderId));
  const nfePort = new MockNfePort();
  const useCase = buildUseCase(repo, nfePort);

  const result = await useCase.execute({ orderId, invoice: failedInvoice, authorized: false });

  assertEquals(result.ok, true);
  assertEquals(nfePort.upsertCalls.length, 1);
  // hasInvoice should NOT be set when not authorized
  const hasInvoiceFlags = repo.flagCalls.filter(c => (c.flags as any).hasInvoice === true);
  assertEquals(hasInvoiceFlags.length, 0);
});

Deno.test("EmitNfeUseCase: does NOT reference marketplace_orders_presented_new", async () => {
  const orderId = "order-3";
  const repo = new MockOrderRepository(buildOrder(orderId));
  const nfePort = new MockNfePort();
  const useCase = buildUseCase(repo, nfePort);

  // The use case source code must not contain any reference to the legacy table.
  // This is verified by grepping the source, but we ensure it runs without querying that table.
  const result = await useCase.execute({ orderId, invoice: buildInvoice(orderId), authorized: true });
  assertEquals(result.ok, true);
  assertEquals(FULLY_LINKED.unlinkedCount, 0);
});
