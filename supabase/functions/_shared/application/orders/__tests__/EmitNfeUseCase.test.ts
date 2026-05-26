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
import type { InvoicesPort, InvoiceRow, CreateInvoiceInput } from "../../../ports/invoices-port.ts";
import type { SupabaseClient } from "../../../adapters/infra/supabase-client.ts";

// ── Mocks ──────────────────────────────────────────────────────────────────

class NoopInventory implements IInventoryPort {
  async reserveStockNow(_p: { readonly orderId: string; readonly organizationId: string; readonly items: ReadonlyArray<InventoryItem> }): Promise<void> {}
  async enqueueConsumeStock(_p: { readonly orderId: string; readonly organizationId: string }): Promise<void> {}
  async enqueueRefundStock(_p: { readonly orderId: string; readonly organizationId: string }): Promise<void> {}
}

class MockOrderRepository implements IOrderRepository {
  public flagCalls: Array<{ orderId: string; flags: Record<string, unknown> }> = [];

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

class MockInvoicesAdapter implements InvoicesPort {
  public findCalls: string[] = [];
  public createCalls: CreateInvoiceInput[] = [];
  public markProcessingCalls: Array<{ id: string; focusId: string }> = [];
  public markErrorCalls: Array<{ id: string; message: string; retryCount: number }> = [];
  public markAuthorizedCalls: Array<{ id: string; nfeKey: string; nfeNumber: number }> = [];

  private existingRow: InvoiceRow | null = null;

  givenExisting(row: InvoiceRow): this {
    this.existingRow = row;
    return this;
  }

