import { supabase } from "@/integrations/supabase/client";
import { calendarStartOfDaySPEpochMs, calendarEndOfDaySPEpochMs } from "@/lib/datetime";

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
    toISO: string
): Promise<ProductPerformanceResult> {
    let oq: any = supabase
        .from('marketplace_orders_presented_new')
        .select('id, marketplace, created_at');
    if (orgId) oq = oq.eq('organizations_id', orgId);
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
            .from('marketplace_order_items')
            .select('id, linked_products, model_id_externo, quantity, unit_price, item_name, image_url')
            .in('id', chunk);
        const { data: itemsRows, error: itemsErr } = await iq;
        if (itemsErr) throw itemsErr;

        for (const it of (itemsRows || [])) {
            const oid = String(it?.id || '');
            const qn = Number(it?.quantity || 0) || 0;
            const up = Number(it?.unit_price || 0) || 0;
            const pid = String(it?.linked_products || '').trim();

            if (pid) {
                if (!byProduct[pid]) byProduct[pid] = { pedidosSet: new Set(), unidades: 0, valor: 0, modelsSet: new Set() };
                const bp = byProduct[pid];
                bp.pedidosSet.add(oid);
                bp.unidades += qn;
                bp.valor += qn * up;
                const mid = String(it?.model_id_externo || '').trim();
                if (mid) bp.modelsSet.add(mid);
            }

            const mid = String(it?.model_id_externo || '').trim();
            if (mid) {
                if (!byListing[mid]) byListing[mid] = { pedidosSet: new Set(), unidades: 0, valor: 0, marketplace: marketplaceByOrderId[oid] || 'Outros' };
                const bl = byListing[mid];
                bl.pedidosSet.add(oid);
                bl.unidades += qn;
                bl.valor += qn * up;
                if (!bl.title && it?.item_name) bl.title = String(it.item_name);
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
