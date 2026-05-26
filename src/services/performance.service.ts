import { supabase } from "@/integrations/supabase/client";
import { calendarStartOfDaySPEpochMs, calendarEndOfDaySPEpochMs } from "@/lib/datetime";
import { computeAbc } from "@/utils/abc";
import type { DateRange } from "react-day-picker";

export interface ProductPerformanceItem {
    id: string;
    nome: string;
    pedidos: number;
    unidades: number;
    valor: number;
    vinculos: number;
}

export interface ListingPerformanceItem {
    id: string;
    titulo: string;
    marketplace: string;
    vendas: number;
    valor: number;
    image_url: string;
}

export interface ProductPerformanceResult {
    produtosData: ProductPerformanceItem[];
    anunciosData: ListingPerformanceItem[];
    productModelsByProduct: Record<string, string[]>;
}

export interface ConnectedMarketplace {
    display: string;
    slug: string;
}

export interface StateSale {
    uf: string;
    state_name: string;
    pedidos: number;
    unidades: number;
    total: number;
    ticket_medio: number;
    pct_total: number;
}

export type AbcTag = 'A' | 'B' | 'C';

export interface AbcProductRow {
    id: string;
    nome: string;
    sku?: string;
    image_url?: string;
    pedidos?: number;
    valor: number;
    unidades: number;
    pct: number;
    cum_pct: number;
    tag: AbcTag;
    margin_pct?: number | null;
    margin_brl?: number | null;
}

export interface AbcListingRow {
    id: string;
    titulo: string;
    marketplace: string;
    valor: number;
    unidades: number;
    pct: number;
    cum_pct: number;
    tag: AbcTag;
}

export interface ProductChannelMix {
    product_id: string;
    marketplace: string;
    valor: number;
    unidades: number;
    pct_within_product: number;
}

export interface SoldListing {
    id: string;
    titulo: string;
    sku: string;
    marketplace: string;
    image_url: string;
    pedidos: number;
    unidades: number;
    valor: number;
    margin_pct: number | null;
    margin_brl: number | null;
    pct: number;
    cum_pct: number;
    tag: AbcTag;
}

export type AbcCriterion = 'valor' | 'unidades';

export interface FinancialOverview {
    total_revenue: number;
    net_revenue: number;
    tax_amount: number;
    marketplace_fee: number;
    shipping_cost: number;
    product_cost: number;
    total_spent: number;
    pct_revenue: number;
    orders_count: number;
    by_marketplace?: Array<{
        marketplace: string;
        revenue: number;
        marketplace_fee: number;
        shipping_cost: number;
        product_cost: number;
        tax_amount: number;
        total_spent: number;
        tax_rate_pct: number;
    }>;
}

// Keep the backend RPC contract ready, but use table fallbacks until the
// migrations are present in the remote Supabase schema cache.
const PERF_RPC_ENABLED = false;

function toISOs(dateRange: DateRange | undefined): { fromISO: string | undefined; toISO: string | undefined } {
    const from = dateRange?.from;
    const to = dateRange?.to || dateRange?.from;
    const fromISO = from ? new Date(calendarStartOfDaySPEpochMs(from)).toISOString() : undefined;
    const toISO = to ? new Date(calendarEndOfDaySPEpochMs(to)).toISOString() : undefined;
    return { fromISO, toISO };
}

function normalizeMarketplace(m: string | undefined): string | undefined {
    if (!m || m === 'todos') return undefined;
    return m;
}

function marketplaceKey(value: string | undefined): string {
    return String(value || "").toLowerCase().replace(/[_\s-]/g, "");
}

function normalizeImageUrl(url: string | null | undefined): string {
    const value = String(url || "").trim();
    return /^https?:\/\//i.test(value) ? value : "";
}

