import { supabase } from "@/integrations/supabase/client";
import type { ListingDraft, MarketplaceNavItem, ShippingCaps } from "@/types/listings";
import { toSlug } from "@/utils/listingUtils";

// ─── Marketplace Integrations ──────────────────────────────────────────────

export interface ConnectedMarketplacesResult {
    navItems: MarketplaceNavItem[];
    shippingCaps: ShippingCaps | null;
    hasIntegration: boolean;
}

export async function fetchConnectedMarketplaces(orgId: string): Promise<ConnectedMarketplacesResult> {
    const { data, error } = await (supabase as any)
        .from('marketplace_integrations')
        .select('marketplace_name, drop_off, xd_drop_off, self_service')
        .eq('organizations_id', orgId);
    if (error) throw error;

    const rows = (data || []) as Array<{
        marketplace_name: string | null;
        drop_off?: boolean;
        xd_drop_off?: boolean;
        self_service?: boolean;
    }>;
    const names = Array.from(new Set(rows.map(r => String(r?.marketplace_name || '')).filter(Boolean)));
    const navItems: MarketplaceNavItem[] = names.map(dn => ({
        title: dn,
        path: toSlug(dn),
        description: `Anúncios no ${dn}`,
        displayName: dn,
    }));

    const mlRows = rows.filter(r => String(r?.marketplace_name || '').toLowerCase() === 'mercado livre');
    let shippingCaps: ShippingCaps | null = null;
    if (mlRows.length > 0) {
        const caps: ShippingCaps = {};
        mlRows.forEach(r => {
            if (r?.self_service === true) caps.flex = true;
            if (r?.xd_drop_off === true) caps.envios = true;
            if (r?.drop_off === true) caps.correios = true;
        });
        shippingCaps = (caps.flex || caps.envios || caps.correios || caps.full) ? caps : null;
    }

    return { navItems, shippingCaps, hasIntegration: names.length > 0 };
}

// ─── Listings Items ────────────────────────────────────────────────────────

export interface FetchListingsResult {
    rows: any[];
    isShopee: boolean;
}

export async function fetchListings(orgId: string, selectedDisplayName: string): Promise<FetchListingsResult> {
    const isShopee = String(selectedDisplayName).toLowerCase() === 'shopee';
    try {
        const { data, error } = isShopee
            ? await (supabase as any)
                .from('marketplace_items_raw')
                .select('*')
                .eq('organizations_id', orgId)
                .eq('marketplace_name', 'Shopee')
                .order('updated_at', { ascending: false })
                .limit(400)
            : await (supabase as any)
                .from('marketplace_items_unified')
                .select('*')
                .eq('organizations_id', orgId)
                .order('updated_at', { ascending: false })
                .limit(400);
        if (error) throw error;
        return { rows: data || [], isShopee };
    } catch {
        // Fallback to original table
        const { data, error: fallbackErr } = await (supabase as any)
            .from('marketplace_items')
            .select('*')
            .eq('organizations_id', orgId)
            .order('updated_at', { ascending: false })
            .limit(400);
        if (fallbackErr) throw fallbackErr;
        return { rows: data || [], isShopee };
    }
}

export async function deleteListingItem(orgId: string, marketplaceItemId: string): Promise<void> {
    const { error } = await (supabase as any)
        .from('marketplace_items')
        .delete()
        .eq('organizations_id', orgId)
        .eq('marketplace_item_id', marketplaceItemId);
    if (error) throw error;
}

// ─── Drafts ────────────────────────────────────────────────────────────────

export async function fetchDrafts(orgId: string): Promise<ListingDraft[]> {
    const { data, error } = await (supabase as any)
        .from('marketplace_drafts')
        .select('*')
        .eq('organizations_id', orgId)
        .order('updated_at', { ascending: false })
        .limit(200);
    if (error) throw error;
    return data || [];
}

export async function deleteDraft(orgId: string, draftId: string): Promise<void> {
    const { error } = await (supabase as any)
        .from('marketplace_drafts')
        .delete()
        .eq('id', draftId)
        .eq('organizations_id', orgId);
    if (error) throw error;
}

export async function deleteDrafts(orgId: string, draftIds: string[]): Promise<void> {
    if (!draftIds.length) return;
    const { error } = await (supabase as any)
        .from('marketplace_drafts')
        .delete()
        .eq('organizations_id', orgId)
        .in('id', draftIds);
    if (error) throw error;
}

