// Mercado Livre → canonical listing adapter.
// Transforms a raw Mercado Livre item payload into NormalizedListing.

import type {
  AdapterContext,
  CanonicalAttribute,
  CanonicalFees,
  CanonicalListing,
  CanonicalMetrics,
  CanonicalPicture,
  CanonicalQuality,
  CanonicalShipping,
  CanonicalVariation,
  ListingAdapter,
  NormalizedListing,
} from './types.ts';
import { mapMercadoLivreStatus } from './shared/statusMapping.ts';
import {
  mapMercadoLivreLogistic,
  mergeMercadoLivreLogisticTypes,
} from './shared/logisticMapping.ts';
import { mapMercadoLivreQuality } from './shared/qualityMapping.ts';
import { parseMercadoLivreDimensions, parseMercadoLivrePackage } from './shared/dimensionsParse.ts';
import { resolveCanonicalFees } from './shared/feesResolve.ts';
import { normalizeMlPictureEntries } from './prepareAdapterPayload.ts';
import {
  encodePictureIdsAttr,
  mlVariationPictureIds,
  resolveMlVariationImageUrl,
} from './variationAttrs.ts';

// ---------------------------------------------------------------------------
// Helper types for the raw Mercado Livre payload
// ---------------------------------------------------------------------------

interface MlItem {
  id?: string;
  title?: string;
  price?: number;
  base_price?: number;
  currency_id?: string;
  status?: string;
  sub_status?: string[];
  available_quantity?: number;
  sold_quantity?: number;
  listing_type_id?: string;
  catalog_listing?: boolean;
  catalog_product_id?: string;
  category_id?: string;
  permalink?: string;
  pictures?: Array<{ id?: string; url?: string; secure_url?: string }>;
  video_id?: string;
  variations?: MlVariation[];
  attributes?: MlAttribute[];
  shipping?: MlShipping;
  seller_custom_field?: string;
  date_created?: string;
  last_updated?: string;
  tags?: string[];
  condition?: string;
  sale_terms?: Array<{ id: string; value_name?: string }>;
}

interface MlVariation {
  id?: number | string;
  seller_custom_field?: string;
  price?: number;
  original_price?: number;
  available_quantity?: number;
  sold_quantity?: number;
  picture_ids?: string[];
  attribute_combinations?: Array<{
    id?: string;
    name?: string;
    value_id?: string;
    value_name?: string;
  }>;
}

interface MlAttribute {
  id?: string;
  name?: string;
  value_id?: string;
  value_name?: string;
  value_struct?: unknown;
  attribute_group_id?: string;
  tags?: Record<string, unknown>;
}