const STATE_NAMES: Record<string, string> = {
    AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
    DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
    MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
    PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
    RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
    SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

type ScopedOrder = {
    id: string;
    marketplace: string;
    marketplace_fee: number;
    shipping_cost: number;
};

type ScopedItem = {
    order_id: string;
    product_id: string | null;
    marketplace_item_id: string | null;
    quantity: number;
    unit_price: number;
    unit_cost: number | null;
    title: string | null;
    image_url: string | null;
    sku: string | null;
};

async function fetchScopedOrders(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
): Promise<ScopedOrder[]> {
    const { fromISO, toISO } = toISOs(dateRange);
    if (!fromISO || !toISO) return [];

    const { data, error } = await supabase
        .from("orders")
        .select("id, marketplace, marketplace_fee, shipping_cost")
        .eq("organization_id", orgId)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);

    if (error) throw error;

    const normalizedMarketplace = normalizeMarketplace(marketplace);
    return (Array.isArray(data) ? data : [])
        .map((order: any) => ({
            id: String(order.id),
            marketplace: String(order.marketplace || "Outros"),
            marketplace_fee: Number(order.marketplace_fee || 0),
            shipping_cost: Number(order.shipping_cost || 0),
        }))
        .filter((order) => {
            if (!normalizedMarketplace) return true;
            return marketplaceKey(order.marketplace) === marketplaceKey(normalizedMarketplace);
        });
}

/** Fetches tax rate (%) per marketplace key for the given org. */
async function fetchOrgTaxRates(orgId: string): Promise<Record<string, number>> {
    const { data: integrations } = await supabase
        .from("marketplace_integrations")
        .select("marketplace_name, company_id")
        .eq("organizations_id", orgId)
        .is("deactivated_at", null);
    const companyIds = Array.from(
        new Set((integrations || []).map((r: any) => String(r?.company_id || "")).filter(Boolean)),
    );
    let taxPctByCompanyId: Record<string, number> = {};
    if (companyIds.length > 0) {
        const { data: companies } = await supabase
            .from("companies")
            .select("id, imposto_pago")
            .in("id", companyIds);
        taxPctByCompanyId = Object.fromEntries(
            (companies || []).map((c: any) => [String(c.id), Number(c.imposto_pago || 0)]),
        );
    }
    const taxByMktKey: Record<string, number> = {};
    (integrations || []).forEach((r: any) => {
        const key = marketplaceKey(String(r?.marketplace_name || ""));
        const companyId = String(r?.company_id || "");
        if (!key || !companyId || taxByMktKey[key] != null) return;
        taxByMktKey[key] = Number(taxPctByCompanyId[companyId] || 0);
    });
    return taxByMktKey;
}

async function fetchScopedItems(orderIds: string[]): Promise<ScopedItem[]> {
    if (orderIds.length === 0) return [];
    const result: ScopedItem[] = [];
    const chunkSize = 200;

    for (let i = 0; i < orderIds.length; i += chunkSize) {
        const chunk = orderIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
            .from("order_items")
            .select("order_id, product_id, marketplace_item_id, quantity, unit_price, unit_cost, title, image_url, sku")
            .in("order_id", chunk);

        if (error) throw error;

        (data || []).forEach((item: any) => {
            result.push({
                order_id: String(item.order_id),
                product_id: item.product_id ? String(item.product_id) : null,
                marketplace_item_id: item.marketplace_item_id ? String(item.marketplace_item_id) : null,
                quantity: Number(item.quantity || 0),
                unit_price: Number(item.unit_price || 0),
                unit_cost: item.unit_cost != null ? Number(item.unit_cost) : null,
                title: item.title ? String(item.title) : null,
                image_url: item.image_url ? String(item.image_url) : null,
                sku: item.sku ? String(item.sku) : null,
            });
        });
    }

    return result;
}

async function fetchProductDetails(productIds: string[]): Promise<Record<string, { name: string; sku: string; image_url: string }>> {
    if (productIds.length === 0) return {};
    const { data } = await supabase
        .from("products")
        .select("id, name, sku, image_urls")
        .in("id", productIds);

    const details: Record<string, { name: string; sku: string; image_url: string }> = {};
    (data || []).forEach((row: any) => {
        const imageUrls = Array.isArray(row.image_urls) ? row.image_urls : [];
        details[String(row.id)] = {
            name: String(row.name || row.id),
            sku: String(row.sku || ""),
            image_url: normalizeImageUrl(String(imageUrls[0] || "")),
        };
    });
    return details;
}

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

