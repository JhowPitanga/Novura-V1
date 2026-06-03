import { supabase } from "@/integrations/supabase/client";
import type { ConnectedMarketplace } from "./types";

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
