import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "react-day-picker";
import { marketplaceKey, normalizeMarketplace, PERF_RPC_ENABLED, toISOs } from "./shared-helpers";
import type { FinancialOverview } from "./types";

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