interface MlShipping {
  logistic_type?: string;
  shipping_mode?: string;
  free_shipping?: boolean;
  free_methods?: unknown[];
  tags?: string[];
  dimensions?: string;
  local_pick_up?: boolean;
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

function normalizeMLItem(payload: unknown, ctx: AdapterContext): NormalizedListing {
  const extra = ctx.extra;
  const raw = payload as Record<string, unknown>;

  // The item may be directly in raw or nested under raw.data
  const item: MlItem =
    (raw['data'] as MlItem) ?? (raw as unknown as MlItem);

  const itemId: string = String(item.id ?? raw['marketplace_item_id'] ?? '');

  const mlPictures =
    Array.isArray(item.pictures) && item.pictures.length > 0
      ? item.pictures
      : Array.isArray(raw.pictures)
        ? normalizeMlPictureEntries(raw.pictures)
        : [];

  // -------------------------------------------------------------------------
  // Listing core
  // -------------------------------------------------------------------------
  const sku =
    item.seller_custom_field ??
    item.attributes?.find((a) => a.id === 'SELLER_SKU')?.value_name ??
    null;

  const thumbnail =
    mlPictures[0]?.secure_url ??
    mlPictures[0]?.url ??
    null;

  const listing: CanonicalListing = {
    marketplace_name: 'Mercado Livre',
    marketplace_item_id: itemId,
    title: item.title ?? '',
    sku,
    category_id: item.category_id ?? null,
    category_path: null,
    permalink: item.permalink ?? null,
    thumbnail_url: thumbnail,
    has_variations:
      (Array.isArray(item.variations) && item.variations.length > 0) ||
      (Array.isArray(raw.variations) && (raw.variations as unknown[]).length > 0),
    condition: normalizeCondition(item.condition),

    status: mapMercadoLivreStatus(item.status),
    status_raw: item.status ?? '',
    sub_status: Array.isArray(item.sub_status) ? item.sub_status : [],
    pause_reason: item.sale_terms?.find((t) => t.id === 'PAUSE_REASON')?.value_name ?? null,

    price: item.price ?? null,
    original_price: item.base_price ?? null,
    promo_price: null,
    currency: item.currency_id ?? 'BRL',

    available_quantity: item.available_quantity ?? 0,
    sold_quantity: item.sold_quantity ?? 0,

    listing_type_id: item.listing_type_id ?? null,
    catalog_listing: item.catalog_listing ?? null,
    catalog_product_id: item.catalog_product_id ?? null,

    marketplace_created_at: raw['date_created'] as string ?? item.date_created ?? null,
    marketplace_updated_at: raw['last_updated'] as string ?? item.last_updated ?? null,
  };

  // -------------------------------------------------------------------------
  // Variations
  // -------------------------------------------------------------------------
  const rawVariations = item.variations ?? [];
  const variations: CanonicalVariation[] = rawVariations.map((v, i) => {
    const vRec = v as MlVariation & Record<string, unknown>;
    const pictureIds = mlVariationPictureIds(vRec);
    const combos = (v.attribute_combinations ?? []).map((ac) => ({
      id: ac.id ?? '',
      name: ac.name ?? '',
      value_id: ac.value_id,
      value_name: ac.value_name,
    }));
    return {
      variation_id: String(v.id ?? i),
      sku: v.seller_custom_field ?? null,
      price: v.price ?? null,
      original_price: v.original_price ?? null,
      promo_price: null,
      available_quantity: v.available_quantity ?? 0,
      sold_quantity: v.sold_quantity ?? 0,
      image_url: resolveMlVariationImageUrl(pictureIds, mlPictures),
      attributes: [...combos, ...encodePictureIdsAttr(pictureIds)],
      primary_for_listing: i === 0,
    };
  });

  // -------------------------------------------------------------------------
  // Pictures
  // -------------------------------------------------------------------------
  const pictures: CanonicalPicture[] = mlPictures.map((p, idx) => ({
    external_picture_id: p.id ?? null,
    url: p.url ?? '',
    secure_url: p.secure_url ?? null,
    position: idx,
    is_video: false,
    video_url: null,
    variation_id: null,
  }));

  // Video (Mercado Livre stores video_id, not a direct URL)
  if (item.video_id) {
    pictures.push({
      external_picture_id: item.video_id,
      url: `https://www.youtube.com/watch?v=${item.video_id}`,
      secure_url: null,
      position: pictures.length,
      is_video: true,
      video_url: `https://www.youtube.com/watch?v=${item.video_id}`,
      variation_id: null,
    });
  }

  // Variation-scoped copies (variation_id = marketplace variation id, resolved to UUID on upsert)
  for (const v of rawVariations) {
    const vRec = v as MlVariation & Record<string, unknown>;
    const pictureIds = mlVariationPictureIds(vRec);
    const marketplaceVarId = String(v.id ?? '');
    if (!marketplaceVarId) continue;
    pictureIds.forEach((pid, idx) => {
      const pic = mlPictures.find((p) => String(p.id ?? '') === pid);
      if (!pic?.url) return;
      pictures.push({
        external_picture_id: pic.id ?? pid,
        url: pic.url ?? '',
        secure_url: pic.secure_url ?? null,
        position: idx,
        is_video: false,
        video_url: null,
        variation_id: marketplaceVarId,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Attributes
  // -------------------------------------------------------------------------
  const attributes: CanonicalAttribute[] = (item.attributes ?? []).map((a) => ({
    attribute_id: a.id ?? '',
    attribute_name: a.name ?? null,
    value_id: a.value_id ?? null,
    value_name: a.value_name ?? null,
    value_struct: a.value_struct != null ? (a.value_struct as Record<string, unknown>) : null,
    is_required: a.tags?.['required'] === true,
    is_variation_attr: a.tags?.['variation_attribute'] === true,
  }));

  // -------------------------------------------------------------------------
  // Shipping
  // -------------------------------------------------------------------------
  const ship = item.shipping;
  const dims = extra?.packageDims
    ? parseMercadoLivrePackage(extra.packageDims)
    : parseMercadoLivreDimensions(ship?.dimensions);

  const shippingTags = Array.isArray(ship?.tags) ? ship!.tags : [];
  const primaryLogistic = mapMercadoLivreLogistic(ship?.logistic_type);
  const logisticTypes = mergeMercadoLivreLogisticTypes(
    primaryLogistic,
    ship?.logistic_type,
    shippingTags,
  );

  const shipping: CanonicalShipping = {
    logistic_type: primaryLogistic,
    logistic_types: logisticTypes,
    shipping_mode: ship?.shipping_mode ?? null,
    free_shipping: ship?.free_shipping ?? false,
    mandatory_free_shipping:
      Array.isArray(ship?.tags) && ship!.tags!.includes('mandatory_free_shipping'),
    local_pick_up: ship?.local_pick_up ?? false,
    package_length_cm: dims.length_cm,
    package_width_cm: dims.width_cm,
    package_height_cm: dims.height_cm,
    package_weight_g: dims.weight_g,
  };

  // -------------------------------------------------------------------------
  // Metrics (from marketplace_metrics row when available)
  // -------------------------------------------------------------------------
  const m = extra?.metricsRow ?? {};
  const metrics: CanonicalMetrics = {
    visits_total: num(m['visits_total']) ?? 0,
    visits_last_30_days: num(m['visits_last_30_days']) ?? 0,
    impressions: num(m['impressions']) ?? null,
    sales_total: item.sold_quantity ?? 0,
    sales_last_30_days: null,
    conversion_rate: num(m['conversion_rate']) ?? 0,
    likes_total: 0,
    comments_total: 0,
    rating_average: num(m['rating_average']) ?? null,
    reviews_count: num(m['reviews_count']) ?? 0,
  };

  // -------------------------------------------------------------------------
  // Quality
  // -------------------------------------------------------------------------
  const q = extra?.qualityRow ?? {};
  const { level, score } = mapMercadoLivreQuality(
    String(q['quality_level'] ?? ''),
    num(q['listing_quality']),
  );
  const quality: CanonicalQuality = {
    quality_score: score,
    quality_level: level,
    missing_attributes: [],
    unfinished_tasks: [],
  };

  // -------------------------------------------------------------------------
  // Fees (universal resolver → marketplace_listing_fees)
  // -------------------------------------------------------------------------
  const lp = (extra?.listingPricesRow?.['listing_prices'] ?? null) as Record<string, unknown> | null;
  const fees: CanonicalFees = resolveCanonicalFees({
    marketplaceName: 'Mercado Livre',
    salePrice: listing.price,
    payloadVersion: ctx.payloadVersion ?? null,
    mlListingPrices: lp,
  });

  return { listing, variations, pictures, attributes, shipping, metrics, quality, fees };
}

function normalizeCondition(raw?: string): 'new' | 'used' | 'refurbished' | null {
  if (!raw) return null;
  if (raw === 'new') return 'new';
  if (raw === 'used') return 'used';
  if (raw === 'refurbished') return 'refurbished';
  return null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return v != null && v !== '' && isFinite(n) ? n : null;
}

export const mercadoLivreAdapter: ListingAdapter = {
  channel: 'mercado-livre',
  normalize: normalizeMLItem,
};