export async function fetchFinancialOverview(
    orgId: string,
    dateRange: DateRange | undefined,
    marketplace: string,
): Promise<FinancialOverview> {
    const { fromISO, toISO } = toISOs(dateRange);
    const empty = {
        total_revenue: 0,
        net_revenue: 0,
        tax_amount: 0,
        marketplace_fee: 0,
        shipping_cost: 0,
        product_cost: 0,
        total_spent: 0,
        pct_revenue: 0,
        orders_count: 0,
        by_marketplace: [],
    };
    if (!fromISO || !toISO) {
        return empty;
    }

    if (!PERF_RPC_ENABLED) {
        const { data: integrations } = await supabase
            .from("marketplace_integrations")
            .select("marketplace_name, company_id")
            .eq("organizations_id", orgId)
            .is("deactivated_at", null);
        const companyIds = Array.from(
            new Set((integrations || []).map((row: any) => String(row?.company_id || "")).filter(Boolean)),
        );
        let taxPctByCompanyId: Record<string, number> = {};
        if (companyIds.length > 0) {
            const { data: companies } = await supabase
                .from("companies")
                .select("id, imposto_pago")
                .in("id", companyIds);
            taxPctByCompanyId = Object.fromEntries(
                (companies || []).map((company: any) => [
                    String(company.id),
                    Number(company.imposto_pago || 0),
                ]),
            );
        }
        const taxPctByMarketplace: Record<string, number> = {};
        (integrations || []).forEach((integration: any) => {
            const key = marketplaceKey(String(integration?.marketplace_name || ""));
            const companyId = String(integration?.company_id || "");
            if (!key || !companyId || taxPctByMarketplace[key] != null) return;
            taxPctByMarketplace[key] = Number(taxPctByCompanyId[companyId] || 0);
        });

        let q: any = supabase
            .from("orders")
            .select("id, gross_amount, net_amount, marketplace_fee, shipping_cost, marketplace")
            .eq("organization_id", orgId)
            .gte("created_at", fromISO)
            .lte("created_at", toISO);
        const { data: rows, error: fallbackError } = await q;
        if (fallbackError) throw fallbackError;
        const normalizedMarketplace = normalizeMarketplace(marketplace);
        const filtered = (Array.isArray(rows) ? rows : []).filter((row: any) => {
            if (!normalizedMarketplace) return true;
            return marketplaceKey(row?.marketplace) === marketplaceKey(normalizedMarketplace);
        });
        const orderIds = filtered.map((row: any) => String(row?.id || "")).filter(Boolean);
        const productCostByOrderId: Record<string, number> = {};
        for (let i = 0; i < orderIds.length; i += 200) {
            const chunk = orderIds.slice(i, i + 200);
            const { data: itemsRows } = await supabase
                .from("order_items")
                .select("order_id, quantity, unit_cost")
                .in("order_id", chunk);
            (itemsRows || []).forEach((item: any) => {
                const orderId = String(item?.order_id || "");
                const quantity = Number(item?.quantity || 0);
                const unitCost = Number(item?.unit_cost || 0);
                productCostByOrderId[orderId] = (productCostByOrderId[orderId] || 0) + (quantity * unitCost);
            });
        }

        const byMarketplaceAgg: Record<string, {
            marketplace: string;
            revenue: number;
            marketplace_fee: number;
            shipping_cost: number;
            product_cost: number;
            tax_amount: number;
            total_spent: number;
            tax_rate_pct: number;
        }> = {};

        const totals = filtered.reduce((acc, row: any) => {
            const orderId = String(row?.id || "");
            const revenue = Number(row?.gross_amount || 0);
            const fee = Number(row?.marketplace_fee || 0);
            const shipping = Number(row?.shipping_cost || 0);
            const marketplaceLabel = String(row?.marketplace || "Outros");
            const taxRate = Number(taxPctByMarketplace[marketplaceKey(marketplaceLabel)] || 0);
            const tax = revenue * (taxRate / 100);
            const productCost = Number(productCostByOrderId[orderId] || 0);
            const spent = fee + shipping + tax + productCost;
            acc.total_revenue += revenue;
            // Net revenue = gross - all tracked costs (consistent with total_spent)
            acc.net_revenue += Math.max(0, revenue - spent);
            acc.tax_amount += tax;
            acc.marketplace_fee += fee;
            acc.shipping_cost += shipping;
            acc.product_cost += productCost;
            acc.total_spent += spent;
            acc.orders_count += 1;

            if (!byMarketplaceAgg[marketplaceLabel]) {
                byMarketplaceAgg[marketplaceLabel] = {
                    marketplace: marketplaceLabel,
                    revenue: 0,
                    marketplace_fee: 0,
                    shipping_cost: 0,
                    product_cost: 0,
                    tax_amount: 0,
                    total_spent: 0,
                    tax_rate_pct: taxRate,
                };
            }
            byMarketplaceAgg[marketplaceLabel].revenue += revenue;
            byMarketplaceAgg[marketplaceLabel].marketplace_fee += fee;
            byMarketplaceAgg[marketplaceLabel].shipping_cost += shipping;
            byMarketplaceAgg[marketplaceLabel].product_cost += productCost;
            byMarketplaceAgg[marketplaceLabel].tax_amount += tax;
            byMarketplaceAgg[marketplaceLabel].total_spent += spent;
            return acc;
        }, { ...empty });
        totals.pct_revenue = totals.total_revenue > 0 ? (totals.total_spent / totals.total_revenue) * 100 : 0;
        totals.by_marketplace = Object.values(byMarketplaceAgg).sort((a, b) => b.total_spent - a.total_spent);
        return totals;
    }

    const { data, error } = await (supabase as any).rpc('fn_perf_financial_overview', {
        p_org_id: orgId,
        p_from: fromISO,
        p_to: toISO,
        p_marketplace: normalizeMarketplace(marketplace) ?? null,
    });
    if (error) {
        console.warn("fn_perf_financial_overview unavailable, using table fallback", error);
        const { data: integrations } = await supabase
            .from("marketplace_integrations")
            .select("marketplace_name, company_id")
            .eq("organizations_id", orgId)
            .is("deactivated_at", null);
        const companyIds = Array.from(
            new Set((integrations || []).map((row: any) => String(row?.company_id || "")).filter(Boolean)),
        );
        let taxPctByCompanyId: Record<string, number> = {};
        if (companyIds.length > 0) {
            const { data: companies } = await supabase
                .from("companies")
                .select("id, imposto_pago")
                .in("id", companyIds);
            taxPctByCompanyId = Object.fromEntries(
                (companies || []).map((company: any) => [
                    String(company.id),
                    Number(company.imposto_pago || 0),
                ]),
            );
        }
        const taxPctByMarketplace: Record<string, number> = {};
        (integrations || []).forEach((integration: any) => {
            const key = marketplaceKey(String(integration?.marketplace_name || ""));
            const companyId = String(integration?.company_id || "");
            if (!key || !companyId || taxPctByMarketplace[key] != null) return;
            taxPctByMarketplace[key] = Number(taxPctByCompanyId[companyId] || 0);
        });
        let q: any = supabase
            .from("orders")
            .select("id, gross_amount, net_amount, marketplace_fee, shipping_cost, marketplace")
            .eq("organization_id", orgId)
            .gte("created_at", fromISO)
            .lte("created_at", toISO);
        const { data: rows, error: fallbackError } = await q;
        if (fallbackError) throw fallbackError;
        const normalizedMarketplace = normalizeMarketplace(marketplace);
        const filtered = (Array.isArray(rows) ? rows : []).filter((row: any) => {
            if (!normalizedMarketplace) return true;
            return marketplaceKey(row?.marketplace) === marketplaceKey(normalizedMarketplace);
        });
        const orderIds = filtered.map((row: any) => String(row?.id || "")).filter(Boolean);
        const productCostByOrderId: Record<string, number> = {};
        for (let i = 0; i < orderIds.length; i += 200) {
            const chunk = orderIds.slice(i, i + 200);
            const { data: itemsRows } = await supabase
                .from("order_items")
                .select("order_id, quantity, unit_cost")
                .in("order_id", chunk);
            (itemsRows || []).forEach((item: any) => {
                const orderId = String(item?.order_id || "");
                const quantity = Number(item?.quantity || 0);
                const unitCost = Number(item?.unit_cost || 0);
                productCostByOrderId[orderId] = (productCostByOrderId[orderId] || 0) + (quantity * unitCost);
            });
        }

        const byMarketplaceAgg: Record<string, {
            marketplace: string;
            revenue: number;
            marketplace_fee: number;
            shipping_cost: number;
            product_cost: number;
            tax_amount: number;
            total_spent: number;
            tax_rate_pct: number;
        }> = {};

        const totals = filtered.reduce((acc, row: any) => {
            const orderId = String(row?.id || "");
            const revenue = Number(row?.gross_amount || 0);
            const fee = Number(row?.marketplace_fee || 0);
            const shipping = Number(row?.shipping_cost || 0);
            const marketplaceLabel = String(row?.marketplace || "Outros");
            const taxRate = Number(taxPctByMarketplace[marketplaceKey(marketplaceLabel)] || 0);
            const tax = revenue * (taxRate / 100);
            const productCost = Number(productCostByOrderId[orderId] || 0);
            const spent = fee + shipping + tax + productCost;
            acc.total_revenue += revenue;
            // Net revenue = gross - all tracked costs (consistent with total_spent)
            acc.net_revenue += Math.max(0, revenue - spent);
            acc.tax_amount += tax;
            acc.marketplace_fee += fee;
            acc.shipping_cost += shipping;
            acc.product_cost += productCost;
            acc.total_spent += spent;
            acc.orders_count += 1;

            if (!byMarketplaceAgg[marketplaceLabel]) {
                byMarketplaceAgg[marketplaceLabel] = {
                    marketplace: marketplaceLabel,
                    revenue: 0,
                    marketplace_fee: 0,
                    shipping_cost: 0,
                    product_cost: 0,
                    tax_amount: 0,
                    total_spent: 0,
                    tax_rate_pct: taxRate,
                };
            }
            byMarketplaceAgg[marketplaceLabel].revenue += revenue;
            byMarketplaceAgg[marketplaceLabel].marketplace_fee += fee;
            byMarketplaceAgg[marketplaceLabel].shipping_cost += shipping;
            byMarketplaceAgg[marketplaceLabel].product_cost += productCost;
            byMarketplaceAgg[marketplaceLabel].tax_amount += tax;
            byMarketplaceAgg[marketplaceLabel].total_spent += spent;
            return acc;
        }, { ...empty });
        totals.pct_revenue = totals.total_revenue > 0 ? (totals.total_spent / totals.total_revenue) * 100 : 0;
        totals.by_marketplace = Object.values(byMarketplaceAgg).sort((a, b) => b.total_spent - a.total_spent);
        return totals;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
        total_revenue: Number(row?.total_revenue || 0),
        net_revenue: Number(row?.net_revenue || 0),
        tax_amount: Number(row?.tax_amount || 0),
        marketplace_fee: Number(row?.marketplace_fee || 0),
        shipping_cost: Number(row?.shipping_cost || 0),
        product_cost: 0,
        total_spent: Number(row?.total_spent || 0),
        pct_revenue: Number(row?.pct_revenue || 0),
        orders_count: Number(row?.orders_count || 0),
        by_marketplace: [],
    };
}

