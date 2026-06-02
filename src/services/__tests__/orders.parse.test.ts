import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOrderById, parseOrderRow } from "../orders.service";

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockAuthGetSession = vi.fn();
const mockAuthGetUser = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getSession: () => mockAuthGetSession(), getUser: () => mockAuthGetUser() },
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
  },
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-key",
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function buildFullOrderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "order-uuid-1",
    organization_id: "org-1",
    marketplace: "mercado_livre",
    marketplace_order_id: "ML-12345",
    pack_id: null,
    status: "pending",
    marketplace_status: null,
    payment_status: "paid",
    gross_amount: 150,
    marketplace_fee: 15,
    shipping_cost: 12.5,
    shipping_subsidy: 0,
    net_amount: 122.5,
    buyer_name: "João Silva",
    buyer_document: null,
    buyer_email: null,
    buyer_phone: null,
    buyer_state: "SP",
    created_at: "2025-01-15T10:00:00Z",
    shipped_at: null,
    delivered_at: null,
    canceled_at: null,
    last_synced_at: null,
    is_printed_label: false,
    label_printed_at: null,
    has_invoice: false,
    is_fulfillment: false,
    order_items: [
      {
        id: "item-uuid-1",
        title: "Camiseta Azul",
        sku: "SKU-001",
        quantity: 2,
        unit_price: 75,
        unit_cost: 30,
        product_id: "prod-uuid-1",
        marketplace_item_id: "MLB-999",
        variation_name: "M",
        image_url: "https://cdn.example/img.jpg",
      },
    ],
    order_shipping: {
      logistic_type: "drop_off",
      status: "ready_to_ship",
      carrier: "Correios",
      sla_expected_date: "2025-01-20",
      city: "São Paulo",
      state_uf: "SP",
    },
    order_labels: [],
    ...overrides,
  };
}

describe("parseOrderRow", () => {
  it("[P1] maps full row with items, shipping, and financials", () => {
    const row = buildFullOrderRow();
    const order = parseOrderRow(row);

    expect(order.id).toBe("order-uuid-1");
    expect(order.marketplace).toBe("mercado_livre");
    expect(order.marketplaceOrderId).toBe("ML-12345");
    expect(order.items[0].name).toBe("Camiseta Azul");
    expect(order.items[0].linked).toBe(true);
    expect(order.status).toBe("Pendente");
    expect(order.labelPrinted).toBe(false);
    expect(order.financial.shippingCost).toBe(12.5);
  });

  it("returns Entregue when shipping.status is delivered", () => {
    const row = buildFullOrderRow({
      order_shipping: {
        logistic_type: "drop_off",
        status: "delivered",
        carrier: "Correios",
        sla_expected_date: null,
        city: "São Paulo",
        state_uf: "SP",
      },
    });
    const order = parseOrderRow(row);
    expect(order.status).toBe("Entregue");
  });

  it("sets labelPrinted true when order_labels has entries", () => {
    const row = buildFullOrderRow({ order_labels: [{ id: "label-1" }] });
    const order = parseOrderRow(row);
    expect(order.labelPrinted).toBe(true);
  });

  it("uses buyer_name fallback item when order_items empty", () => {
    const row = buildFullOrderRow({ order_items: [] });
    const order = parseOrderRow(row);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].name).toBe("João Silva");
    expect(order.items[0].linked).toBe(false);
  });

  it("returns Pendente for empty internal status (mapInternalStatusToLabel fallback)", () => {
    const row = buildFullOrderRow({ status: "" });
    const order = parseOrderRow(row);
    expect(order.status).toBe("Pendente");
    expect(order.status).not.toBe("—");
  });

  it("does not return em-dash for unrecognized slug (differs from orderUtils)", () => {
    const row = buildFullOrderRow({ status: "totally_unknown_slug" });
    const order = parseOrderRow(row);
    expect(order.status).toBe("totally_unknown_slug");
    expect(order.status).not.toBe("—");
  });
});

describe("fetchOrderById", () => {
  it("queries orders table and returns parseOrderRow result", async () => {
    const rawRow = buildFullOrderRow();
    const mockSingle = vi.fn().mockResolvedValue({ data: rawRow, error: null });
    const mockEq2 = vi.fn().mockReturnValue({ single: mockSingle });
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq1,
      }),
    });

    const result = await fetchOrderById("org-1", "order-uuid-1");

    expect(mockFrom).toHaveBeenCalledWith("orders");
    expect(result.id).toBe("order-uuid-1");
    expect(result.marketplaceOrderId).toBe("ML-12345");
    expect(result.items[0].name).toBe("Camiseta Azul");
  });

  it('throws "Pedido não encontrado" when data null and error null', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockEq2 = vi.fn().mockReturnValue({ single: mockSingle });
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq1,
      }),
    });

    await expect(fetchOrderById("org-1", "missing-id")).rejects.toThrow("Pedido não encontrado");
  });

  it("rethrows supabase error when set", async () => {
    const dbError = { message: "DB connection failed", code: "PGRST" };
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: dbError });
    const mockEq2 = vi.fn().mockReturnValue({ single: mockSingle });
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq1,
      }),
    });

    await expect(fetchOrderById("org-1", "order-uuid-1")).rejects.toEqual(dbError);
  });
});
