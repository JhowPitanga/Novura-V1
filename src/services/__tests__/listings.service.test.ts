import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isListingsCanonicalEnabled,
  fetchListings,
  createDraftFromListing,
} from "../listings.service";

// ─── Supabase client mock ───────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockChannel = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
    channel: (...args: unknown[]) => mockChannel(...args),
  },
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-key",
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Chainable mock builder ─────────────────────────────────────────────────

type MockResult = { data: unknown; error: unknown };

/**
 * Builds a Supabase-like builder chain that is both chainable (methods return
 * `this`) and directly awaitable (has a `then` method for when the chain is
 * awaited without a terminal `.single()` / `.maybeSingle()`).
 */
function makeChain(result: MockResult) {
  const terminal = vi.fn().mockResolvedValue(result);
  const obj: Record<string, any> = {};
  const methods = ["select", "eq", "order", "limit", "gt", "in", "delete", "insert"];
  methods.forEach((k) => {
    obj[k] = vi.fn().mockReturnValue(obj);
  });
  obj.single = terminal;
  obj.maybeSingle = terminal;
  // Make the chain directly awaitable (Supabase builder is a PromiseLike)
  obj.then = (resolve: (v: MockResult) => any, reject: (r: any) => any) =>
    Promise.resolve(result).then(resolve, reject);
  obj.catch = (reject: (r: any) => any) => Promise.resolve(result).catch(reject);
  return { chain: obj, terminal };
}

function makeErrorChain(error: Error) {
  const obj: Record<string, any> = {};
  const methods = ["select", "eq", "order", "limit", "gt", "in", "delete", "insert"];
  methods.forEach((k) => {
    obj[k] = vi.fn().mockReturnValue(obj);
  });
  const terminal = vi.fn().mockRejectedValue(error);
  obj.single = terminal;
  obj.maybeSingle = terminal;
  obj.then = (resolve: any, reject: (r: any) => any) =>
    Promise.reject(error).then(resolve, reject);
  obj.catch = (cb: (r: any) => any) => Promise.reject(error).catch(cb);
  return { chain: obj, terminal };
}

// ─── isListingsCanonicalEnabled ─────────────────────────────────────────────

describe("isListingsCanonicalEnabled", () => {
  it("returns true when config.listings_canonical === true", async () => {
    const { chain } = makeChain({ data: { config: { listings_canonical: true } }, error: null });
    mockFrom.mockReturnValue(chain);
    const result = await isListingsCanonicalEnabled("org-1", "Mercado Livre");
    expect(result).toBe(true);
  });

  it("returns false when config.listings_canonical === false", async () => {
    const { chain } = makeChain({ data: { config: { listings_canonical: false } }, error: null });
    mockFrom.mockReturnValue(chain);
    const result = await isListingsCanonicalEnabled("org-1", "Mercado Livre");
    expect(result).toBe(false);
  });

  it("returns false when data is null (no row found)", async () => {
    const { chain } = makeChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);
    const result = await isListingsCanonicalEnabled("org-1", "Mercado Livre");
    expect(result).toBe(false);
  });

  it("returns false when config is null", async () => {
    const { chain } = makeChain({ data: { config: null }, error: null });
    mockFrom.mockReturnValue(chain);
    const result = await isListingsCanonicalEnabled("org-1", "Mercado Livre");
    expect(result).toBe(false);
  });

  it("returns false on supabase error (and does not throw)", async () => {
    const { chain } = makeChain({ data: null, error: { message: "DB error", code: "PGRST" } });
    mockFrom.mockReturnValue(chain);
    const result = await isListingsCanonicalEnabled("org-1", "Mercado Livre");
    expect(result).toBe(false);
  });
});

// ─── fetchListings fallback logic ───────────────────────────────────────────

