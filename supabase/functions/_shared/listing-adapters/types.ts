// Canonical types for the listing adapter layer.
// These map to the tables created in 20260518_000001_listings_canonical.sql.

export type ListingStatusCanonical =
  | 'active'
  | 'paused'
  | 'closed'
  | 'deleted'
  | 'under_review';

export type LogisticTypeCanonical =
  | 'full'
  | 'flex'
  | 'shopee_xpress'
  | 'envios'
  | 'correios'
  | 'agencia'
  | 'retire'
  | 'custom'
  | 'unknown';

export type QualityLevelCanonical =
  | 'excellent'
  | 'good'
  | 'medium'
  | 'low'
  | 'incomplete'
  | 'unknown';

// ---------------------------------------------------------------------------
// Canonical sub-objects (mirror DB columns)
// ---------------------------------------------------------------------------

export interface CanonicalListing {
  marketplace_name: string;
  marketplace_item_id: string;

  title: string;
  sku: string | null;
  category_id: string | null;
  category_path: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  has_variations: boolean;
  condition: 'new' | 'used' | 'refurbished' | null;

  status: ListingStatusCanonical;
  status_raw: string;
  sub_status: string[];
  pause_reason: string | null;

  price: number | null;
  original_price: number | null;
  promo_price: number | null;
  currency: string;

  available_quantity: number;
  sold_quantity: number;

  listing_type_id: string | null;
  catalog_listing: boolean | null;
  catalog_product_id: string | null;

  marketplace_created_at: string | null;
  marketplace_updated_at: string | null;
}

export interface CanonicalVariation {
  variation_id: string;
  sku: string | null;
  price: number | null;
  original_price: number | null;
  promo_price: number | null;
  available_quantity: number;
  sold_quantity: number;
  image_url: string | null;
  attributes: Array<{
    id: string;
    name: string;
    value_id?: string;
    value_name?: string;
  }>;
  primary_for_listing: boolean;
}

export interface CanonicalPicture {
  external_picture_id: string | null;
  url: string;
  secure_url: string | null;
  position: number;
  is_video: boolean;
  video_url: string | null;
  // Marketplace variation key (ML variation.id / Shopee model_id); upsert maps to variations.id UUID
  variation_id: string | null;
}

export interface CanonicalAttribute {
  attribute_id: string;
  attribute_name: string | null;
  value_id: string | null;
  value_name: string | null;
  value_struct: Record<string, unknown> | null;
  is_required: boolean | null;
  is_variation_attr: boolean | null;
}

export interface CanonicalShipping {
  logistic_type: LogisticTypeCanonical;
  logistic_types: LogisticTypeCanonical[];
  shipping_mode: string | null;
  free_shipping: boolean;
  mandatory_free_shipping: boolean;
  local_pick_up: boolean;
  package_length_cm: number | null;
  package_width_cm: number | null;
  package_height_cm: number | null;
  package_weight_g: number | null;
}

export interface CanonicalMetrics {
  visits_total: number;
  visits_last_30_days: number;
  impressions: number | null;
  sales_total: number;
  sales_last_30_days: number | null;
  conversion_rate: number;
  likes_total: number;
  comments_total: number;
  rating_average: number | null;
  reviews_count: number;
}

export interface CanonicalQuality {
  quality_score: number | null;
  quality_level: QualityLevelCanonical;
  missing_attributes: string[];
  unfinished_tasks: unknown[];
}

export interface CanonicalFees {
  currency: string;
  commission_amount: number | null;
  commission_percentage: number | null;
  commission_fixed_fee: number | null;
  listing_fee_amount: number | null;
  shipping_subsidy: number | null;
  total_fees_estimated: number | null;
  source_payload_version: number | null;
}

// ---------------------------------------------------------------------------
// Full normalised listing returned by each adapter
// ---------------------------------------------------------------------------

export interface NormalizedListing {
  listing: CanonicalListing;
  variations: CanonicalVariation[];
  pictures: CanonicalPicture[];
  attributes: CanonicalAttribute[];
  shipping: CanonicalShipping;
  metrics: CanonicalMetrics;
  quality: CanonicalQuality;
  fees: CanonicalFees;
}

/** Cached row from marketplace_provider_fee_rules (category commission). */
export interface ProviderFeeRuleSnapshot {
  commission_percentage?: number | null;
  commission_fixed_fee?: number | null;
  listing_fee_amount?: number | null;
  currency?: string | null;
  source?: string | null;
}

/** Optional rows from legacy tables + fee enrichment (all channels). */
export interface AdapterNormalizeExtra {
  metricsRow?: Record<string, unknown> | null;
  listingPricesRow?: Record<string, unknown> | null;
  qualityRow?: Record<string, unknown> | null;
  packageDims?: Record<string, unknown> | null;
  feeRule?: ProviderFeeRuleSnapshot | null;
  observedAvgCommissionAmount?: number | null;
  observedAvgCommissionPercentage?: number | null;
}

export interface AdapterContext {
  organizationId: string;
  integrationId?: string | null;
  payloadVersion?: number;
  extra?: AdapterNormalizeExtra;
}

export interface ListingAdapter {
  readonly channel: 'mercado-livre' | 'shopee';
  normalize(payload: unknown, ctx: AdapterContext): NormalizedListing;
}
