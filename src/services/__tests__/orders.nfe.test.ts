import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchNfeEmissionOrders,
  fetchOrderStatusHistory,
} from "../orders.service";

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

describe("fetchNfeEmissionOrders", () => {
  it("returns mapped NfeEmissionOrderData with count", async () => {
    const orderRow = {
      id: "order-nfe-1",
      marketplace_order_id: "ML-NFE-1",
      buyer_name: "Maria Santos",
      gross_amount: 200,
      status: "invoice_pending",
      created_at: "2025-02-01T12:00:00Z",
      marketplace: "mercado_livre",
      pack_id: "pack-1",
      order_items: [{ title: "Produto A", quantity: 1, sku: "SKU-A", marketplace_item_id: "MLB-1" }],
      order_shipping: { logistic_type: "xd_drop_off" },
    };

    const mockEq = vi.fn().mockResolvedValue({
      data: [orderRow],
      error: null,
      count: 1,
    });
    const mockRange = vi.fn().mockReturnValue({ eq: mockEq });
    const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
    const mockIn = vi.fn().mockReturnValue({ order: mockOrder });
    mockFrom.mockReturnValue({
      select: vi.fn().mockImplementation((_fields: string, opts?: { count?: string }) => {
        expect(opts?.count).toBe("exact");
        return { in: mockIn };
      }),
    });

    const result = await fetchNfeEmissionOrders("org-1", 0, 10);

    expect(mockFrom).toHaveBeenCalledWith("orders");
    expect(result.count).toBe(1);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({
      id: "order-nfe-1",
      marketplace_order_id: "ML-NFE-1",
      customer_name: "Maria Santos",
      order_total: 200,
    });
  });

  it('throws containing "fetchNfeEmissionOrders failed:" on error', async () => {
    const mockEq = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
      count: null,
    });
    const mockRange = vi.fn().mockReturnValue({ eq: mockEq });
    const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
    const mockIn = vi.fn().mockReturnValue({ order: mockOrder });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: mockIn }),
    });

    await expect(fetchNfeEmissionOrders("org-1", 0, 10)).rejects.toThrow(
      "fetchNfeEmissionOrders failed: permission denied",
    );
  });
});

describe("fetchOrderStatusHistory", () => {
  it("maps snake_case rows to OrderStatusHistoryEntry", async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: "hist-1",
          order_id: "order-1",
          from_status: "pending",
          to_status: "invoice_pending",
          changed_at: "2025-01-01T00:00:00Z",
          source: "system",
        },
        {
          id: "hist-2",
          order_id: "order-1",
          from_status: "invoice_pending",
          to_status: "ready_to_print",
          changed_at: "2025-01-02T00:00:00Z",
          source: "user",
        },
      ],
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq,
      }),
    });

    const result = await fetchOrderStatusHistory("order-1");

    expect(mockFrom).toHaveBeenCalledWith("order_status_history");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "hist-1",
      orderId: "order-1",
      fromStatus: "pending",
      toStatus: "invoice_pending",
      changedAt: "2025-01-01T00:00:00Z",
      source: "system",
    });
    expect(result[1]).toMatchObject({
      id: "hist-2",
      orderId: "order-1",
      fromStatus: "invoice_pending",
      toStatus: "ready_to_print",
      source: "user",
    });
  });

  it('throws containing "fetchOrderStatusHistory failed:" on error', async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "table missing" },
    });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq,
      }),
    });

    await expect(fetchOrderStatusHistory("order-1")).rejects.toThrow(
      "fetchOrderStatusHistory failed: table missing",
    );
  });
});