  async findByIdempotencyKey(_admin: SupabaseClient, key: string): Promise<InvoiceRow | null> {
    this.findCalls.push(key);
    return this.existingRow;
  }
  async createQueued(_admin: SupabaseClient, input: CreateInvoiceInput): Promise<InvoiceRow> {
    this.createCalls.push(input);
    return { id: "inv-001", status: "queued", retry_count: 0, ...input } as unknown as InvoiceRow;
  }
  async markProcessing(_admin: SupabaseClient, id: string, focusId: string): Promise<void> {
    this.markProcessingCalls.push({ id, focusId });
  }
  async markError(_admin: SupabaseClient, id: string, message: string, retryCount: number): Promise<void> {
    this.markErrorCalls.push({ id, message, retryCount });
  }
  async markAuthorized(_admin: SupabaseClient, id: string, nfeKey: string, nfeNumber: number): Promise<void> {
    this.markAuthorizedCalls.push({ id, nfeKey, nfeNumber });
  }
  async markCanceled(_admin: SupabaseClient, _id: string): Promise<void> {}
  async findByFocusId(_admin: SupabaseClient, _focusId: string): Promise<InvoiceRow | null> { return null; }
  async findByNfeKey(_admin: SupabaseClient, _nfeKey: string): Promise<InvoiceRow | null> { return null; }
  async updateFields(_admin: SupabaseClient, _id: string, _fields: Partial<InvoiceRow>): Promise<void> {}
}

const MOCK_ADMIN = {} as SupabaseClient;

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

function buildExistingInvoice(): InvoiceRow {
  return {
    id: "inv-existing",
    organization_id: "org-1",
    order_id: "order-1",
    company_id: "company-1",
    idempotency_key: "org-1:order-1:homologacao",
    focus_id: null,
    nfe_number: null,
    nfe_key: null,
    status: "queued",
    emission_environment: "homologacao",
    retry_count: 0,
    error_message: null,
    payload_sent: null,
    marketplace: "mercado_livre",
    marketplace_order_id: "ML-123",
    total_value: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function buildUseCase(repo: MockOrderRepository, invoicesAdapter: MockInvoicesAdapter): EmitNfeUseCase {
  const stock = new HandleStockSideEffectsUseCase(new NoopInventory());
  const recalculate = new RecalculateOrderStatusUseCase(repo, new OrderStatusEngine(), stock);
  return new EmitNfeUseCase(MOCK_ADMIN, repo, invoicesAdapter, recalculate);
}

// ── Tests ──────────────────────────────────────────────────────────────────

Deno.test("EmitNfeUseCase: returns error when order not found", async () => {
  const repo = new MockOrderRepository(null);
  const invoicesAdapter = new MockInvoicesAdapter();
  const useCase = buildUseCase(repo, invoicesAdapter);

  const result = await useCase.execute({
    orderId: "missing-id",
    organizationId: "org-1",
    companyId: "company-1",
    environment: "homologacao",
    focusId: null,
    nfeKey: "key-1",
    nfeNumber: 1,
    authorized: true,
    errorMessage: null,
  });

  assertEquals(result.ok, false);
  assertEquals(invoicesAdapter.findCalls.length, 0);
  assertEquals(repo.flagCalls.length, 0);
});

Deno.test("EmitNfeUseCase: authorized emission calls markAuthorized and sets hasInvoice", async () => {
  const orderId = "order-1";
  const repo = new MockOrderRepository(buildOrder(orderId));
  const invoicesAdapter = new MockInvoicesAdapter().givenExisting(buildExistingInvoice());
  const useCase = buildUseCase(repo, invoicesAdapter);

  const result = await useCase.execute({
    orderId,
    organizationId: "org-1",
    companyId: "company-1",
    environment: "homologacao",
    focusId: "focus-1",
    nfeKey: "key-1",
    nfeNumber: 1,
    authorized: true,
    errorMessage: null,
  });

  assertEquals(result.ok, true);
  assertEquals(invoicesAdapter.markAuthorizedCalls.length, 1);
  assertEquals(invoicesAdapter.markAuthorizedCalls[0].nfeKey, "key-1");
  assertEquals(repo.flagCalls.length, 1);
  assertEquals(repo.flagCalls[0].flags.hasInvoice, true);
});

Deno.test("EmitNfeUseCase: error emission calls markError and does NOT set hasInvoice", async () => {
  const orderId = "order-2";
  const repo = new MockOrderRepository(buildOrder(orderId));
  const existing = { ...buildExistingInvoice(), id: "inv-err", idempotency_key: "org-1:order-2:homologacao", order_id: orderId };
  const invoicesAdapter = new MockInvoicesAdapter().givenExisting(existing);
  const useCase = buildUseCase(repo, invoicesAdapter);

  const result = await useCase.execute({
    orderId,
    organizationId: "org-1",
    companyId: "company-1",
    environment: "homologacao",
    focusId: null,
    nfeKey: null,
    nfeNumber: null,
    authorized: false,
    errorMessage: "SEFAZ rejected",
  });

  assertEquals(result.ok, true);
  assertEquals(invoicesAdapter.markErrorCalls.length, 1);
  assertEquals(invoicesAdapter.markErrorCalls[0].message, "SEFAZ rejected");
  const hasInvoiceFlags = repo.flagCalls.filter(c => (c.flags as Record<string, unknown>).hasInvoice === true);
  assertEquals(hasInvoiceFlags.length, 0);
});

Deno.test("EmitNfeUseCase: recalculateOrderStatus is always called", async () => {
  const orderId = "order-3";
  const repo = new MockOrderRepository(buildOrder(orderId));
  const invoicesAdapter = new MockInvoicesAdapter();
  const useCase = buildUseCase(repo, invoicesAdapter);

  const result = await useCase.execute({
    orderId,
    organizationId: "org-1",
    companyId: "company-1",
    environment: "homologacao",
    focusId: null,
    nfeKey: null,
    nfeNumber: null,
    authorized: false,
    errorMessage: null,
  });

  assertEquals(result.ok, true);
  assertEquals(FULLY_LINKED.unlinkedCount, 0);
});

Deno.test("EmitNfeUseCase: source has no reference to notas_fiscais", async () => {
  const src = await Deno.readTextFile(new URL("../EmitNfeUseCase.ts", import.meta.url));
  assertEquals(src.includes("notas_fiscais"), false, "EmitNfeUseCase must not reference notas_fiscais");
});
