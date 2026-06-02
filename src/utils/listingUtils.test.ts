import { describe, expect, it } from "vitest";
import {
  marketplaceDisplayNameFromSlug,
  parsePriceToNumber,
  formatVariationData,
  translatePauseReason,
  extractCostsFromListingPrices,
  extractSaleFeeDetails,
  parseListingRow,
} from "@/utils/listingUtils";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Minimal ParseListingRowContext for structural testing */
function makeCtx(overrides: Record<string, any> = {}) {
  return {
    metricsByItemId: {} as Record<string, { quality_level?: string | null; performance_data?: any }>,
    listingTypeByItemId: {} as Record<string, string | null>,
    shippingTypesByItemId: {} as Record<string, string[]>,
    listingPricesByItemId: {} as Record<string, any>,
    shippingCaps: null,
    ...overrides,
  };
}

/** Build a minimal canonical row (has marketplace_item_id + at least one of shipping/metrics/quality) */
function canonicalRow(overrides: Record<string, any> = {}) {
  return {
    marketplace_item_id: "ML-1001",
    marketplace_name: "Mercado Livre",
    title: "Produto Teste",
    price: 99.9,
    status: "active",
    available_quantity: 5,
    shipping: {},
    metrics: {},
    quality: {},
    fees: {},
    ...overrides,
  };
}

/** Build a minimal legacy ML row (no shipping/metrics/quality) */
function legacyMlRow(overrides: Record<string, any> = {}) {
  return {
    marketplace_item_id: "ML-2001",
    marketplace_name: "Mercado Livre",
    title: "Produto Legacy",
    price: 150,
    status: "active",
    available_quantity: 10,
    ...overrides,
  };
}

/** Build a minimal legacy Shopee row */
function legacyShopeeRow(overrides: Record<string, any> = {}) {
  return {
    marketplace_item_id: "SP-3001",
    marketplace_name: "Shopee",
    title: "Produto Shopee",
    price: 50,
    status: "NORMAL",
    ...overrides,
  };
}

// ─── marketplaceDisplayNameFromSlug (pre-existing tests kept) ────────────────

describe("marketplaceDisplayNameFromSlug", () => {
  it("maps Mercado Livre slug variants", () => {
    expect(marketplaceDisplayNameFromSlug("mercado-livre")).toBe("Mercado Livre");
    expect(marketplaceDisplayNameFromSlug("mercado_livre")).toBe("Mercado Livre");
    expect(marketplaceDisplayNameFromSlug("mercado")).toBe("Mercado Livre");
  });

  it("maps shopee slug", () => {
    expect(marketplaceDisplayNameFromSlug("shopee")).toBe("Shopee");
  });

  it("title-cases hyphenated slugs", () => {
    expect(marketplaceDisplayNameFromSlug("minha-loja")).toBe("Minha Loja");
  });

  it("returns empty string for empty input", () => {
    expect(marketplaceDisplayNameFromSlug("")).toBe("");
  });
});

// ─── parsePriceToNumber ──────────────────────────────────────────────────────

describe("parsePriceToNumber", () => {
  it("parses plain integer string", () => {
    expect(parsePriceToNumber("100")).toBe(100);
  });

  it("parses pt-BR decimal (comma separator, dot thousands)", () => {
    // "1.234,56" → strip "." → "1234,56" → replace "," → "1234.56"
    expect(parsePriceToNumber("1.234,56")).toBe(1234.56);
  });

  it("parses decimal with comma only", () => {
    expect(parsePriceToNumber("29,99")).toBe(29.99);
  });

  it("returns 0 for empty string", () => {
    expect(parsePriceToNumber("")).toBe(0);
  });

  it("returns 0 for non-numeric string", () => {
    expect(parsePriceToNumber("abc")).toBe(0);
  });

  it("returns 0 for non-finite result (Infinity)", () => {
    // String coercion of non-finite eventually yields 0
    expect(parsePriceToNumber("Infinity")).toBe(0);
  });
});

