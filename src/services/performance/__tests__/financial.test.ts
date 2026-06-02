import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFinancialOverview } from "@/services/performance.service";

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
    supabase: {
        from: (...args: unknown[]) => mockFrom(...args),
        rpc: (...args: unknown[]) => mockRpc(...args),
    },
}));

function chain(resolver: () => Promise<{ data: unknown; error: null }>) {
    const self: Record<string, unknown> = {};
    const methods = ["select", "eq", "gte", "lte", "in", "is", "order", "limit"];
    for (const m of methods) {
        self[m] = vi.fn(() => self);
    }
    (self as { then?: unknown }).then = undefined;
    Object.assign(self, {
        then(onFulfilled: (v: { data: unknown; error: null }) => unknown) {
            return resolver().then(onFulfilled);
        },
    });
    return self;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: { message: "rpc disabled in test" } });
});

describe("fetchFinancialOverview fallback (PERF_RPC_ENABLED=false)", () => {
    it("aggregates revenue, costs, tax and by_marketplace", async () => {
        mockFrom.mockImplementation((table: string) => {
            if (table === "marketplace_integrations") {
                return chain(() =>
                    Promise.resolve({
                        data: [{ marketplace_name: "shopee", company_id: "c1" }],
                        error: null,
                    }),
                );
            }
            if (table === "companies") {
                return chain(() =>
                    Promise.resolve({
                        data: [{ id: "c1", imposto_pago: 10 }],
                        error: null,
                    }),
                );
            }
            if (table === "orders") {
                return chain(() =>
                    Promise.resolve({
                        data: [
                            {
                                id: "o1",
                                gross_amount: 100,
                                net_amount: 80,
                                marketplace_fee: 5,
                                shipping_cost: 3,
                                marketplace: "shopee",
                            },
                        ],
                        error: null,
                    }),
                );
            }
            if (table === "order_items") {
                return chain(() =>
                    Promise.resolve({
                        data: [{ order_id: "o1", quantity: 2, unit_cost: 10 }],
                        error: null,
                    }),
                );
            }
            return chain(() => Promise.resolve({ data: [], error: null }));
        });

        const result = await fetchFinancialOverview("org-1", {
            from: new Date("2025-01-01"),
            to: new Date("2025-01-31"),
        }, "todos");

        expect(result.total_revenue).toBe(100);
        expect(result.marketplace_fee).toBe(5);
        expect(result.shipping_cost).toBe(3);
        expect(result.tax_amount).toBe(10);
        expect(result.product_cost).toBe(20);
        expect(result.total_spent).toBe(38);
        expect(result.net_revenue).toBe(62);
        expect(result.orders_count).toBe(1);
        expect(result.by_marketplace).toHaveLength(1);
        expect(result.by_marketplace![0].marketplace).toBe("shopee");
        expect(result.pct_revenue).toBeCloseTo(38, 5);
    });
});
