import { supabase } from "@/integrations/supabase/client";
import { computeAbc } from "@/utils/abc";
import type { DateRange } from "react-day-picker";
import { fetchOrgTaxRates, fetchProductDetails, fetchScopedItems, fetchScopedOrders } from "./queries";
import {
    marketplaceKey,
    normalizeImageUrl,
    normalizeMarketplace,
    PERF_RPC_ENABLED,
    toISOs,
} from "./shared-helpers";
import type { AbcTag, SoldListing } from "./types";

async function fetchListingsSoldFallback(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
): Promise<SoldListing[]> {
    const [orders, taxRates] = await Promise.all([
        fetchScopedOrders(orgId, dateRange, marketplace),
        fetchOrgTaxRates(orgId),
    ]);
    const orderIds = orders.map((order) => order.id);
    const ordersById = Object.fromEntries(orders.map((o) => [o.id, o]));
    const items = await fetchScopedItems(orderIds);

    // Total item value per order for proportional fee/shipping distribution
    const orderTotalValue: Record<string, number> = {};
    items.forEach((item) => {
        if (item.quantity <= 0) return;
        orderTotalValue[item.order_id] = (orderTotalValue[item.order_id] || 0) + item.quantity * item.unit_price;
    });

    const byListing: Record<string, {
        titulo: string;
        sku: string;
        product_id: string;
        marketplace: string;
        image_url: string;
        pedidosSet: Set<string>;
        unidades: number;
        valor: number;
        cost: number | null;
        proportional_fee: number;
        proportional_shipping: number;
        tax: number;
    }> = {};

    items.forEach((item) => {
        if (item.quantity <= 0) return;
        const fallbackId = item.sku || item.title || item.order_id;
        const listingId = item.marketplace_item_id || `unlinked:${fallbackId}`;
        if (!byListing[listingId]) {
            byListing[listingId] = {
                titulo: item.title || `Anúncio ${listingId}`,
                sku: item.sku || "",
                product_id: item.product_id || "",
                marketplace: ordersById[item.order_id]?.marketplace || "Outros",
                image_url: normalizeImageUrl(item.image_url),
                pedidosSet: new Set<string>(),
                unidades: 0,
                valor: 0,
                cost: 0,
                proportional_fee: 0,
                proportional_shipping: 0,
                tax: 0,
            };
        }
        const row = byListing[listingId];
        const itemValue = item.quantity * item.unit_price;
        row.pedidosSet.add(item.order_id);
        row.unidades += item.quantity;
        row.valor += itemValue;

        // Accumulate product cost
        if (item.unit_cost != null && row.cost != null) row.cost += item.quantity * item.unit_cost;
        if (item.unit_cost == null) row.cost = null;

        if (item.title) row.titulo = item.title;
        if (item.sku) row.sku = item.sku;
        if (item.product_id && !row.product_id) row.product_id = item.product_id;
        if (item.image_url) row.image_url = normalizeImageUrl(item.image_url);

        // Distribute order-level fees proportionally by item value
        const order = ordersById[item.order_id];
        if (order) {
            const orderTotal = orderTotalValue[item.order_id] || 1;
            const ratio = itemValue / orderTotal;
            row.proportional_fee += order.marketplace_fee * ratio;
            row.proportional_shipping += order.shipping_cost * ratio;
        }

        // Tax based on item revenue
        const mktKey = marketplaceKey(order?.marketplace || "");
        row.tax += itemValue * ((taxRates[mktKey] || 0) / 100);
    });

    const linkedProductIds = Array.from(new Set(Object.values(byListing).map((row) => row.product_id).filter(Boolean)));
    const productDetails = await fetchProductDetails(linkedProductIds);

    const abcRows = computeAbc(
        Object.entries(byListing).map(([id, row]) => ({
            id,
            label: row.titulo,
            valor: row.valor,
            unidades: row.unidades,
        })),
        "valor",
    );

    return abcRows.map((abc) => {
        const row = byListing[abc.id];
        // Full margin: only for listings linked to a registered product with cost data
        let margin_brl: number | null = null;
        let margin_pct: number | null = null;
        if (row.product_id && row.cost != null && row.valor > 0) {
            margin_brl = row.valor - row.cost - row.proportional_fee - row.proportional_shipping - row.tax;
            margin_pct = (margin_brl / row.valor) * 100;
        }
        return {
            id: abc.id,
            titulo: row.titulo,
            sku: row.sku,
            marketplace: row.marketplace,
            image_url: row.image_url || productDetails[row.product_id]?.image_url || "",
            pedidos: row.pedidosSet.size,
            unidades: row.unidades,
            valor: row.valor,
            margin_pct,
            margin_brl,
            pct: abc.pct,
            cum_pct: abc.cum_pct,
            tag: abc.tag,
        };
    });
}

export async function fetchListingsSold(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
): Promise<SoldListing[]> {
    if (!PERF_RPC_ENABLED) return fetchListingsSoldFallback(orgId, dateRange, marketplace);

    const { fromISO, toISO } = toISOs(dateRange);
    if (!fromISO || !toISO) return [];
    const { data, error } = await (supabase as any).rpc('fn_perf_listings_sold', {
        p_org_id: orgId,
        p_from: fromISO,
        p_to: toISO,
        p_marketplace: normalizeMarketplace(marketplace) ?? null,
    });
    if (error) return fetchListingsSoldFallback(orgId, dateRange, marketplace);
    return (data || []).map((r: any) => ({
        id: String(r.id),
        titulo: String(r.titulo || r.id),
        sku: String(r.sku || ''),
        marketplace: String(r.marketplace || ''),
        image_url: String(r.image_url || ''),
        pedidos: Number(r.pedidos),
        unidades: Number(r.unidades),
        valor: Number(r.valor),
        margin_pct: r.margin_pct != null ? Number(r.margin_pct) : null,
        pct: Number(r.pct || 0),
        cum_pct: Number(r.cum_pct || 0),
        tag: String(r.tag || 'C') as AbcTag,
    }));
}
