import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitNfeQueue,
  fetchAllOrders,
  fetchNfeStatusRows,
  fetchShopeeShops,
  getCompanyIdForOrg,
  linkProductToOrderItems,
  markOrdersPrinted,
  syncMercadoLivreOrders,
  syncNfeForOrder,
  updateOrdersInternalStatus
} from "../orders.service";

// Mock supabase
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockAuthGetSession = vi.fn();
const mockAuthGetUser = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
    auth: { getSession: () => mockAuthGetSession(), getUser: () => mockAuthGetUser() },
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
  mockAuthGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
  });
  mockRpc.mockImplementation((fnName: string) => {
    if (fnName === "get_user_organization_id") {
      return Promise.resolve({ data: "org-1", error: null });
    }
    return Promise.resolve({ data: null, error: null });
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
  it("calls edge function with order ids and organizationId", async () => {
    mockFunctionsInvoke.mockResolvedValue({ error: null });

    await markOrdersPrinted(["order-1", "order-2"], "org-1");

    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      "mark-labels-printed",
      expect.objectContaining({
        body: { orderIds: ["order-1", "order-2"], organizationId: "org-1" },
      })
    );
  });

  it("does nothing for empty array", async () => {
    await markOrdersPrinted([], "org-1");
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
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

    expect(mockFrom).toHaveBeenCalledWith("orders");
    expect(mockUpdate).toHaveBeenCalledWith({ status: "Processando NF" });
  });

  it("does nothing for empty array", async () => {
    await updateOrdersInternalStatus([], "Processando NF");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("fetchNfeStatusRows", () => {
  it("queries invoices with order and marketplace ids", async () => {
    const mockOr = vi.fn().mockResolvedValue({
      data: [{ order_id: "o1", status: "autorizado", emission_environment: "producao" }],
    });
    const mockEq = vi.fn().mockReturnValue({ or: mockOr });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq,
      }),
    });

    const result = await fetchNfeStatusRows("company-1", ["o1"], ["mk1"]);

    expect(mockFrom).toHaveBeenCalledWith("invoices");
    expect(result).toHaveLength(1);
    // normalizeInvoiceToNfeRow maps status → status_focus, emission_environment → emissao_ambiente
    expect(result[0].status_focus).toBe("autorizado");
    expect(result[0].emissao_ambiente).toBe("producao");
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

// ---------------------------------------------------------------------------
// T10 — fetchAllOrders (T10 §2.1: reads from 'orders', not legacy view)
// ---------------------------------------------------------------------------

describe("fetchAllOrders", () => {
  it("queries the 'orders' table (not marketplace_orders_presented_new)", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    await fetchAllOrders("org-1");

    expect(mockFrom).toHaveBeenCalledWith("orders");
  });

  it("throws when Supabase returns an error", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "DB error" },
          }),
        }),
      }),
    });

    await expect(fetchAllOrders("org-1")).rejects.toThrow("fetchAllOrders failed: DB error");
  });

  it("returns an empty array when data is null", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });

    const result = await fetchAllOrders("org-1");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T10 — linkProductToOrderItems (T10 §2.4)
// ---------------------------------------------------------------------------

describe("linkProductToOrderItems", () => {
  it("invokes the link-order-product edge function", async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: { remainingUnlinkedCount: 0, statusChanged: true, newStatus: "ready_to_print" },
      error: null,
    });

    const result = await linkProductToOrderItems({
      orderId: "order-1",
      organizationId: "org-1",
      marketplace: "mercado_livre",
      links: [
        {
          orderItemId: "item-1",
          marketplaceItemId: "ml-item-1",
          variationId: "var-1",
          productId: "prod-1",
          isPermanent: true,
        },
      ],
    });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      "link-order-product",
      expect.objectContaining({
        body: expect.objectContaining({
          orderId: "order-1",
          organizationId: "org-1",
        }),
      })
    );
    expect(result.statusChanged).toBe(true);
    expect(result.newStatus).toBe("ready_to_print");
  });

  it("throws when edge function returns an error", async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: { message: "Function error" },
    });

    await expect(
      linkProductToOrderItems({
        orderId: "o1",
        organizationId: "org-1",
        marketplace: "shopee",
        links: [],
      })
    ).rejects.toThrow("linkProductToOrderItems failed: Function error");
  });
});

// ---------------------------------------------------------------------------
// T10 — markOrdersPrinted now calls edge function (T10 §2.3)
// ---------------------------------------------------------------------------

describe("markOrdersPrinted (T10 §2.3)", () => {
  it("passes organizationId explicitly to mark-labels-printed", async () => {
    mockFunctionsInvoke.mockResolvedValue({ error: null });

    await markOrdersPrinted(["order-1"], "org-1");

    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      "mark-labels-printed",
      expect.objectContaining({
        body: { orderIds: ["order-1"], organizationId: "org-1" },
      })
    );
  });
});
