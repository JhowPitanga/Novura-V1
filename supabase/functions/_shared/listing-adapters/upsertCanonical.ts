// Writes a NormalizedListing (from any adapter) into the canonical tables
// using UPSERT operations. All writes use the service-role client to bypass RLS.

import type { NormalizedListing } from './types.ts';

// Supabase client interface subset (compatible with @supabase/supabase-js admin client)
interface SupabaseClient {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
}

export interface UpsertContext {
  organizationsId: string;
  integrationId?: string | null;
}

export async function upsertCanonicalListing(
  supabase: SupabaseClient,
  normalized: NormalizedListing,
  ctx: UpsertContext,
): Promise<{ listingId: string; error: Error | null }> {
  const { listing, variations, pictures, attributes, shipping, metrics, quality, fees } =
    normalized;

  // -------------------------------------------------------------------------
  // 1. Upsert core listing row → get canonical id
  // -------------------------------------------------------------------------
  const { data: listingRow, error: listingErr } = await supabase
    .from('marketplace_listings')
    .upsert(
      {
        organizations_id: ctx.organizationsId,
        integration_id: ctx.integrationId ?? null,
        marketplace_name: listing.marketplace_name,
        marketplace_item_id: listing.marketplace_item_id,
        title: listing.title,
        sku: listing.sku,
        category_id: listing.category_id,
        category_path: listing.category_path,
        permalink: listing.permalink,
        thumbnail_url: listing.thumbnail_url,
        has_variations: listing.has_variations,
        condition: listing.condition,
        status: listing.status,
        status_raw: listing.status_raw,
        sub_status: listing.sub_status,
        pause_reason: listing.pause_reason,
        price: listing.price,
        original_price: listing.original_price,
        promo_price: listing.promo_price,
        currency: listing.currency,
        available_quantity: listing.available_quantity,
        sold_quantity: listing.sold_quantity,
        listing_type_id: listing.listing_type_id,
        catalog_listing: listing.catalog_listing,
        catalog_product_id: listing.catalog_product_id,
        marketplace_created_at: listing.marketplace_created_at,
        marketplace_updated_at: listing.marketplace_updated_at,
        last_synced_at: new Date().toISOString(),
      },
      {
        onConflict: 'organizations_id,marketplace_name,marketplace_item_id',
        ignoreDuplicates: false,
      },
    )
    .select('id')
    .single();

  if (listingErr || !listingRow) {
    return { listingId: '', error: listingErr ?? new Error('Failed to upsert listing') };
  }

  const listingId: string = listingRow.id;

  // -------------------------------------------------------------------------
  // 2. Shipping
  // -------------------------------------------------------------------------
  await supabase.from('marketplace_listing_shipping').upsert(
    {
      listing_id: listingId,
      organizations_id: ctx.organizationsId,
      marketplace_name: listing.marketplace_name,
      marketplace_item_id: listing.marketplace_item_id,
      logistic_type: shipping.logistic_type,
      logistic_types: shipping.logistic_types,
      shipping_mode: shipping.shipping_mode,
      free_shipping: shipping.free_shipping,
      mandatory_free_shipping: shipping.mandatory_free_shipping,
      local_pick_up: shipping.local_pick_up,
      package_length_cm: shipping.package_length_cm,
      package_width_cm: shipping.package_width_cm,
      package_height_cm: shipping.package_height_cm,
      package_weight_g: shipping.package_weight_g,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'listing_id', ignoreDuplicates: false },
  );

  // -------------------------------------------------------------------------
  // 3. Metrics
  // -------------------------------------------------------------------------
  await supabase.from('marketplace_listing_metrics').upsert(
    {
      listing_id: listingId,
      organizations_id: ctx.organizationsId,
      marketplace_name: listing.marketplace_name,
      marketplace_item_id: listing.marketplace_item_id,
      visits_total: metrics.visits_total,
      visits_last_30_days: metrics.visits_last_30_days,
      impressions: metrics.impressions,
      sales_total: metrics.sales_total,
      sales_last_30_days: metrics.sales_last_30_days,
      conversion_rate: metrics.conversion_rate,
      likes_total: metrics.likes_total,
      comments_total: metrics.comments_total,
      rating_average: metrics.rating_average,
      reviews_count: metrics.reviews_count,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'listing_id', ignoreDuplicates: false },
  );

  // -------------------------------------------------------------------------
  // 4. Quality
  // -------------------------------------------------------------------------
  await supabase.from('marketplace_listing_quality').upsert(
    {
      listing_id: listingId,
      organizations_id: ctx.organizationsId,
      marketplace_name: listing.marketplace_name,
      marketplace_item_id: listing.marketplace_item_id,
      quality_score: quality.quality_score,
      quality_level: quality.quality_level,
      missing_attributes: quality.missing_attributes,
      unfinished_tasks: quality.unfinished_tasks,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'listing_id', ignoreDuplicates: false },
  );

  // -------------------------------------------------------------------------
  // 5. Fees
  // -------------------------------------------------------------------------
  await supabase.from('marketplace_listing_fees').upsert(
    {
      listing_id: listingId,
      organizations_id: ctx.organizationsId,
      marketplace_name: listing.marketplace_name,
      marketplace_item_id: listing.marketplace_item_id,
      currency: fees.currency,
      commission_amount: fees.commission_amount,
      commission_percentage: fees.commission_percentage,
      commission_fixed_fee: fees.commission_fixed_fee,
      listing_fee_amount: fees.listing_fee_amount,
      shipping_subsidy: fees.shipping_subsidy,
      total_fees_estimated: fees.total_fees_estimated,
      source_payload_version: fees.source_payload_version,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'listing_id', ignoreDuplicates: false },
  );

  // -------------------------------------------------------------------------
  // 6. Variations (delete-then-insert to handle removals cleanly)
  // -------------------------------------------------------------------------
  if (variations.length > 0) {
    // Delete stale variations not in current payload
    const currentVariationIds = variations.map((v) => v.variation_id);
    await supabase
      .from('marketplace_listing_variations')
      .delete()
      .eq('listing_id', listingId)
      .not('variation_id', 'in', `(${currentVariationIds.map((id) => `"${id}"`).join(',')})`);

    await supabase.from('marketplace_listing_variations').upsert(
      variations.map((v) => ({
        listing_id: listingId,
        organizations_id: ctx.organizationsId,
        marketplace_name: listing.marketplace_name,
        marketplace_item_id: listing.marketplace_item_id,
        variation_id: v.variation_id,
        sku: v.sku,
        price: v.price,
        original_price: v.original_price,
        promo_price: v.promo_price,
        available_quantity: v.available_quantity,
        sold_quantity: v.sold_quantity,
        image_url: v.image_url,
        attributes: v.attributes,
        primary_for_listing: v.primary_for_listing,
        last_synced_at: new Date().toISOString(),
      })),
      {
        onConflict: 'organizations_id,marketplace_name,marketplace_item_id,variation_id',
        ignoreDuplicates: false,
      },
    );
  }

  // -------------------------------------------------------------------------
  // 7. Pictures (replace all; variation_id FK → marketplace_listing_variations.id)
  // -------------------------------------------------------------------------
  const { data: variationRows } = await supabase
    .from('marketplace_listing_variations')
    .select('id, variation_id')
    .eq('listing_id', listingId);

  const variationUuidByMarketplaceId = new Map<string, string>();
  for (const row of variationRows ?? []) {
    const key = String((row as { variation_id?: string }).variation_id ?? '');
    const uuid = String((row as { id?: string }).id ?? '');
    if (key && uuid) variationUuidByMarketplaceId.set(key, uuid);
  }

  await supabase.from('marketplace_listing_pictures').delete().eq('listing_id', listingId);

  if (pictures.length > 0) {
    const pictureRows = pictures.map((p) => {
      const marketplaceVarId = p.variation_id ? String(p.variation_id) : '';
      const variationUuid = marketplaceVarId
        ? variationUuidByMarketplaceId.get(marketplaceVarId) ?? null
        : null;
      return {
        listing_id: listingId,
        variation_id: variationUuid,
        organizations_id: ctx.organizationsId,
        marketplace_name: listing.marketplace_name,
        marketplace_item_id: listing.marketplace_item_id,
        external_picture_id: p.external_picture_id,
        url: p.url,
        secure_url: p.secure_url,
        position: p.position,
        is_video: p.is_video,
        video_url: p.video_url,
      };
    });

    await supabase.from('marketplace_listing_pictures').insert(pictureRows);
  }

  // -------------------------------------------------------------------------
  // 8. Attributes (upsert by listing_id + attribute_id)
  // -------------------------------------------------------------------------
  if (attributes.length > 0) {
    await supabase.from('marketplace_listing_attributes').upsert(
      attributes.map((a) => ({
        listing_id: listingId,
        organizations_id: ctx.organizationsId,
        marketplace_name: listing.marketplace_name,
        marketplace_item_id: listing.marketplace_item_id,
        attribute_id: a.attribute_id,
        attribute_name: a.attribute_name,
        value_id: a.value_id,
        value_name: a.value_name,
        value_struct: a.value_struct,
        is_required: a.is_required,
        is_variation_attr: a.is_variation_attr,
      })),
      { onConflict: 'listing_id,attribute_id', ignoreDuplicates: false },
    );
  }

  return { listingId, error: null };
}
