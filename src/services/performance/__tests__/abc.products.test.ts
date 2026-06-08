import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAbcProducts } from "@/services/performance.service";

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

describe("fetchAbcProducts fallback", () => {
    it("returns ABC rows with tags, pct sum ~100, sorted by valor desc", async () => {
        const orders = [
            { id: "o1", marketplace: "shopee", marketplace_fee: 0, shipping_cost: 0 },
            { id: "o2", marketplace: "shopee", marketplace_fee: 0, shipping_cost: 0 },
        ];
        const orderItems = [
            { order_id: "o1", product_id: "p1", marketplace_item_id: "m1", quantity: 1, unit_price: 100, unit_cost: 10, title: "A", image_url: null, sku: "s1" },
            { order_id: "o1", product_id: "p2", marketplace_item_id: "m2", quantity: 1, unit_price: 50, unit_cost: 5, title: "B", image_url: null, sku: "s2" },
            { order_id: "o2", product_id: "p3", marketplace_item_id: "m3", quantity: 1, unit_price: 25, unit_cost: 2, title: "C", image_url: null, sku: "s3" },
        ];
        const products = [
            { id: "p1", name: "Prod 1", sku: "s1", image_urls: ["https://a.com/1.jpg"] },
            { id: "p2", name: "Prod 2", sku: "s2", image_urls: [] },
            { id: "p3", name: "Prod 3", sku: "s3", image_urls: [] },
        ];

        mockFrom.mockImplementation((table: string) => {
            if (table === "marketplace_integrations") return buildChain([]);
            if (table === "orders") return buildChain(orders);
            if (table === "order_items") return buildChain(orderItems);
            if (table === "products") return buildChain(products);
            return buildChain([]);
        });

        const rows = await fetchAbcProducts(
            "org-1",
            { from: new Date("2025-01-01"), to: new Date("2025-01-31") },
            "todos",
            "valor",
        );

        const distinctIds = new Set(rows.map((r) => r.id));
        expect(rows.length).toBe(distinctIds.size);
        expect(rows.length).toBe(3);
        for (const row of rows) {
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
