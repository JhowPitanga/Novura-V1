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
import type { AbcCriterion, AbcProductRow, AbcTag } from "./types";

async function fetchAbcProductsFallback(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
    criterion: AbcCriterion,
): Promise<AbcProductRow[]> {
    const [orders, taxRates] = await Promise.all([
        fetchScopedOrders(orgId, dateRange, marketplace),
        fetchOrgTaxRates(orgId),
    ]);
    const orderIds = orders.map((order) => order.id);
    const items = await fetchScopedItems(orderIds);

    const ordersById = Object.fromEntries(orders.map((o) => [o.id, o]));

    // Total item value per order — used for proportional fee/shipping distribution
    const orderTotalValue: Record<string, number> = {};
    items.forEach((item) => {
        orderTotalValue[item.order_id] = (orderTotalValue[item.order_id] || 0) + item.quantity * item.unit_price;
    });

    const byProduct: Record<string, {
        valor: number;
        unidades: number;
        pedidosSet: Set<string>;
        nome: string;
        sku: string;
        image_url: string;
        isLinkedProduct: boolean;
        cost: number | null;
        proportional_fee: number;
        proportional_shipping: number;
        tax: number;
    }> = {};

    items.forEach((item) => {
        const fallbackId = item.sku || item.marketplace_item_id || item.title || item.order_id;
        const id = item.product_id || `item:${fallbackId}`;
        if (!byProduct[id]) {
            byProduct[id] = {
                valor: 0,
                unidades: 0,
                pedidosSet: new Set<string>(),
                nome: item.title || item.product_id || "Produto sem vínculo",
                sku: item.sku || "",
                image_url: normalizeImageUrl(item.image_url),
                isLinkedProduct: !!item.product_id,
                cost: 0,
                proportional_fee: 0,
                proportional_shipping: 0,
                tax: 0,
            };
        }
        const row = byProduct[id];
        const itemValue = item.quantity * item.unit_price;
        row.valor += itemValue;
        row.unidades += item.quantity;
        row.pedidosSet.add(item.order_id);
        if (item.title) row.nome = item.title;
        if (item.sku) row.sku = item.sku;
        if (item.image_url) row.image_url = normalizeImageUrl(item.image_url);

        // Accumulate product cost (null if any item lacks unit_cost)
        if (item.unit_cost != null && row.cost != null) {
            row.cost += item.quantity * item.unit_cost;
        } else if (item.unit_cost == null) {
            row.cost = null;
        }

        // Distribute order-level fees proportionally by item value
        const order = ordersById[item.order_id];
        if (order) {
            const orderTotal = orderTotalValue[item.order_id] || 1;
            const ratio = itemValue / orderTotal;
            row.proportional_fee += order.marketplace_fee * ratio;
            row.proportional_shipping += order.shipping_cost * ratio;
        }

        // Tax based on item revenue
        const mktKey = marketplaceKey(ordersById[item.order_id]?.marketplace || "");
        row.tax += itemValue * ((taxRates[mktKey] || 0) / 100);
    });

    const productIds = Object.keys(byProduct).filter((id) => byProduct[id].isLinkedProduct);
    const details = await fetchProductDetails(productIds);
    const allIds = Object.keys(byProduct);
    return computeAbc(
        allIds.map((id) => ({
            id,
            label: details[id]?.name || byProduct[id].nome || id,
            valor: byProduct[id].valor,
            unidades: byProduct[id].unidades,
        })),
        criterion,
    ).map((row) => {
        const p = byProduct[row.id];
        // Margin only for registered products that have cost data
        let margin_brl: number | null = null;
        let margin_pct: number | null = null;
        if (p.isLinkedProduct && p.cost != null && row.valor > 0) {
            margin_brl = row.valor - p.cost - p.proportional_fee - p.proportional_shipping - p.tax;
            margin_pct = (margin_brl / row.valor) * 100;
        }
        return {
            id: row.id,
            nome: row.label,
            sku: details[row.id]?.sku || p?.sku || "",
            image_url: details[row.id]?.image_url || p?.image_url || "",
            pedidos: p?.pedidosSet.size ?? 0,
            valor: row.valor,
            unidades: row.unidades,
            pct: row.pct,
            cum_pct: row.cum_pct,
            tag: row.tag,
            margin_pct,
            margin_brl,
        };
    });
}

export async function fetchAbcProducts(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
    criterion: AbcCriterion,
): Promise<AbcProductRow[]> {
    if (!PERF_RPC_ENABLED) return fetchAbcProductsFallback(orgId, dateRange, marketplace, criterion);

    const { fromISO, toISO } = toISOs(dateRange);
    if (!fromISO || !toISO) return [];
    const { data, error } = await (supabase as any).rpc('fn_perf_abc_products', {
        p_org_id: orgId,
        p_from: fromISO,
        p_to: toISO,
        p_marketplace: normalizeMarketplace(marketplace) ?? null,
        p_criterion: criterion,
    });
    if (error) return fetchAbcProductsFallback(orgId, dateRange, marketplace, criterion);
    return (data || []).map((r: any) => ({
        id: String(r.id),
        nome: String(r.nome || r.id),
        sku: String(r.sku || ''),
        image_url: String(r.image_url || ''),
        pedidos: Number(r.pedidos || 0),
        valor: Number(r.valor),
        unidades: Number(r.unidades),
        pct: Number(r.pct),
        cum_pct: Number(r.cum_pct),
        tag: String(r.tag || 'C') as AbcTag,
    }));
}