describe("fetchListings fallback logic", () => {
  /**
   * Builds a table-differentiated mock for mockFrom.
   * Each call to mockFrom(table) returns a chained mock with a terminal result.
   */
  function setupTableMocks(tableResults: Record<string, MockResult>) {
    mockFrom.mockImplementation((table: string) => {
      const result = tableResults[table] ?? { data: null, error: null };
      const { chain } = makeChain(result);
      return chain;
    });
  }

  it("canonical flag=true + canonical rows → returns isCanonical:true", async () => {
    setupTableMocks({
      marketplace_integrations: { data: { config: { listings_canonical: true } }, error: null },
      marketplace_listings: { data: [{ id: "r1" }], error: null },
    });

    const result = await fetchListings("org-1", "Mercado Livre");
    expect(result.isCanonical).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.isShopee).toBe(false);
  });

  it("canonical flag=false + canonical rows present → still returns isCanonical:true (non-empty canonical used)", async () => {
    setupTableMocks({
      marketplace_integrations: { data: { config: { listings_canonical: false } }, error: null },
      marketplace_listings: { data: [{ id: "r1" }], error: null },
    });

    const result = await fetchListings("org-1", "Mercado Livre");
    expect(result.isCanonical).toBe(true);
  });

  it("canonical flag=false + empty canonical → falls back to legacy (unified)", async () => {
    setupTableMocks({
      marketplace_integrations: { data: { config: { listings_canonical: false } }, error: null },
      marketplace_listings: { data: [], error: null }, // empty canonical
      marketplace_items_unified: { data: [{ id: "legacy-1" }], error: null },
    });

    const result = await fetchListings("org-1", "Mercado Livre");
    expect(result.isCanonical).toBe(false);
    expect(result.rows[0].id).toBe("legacy-1");
  });

  it("legacy throws → last-resort fallback to marketplace_items", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "marketplace_integrations") {
        return makeChain({ data: { config: { listings_canonical: false } }, error: null }).chain;
      }
      if (table === "marketplace_listings") {
        return makeChain({ data: [], error: null }).chain;
      }
      if (table === "marketplace_items_unified") {
        return makeErrorChain(new Error("legacy failed")).chain;
      }
      if (table === "marketplace_items") {
        return makeChain({ data: [{ id: "fallback-1" }], error: null }).chain;
      }
      return makeChain({ data: null, error: null }).chain;
    });

    const result = await fetchListings("org-1", "Mercado Livre");
    expect(result.rows[0].id).toBe("fallback-1");
    expect(result.isCanonical).toBe(false);
  });

  it("isShopee=true for 'shopee' display name", async () => {
    setupTableMocks({
      marketplace_integrations: { data: { config: { listings_canonical: false } }, error: null },
      marketplace_listings: { data: [], error: null },
      marketplace_items_raw: { data: [], error: null },
    });

    const result = await fetchListings("org-1", "shopee");
    expect(result.isShopee).toBe(true);
  });

  it("resolveMarketplaceName: 'shopee' display → 'Shopee' is used for canonical check", async () => {
    const eqCalls: string[][] = [];
    mockFrom.mockImplementation((table: string) => {
      const obj: Record<string, any> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockImplementation((col: string, val: string) => {
        if (table === "marketplace_integrations") eqCalls.push([col, val]);
        return obj;
      });
      obj.order = vi.fn().mockReturnValue(obj);
      obj.limit = vi.fn().mockReturnValue(obj);
      obj.maybeSingle = vi.fn().mockResolvedValue({ data: { config: { listings_canonical: false } }, error: null });
      obj.single = obj.maybeSingle;
      return obj;
    });

    await fetchListings("org-1", "shopee").catch(() => {});
    // Check that marketplace_name eq call used 'Shopee' (capital S, resolved)
    const mktCall = eqCalls.find(([col, val]) => col === "marketplace_name" && val === "Shopee");
    expect(mktCall).toBeTruthy();
  });

  it("resolveMarketplaceName: 'mercado livre' display → 'Mercado Livre'", async () => {
    const eqCalls: string[][] = [];
    mockFrom.mockImplementation((table: string) => {
      const obj: Record<string, any> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockImplementation((col: string, val: string) => {
        if (table === "marketplace_integrations") eqCalls.push([col, val]);
        return obj;
      });
      obj.order = vi.fn().mockReturnValue(obj);
      obj.limit = vi.fn().mockReturnValue(obj);
      obj.maybeSingle = vi.fn().mockResolvedValue({ data: { config: { listings_canonical: false } }, error: null });
      obj.single = obj.maybeSingle;
      return obj;
    });

    await fetchListings("org-1", "mercado livre").catch(() => {});
    const mktCall = eqCalls.find(([col, val]) => col === "marketplace_name" && val === "Mercado Livre");
    expect(mktCall).toBeTruthy();
  });

  it("resolveMarketplaceName: unknown name passes through unchanged", async () => {
    const eqCalls: string[][] = [];
    mockFrom.mockImplementation((table: string) => {
      const obj: Record<string, any> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockImplementation((col: string, val: string) => {
        if (table === "marketplace_integrations") eqCalls.push([col, val]);
        return obj;
      });
      obj.order = vi.fn().mockReturnValue(obj);
      obj.limit = vi.fn().mockReturnValue(obj);
      obj.maybeSingle = vi.fn().mockResolvedValue({ data: { config: { listings_canonical: false } }, error: null });
      obj.single = obj.maybeSingle;
      return obj;
    });

    await fetchListings("org-1", "Amazon").catch(() => {});
    const mktCall = eqCalls.find(([col, val]) => col === "marketplace_name" && val === "Amazon");
    expect(mktCall).toBeTruthy();
  });
});

// ─── createDraftFromListing mapper ─────────────────────────────────────────

