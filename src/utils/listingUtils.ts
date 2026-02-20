import type { ListingItem, ShippingCaps } from "@/types/listings";

// ─── Quality Helpers ───────────────────────────────────────────────────────

export function getQualityStrokeColor(level?: any): string {
    if (typeof level === 'number') {
        if (level === 1) return '#EF4444';
        if (level === 2) return '#F59E0B';
        if (level === 3) return '#7C3AED';
        return '#6B7280';
    }
    const s = String(level || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (s === '1' || s.includes('bas') || s === 'to_be_improved') return '#EF4444';
    if (s === '2' || s.includes('satis') || s === 'qualified') return '#F59E0B';
    if (s === '3' || s.includes('prof') || s === 'excellent') return '#7C3AED';
    return '#6B7280';
}

export function getQualityLabel(level?: any): string {
    if (typeof level === 'number') {
        if (level === 1) return 'Precisa de Melhoria';
        if (level === 2) return 'Qualificado';
        if (level === 3) return 'Excelente';
    }
    const s = String(level || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (s === '1' || s.includes('bas') || s === 'to_be_improved') return 'Precisa de Melhoria';
    if (s === '2' || s.includes('satis') || s === 'qualified') return 'Qualificado';
    if (s === '3' || s.includes('prof') || s === 'excellent') return 'Excelente';
    return '';
}

// ─── Translation Helpers ───────────────────────────────────────────────────

export function translateSuggestion(text: string): string {
    const s = String(text || '').trim();
    const l = s.toLowerCase();
    const mImg = l.match(/add at least\s*(\d+)\s*images/);
    if (mImg) return `Adicionar pelo menos ${mImg[1]} imagens`;
    const mAttr = l.match(/add at least\s*(\d+)\s*attributes/);
    if (mAttr) return `Adicionar pelo menos ${mAttr[1]} atributos`;
    if (l.includes('add brand info')) return 'Adicionar informações de marca';
    if (l.includes('adopt suggested category')) return 'Adotar categoria sugerida';
    if (l.includes('add size chart')) return 'Adicionar tabela de medidas';
    if (l.includes('adopt the color or size variation')) return 'Adotar variações de cor ou tamanho';
    if (l.includes('add at least 100 characters or 1 image for desc')) return 'Adicionar ao menos 100 caracteres ou 1 imagem na descrição';
    if (l.includes('add characters for name to 25~100')) return 'Ajustar nome para 25 a 100 caracteres';
    if (l.includes('adopt suggested weight')) return 'Adotar peso sugerido';
    if (l.includes('add video')) return 'Adicionar vídeo';
    const tokens: Record<string, string> = {
        'add ': 'Adicionar ',
        'adopt ': 'Adotar ',
        'brand': 'marca',
        'info': 'informações',
        'category': 'categoria',
        'color': 'cor',
        'size': 'tamanho',
        'variation': 'variação',
        'weight': 'peso',
        'images': 'imagens',
        'attributes': 'atributos',
        'video': 'vídeo',
        'desc': 'descrição',
        'characters': 'caracteres',
        'name': 'nome',
        'chart': 'tabela',
    };
    let out = s;
    Object.keys(tokens).forEach(k => { out = out.replace(new RegExp(k, 'ig'), tokens[k]); });
    return out;
}

export function getImprovementSuggestions(pd: any): string[] {
    const tasks = Array.isArray(pd?.unfinished_task) ? pd.unfinished_task : [];
    return tasks
        .map((t: any) => translateSuggestion(String(t?.suggestion || '')))
        .filter((x: string) => x && x.trim().length > 0);
}

export function translatePauseReason(reason: string | null | undefined): string {
    const r = String(reason || '').toLowerCase();
    if (!r) return 'Pausado pelo seller';
    if (r.includes('out_of_stock') || r.includes('no_stock') || r.includes('stock')) return 'Sem estoque';
    if (r.includes('under_review') || r.includes('review')) return 'Em análise';
    if (r.includes('waiting') || r.includes('payment')) return 'Pagamento pendente';
    if (r.includes('dispute')) return 'Em disputa';
    if (r.includes('violation') || r.includes('policy')) return 'Violação de política';
    if (r.includes('claim')) return 'Reclamações';
    if (r.includes('expired') || r.includes('out_of_date')) return 'Expirado';
    if (r.includes('closed_by_user') || r.includes('closed')) return 'Fechado pelo vendedor';
    if (r.includes('inactive')) return 'Inativo';
    return 'Pausado pelo seller';
}

// ─── Display Helpers ───────────────────────────────────────────────────────

/** Converts marketplace display name to a URL path segment */
export function toSlug(displayName: string): string {
    return '/' + displayName
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
}

export function toPublicationLabel(listingTypeId?: string | null): string | null {
    const s = String(listingTypeId || '').toLowerCase();
    if (!s) return null;
    if (s.includes('gold_pro') || s.includes('pro')) return 'Premium';
    if (s.includes('gold_special') || s.includes('gold') || s === 'silver') return 'Clássico';
    if (s === 'free') return 'Grátis';
    return 'Outro';
}

/** Splits title into two display lines of max 30 chars each */
export function getTitleLines(full: string): { line1: string; line2: string } {
    const title = String(full || '').slice(0, 60).trim();
    if (title.length <= 30) return { line1: title, line2: '' };
    const firstPart = title.slice(0, 30);
    const lastSpace = firstPart.lastIndexOf(' ');
    const cut = lastSpace > 15 ? lastSpace : 30;
    return {
        line1: title.slice(0, cut).trim(),
        line2: title.slice(cut).trim().slice(0, 30),
    };
}

export function extractCostsFromListingPrices(lp: any): { currency: string; commission: number; shippingCost: number; tax: number; total: number } | null {
    try {
        if (!lp) return null;
        const entry = Array.isArray(lp?.prices) ? lp.prices[0] : lp;
        const currency = entry?.currency_id || entry?.sale_fee?.currency_id || 'BRL';
        const commission = typeof entry?.sale_fee?.amount === 'number'
            ? entry.sale_fee.amount
            : (typeof entry?.sale_fee_amount === 'number' ? entry.sale_fee_amount
            : (typeof entry?.application_fee?.amount === 'number' ? entry.application_fee.amount : 0));
        const shippingCost = typeof entry?.shipping_cost?.amount === 'number'
            ? entry.shipping_cost.amount
            : (typeof entry?.logistics?.shipping_cost === 'number' ? entry.logistics.shipping_cost : 0);
        const tax = typeof entry?.taxes?.amount === 'number' ? entry.taxes.amount : 0;
        const total = [commission || 0, shippingCost || 0, tax || 0].reduce((a, b) => a + b, 0);
        return { currency: String(currency || 'BRL'), commission: commission || 0, shippingCost: shippingCost || 0, tax: tax || 0, total };
    } catch {
        return null;
    }
}

export function extractSaleFeeDetails(lp: any): { currency: string; percentage: number | null; fixedFee: number | null; grossAmount: number | null } | null {
    try {
        if (!lp) return null;
        const entry = Array.isArray(lp?.prices) ? (lp.prices.find((p: any) => p?.sale_fee_details) || lp.prices[0]) : lp;
        const currency = entry?.currency_id || entry?.sale_fee?.currency_id || 'BRL';
        const details = entry?.sale_fee_details || entry?.sale_fee?.details || {};
        const percentage = typeof details?.percentage_fee === 'number' ? details.percentage_fee
            : (typeof details?.percentage === 'number' ? details.percentage : null);
        const fixedFee = typeof details?.fixed_fee === 'number' ? details.fixed_fee
            : (typeof details?.fixed_amount === 'number' ? details.fixed_amount
            : (typeof details?.fixed_fee?.amount === 'number' ? details.fixed_fee.amount : null));
        const grossAmount = typeof details?.gross_amount === 'number' ? details.gross_amount
            : (typeof details?.total === 'number' ? details.total
            : (typeof entry?.sale_fee?.amount === 'number' ? entry.sale_fee.amount : null));
        if (percentage == null && fixedFee == null && grossAmount == null) return null;
        return { currency: String(currency || 'BRL'), percentage, fixedFee, grossAmount };
    } catch {
        return null;
    }
}

export function extractPerformanceHints(pd: any, ad: any): string[] {
    const hints: string[] = [];
    try {
        if (pd && Array.isArray(pd?.missing_fields) && pd.missing_fields.length) {
            hints.push(`Preencher campos: ${pd.missing_fields.join(', ')}`);
        }
        const recs = Array.isArray(pd?.recommendations) ? pd.recommendations : [];
        recs.slice(0, 3).forEach((r: any) => {
            const t = typeof r === 'string' ? r : (r?.text || r?.title || r?.message || '');
            if (t) hints.push(t);
        });
        const actions = Array.isArray(pd?.actions) ? pd.actions : [];
        actions.slice(0, 3).forEach((a: any) => {
            const t = typeof a === 'string' ? a : (a?.text || a?.title || a?.message || '');
            if (t) hints.push(t);
        });
    } catch {}
    try {
        const titleLen = Number(ad?.titleLength) || 0;
        const pictures = Number(ad?.pictureCount) || 0;
        const hasVideo = !!ad?.hasVideo;
        const attrs = Number(ad?.attributeCount) || 0;
        const descLen = Number(ad?.descriptionLength) || 0;
        const freeShip = !!ad?.freeShipping;
        const qualityLevel = String(ad?.qualityLevel || '').toLowerCase();
        const quality = Number(ad?.quality) || 0;
        if (titleLen && titleLen < 45) hints.push('Aumente o título com palavras-chave e atributos.');
        if (pictures < 3) hints.push('Adicione mais fotos (mínimo 3) com diferentes ângulos.');
        if (!hasVideo) hints.push('Inclua um vídeo curto demonstrando o produto.');
        if (attrs < 4) hints.push('Preencha atributos importantes (cor, tamanho, marca, etc.).');
        if (!freeShip) hints.push('Considere oferecer frete grátis para aumentar conversão.');
        if (descLen < 200) hints.push('Amplie a descrição com benefícios e especificações.');
        if (quality < 80 || qualityLevel.includes('bás') || qualityLevel.includes('satis')) {
            hints.push('Siga as recomendações do ML para alcançar nível profissional.');
        }
    } catch {}
    return Array.from(new Set(hints.filter(Boolean))).slice(0, 5);
}

// ─── Variation Formatting ──────────────────────────────────────────────────

export interface VariationItem {
    id: string | number;
    sku: string;
    available_quantity: number;
    seller_stock_total: number;
    types: Array<{ name: string; value: string }>;
    price: number;
    current_price?: number;
    original_price?: number;
    image: string;
}

export function formatVariationData(variations: any[], itemRow?: any): VariationItem[] {
    if (!Array.isArray(variations) || variations.length === 0) return [];
    const picsArr = Array.isArray(itemRow?.pictures) ? itemRow.pictures : [];
    const fallbackImage = picsArr.length > 0
        ? (typeof picsArr[0] === 'string' ? picsArr[0] : (picsArr[0]?.url || "/placeholder.svg"))
        : (itemRow?.thumbnail || "/placeholder.svg");

    return variations.map((variation, index) => {
        const attributes = Array.isArray(variation.attribute_combinations) ? variation.attribute_combinations : [];
        const types = attributes.length > 0
            ? attributes.map((attr: any) => ({ name: attr.name || attr.id || 'Tipo', value: attr.value_name || attr.value || 'N/A' }))
            : (() => {
                const vname = String(variation?.model_name || variation?.name || '').trim();
                return vname ? [{ name: 'Variação', value: vname }] : [];
              })();

        let imageUrl: string | null = null;
        const pictureIds = Array.isArray(variation?.picture_ids) ? variation.picture_ids : (variation?.picture_id ? [variation.picture_id] : []);
        if (pictureIds.length > 0) {
            const pid = pictureIds[0];
            const match = picsArr.find((p: any) => typeof p !== 'string' && String(p?.id || p?.picture_id) === String(pid));
            imageUrl = typeof match === 'string' ? match : (match?.url || match?.secure_url || null);
        }
        if (!imageUrl) imageUrl = fallbackImage;

        const pi0 = Array.isArray((variation as any)?.price_info) ? (variation as any).price_info[0] : null;
        const cpCandidate = Number(pi0?.current_price ?? pi0?.inflated_price_of_current_price ?? (variation as any)?.current_price ?? NaN);
        const opCandidate = Number(pi0?.original_price ?? pi0?.inflated_price_of_original_price ?? (variation as any)?.original_price ?? NaN);
        const cp = Number.isFinite(cpCandidate) ? cpCandidate : undefined;
        const op = Number.isFinite(opCandidate) ? opCandidate : undefined;
        const priceFallback = typeof (variation as any)?.price === 'number' ? (variation as any).price : undefined;

        const availSummary = Number((variation as any)?.stock_info_v2?.summary_info?.total_available_stock ?? NaN);
        const availableQty = Number.isFinite(availSummary) ? availSummary : (Number((variation as any)?.available_quantity) || 0);

        let sellerTotal: number | null = null;
        const sellerInfoList = Array.isArray((variation as any)?.stock_info_v2?.seller_stock) ? (variation as any).stock_info_v2.seller_stock : null;
        if (sellerInfoList) {
            sellerTotal = sellerInfoList.reduce((acc: number, it: any) => acc + (Number(it?.stock || 0) || 0), 0);
        }
        const sellerStockRaw = (variation as any)?.seller_stock;
        if (typeof sellerStockRaw === 'number' && Number.isFinite(sellerStockRaw)) {
            sellerTotal = Number(sellerStockRaw);
        } else if (Array.isArray(sellerStockRaw)) {
            sellerTotal = sellerStockRaw.reduce((acc: number, it: any) => {
                const val = typeof it === 'number' ? it : Number(it?.stock || 0);
                return acc + (Number.isFinite(val) ? val : 0);
            }, 0);
        } else if (typeof (variation as any)?.stock === 'object' && (variation as any).stock) {
            const s = (variation as any).stock;
            if (typeof s?.seller_stock === 'number' && Number.isFinite(s?.seller_stock)) sellerTotal = Number(s.seller_stock);
            else if (Array.isArray(s?.seller_stock)) sellerTotal = s.seller_stock.reduce((acc: number, it: any) => acc + (Number(it?.stock || 0) || 0), 0);
            else if (Array.isArray(s?.seller_stock_list)) sellerTotal = s.seller_stock_list.reduce((acc: number, it: any) => acc + (Number(it?.stock || 0) || 0), 0);
        }

        return {
            id: variation.model_id || variation.id || `var-${index}`,
            sku: variation.model_sku || variation.seller_sku || variation.sku || 'N/A',
            available_quantity: availableQty,
            seller_stock_total: Number.isFinite(Number(sellerTotal)) ? Number(sellerTotal) : availableQty,
            types,
            price: cp ?? op ?? priceFallback ?? 0,
            current_price: cp ?? priceFallback,
            original_price: op,
            image: imageUrl || fallbackImage,
        };
    });
}

// ─── Shipping Tag Normalization ────────────────────────────────────────────

function normalizeShippingTag(tag: string): string {
    const t = String(tag || '').toLowerCase();
    if (t.includes('full')) return 'full';
    if (t.includes('flex')) return 'flex';
    if (t.includes('correios') || t.includes('drop_off')) return 'correios';
    if (t.includes('envios') || t.includes('xd_drop_off') || t.includes('cross_docking') || t.includes('me2') || t.includes('custom')) return 'envios';
    if (t.includes('no_shipping')) return 'no_shipping';
    return t;
}

const IGNORED_SHIPPING_TAGS = new Set(['mandatory_free_shipping', 'self_service_available', 'self_service_out']);

function resolveShippingTags(row: any, shippingCaps: ShippingCaps | null): string[] {
    let tags: string[] = [];

    // Capability flags embedded in the unified view
    if ((row as any)?.cap_full) tags.push('full');
    if ((row as any)?.cap_flex) tags.push('flex');
    if ((row as any)?.cap_envios) tags.push('envios');
    if ((row as any)?.cap_correios) tags.push('correios');
    tags = Array.from(new Set(tags));

    const shippingInfo = (row as any)?.data?.shipping || (row as any)?.shipping;
    const logisticType = String([
        shippingInfo?.logistic_type,
        shippingInfo?.mode,
        (row as any)?.logistic_type,
        (row as any)?.shipping_logistic_type,
        (row as any)?.data?.shipping?.logistic_type,
        (row as any)?.data?.shipping?.logistic?.type,
        (row as any)?.shipping?.logistic?.type,
    ].find((v: any) => v && String(v).trim().length > 0) || '').toLowerCase();

    // Parse raw shipping tags
    const rawTagsSource = Array.isArray(shippingInfo?.tags)
        ? shippingInfo.tags
        : (Array.isArray((row as any)?.data?.shipping?.tags)
            ? (row as any)?.data?.shipping?.tags
            : (Array.isArray((row as any)?.shipping?.tags) ? (row as any)?.shipping?.tags : []));
    const rawTags: string[] = (rawTagsSource as any[]).map((t: any) => String(t || '').toLowerCase());
    const tagSet = new Set<string>(tags);
    if (rawTags.includes('self_service_in')) tagSet.add('flex');
    if (rawTags.includes('self_service_out') && logisticType !== 'self_service') tagSet.delete('flex');
    tags = Array.from(tagSet);

    // Normalize and filter
    tags = Array.from(new Set(tags.map(normalizeShippingTag)));
    tags = tags.filter(t => !IGNORED_SHIPPING_TAGS.has(t));

    // Filter by seller capabilities
    if (shippingCaps) {
        const has = (v?: boolean) => v === undefined || v === true;
        tags = tags.filter(t => {
            if (t === 'full') return has(shippingCaps.full);
            if (t === 'flex') return has(shippingCaps.flex);
            if (t === 'envios') return has(shippingCaps.envios);
            if (t === 'correios') return has(shippingCaps.correios);
            return true;
        });
    }

    return tags;
}

// ─── Main Row Parser ───────────────────────────────────────────────────────

interface ParseListingRowContext {
    metricsByItemId: Record<string, { quality_level?: string | null; performance_data?: any }>;
    listingTypeByItemId: Record<string, string | null>;
    shippingTypesByItemId: Record<string, string[]>;
    listingPricesByItemId: Record<string, any>;
    shippingCaps: ShippingCaps | null;
}

/** Transform a raw DB row into an enriched ListingItem for display. */
export function parseListingRow(row: any, ctx: ParseListingRowContext): ListingItem {
    const idVal = String(row?.marketplace_item_id || row?.id || '');
    const mktLower = String(row?.marketplace_name || '').toLowerCase();

    // Image
    const pics = Array.isArray(row?.pictures) ? row.pictures : [];
    const firstPic = pics.length > 0
        ? (typeof pics[0] === 'string' ? pics[0] : (pics[0]?.url || "/placeholder.svg"))
        : (row?.thumbnail || "/placeholder.svg");

    // SKU
    let derivedSku = row?.sku || "";
    if (!derivedSku && Array.isArray(row?.variations) && row.variations.length > 0) {
        const bySellerSku = row.variations.find((v: any) => v?.seller_sku);
        if (bySellerSku?.seller_sku) {
            derivedSku = bySellerSku.seller_sku;
        } else {
            const withAttr = row.variations.find((v: any) => Array.isArray(v?.attribute_combinations));
            const skuAttr = withAttr?.attribute_combinations?.find((a: any) => a?.id === 'SELLER_SKU' || a?.name?.toUpperCase() === 'SKU');
            if (skuAttr?.value_name) derivedSku = skuAttr.value_name;
        }
    }

    // Price
    const priceNum = typeof row?.price === 'number' ? row.price : (Number(row?.price) || 0);
    let originalPrice: number | null = null;
    let promoPrice: number | null = null;
    if (mktLower === 'shopee') {
        const pp = typeof (row as any)?.promotion_price === 'number' ? (row as any).promotion_price : null;
        promoPrice = pp;
        originalPrice = pp != null ? priceNum : null;
    } else {
        const op = Number((row as any)?.original_price) || null;
        const hasPromo = !!op && op > priceNum;
        originalPrice = hasPromo ? op : null;
        promoPrice = hasPromo ? priceNum : null;
    }

    // Shipping tags
    let shippingTags = resolveShippingTags(row, ctx.shippingCaps);
    if (mktLower === 'shopee') {
        const st = ctx.shippingTypesByItemId[idVal] || [];
        if (Array.isArray(st) && st.length) {
            shippingTags = Array.from(new Set(st));
        }
    }

    // Publication type
    const listingTypeIdForItem = ctx.listingTypeByItemId[idVal] || null;
    const publicationTypeLabel = toPublicationLabel(listingTypeIdForItem);

    // Publication costs
    const publicationCosts = {
        currency: String((row as any)?.publication_currency || 'BRL'),
        commission: Number((row as any)?.total_fare || 0),
        shippingCost: Number((row as any)?.publication_shipping_cost || 0),
        tax: 0,
        total: Number((row as any)?.total_fare || 0) + Number((row as any)?.publication_shipping_cost || 0),
    };
    const publicationFeeDetails = {
        currency: String((row as any)?.publication_currency || 'BRL'),
        percentage: (row as any)?.percentage_fee ?? null,
        fixedFee: (row as any)?.fixed_fee ?? null,
        grossAmount: (row as any)?.gross_amount ?? null,
    };

    // Quality
    const metricsForItem = ctx.metricsByItemId[idVal] || {};
    const pd = metricsForItem?.performance_data;
    let qualityPercent = 0;
    let persistedLevel = row?.quality_level ?? metricsForItem?.quality_level ?? null;

    if (mktLower === 'shopee') {
        const rawLevel = pd?.quality_level ?? persistedLevel ?? null;
        const numLevel = typeof rawLevel === 'number' ? rawLevel : Number(rawLevel);
        persistedLevel = Number.isFinite(numLevel) ? numLevel : null;
        qualityPercent = numLevel === 1 ? 50 : (numLevel === 2 ? 76 : (numLevel === 3 ? 100 : 0));
    } else {
        const scoreRaw = pd && !isNaN(Number(pd?.score)) ? Number(pd.score) : null;
        const rawCandidates = [scoreRaw, pd?.quality_score, pd?.listing_quality_percentage, pd?.listing_quality, row?.listing_quality, row?.quality_score];
        for (const v of rawCandidates) {
            const num = Number(v);
            if (!isNaN(num) && num >= 0) {
                qualityPercent = num <= 1 ? num * 100 : num;
                break;
            }
        }
        qualityPercent = Math.max(0, Math.min(100, qualityPercent));
    }

    // Pause reason
    let pauseReason: string | null = null;
    const dataRaw: any = row?.data;
    if (dataRaw && dataRaw.sub_status !== undefined && mktLower !== 'shopee') {
        const first = Array.isArray(dataRaw.sub_status) ? dataRaw.sub_status[0] : dataRaw.sub_status;
        pauseReason = translatePauseReason(String(first));
    } else if (Array.isArray(row?.tags)) {
        const tag = (row.tags as any[]).find(t => {
            const s = String(t || '').toLowerCase();
            return s.includes('paused') || s.includes('under_review') || s.includes('out_of_stock');
        });
        if (tag) pauseReason = translatePauseReason(String(tag));
    }

    // Metrics
    let visitsVal = Number(row?.visits_total ?? row?.visits ?? 0);
    let salesVal = Number(row?.sold_quantity ?? 0);
    let likesVal = 0;
    let stockVal = Number(row?.available_quantity ?? 0);

    if (mktLower === 'shopee') {
        const ip = (row as any)?.item_perfomance || {};
        visitsVal = Number(ip?.views || 0);
        salesVal = Number(ip?.sale || 0);
        likesVal = Number(ip?.liked_count || ip?.like_count || ip?.likes || 0);
        if (Array.isArray(row?.variations) && row.variations.length > 0) {
            stockVal = row.variations.reduce((acc: number, v: any) => {
                const sellerInfoList = Array.isArray((v as any)?.stock_info_v2?.seller_stock) ? (v as any).stock_info_v2.seller_stock : null;
                if (sellerInfoList) return acc + sellerInfoList.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0);
                const raw = (v as any)?.seller_stock;
                if (typeof raw === 'number' && Number.isFinite(raw)) return acc + Number(raw);
                if (Array.isArray(raw)) return acc + raw.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0);
                if (typeof (v as any)?.stock === 'object' && (v as any)?.stock) {
                    const sv = (v as any).stock;
                    if (typeof sv?.seller_stock === 'number') return acc + Number(sv.seller_stock);
                    if (Array.isArray(sv?.seller_stock)) return acc + sv.seller_stock.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0);
                    if (Array.isArray(sv?.seller_stock_list)) return acc + sv.seller_stock_list.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0);
                }
                const availSummary = Number((v as any)?.stock_info_v2?.summary_info?.total_available_stock ?? NaN);
                return acc + (Number.isFinite(availSummary) ? availSummary : (Number((v as any)?.available_quantity) || 0));
            }, 0);
        }
    }

    return {
        id: idVal,
        title: row?.title || "Sem título",
        sku: derivedSku,
        marketplace: String(row?.marketplace_name || "Mercado Livre"),
        price: priceNum,
        originalPrice,
        promoPrice,
        status: row?.status || "",
        visits: visitsVal,
        questions: Number(row?.questions_total ?? row?.questions ?? 0),
        sales: salesVal,
        likes: likesVal,
        stock: stockVal,
        marketplaceId: row?.marketplace_item_id || "",
        image: firstPic || "/placeholder.svg",
        shippingTags,
        quality: Math.round(qualityPercent),
        qualityLevel: persistedLevel,
        performanceData: pd,
        conversion: visitsVal > 0 ? (salesVal / visitsVal) * 100 : 0,
        pauseReason,
        publicationType: publicationTypeLabel,
        publicationCosts,
        publicationFeeDetails,
        permalink: row?.permalink || null,
    };
}
