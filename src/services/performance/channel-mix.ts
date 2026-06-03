import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "react-day-picker";
import { fetchScopedItems, fetchScopedOrders } from "./queries";
import { normalizeMarketplace, PERF_RPC_ENABLED, toISOs } from "./shared-helpers";
import type { ProductChannelMix } from "./types";

async function fetchProductSalesBreakdownFallback(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
): Promise<ProductChannelMix[]> {
    const orders = await fetchScopedOrders(orgId, dateRange, marketplace);
    const orderIds = orders.map((order) => order.id);
    const marketplaceByOrder = Object.fromEntries(orders.map((order) => [order.id, order.marketplace]));
    const items = await fetchScopedItems(orderIds);
    const byProductMarketplace: Record<string, Record<string, { valor: number; unidades: number }>> = {};

    items.forEach((item) => {
        if (!item.product_id) return;
        const mkt = marketplaceByOrder[item.order_id] || "Outros";
        if (!byProductMarketplace[item.product_id]) byProductMarketplace[item.product_id] = {};
        if (!byProductMarketplace[item.product_id][mkt]) byProductMarketplace[item.product_id][mkt] = { valor: 0, unidades: 0 };
        byProductMarketplace[item.product_id][mkt].valor += item.quantity * item.unit_price;
        byProductMarketplace[item.product_id][mkt].unidades += item.quantity;
    });

    const rows: ProductChannelMix[] = [];
    Object.entries(byProductMarketplace).forEach(([productId, byMarketplace]) => {
        const total = Object.values(byMarketplace).reduce((sum, row) => sum + row.valor, 0);
        Object.entries(byMarketplace).forEach(([mkt, row]) => {
            rows.push({
                product_id: productId,
                marketplace: mkt,
                valor: row.valor,
                unidades: row.unidades,
                pct_within_product: total > 0 ? (row.valor / total) * 100 : 0,
            });
        });
    });

    return rows.sort((a, b) => b.valor - a.valor);
}

export async function fetchProductSalesBreakdown(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
): Promise<ProductChannelMix[]> {
    if (!PERF_RPC_ENABLED) return fetchProductSalesBreakdownFallback(orgId, dateRange, marketplace);

    const { fromISO, toISO } = toISOs(dateRange);
    if (!fromISO || !toISO) return [];
    const { data, error } = await (supabase as any).rpc('fn_perf_product_sales_breakdown', {
        p_org_id: orgId,
        p_from: fromISO,
        p_to: toISO,
        p_marketplace: normalizeMarketplace(marketplace) ?? null,
    });
    if (error) return fetchProductSalesBreakdownFallback(orgId, dateRange, marketplace);
    return (data || []).map((r: any) => ({
        product_id: String(r.product_id),
        marketplace: String(r.marketplace || ''),
        valor: Number(r.valor),
        unidades: Number(r.unidades),
        pct_within_product: Number(r.pct_within_product),
    }));
}