describe("createDraftFromListing mapper", () => {
  function setupDraftInsert(returnedId: string) {
    mockFrom.mockImplementation((table: string) => {
      const obj: Record<string, any> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockReturnValue(obj);
      obj.order = vi.fn().mockReturnValue(obj);
      obj.limit = vi.fn().mockReturnValue(obj);
      obj.in = vi.fn().mockReturnValue(obj);
      obj.single = vi.fn().mockResolvedValue({ data: null, error: null });

      if (table === "marketplace_item_descriptions") {
        // description fetch — returns no data (error caught)
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
      }

      if (table === "marketplace_drafts") {
        const insertResult = { data: { id: returnedId }, error: null };
        obj.insert = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(insertResult),
          }),
        });
      }

      return obj;
    });
  }

  it("returns the inserted draft id as string", async () => {
    setupDraftInsert("draft-abc-123");
    const itemRow = { marketplace_item_id: "ML-1", title: "Test Product", price: 100 };
    const result = await createDraftFromListing("org-1", itemRow, "gold_pro");
    expect(result).toBe("draft-abc-123");
  });

  it("maps picture urls from pictures array (object with url)", async () => {
    setupDraftInsert("draft-1");
    let capturedDraft: any;
    mockFrom.mockImplementation((table: string) => {
      const obj: Record<string, any> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockReturnValue(obj);
      obj.limit = vi.fn().mockReturnValue(obj);
      obj.single = vi.fn().mockResolvedValue({ data: null, error: null });

      if (table === "marketplace_drafts") {
        obj.insert = vi.fn().mockImplementation((draft: any) => {
          capturedDraft = draft;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "draft-1" }, error: null }),
            }),
          };
        });
      }
      return obj;
    });

    const itemRow = {
      marketplace_item_id: "ML-2",
      title: "With Pictures",
      price: 50,
      pictures: [{ url: "https://cdn.example/img1.jpg" }, { url: "https://cdn.example/img2.jpg" }],
    };
    await createDraftFromListing("org-1", itemRow, null);
    expect(capturedDraft.pictures).toEqual([
      "https://cdn.example/img1.jpg",
      "https://cdn.example/img2.jpg",
    ]);
  });

  it("variations without data become empty array in draft", async () => {
    let capturedDraft: any;
    mockFrom.mockImplementation((table: string) => {
      const obj: Record<string, any> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockReturnValue(obj);
      obj.limit = vi.fn().mockReturnValue(obj);
      obj.single = vi.fn().mockResolvedValue({ data: null, error: null });

      if (table === "marketplace_drafts") {
        obj.insert = vi.fn().mockImplementation((draft: any) => {
          capturedDraft = draft;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "draft-x" }, error: null }),
            }),
          };
        });
      }
      return obj;
    });

    const itemRow = {
      marketplace_item_id: "ML-3",
      title: "No Variations",
      price: 75,
      variations: [],
    };
    await createDraftFromListing("org-1", itemRow, null);
    expect(capturedDraft.variations).toEqual([]);
  });

  it("description fetch error is caught → description remains undefined in draft", async () => {
    let capturedDraft: any;
    mockFrom.mockImplementation((table: string) => {
      const obj: Record<string, any> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockReturnValue(obj);
      obj.limit = vi.fn().mockReturnValue(obj);

      if (table === "marketplace_item_descriptions") {
        obj.single = vi.fn().mockRejectedValue(new Error("desc fetch failed"));
      } else {
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
      }

      if (table === "marketplace_drafts") {
        obj.insert = vi.fn().mockImplementation((draft: any) => {
          capturedDraft = draft;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "draft-y" }, error: null }),
            }),
          };
        });
      }
      return obj;
    });

    const itemRow = { marketplace_item_id: "ML-4", title: "Desc Error", price: 99 };
    await createDraftFromListing("org-1", itemRow, null);
    expect(capturedDraft.description).toBeUndefined();
  });

  it("dimensions string '30x20x15,500' is parsed to dimsObj and weight", async () => {
    let capturedDraft: any;
    mockFrom.mockImplementation((table: string) => {
      const obj: Record<string, any> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockReturnValue(obj);
      obj.limit = vi.fn().mockReturnValue(obj);
      obj.single = vi.fn().mockResolvedValue({ data: null, error: null });

      if (table === "marketplace_drafts") {
        obj.insert = vi.fn().mockImplementation((draft: any) => {
          capturedDraft = draft;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "draft-z" }, error: null }),
            }),
          };
        });
      }
      return obj;
    });

    const itemRow = {
      marketplace_item_id: "ML-5",
      title: "With Dims",
      price: 100,
      shipping: { dimensions: "30x20x15,500" },
    };
    await createDraftFromListing("org-1", itemRow, null);
    expect(capturedDraft.shipping.dimensions).toEqual({ length: 30, height: 20, width: 15 });
    expect(capturedDraft.shipping.weight).toBe(500);
  });

  // ─── Integration test stubs ─────────────────────────────────────────────
  // TODO: integration tests for fetchConnectedMarketplaces, fetchMarketplaceStores,
  // fetchDrafts, deleteDraft, deleteDrafts, fetchFulfillmentStockForListings,
  // fetchStockDistributionForListings, syncAllListings, syncSelectedListings,
  // syncSingleListing, updateItemStatus, updateShopeeStock require DB fixtures.
});