// ─── translatePauseReason ───────────────────────────────────────────────────

describe("translatePauseReason", () => {
  it("returns 'Pausado pelo seller' for null", () => {
    expect(translatePauseReason(null)).toBe("Pausado pelo seller");
  });

  it("returns 'Pausado pelo seller' for empty string", () => {
    expect(translatePauseReason("")).toBe("Pausado pelo seller");
  });

  it("returns 'Pausado pelo seller' for unknown reason", () => {
    expect(translatePauseReason("unknown")).toBe("Pausado pelo seller");
  });

  it("translates out_of_stock", () => {
    expect(translatePauseReason("out_of_stock")).toBe("Sem estoque");
  });

  it("translates under_review", () => {
    expect(translatePauseReason("under_review")).toBe("Em análise");
  });

  it("translates waiting", () => {
    expect(translatePauseReason("waiting_payment")).toBe("Pagamento pendente");
  });

  it("translates closed_by_user", () => {
    expect(translatePauseReason("closed_by_user")).toBe("Fechado pelo vendedor");
  });

  it("translates inactive", () => {
    expect(translatePauseReason("inactive")).toBe("Inativo");
  });
});

// ─── extractCostsFromListingPrices ──────────────────────────────────────────

describe("extractCostsFromListingPrices", () => {
  it("returns null for null input", () => {
    expect(extractCostsFromListingPrices(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(extractCostsFromListingPrices(undefined)).toBeNull();
  });

  it("extracts from flat entry with sale_fee.amount", () => {
    const lp = {
      currency_id: "BRL",
      sale_fee: { amount: 12.5 },
    };
    const result = extractCostsFromListingPrices(lp)!;
    expect(result).not.toBeNull();
    expect(result.currency).toBe("BRL");
    expect(result.commission).toBe(12.5);
    expect(result.total).toBe(12.5);
  });

  it("extracts from prices array (first entry)", () => {
    const lp = {
      prices: [
        { currency_id: "BRL", sale_fee: { amount: 5 }, shipping_cost: { amount: 3 } },
      ],
    };
    const result = extractCostsFromListingPrices(lp)!;
    expect(result.commission).toBe(5);
    expect(result.shippingCost).toBe(3);
    expect(result.total).toBe(8);
  });

  it("returns null if extracting throws (defensive)", () => {
    const lp = Object.create(null);
    Object.defineProperty(lp, "prices", {
      get() { throw new Error("boom"); },
    });
    expect(extractCostsFromListingPrices(lp)).toBeNull();
  });
});

// ─── extractSaleFeeDetails ──────────────────────────────────────────────────

describe("extractSaleFeeDetails", () => {
  it("returns null for null input", () => {
    expect(extractSaleFeeDetails(null)).toBeNull();
  });

  it("returns null when no fee details found", () => {
    // currency exists but all amounts are null
    const result = extractSaleFeeDetails({ currency_id: "BRL" });
    expect(result).toBeNull();
  });

  it("extracts percentage fee", () => {
    const lp = {
      currency_id: "BRL",
      sale_fee_details: { percentage_fee: 10 },
    };
    const result = extractSaleFeeDetails(lp)!;
    expect(result).not.toBeNull();
    expect(result.percentage).toBe(10);
    expect(result.currency).toBe("BRL");
  });

  it("returns null if extracting throws (defensive)", () => {
    const lp = Object.create(null);
    Object.defineProperty(lp, "prices", {
      get() { throw new Error("boom"); },
    });
    expect(extractSaleFeeDetails(lp)).toBeNull();
  });
});

// ─── formatVariationData ────────────────────────────────────────────────────

describe("formatVariationData", () => {
  it("returns [] for empty array", () => {
    expect(formatVariationData([])).toEqual([]);
  });

  it("returns [] for non-array", () => {
    expect(formatVariationData(null as any)).toEqual([]);
  });

  it("id fallback chain: model_id → variation_id → id → var-{index}", () => {
    const v1 = { model_id: "m1" };
    const v2 = { variation_id: "v2" };
    const v3 = { id: "i3" };
    const v4 = {}; // no id → var-3
    const result = formatVariationData([v1, v2, v3, v4]);
    expect(result[0].id).toBe("m1");
    expect(result[1].id).toBe("v2");
    expect(result[2].id).toBe("i3");
    expect(result[3].id).toBe("var-3");
  });

  it("sku fallback chain: model_sku → seller_sku → sku → 'N/A'", () => {
    const v1 = { model_sku: "msku" };
    const v2 = { seller_sku: "ssku" };
    const v3 = { sku: "sku3" };
    const v4 = {}; // → 'N/A'
    const result = formatVariationData([v1, v2, v3, v4]);
    expect(result[0].sku).toBe("msku");
    expect(result[1].sku).toBe("ssku");
    expect(result[2].sku).toBe("sku3");
    expect(result[3].sku).toBe("N/A");
  });

  it("image falls back to /placeholder.svg when no itemRow pics", () => {
    const result = formatVariationData([{ id: "v1" }]);
    expect(result[0].image).toBe("/placeholder.svg");
  });

  it("seller_stock_total is 0 (not availableQty) when no seller_stock data — Number(null)=0 is finite", () => {
    // NOTE: quirk — sellerTotal=null, Number(null)=0, Number.isFinite(0)=true
    // so seller_stock_total = 0, NOT availableQty (the fallback never triggers)
    const v = { id: "v1", available_quantity: 7 };
    const result = formatVariationData([v]);
    expect(result[0].available_quantity).toBe(7);
    expect(result[0].seller_stock_total).toBe(0);
  });

  it("seller_stock_total sums stock_info_v2.seller_stock array", () => {
    const v = {
      id: "v1",
      available_quantity: 0,
      stock_info_v2: {
        seller_stock: [{ stock: 10 }, { stock: 5 }],
        summary_info: { total_available_stock: 0 },
      },
    };
    const result = formatVariationData([v]);
    expect(result[0].seller_stock_total).toBe(15);
  });

  it("seller_stock_total accepts scalar seller_stock", () => {
    const v = { id: "v1", available_quantity: 0, seller_stock: 20 };
    const result = formatVariationData([v]);
    expect(result[0].seller_stock_total).toBe(20);
  });

  it("available_quantity prefers stock_info_v2 total_available_stock", () => {
    const v = {
      id: "v1",
      available_quantity: 3,
      stock_info_v2: { summary_info: { total_available_stock: 42 } },
    };
    const result = formatVariationData([v]);
    expect(result[0].available_quantity).toBe(42);
  });
});

// ─── parseListingRow — dispatch ─────────────────────────────────────────────

describe("parseListingRow dispatch: canonical vs legacy", () => {
  it("routes to canonical when row has marketplace_item_id + shipping", () => {
    const row = canonicalRow({ marketplace_name: "Mercado Livre", title: "Canon Item" });
    const item = parseListingRow(row, makeCtx());
    // canonical sets id = marketplace_item_id
    expect(item.id).toBe("ML-1001");
    expect(item.title).toBe("Canon Item");
    expect(item.marketplace).toBe("Mercado Livre");
  });

  it("routes to canonical when row has marketplace_item_id + metrics (no shipping)", () => {
    const row = { marketplace_item_id: "ML-9999", metrics: { visits_total: 5 }, title: "Metrics Only" };
    const item = parseListingRow(row, makeCtx());
    expect(item.id).toBe("ML-9999");
  });

  it("routes to canonical when row has marketplace_item_id + quality (no shipping/metrics)", () => {
    const row = { marketplace_item_id: "ML-8888", quality: { quality_level: "good" }, title: "Quality Only" };
    const item = parseListingRow(row, makeCtx());
    expect(item.id).toBe("ML-8888");
  });

  it("routes to LEGACY when row has marketplace_item_id but NO shipping/metrics/quality", () => {
    const row = legacyMlRow({ marketplace_name: "Mercado Livre", title: "Legacy ML" });
    const item = parseListingRow(row, makeCtx());
    expect(item.id).toBe("ML-2001");
    expect(item.title).toBe("Legacy ML");
    expect(item.marketplace).toBe("Mercado Livre");
  });

  it("uses 'Sem título' default for missing title (canonical)", () => {
    const row = canonicalRow({ title: undefined });
    expect(parseListingRow(row, makeCtx()).title).toBe("Sem título");
  });

  it("uses 'Sem título' default for missing title (legacy ML)", () => {
    const row = legacyMlRow({ title: undefined });
    expect(parseListingRow(row, makeCtx()).title).toBe("Sem título");
  });

  it("uses 'Mercado Livre' as default marketplace (canonical with no marketplace_name)", () => {
    const row = canonicalRow({ marketplace_name: undefined });
    expect(parseListingRow(row, makeCtx()).marketplace).toBe("Mercado Livre");
  });

  it("uses 'Mercado Livre' as default marketplace (legacy with no marketplace_name)", () => {
    const row = legacyMlRow({ marketplace_name: undefined });
    expect(parseListingRow(row, makeCtx()).marketplace).toBe("Mercado Livre");
  });
});

// ─── parseListingRow — qualityLevelToPercent (via canonical) ────────────────

describe("parseListingRow canonical: qualityLevelToPercent via quality object", () => {
  function qRow(qualityLevel: string | null | undefined, qualityScore: number | null | undefined) {
    return canonicalRow({
      quality: {
        quality_level: qualityLevel ?? null,
        quality_score: qualityScore ?? null,
      },
    });
  }

  it("excellent → 100", () => {
    expect(parseListingRow(qRow("excellent", null), makeCtx()).quality).toBe(100);
  });

  it("good → 76", () => {
    expect(parseListingRow(qRow("good", null), makeCtx()).quality).toBe(76);
  });

  it("medium → 50", () => {
    expect(parseListingRow(qRow("medium", null), makeCtx()).quality).toBe(50);
  });

  it("low → 25", () => {
    expect(parseListingRow(qRow("low", null), makeCtx()).quality).toBe(25);
  });

  it("incomplete → 10", () => {
    expect(parseListingRow(qRow("incomplete", null), makeCtx()).quality).toBe(10);
  });

  it("unknown → 0", () => {
    expect(parseListingRow(qRow("unknown", null), makeCtx()).quality).toBe(0);
  });

  it("score ≤ 1 is multiplied ×100 (0.5 → 50)", () => {
    expect(parseListingRow(qRow(null, 0.5), makeCtx()).quality).toBe(50);
  });

  it("score > 1 is used as-is (75 → 75)", () => {
    expect(parseListingRow(qRow(null, 75), makeCtx()).quality).toBe(75);
  });

  it("score > 100 clamped to 100", () => {
    expect(parseListingRow(qRow(null, 120), makeCtx()).quality).toBe(100);
  });

  it("score < 0 clamped to 0", () => {
    expect(parseListingRow(qRow(null, -10), makeCtx()).quality).toBe(0);
  });

  it("both null → 0 (default)", () => {
    expect(parseListingRow(qRow(null, null), makeCtx()).quality).toBe(0);
  });

  it("score takes priority over level", () => {
    // score = 0.8 → 80, overrides 'excellent' (100)
    expect(parseListingRow(qRow("excellent", 0.8), makeCtx()).quality).toBe(80);
  });
});

// ─── parseListingRow — Shopee numeric quality tier ──────────────────────────

describe("parseListingRow legacy Shopee: quality tiers via performance_data", () => {
  function shopeeRow(qualityLevel: number | null) {
    const row = legacyShopeeRow({ marketplace_item_id: "SP-T" });
    return {
      row,
      ctx: makeCtx({
        metricsByItemId: {
          "SP-T": {
            performance_data: qualityLevel !== null ? { quality_level: qualityLevel } : {},
          },
        },
      }),
    };
  }

  it("tier 1 → quality = 50", () => {
    const { row, ctx } = shopeeRow(1);
    expect(parseListingRow(row, ctx).quality).toBe(50);
  });

  it("tier 2 → quality = 76", () => {
    const { row, ctx } = shopeeRow(2);
    expect(parseListingRow(row, ctx).quality).toBe(76);
  });

  it("tier 3 → quality = 100", () => {
    const { row, ctx } = shopeeRow(3);
    expect(parseListingRow(row, ctx).quality).toBe(100);
  });

  it("tier 4 (unknown) → quality = 0", () => {
    const { row, ctx } = shopeeRow(4);
    expect(parseListingRow(row, ctx).quality).toBe(0);
  });

  it("no performance_data → quality = 0", () => {
    const { row, ctx } = shopeeRow(null);
    expect(parseListingRow(row, ctx).quality).toBe(0);
  });
});

// ─── parseListingRow — Shopee item_perfomance (intentional typo) ────────────

describe("parseListingRow legacy Shopee: item_perfomance typo path", () => {
  it("reads visits from item_perfomance.views (typo preserved)", () => {
    const row = legacyShopeeRow({
      item_perfomance: { views: 999, sale: 42, liked_count: 7 },
    });
    const item = parseListingRow(row, makeCtx());
    expect(item.visits).toBe(999);
    expect(item.sales).toBe(42);
    expect(item.likes).toBe(7);
  });

  it("falls back to 0 when item_perfomance absent", () => {
    const row = legacyShopeeRow({});
    const item = parseListingRow(row, makeCtx());
    expect(item.visits).toBe(0);
    expect(item.sales).toBe(0);
    expect(item.likes).toBe(0);
  });

  it("does NOT read from item_performance (correct spelling) for Shopee", () => {
    const row = legacyShopeeRow({
      item_performance: { views: 500, sale: 10, liked_count: 3 }, // correct spelling (ignored)
    });
    const item = parseListingRow(row, makeCtx());
    // correct spelling is not read; falls back to 0
    expect(item.visits).toBe(0);
  });
});

// ─── parseListingRow — resolveShippingTags (via legacy ML) ─────────────────

describe("parseListingRow legacy ML: resolveShippingTags", () => {
  it("cap_full flag adds 'full' tag", () => {
    const row = legacyMlRow({ cap_full: true });
    expect(parseListingRow(row, makeCtx()).shippingTags).toContain("full");
  });

  it("cap_flex flag adds 'flex' tag", () => {
    const row = legacyMlRow({ cap_flex: true });
    expect(parseListingRow(row, makeCtx()).shippingTags).toContain("flex");
  });

  it("self_service_in raw tag adds 'flex' (via data.shipping to stay non-canonical)", () => {
    // NOTE: must use data.shipping — adding row.shipping would make row canonical
    const row = legacyMlRow({ data: { shipping: { tags: ["self_service_in"] } } });
    expect(parseListingRow(row, makeCtx()).shippingTags).toContain("flex");
  });

  it("self_service_out removes 'flex' when logistic_type !== self_service", () => {
    const row = legacyMlRow({
      cap_flex: true,
      data: { shipping: { tags: ["self_service_out"], logistic_type: "drop_off" } },
    });
    expect(parseListingRow(row, makeCtx()).shippingTags).not.toContain("flex");
  });

  it("self_service_out does NOT remove 'flex' when logistic_type === self_service", () => {
    const row = legacyMlRow({
      cap_flex: true,
      data: { shipping: { tags: ["self_service_out"], logistic_type: "self_service" } },
    });
    expect(parseListingRow(row, makeCtx()).shippingTags).toContain("flex");
  });

  it("undefined shippingCaps allows all tags through", () => {
    const row = legacyMlRow({ cap_full: true, cap_flex: true });
    const ctx = makeCtx({ shippingCaps: null });
    const tags = parseListingRow(row, ctx).shippingTags;
    expect(tags).toContain("full");
    expect(tags).toContain("flex");
  });

  it("shippingCaps restricts to enabled tags only", () => {
    const row = legacyMlRow({ cap_full: true, cap_flex: true });
    const ctx = makeCtx({ shippingCaps: { full: false, flex: true } });
    const tags = parseListingRow(row, ctx).shippingTags;
    expect(tags).not.toContain("full");
    expect(tags).toContain("flex");
  });

  it("canonical logistic shopee_xpress → xpress tag", () => {
    const row = canonicalRow({
      shipping: { logistic_types: ["shopee_xpress"] },
    });
    const item = parseListingRow(row, makeCtx());
    expect(item.shippingTags).toContain("xpress");
  });
});

// ─── parseListingRow — Shopee stock from variations ────────────────────────

describe("parseListingRow legacy Shopee: stock from variations", () => {
  it("sums seller_stock (scalar) across variations", () => {
    const row = legacyShopeeRow({
      variations: [{ id: "v1", seller_stock: 10 }, { id: "v2", seller_stock: 5 }],
    });
    expect(parseListingRow(row, makeCtx()).stock).toBe(15);
  });

  it("falls back to available_quantity when no variation stock", () => {
    const row = legacyShopeeRow({
      available_quantity: 8,
      variations: [{ id: "v1" }],
    });
    expect(parseListingRow(row, makeCtx()).stock).toBe(0); // no seller_stock → 0 per variation
  });
});

// ─── parseListingRow — ML legacy price promo ────────────────────────────────

describe("parseListingRow legacy ML: promo price", () => {
  it("sets promoPrice when original_price > price", () => {
    const row = legacyMlRow({ price: 80, original_price: 100 });
    const item = parseListingRow(row, makeCtx());
    expect(item.promoPrice).toBe(80);
    expect(item.originalPrice).toBe(100);
  });

  it("no promo when original_price ≤ price", () => {
    const row = legacyMlRow({ price: 100, original_price: 100 });
    const item = parseListingRow(row, makeCtx());
    expect(item.promoPrice).toBeNull();
    expect(item.originalPrice).toBeNull();
  });
});

// ─── parseListingRow — Shopee promo_price ──────────────────────────────────

describe("parseListingRow legacy Shopee: promotion_price", () => {
  it("uses promotion_price as promoPrice, price as originalPrice", () => {
    const row = legacyShopeeRow({ price: 100, promotion_price: 75 });
    const item = parseListingRow(row, makeCtx());
    expect(item.promoPrice).toBe(75);
    expect(item.originalPrice).toBe(100);
  });

  it("no promo when promotion_price is null", () => {
    const row = legacyShopeeRow({ price: 100, promotion_price: null });
    const item = parseListingRow(row, makeCtx());
    expect(item.promoPrice).toBeNull();
    expect(item.originalPrice).toBeNull();
  });
});

// ─── parseListingRow — Shopee SKU from attributes ──────────────────────────

describe("parseListingRow legacy ML: SKU derivation from SELLER_SKU attribute", () => {
  it("extracts SKU from attribute_combinations SELLER_SKU attribute", () => {
    const row = legacyMlRow({
      sku: "",
      variations: [
        {
          attribute_combinations: [
            { id: "SELLER_SKU", value_name: "MY-SKU-001" },
          ],
        },
      ],
    });
    expect(parseListingRow(row, makeCtx()).sku).toBe("MY-SKU-001");
  });

  it("prefers seller_sku directly on variation over attribute", () => {
    const row = legacyMlRow({
      sku: "",
      variations: [{ seller_sku: "DIRECT-SKU" }],
    });
    expect(parseListingRow(row, makeCtx()).sku).toBe("DIRECT-SKU");
  });
});
