import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAbcListings } from "@/services/performance.service";

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
    supabase: {
        from: (...args: unknown[]) => mockFrom(...args),
        rpc: (...args: unknown[]) => mockRpc(...args),
    },
}));

function buildChain(finalData: unknown) {
    const chainObj: Record<string, ReturnType<typeof vi.fn>> = {};
    const methods = ["select", "eq", "gte", "lte", "in", "is"];
    for (const m of methods) {
        chainObj[m] = vi.fn(() => chainObj);
    }
    Object.defineProperty(chainObj, "then", {
        value(onFulfilled: (v: { data: unknown; error: null }) => unknown) {
            return Promise.resolve({ data: finalData, error: null }).then(onFulfilled);
        },
        enumerable: false,
    });
    return chainObj;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: { message: "rpc off" } });
});

describe("fetchAbcListings fallback", () => {
    it("returns listing ABC rows with titulo, marketplace and pct invariants", async () => {
        const orders = [
            { id: "o1", marketplace: "Mercado_Livre", marketplace_fee: 0, shipping_cost: 0 },
            { id: "o2", marketplace: "shopee", marketplace_fee: 0, shipping_cost: 0 },
        ];
        const orderItems = [
            { order_id: "o1", product_id: "p1", marketplace_item_id: "ml-1", quantity: 2, unit_price: 40, unit_cost: null, title: "Anúncio ML", image_url: null, sku: null },
            { order_id: "o2", product_id: null, marketplace_item_id: "sp-1", quantity: 1, unit_price: 30, unit_cost: null, title: "Anúncio SP", image_url: null, sku: null },
            { order_id: "o2", product_id: null, marketplace_item_id: "sp-2", quantity: 1, unit_price: 10, unit_cost: null, title: "Anúncio SP 2", image_url: null, sku: null },
        ];

        mockFrom.mockImplementation((table: string) => {
            if (table === "orders") return buildChain(orders);
            if (table === "order_items") return buildChain(orderItems);
            return buildChain([]);
        });

        const rows = await fetchAbcListings(
            "org-1",
            { from: new Date("2025-01-01"), to: new Date("2025-01-31") },
            "todos",
            "valor",
        );

        expect(rows.length).toBe(3);
        for (const row of rows) {
            expect(row.titulo.length).toBeGreaterThan(0);
            expect(row.marketplace.length).toBeGreaterThan(0);
            expect(["A", "B", "C"]).toContain(row.tag);
        }
        const pctSum = rows.reduce((s, r) => s + r.pct, 0);
        expect(pctSum).toBeCloseTo(100, 1);
        expect(rows[rows.length - 1].cum_pct).toBeCloseTo(100, 1);
        for (let i = 1; i < rows.length; i++) {
            expect(rows[i - 1].valor).toBeGreaterThanOrEqual(rows[i].valor);
        }
    });
});
