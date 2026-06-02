import { supabase } from "@/integrations/supabase/client";
import { computeAbc } from "@/utils/abc";
import type { DateRange } from "react-day-picker";
import { fetchScopedItems, fetchScopedOrders } from "./queries";
import { normalizeMarketplace, PERF_RPC_ENABLED, toISOs } from "./shared-helpers";
import type { AbcCriterion, AbcListingRow, AbcTag } from "./types";

async function fetchAbcListingsFallback(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
    criterion: AbcCriterion,
): Promise<AbcListingRow[]> {
    const orders = await fetchScopedOrders(orgId, dateRange, marketplace);
    const orderIds = orders.map((order) => order.id);
    const marketplaceByOrder = Object.fromEntries(orders.map((order) => [order.id, order.marketplace]));
    const items = await fetchScopedItems(orderIds);
    const byListing: Record<string, { titulo: string; marketplace: string; valor: number; unidades: number }> = {};

    items.forEach((item) => {
        if (!item.marketplace_item_id) return;
        if (!byListing[item.marketplace_item_id]) {
            byListing[item.marketplace_item_id] = {
                titulo: item.title || `Anúncio ${item.marketplace_item_id}`,
                marketplace: marketplaceByOrder[item.order_id] || "Outros",
                valor: 0,
                unidades: 0,
            };
        }
        byListing[item.marketplace_item_id].valor += item.quantity * item.unit_price;
        byListing[item.marketplace_item_id].unidades += item.quantity;
        if (item.title) byListing[item.marketplace_item_id].titulo = item.title;
    });

    return computeAbc(
        Object.entries(byListing).map(([id, row]) => ({
            id,
            label: row.titulo,
            valor: row.valor,
            unidades: row.unidades,
        })),
        criterion,
    ).map((row) => ({
        id: row.id,
        titulo: row.label,
        marketplace: byListing[row.id]?.marketplace || "Outros",
        valor: row.valor,
        unidades: row.unidades,
        pct: row.pct,
        cum_pct: row.cum_pct,
        tag: row.tag,
    }));
}

export async function fetchAbcListings(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
    criterion: AbcCriterion,
): Promise<AbcListingRow[]> {
    if (!PERF_RPC_ENABLED) return fetchAbcListingsFallback(orgId, dateRange, marketplace, criterion);

    const { fromISO, toISO } = toISOs(dateRange);
    if (!fromISO || !toISO) return [];
    const { data, error } = await (supabase as any).rpc('fn_perf_abc_listings', {
        p_org_id: orgId,
        p_from: fromISO,
        p_to: toISO,
        p_marketplace: normalizeMarketplace(marketplace) ?? null,
        p_criterion: criterion,
    });
    if (error) return fetchAbcListingsFallback(orgId, dateRange, marketplace, criterion);
    return (data || []).map((r: any) => ({
        id: String(r.id),
        titulo: String(r.titulo || r.id),
        marketplace: String(r.marketplace || ''),
        valor: Number(r.valor),
        unidades: Number(r.unidades),
        pct: Number(r.pct),
        cum_pct: Number(r.cum_pct),
        tag: String(r.tag || 'C') as AbcTag,
    }));
}