export async function createDraftFromListing(orgId: string, itemRow: any, listingTypeId: string | null): Promise<string> {
    const idVal = String(itemRow?.marketplace_item_id || itemRow?.id);
    const picsArr = Array.isArray(itemRow?.pictures) ? itemRow.pictures : [];
    const pictureUrls: string[] = picsArr
        .map((p: any) => (typeof p === 'string' ? p : (p?.url || p?.secure_url || '')))
        .filter(Boolean);
    const attrs = Array.isArray(itemRow?.attributes) ? itemRow.attributes : [];
    const rawVars = Array.isArray(itemRow?.variations) ? itemRow.variations : [];
    const mappedVars = rawVars.map((v: any) => {
        const combos = Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : [];
        const varAttrs = Array.isArray(v?.attributes) ? v.attributes : [];
        const qty = typeof v?.available_quantity === 'number' ? v.available_quantity : 0;
        const obj: any = { attribute_combinations: combos, available_quantity: qty };
        if (typeof v?.price === 'number') obj.price = v.price;
        if (varAttrs.length > 0) obj.attributes = varAttrs;
        const skuVal = v?.seller_sku ?? v?.sku ?? null;
        if (skuVal) obj.sku = skuVal;
        const picIds = Array.isArray(v?.picture_ids) ? v.picture_ids : (v?.picture_id ? [v.picture_id] : []);
        if (picIds.length > 0) {
            const urls = picIds
                .map((pid: any) => {
                    const m = picsArr.find((p: any) => typeof p !== 'string' && String(p?.id || p?.picture_id) === String(pid));
                    return typeof m === 'string' ? m : (m?.url || m?.secure_url || '');
                })
                .filter(Boolean);
            if (urls.length > 0) obj.pictures = urls;
        }
        return obj;
    });

    const shippingRaw = (itemRow as any)?.data?.shipping || (itemRow as any)?.shipping || {};
    const dimsText = String((shippingRaw as any)?.dimensions || '');
    let dimsObj: any;
    let weightNum: number | undefined;
    if (dimsText) {
        const m = dimsText.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
        if (m) {
            dimsObj = { length: Math.round(Number(m[1])), height: Math.round(Number(m[2])), width: Math.round(Number(m[3])) };
            weightNum = Math.round(Number(m[4]));
        }
    }
    const ship: any = {};
    const modeRaw = (shippingRaw as any)?.mode ?? (shippingRaw as any)?.logistic_type ?? null;
    if (modeRaw) ship.mode = String(modeRaw);
    if (typeof (shippingRaw as any)?.local_pick_up !== 'undefined') ship.local_pick_up = !!(shippingRaw as any).local_pick_up;
    if (typeof (shippingRaw as any)?.free_shipping !== 'undefined') ship.free_shipping = !!(shippingRaw as any).free_shipping;
    if (dimsObj) ship.dimensions = dimsObj;
    if (typeof weightNum === 'number') ship.weight = weightNum;

    let descriptionText: string | undefined;
    try {
        const { data: descRow } = await (supabase as any)
            .from('marketplace_item_descriptions')
            .select('plain_text')
            .eq('organizations_id', orgId)
            .eq('marketplace_name', 'Mercado Livre')
            .eq('marketplace_item_id', idVal)
            .limit(1)
            .single();
        if (descRow && typeof (descRow as any)?.plain_text === 'string') {
            descriptionText = String((descRow as any).plain_text);
        }
    } catch {}

    const saleTerms = Array.isArray((itemRow as any)?.data?.sale_terms)
        ? (itemRow as any).data.sale_terms
        : (Array.isArray((itemRow as any)?.sale_terms) ? (itemRow as any).sale_terms : []);

    const draft = {
        organizations_id: orgId,
        marketplace_name: 'Mercado Livre',
        site_id: String((itemRow as any)?.data?.site_id || 'MLB'),
        title: itemRow?.title || null,
        category_id: itemRow?.category_id || null,
        condition: itemRow?.condition || undefined,
        attributes: attrs,
        variations: mappedVars,
        pictures: pictureUrls,
        price: typeof itemRow?.price === 'number' ? itemRow.price : (Number(itemRow?.price) || 0),
        listing_type_id: listingTypeId || null,
        shipping: ship,
        sale_terms: saleTerms,
        description: descriptionText,
        available_quantity: typeof itemRow?.available_quantity === 'number' ? itemRow.available_quantity : (Number(itemRow?.available_quantity) || 0),
        last_step: 1,
        status: 'draft',
        api_cache: {},
    };

    const { data, error } = await (supabase as any)
        .from('marketplace_drafts')
        .insert(draft)
        .select('id')
        .single();
    if (error) throw error;
    return String((data as any)?.id || '');
}

// ─── Sync ──────────────────────────────────────────────────────────────────

export async function syncAllListings(orgId: string, marketplaceDisplay: string): Promise<number> {
    const isShopee = String(marketplaceDisplay).toLowerCase() === 'shopee';
    const clientRid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

    if (isShopee) {
        const { data: result, error } = await (supabase as any).functions.invoke('shopee-sync-items', {
            body: { organizationId: orgId, page_size: 100, item_status: ['NORMAL'] },
        });
        if (error) throw error;
        return Array.isArray(result?.results)
            ? result.results.reduce((acc: number, r: any) => acc + Number(r?.updated || 0), 0)
            : 0;
    } else {
        const { data: orchestration, error } = await (supabase as any).functions.invoke('mercado-livre-orchestrate-sync', {
            body: { organizationId: orgId, clientRid },
        });
        if (error) throw error;
        return Number(orchestration?.sync?.synced ?? 0);
    }
}

export async function syncSelectedListings(orgId: string, marketplaceDisplay: string, itemIds: string[]): Promise<void> {
    const isShopee = String(marketplaceDisplay).toLowerCase() === 'shopee';
    const clientRid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

    if (isShopee) {
        const { error } = await (supabase as any).functions.invoke('shopee-sync-items', {
            body: { organizationId: orgId, item_id_list: itemIds },
        });
        if (error) throw error;
    } else {
        const { error } = await (supabase as any).functions.invoke('mercado-livre-orchestrate-sync', {
            body: { organizationId: orgId, clientRid, onlySelectedIds: itemIds },
        });
        if (error) throw error;
    }
}

export async function updateItemStatus(orgId: string, itemId: string, targetStatus: 'active' | 'paused'): Promise<void> {
    const { error } = await (supabase as any).functions.invoke('mercado-livre-update-item-status', {
        body: { organizationId: orgId, itemId, targetStatus },
    });
    if (error) throw error;
}

export async function updateShopeeStock(orgId: string, itemId: string, updates: Array<{ model_id: number; seller_stock: number }>): Promise<any> {
    const { data, error } = await (supabase as any).functions.invoke('shopee-update-stock', {
        body: { organizationId: orgId, item_id: Number(itemId), updates },
    });
    if (error) throw error;
    return data;
}
