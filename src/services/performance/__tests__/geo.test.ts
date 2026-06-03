import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSalesByState } from "@/services/performance.service";

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

describe("fetchSalesByState fallback", () => {
    it("maps UF to state_name, pct_total ~100, sorted by total, ticket_medio correct", async () => {
        const orders = [
            { id: "o1", gross_amount: 300, buyer_state: "SP", marketplace: "shopee" },
            { id: "o2", gross_amount: 200, buyer_state: "RJ", marketplace: "shopee" },
            { id: "o3", gross_amount: 100, buyer_state: "MG", marketplace: "shopee" },
        ];
        const shippingRows = [
            { order_id: "o1", state_uf: "SP", city: "São Paulo" },
            { order_id: "o2", state_uf: "RJ", city: "Rio" },
            { order_id: "o3", state_uf: "MG", city: "BH" },
        ];
        const itemRows = [
            { order_id: "o1", quantity: 2 },
            { order_id: "o2", quantity: 1 },
            { order_id: "o3", quantity: 3 },
        ];

        let orderItemsCall = 0;
        mockFrom.mockImplementation((table: string) => {
            if (table === "orders") return buildChain(orders);
            if (table === "order_shipping") return buildChain(shippingRows);
            if (table === "order_items") {
                orderItemsCall += 1;
                return buildChain(itemRows);
            }
            return buildChain([]);
        });

        const rows = await fetchSalesByState(
            "org-1",
            { from: new Date("2025-01-01"), to: new Date("2025-01-31") },
            "todos",
        );

        const sp = rows.find((r) => r.uf === "SP");
        expect(sp?.state_name).toBe("São Paulo");
        const pctSum = rows.reduce((s, r) => s + r.pct_total, 0);
        expect(pctSum).toBeCloseTo(100, 1);
        for (let i = 1; i < rows.length; i++) {
            expect(rows[i - 1].total).toBeGreaterThanOrEqual(rows[i].total);
        }
        for (const row of rows) {
            if (row.pedidos > 0) {
                expect(row.ticket_medio).toBeCloseTo(row.total / row.pedidos, 5);
            }
        }
        expect(orderItemsCall).toBeGreaterThan(0);
    });
});
