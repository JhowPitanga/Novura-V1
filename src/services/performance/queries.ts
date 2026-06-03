import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "react-day-picker";
import {
    marketplaceKey,
    normalizeImageUrl,
    normalizeMarketplace,
    toISOs,
    type ScopedItem,
    type ScopedOrder,
} from "./shared-helpers";

export async function fetchScopedOrders(
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
export async function fetchOrgTaxRates(orgId: string): Promise<Record<string, number>> {
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

export async function fetchScopedItems(orderIds: string[]): Promise<ScopedItem[]> {
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

export async function fetchProductDetails(productIds: string[]): Promise<Record<string, { name: string; sku: string; image_url: string }>> {
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
