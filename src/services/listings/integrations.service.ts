import { supabase } from "@/integrations/supabase/client";
import type { MarketplaceNavItem, ShippingCaps } from "@/types/listings";
import { toSlug } from "@/utils/listingUtils";

export interface ConnectedMarketplacesResult {
  navItems: MarketplaceNavItem[];
  shippingCaps: ShippingCaps | null;
  hasIntegration: boolean;
}

export async function fetchConnectedMarketplaces(
  orgId: string,
): Promise<ConnectedMarketplacesResult> {
  const { data, error } = await (supabase as any)
    .from("marketplace_integrations")
    .select("marketplace_name, drop_off, xd_drop_off, self_service")
    .eq("organizations_id", orgId);
  if (error) throw error;

  const rows = (data || []) as Array<{
    marketplace_name: string | null;
    drop_off?: boolean;
    xd_drop_off?: boolean;
    self_service?: boolean;
  }>;
  const names = Array.from(
    new Set(rows.map((r) => String(r?.marketplace_name || "")).filter(Boolean)),
  );
  const navItems: MarketplaceNavItem[] = names.map((dn) => ({
    title: dn,
    path: toSlug(dn),
    description: `Anúncios no ${dn}`,
    displayName: dn,
  }));

  const mlRows = rows.filter(
    (r) => String(r?.marketplace_name || "").toLowerCase() === "mercado livre",
  );
  let shippingCaps: ShippingCaps | null = null;
  if (mlRows.length > 0) {
    const caps: ShippingCaps = {};
    mlRows.forEach((r) => {
      if (r?.self_service === true) caps.flex = true;
      if (r?.xd_drop_off === true) caps.envios = true;
      if (r?.drop_off === true) caps.correios = true;
    });
    shippingCaps = caps.flex || caps.envios || caps.correios || caps.full ? caps : null;
  }

  return { navItems, shippingCaps, hasIntegration: names.length > 0 };
}

export interface MarketplaceStoreOption {
  id: string;
  store_name: string | null;
  marketplace_name: string;
}

/** Connected stores for the listings store filter (by marketplace tab). */
export async function fetchMarketplaceStores(
  orgId: string,
  marketplaceDisplayName: string,
): Promise<MarketplaceStoreOption[]> {
  const name = String(marketplaceDisplayName || "").trim();
  if (!name) return [];

  const { data, error } = await (supabase as any)
    .from("marketplace_integrations")
    .select("id, store_name, marketplace_name")
    .eq("organizations_id", orgId)
    .eq("marketplace_name", name)
    .order("store_name", { ascending: true });

  if (error) throw error;
  return (data || []) as MarketplaceStoreOption[];
}
