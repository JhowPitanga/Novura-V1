import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "react-day-picker";
import {
    marketplaceKey,
    normalizeMarketplace,
    PERF_RPC_ENABLED,
    STATE_NAMES,
    toISOs,
} from "./shared-helpers";
import type { StateSale } from "./types";

async function fetchSalesByStateFallback(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
): Promise<StateSale[]> {
    const { fromISO, toISO } = toISOs(dateRange);
    if (!fromISO || !toISO) return [];

    let ordersQ: any = supabase
        .from("orders")
        .select("id, gross_amount, buyer_state, marketplace")
        .eq("organization_id", orgId)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);

    const { data: orders, error: ordersError } = await ordersQ;
    if (ordersError) throw ordersError;

    const normalizedMarketplace = normalizeMarketplace(marketplace);
    const orderList = (Array.isArray(orders) ? orders : []).filter((order: any) => {
        if (!normalizedMarketplace) return true;
        return marketplaceKey(order?.marketplace) === marketplaceKey(normalizedMarketplace);
    });
    const orderIds = orderList.map((o: any) => String(o.id)).filter(Boolean);
    if (orderIds.length === 0) return [];

    const shippingByOrder: Record<string, string> = {};
    const qtyByOrder: Record<string, number> = {};
    const chunkSize = 200;

    for (let i = 0; i < orderIds.length; i += chunkSize) {
        const chunk = orderIds.slice(i, i + chunkSize);
        const { data: shippingRows, error: shippingError } = await supabase
            .from("order_shipping")
            .select("order_id, state_uf, city")
            .in("order_id", chunk);
        if (shippingError) throw shippingError;
        (shippingRows || []).forEach((row: any) => {
            const uf = String(row?.state_uf || "").trim().toUpperCase();
            if (uf) shippingByOrder[String(row.order_id)] = uf;
        });

        const { data: itemRows, error: itemError } = await supabase
            .from("order_items")
            .select("order_id, quantity")
            .in("order_id", chunk);
        if (itemError) throw itemError;
        (itemRows || []).forEach((row: any) => {
            const id = String(row?.order_id || "");
            qtyByOrder[id] = (qtyByOrder[id] || 0) + Number(row?.quantity || 0);
        });
    }

    const byUf: Record<string, { pedidos: number; unidades: number; total: number }> = {};
    for (const order of orderList) {
        const orderId = String(order.id);
        const uf = (shippingByOrder[orderId] || String(order.buyer_state || "").trim().toUpperCase()).slice(0, 2);
        if (!uf) continue;
        if (!byUf[uf]) byUf[uf] = { pedidos: 0, unidades: 0, total: 0 };
        byUf[uf].pedidos += 1;
        byUf[uf].unidades += qtyByOrder[orderId] || 0;
        byUf[uf].total += Number(order.gross_amount || 0);
    }

    const grandTotal = Object.values(byUf).reduce((sum, row) => sum + row.total, 0);
    return Object.entries(byUf)
        .map(([uf, row]) => ({
            uf,
            state_name: STATE_NAMES[uf] || uf,
            pedidos: row.pedidos,
            unidades: row.unidades,
            total: row.total,
            ticket_medio: row.pedidos > 0 ? row.total / row.pedidos : 0,
            pct_total: grandTotal > 0 ? (row.total / grandTotal) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total);
}

export async function fetchSalesByState(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
): Promise<StateSale[]> {
    if (!PERF_RPC_ENABLED) return fetchSalesByStateFallback(orgId, dateRange, marketplace);

    const { fromISO, toISO } = toISOs(dateRange);
    if (!fromISO || !toISO) return [];
    const { data, error } = await (supabase as any).rpc('fn_perf_sales_by_state', {
        p_org_id: orgId,
        p_from: fromISO,
        p_to: toISO,
        p_marketplace: normalizeMarketplace(marketplace) ?? null,
    });
    if (error) {
        console.warn("fn_perf_sales_by_state unavailable, using table fallback", error);
        return fetchSalesByStateFallback(orgId, dateRange, marketplace);
    }
    const rows = (data || []).map((r: any) => ({
        uf: String(r.uf),
        state_name: String(r.state_name || r.uf),
        pedidos: Number(r.pedidos),
        unidades: Number(r.unidades),
        total: Number(r.total),
        ticket_medio: Number(r.ticket_medio),
        pct_total: Number(r.pct_total),
    }));
    return rows.length > 0 ? rows : fetchSalesByStateFallback(orgId, dateRange, marketplace);
}
