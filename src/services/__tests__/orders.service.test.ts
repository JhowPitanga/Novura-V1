import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCompanyIdForOrg,
  syncMercadoLivreOrders,
  syncShopeeOrders,
  syncNfeForOrder,
  submitXmlSend,
  arrangeShopeeShipment,
  emitNfeQueue,
  fetchShopeeShops,
  markOrdersPrinted,
  updateOrdersInternalStatus,
  fetchNfeStatusRows,
} from "../orders.service";

// Mock supabase
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockAuthGetSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
    auth: { getSession: () => mockAuthGetSession() },
    functions: { invoke: (...args: any[]) => mockFunctionsInvoke(...args) },
  },
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-key",
}));

// Mock fetch for edge function calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthGetSession.mockResolvedValue({
    data: { session: { access_token: "test-token" } },
  });
});

describe("getCompanyIdForOrg", () => {
  it("returns company id for valid organization", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: "company-123" }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const result = await getCompanyIdForOrg("org-1");
    expect(result).toBe("company-123");
    expect(mockFrom).toHaveBeenCalledWith("companies");
  });

  it("returns null when no companies found", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const result = await getCompanyIdForOrg("org-1");
    expect(result).toBeNull();
  });

  it("returns null for empty organization id", async () => {
    const result = await getCompanyIdForOrg("");
    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("syncMercadoLivreOrders", () => {
  it("calls edge function with correct parameters", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ synced: 5 }),
    });

    await syncMercadoLivreOrders("org-1");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("mercado-livre-sync-orders"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"organizationId":"org-1"'),
      })
    );
  });

  it("passes order_ids when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await syncMercadoLivreOrders("org-1", ["id-1", "id-2"]);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"order_ids":["id-1","id-2"]'),
      })
    );
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Server error" }),
    });

    await expect(syncMercadoLivreOrders("org-1")).rejects.toThrow(
      "Server error"
    );
  });

  it("throws when no auth token", async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: null },
    });

    await expect(syncMercadoLivreOrders("org-1")).rejects.toThrow();
  });
});

describe("fetchShopeeShops", () => {
  it("returns formatted shop options", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: "int-1",
                config: { shopee_shop_id: 12345, shop_name: "My Shop" },
                meli_user_id: null,
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const result = await fetchShopeeShops("org-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "int-1",
      shop_id: 12345,
      label: "My Shop",
    });
  });

  it("returns empty array for no integrations", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    });

    const result = await fetchShopeeShops("org-1");
    expect(result).toEqual([]);
  });
});

describe("syncNfeForOrder", () => {
  it("invokes focus-nfe-sync edge function", async () => {
    mockFunctionsInvoke.mockResolvedValue({ error: null });

    await syncNfeForOrder("org-1", "company-1", "order-1", "homologacao");

    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      "focus-nfe-sync",
      expect.objectContaining({
        body: expect.objectContaining({
          organizationId: "org-1",
          companyId: "company-1",
          orderIds: ["order-1"],
          environment: "homologacao",
        }),
      })
    );
  });
});

describe("emitNfeQueue", () => {
  it("calls rpc_queues_emit with correct parameters", async () => {
    mockRpc.mockResolvedValue({ error: null });

    await emitNfeQueue("org-1", "company-1", ["order-1"], "producao", {
      forceNewNumber: true,
      forceNewRef: true,
    });

    expect(mockRpc).toHaveBeenCalledWith(
      "rpc_queues_emit",
      expect.objectContaining({
        p_message: expect.objectContaining({
          organizations_id: "org-1",
          company_id: "company-1",
          environment: "producao",
          orderIds: ["order-1"],
          forceNewNumber: true,
          forceNewRef: true,
        }),
      })
    );
  });
});

describe("markOrdersPrinted", () => {
  it("calls rpc with order ids", async () => {
    mockRpc.mockResolvedValue({ error: null });

    await markOrdersPrinted(["order-1", "order-2"]);

    expect(mockRpc).toHaveBeenCalledWith(
      "rpc_marketplace_order_print_label",
      { p_order_ids: ["order-1", "order-2"] }
    );
  });

  it("does nothing for empty array", async () => {
    await markOrdersPrinted([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("updateOrdersInternalStatus", () => {
  it("updates status for given order ids", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error: null }),
    });
    mockFrom.mockReturnValue({
      update: mockUpdate,
    });

    await updateOrdersInternalStatus(["order-1"], "Processando NF");

    expect(mockFrom).toHaveBeenCalledWith("marketplace_orders_presented_new");
    expect(mockUpdate).toHaveBeenCalledWith({ status_interno: "Processando NF" });
  });

  it("does nothing for empty array", async () => {
    await updateOrdersInternalStatus([], "Processando NF");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("fetchNfeStatusRows", () => {
  it("queries notas_fiscais with order and marketplace ids", async () => {
    const mockOr = vi.fn().mockResolvedValue({
      data: [{ order_id: "o1", status_focus: "autorizado" }],
    });
    const mockEq = vi.fn().mockReturnValue({ or: mockOr });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq,
      }),
    });

    const result = await fetchNfeStatusRows("company-1", ["o1"], ["mk1"]);

    expect(mockFrom).toHaveBeenCalledWith("notas_fiscais");
    expect(result).toHaveLength(1);
    expect(result[0].status_focus).toBe("autorizado");
  });

  it("returns empty array when no data", async () => {
    const mockOr = vi.fn().mockResolvedValue({ data: null });
    const mockEq = vi.fn().mockReturnValue({ or: mockOr });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq,
      }),
    });

    const result = await fetchNfeStatusRows("company-1", ["o1"], ["mk1"]);
    expect(result).toEqual([]);
  });
});
