import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/types/orders";
import { computeOrderFinancialBreakdown, type OrderFinancialBreakdown } from "@/utils/orderFinancialBreakdown";

function marketplaceKey(v: string): string {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

async function fetchCmvFromProducts(order: Order): Promise<number | null> {
  try {
    let links: Array<{ product_id?: string; sku?: string }> = [];
    const raw = order.linkedProducts;
    if (Array.isArray(raw)) {
      links = raw as Array<{ product_id?: string; sku?: string }>;
    }

    const ids = Array.from(new Set(links.map((e) => String(e?.product_id || "")).filter(Boolean)));
    const skus = Array.from(new Set(links.map((e) => String(e?.sku || "")).filter(Boolean)));

    let products: Array<{ cost_price?: number | null }> = [];
    if (ids.length > 0) {
      const { data } = await (supabase as any).from("products").select("id, cost_price").in("id", ids);
      if (Array.isArray(data)) products = data;
    }
    if (!products.length && skus.length > 0) {
      const { data } = await (supabase as any).from("products").select("id, cost_price, sku").in("sku", skus);
      if (Array.isArray(data)) products = data;
    }

    if (!products.length) return null;

    const costs = products
      .map((p) => (typeof p?.cost_price === "number" ? p.cost_price : Number(p?.cost_price) || 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!costs.length) return null;

    const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
    const qty =
      Number(order.totalQuantity) ||
      (Array.isArray(order.items) ? order.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0) : 1);
    return avg * qty;
  } catch {
    return null;
  }
}

async function fetchTaxRateForMarketplace(orgId: string, marketplace: string): Promise<number> {
  try {
    const { data: integrations } = await (supabase as any)
      .from("marketplace_integrations")
      .select("marketplace_name, company_id")
      .eq("organizations_id", orgId)
      .is("deactivated_at", null);

    const key = marketplaceKey(marketplace);
    const match = (integrations || []).find(
      (row: { marketplace_name?: string }) => marketplaceKey(String(row?.marketplace_name || "")) === key,
    );
    const companyId = String(match?.company_id || "");
    if (!companyId) return 0;

    const { data: company } = await (supabase as any)
      .from("companies")
      .select("imposto_pago")
      .eq("id", companyId)
      .maybeSingle();

    return Number(company?.imposto_pago || 0);
  } catch {
    return 0;
  }
}

export function useOrderDrawerFinance(order: Order | null, orgId: string | null | undefined) {
  const [cmvLinked, setCmvLinked] = useState<number | null>(null);
  const [taxRatePct, setTaxRatePct] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!order) {
      setCmvLinked(null);
      setTaxRatePct(0);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const [cmv, tax] = await Promise.all([
        fetchCmvFromProducts(order),
        orgId ? fetchTaxRateForMarketplace(orgId, order.marketplace) : Promise.resolve(0),
      ]);
      if (!cancelled) {
        setCmvLinked(cmv);
        setTaxRatePct(tax);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order, orgId]);

  const breakdown: OrderFinancialBreakdown | null = useMemo(() => {
    if (!order) return null;
    return computeOrderFinancialBreakdown(order, { cmvLinked, taxRatePct });
  }, [order, cmvLinked, taxRatePct]);

  return { breakdown, cmvLinked, taxRatePct, loading };
}