export function toDisplayMarketplaceName(name: string): string {
    if (!name) return name;
    const n = name.toLowerCase();
    if (n === 'mercado_livre' || n === 'mercadolivre' || n === 'mercado livre') return 'Mercado Livre';
    if (n === 'amazon') return 'Amazon';
    if (n === 'shopee') return 'Shopee';
    if (n === 'magalu' || n === 'magazineluiza' || n === 'magazine luiza' || n === 'magazine_luiza') return 'Magazine Luiza';
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function slugify(display: string): string {
    return display
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]/g, '');
}

export async function fetchConnectedMarketplaces(orgId: string): Promise<ConnectedMarketplace[]> {
    const { data, error } = await (supabase as any)
        .from('marketplace_integrations')
        .select('marketplace_name')
        .eq('organizations_id', orgId);
    if (error) throw error;
    const names = (data || [])
        .map((r: any) => toDisplayMarketplaceName(String(r?.marketplace_name || '')))
        .filter(Boolean);
    const uniq = Array.from(new Set(names)) as string[];
    return uniq.map((dn) => ({ display: dn, slug: slugify(dn) }));
}

export async function fetchProductPerformance(
    orgId: string | null | undefined,
    fromISO: string,
    toISO: string,
    marketplace?: string,
): Promise<ProductPerformanceResult> {
    let oq: any = supabase
        .from('orders')
        .select('id, marketplace, created_at');
    if (orgId) oq = oq.eq('organization_id', orgId);
    if (marketplace && marketplace !== 'todos') oq = oq.eq('marketplace', marketplace);
    oq = oq.gte('created_at', fromISO).lte('created_at', toISO);
    const { data: orders, error: ordersErr } = await oq;
    if (ordersErr) throw ordersErr;

    const orderList = Array.isArray(orders) ? orders : [];
    const orderIds = Array.from(new Set(orderList.map((o: any) => o.id).filter(Boolean)));
    const marketplaceByOrderId: Record<string, string> = {};
    for (const o of orderList) {
        const id = String(o.id || '');
        if (id) marketplaceByOrderId[id] = o.marketplace || 'Outros';
    }

    if (orderIds.length === 0) {
        return { produtosData: [], anunciosData: [], productModelsByProduct: {} };
    }

    const byProduct: Record<string, { pedidosSet: Set<string>; unidades: number; valor: number; modelsSet: Set<string> }> = {};
    const byListing: Record<string, { pedidosSet: Set<string>; unidades: number; valor: number; marketplace: string; title?: string; image?: string }> = {};
    const chunkSize = 200;

    for (let i = 0; i < orderIds.length; i += chunkSize) {
        const chunk = orderIds.slice(i, i + chunkSize);
        const iq: any = supabase
            .from('order_items')
            .select('order_id, product_id, marketplace_item_id, quantity, unit_price, title, image_url')
            .in('order_id', chunk);
        const { data: itemsRows, error: itemsErr } = await iq;
        if (itemsErr) throw itemsErr;

        for (const it of (itemsRows || [])) {
            const oid = String(it?.order_id || '');
            const qn = Number(it?.quantity || 0) || 0;
            const up = Number(it?.unit_price || 0) || 0;
            const pid = String(it?.product_id || '').trim();

            if (pid) {
                if (!byProduct[pid]) byProduct[pid] = { pedidosSet: new Set(), unidades: 0, valor: 0, modelsSet: new Set() };
                const bp = byProduct[pid];
                bp.pedidosSet.add(oid);
                bp.unidades += qn;
                bp.valor += qn * up;
                const mid = String(it?.marketplace_item_id || '').trim();
                if (mid) bp.modelsSet.add(mid);
            }

            const mid = String(it?.marketplace_item_id || '').trim();
            if (mid) {
                if (!byListing[mid]) byListing[mid] = { pedidosSet: new Set(), unidades: 0, valor: 0, marketplace: marketplaceByOrderId[oid] || 'Outros' };
                const bl = byListing[mid];
                bl.pedidosSet.add(oid);
                bl.unidades += qn;
                bl.valor += qn * up;
                if (!bl.title && it?.title) bl.title = String(it.title);
                if (!bl.image && it?.image_url) bl.image = String(it.image_url);
                if (!bl.marketplace) bl.marketplace = marketplaceByOrderId[oid] || 'Outros';
            }
        }
    }

    const productIds = Object.keys(byProduct);
    const nameByProduct: Record<string, string> = {};
    if (productIds.length > 0) {
        const { data: prows } = await supabase.from('products').select('id, name').in('id', productIds);
        (prows || []).forEach((r: any) => { nameByProduct[String(r.id)] = r?.name || ''; });
    }

    const produtosData: ProductPerformanceItem[] = productIds.map((pid) => {
        const agg = byProduct[pid];
        return { id: pid, nome: nameByProduct[pid] || pid, pedidos: agg.pedidosSet.size, unidades: agg.unidades, valor: agg.valor, vinculos: agg.modelsSet.size };
    }).sort((a, b) => b.valor - a.valor);

    const productModelsByProduct: Record<string, string[]> = {};
    productIds.forEach((pid) => { productModelsByProduct[pid] = Array.from(byProduct[pid].modelsSet); });

    const anunciosData: ListingPerformanceItem[] = Object.keys(byListing).map((mid) => {
        const agg = byListing[mid];
        const unit = agg.unidades > 0 ? (agg.valor / agg.unidades) : 0;
        return { id: mid, titulo: agg.title || `Anúncio ${mid}`, marketplace: agg.marketplace, vendas: agg.unidades, valor: unit, image_url: agg.image || '' };
    }).sort((a, b) => b.vendas - a.vendas);

    return { produtosData, anunciosData, productModelsByProduct };
}
