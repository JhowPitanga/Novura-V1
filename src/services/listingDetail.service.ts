import { supabase } from "@/integrations/supabase/client";
import {
  decodePictureIdsFromAttrs,
  rawVariationPictureIds,
  rawVariationsFromPayload,
} from "@/utils/listingVariationUtils";

const CANONICAL_DETAIL_SELECT = `
  *,
  shipping:marketplace_listing_shipping(*),
  metrics:marketplace_listing_metrics(*),
  quality:marketplace_listing_quality(*),
  fees:marketplace_listing_fees(*),
  variations:marketplace_listing_variations(*),
  pictures:marketplace_listing_pictures(*)
`;

/**
 * Loads one listing for edit/linking modules: canonical first, then legacy tables.
 */
export async function fetchListingDetailRow(
  organizationId: string,
  marketplaceName: string,
  marketplaceItemId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await (supabase as any)
      .from("marketplace_listings")
      .select(CANONICAL_DETAIL_SELECT)
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", marketplaceName)
      .eq("marketplace_item_id", String(marketplaceItemId))
      .maybeSingle();

    if (!error && data) {
      const { data: rawRow } = await (supabase as any)
        .from("marketplace_listings_raw")
        .select("payload")
        .eq("organizations_id", organizationId)
        .eq("marketplace_name", marketplaceName)
        .eq("marketplace_item_id", String(marketplaceItemId))
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let rawPayload = rawRow?.payload;
      if (!rawPayload) {
        const legacyTable =
          String(marketplaceName).toLowerCase() === "shopee"
            ? "marketplace_items_raw"
            : "marketplace_items_unified";
        const { data: legacy } = await (supabase as any)
          .from(legacyTable)
          .select("data, pictures, variations")
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", marketplaceName)
          .eq("marketplace_item_id", String(marketplaceItemId))
          .maybeSingle();
        if (legacy) {
          rawPayload = {
            data: legacy.data,
            pictures: legacy.pictures,
            variations: legacy.variations,
          };
        }
      }

      return canonicalListingToModuleRow(data, rawPayload, marketplaceName);
    }
  } catch (e) {
    console.warn("[fetchListingDetailRow] canonical", e);
  }

  const isShopee = String(marketplaceName).toLowerCase() === "shopee";
  const legacyTable = isShopee ? "marketplace_items_raw" : "marketplace_items_unified";

  try {
    const { data, error } = await (supabase as any)
      .from(legacyTable)
      .select("*")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", marketplaceName)
      .eq("marketplace_item_id", String(marketplaceItemId))
      .maybeSingle();
    if (!error && data) return data as Record<string, unknown>;
  } catch {
    /* fall through */
  }

  const { data, error } = await (supabase as any)
    .from("marketplace_items")
    .select("*")
    .eq("organizations_id", organizationId)
    .eq("marketplace_name", marketplaceName)
    .eq("marketplace_item_id", String(marketplaceItemId))
    .maybeSingle();

  if (error) return null;
  return (data as Record<string, unknown>) ?? null;
}

function resolvePictureIdsForVariation(
  canonicalVar: Record<string, unknown>,
  rawVar: Record<string, unknown> | undefined,
  pictures: Array<Record<string, unknown>>,
): string[] {
  const varUuid = String(canonicalVar.id ?? "");
  const fromLinkedPics = pictures
    .filter((p) => varUuid && String(p.variation_id ?? "") === varUuid)
    .map((p) => String(p.external_picture_id ?? ""))
    .filter(Boolean);
  if (fromLinkedPics.length) return fromLinkedPics;

  const { picture_ids: fromAttrs } = decodePictureIdsFromAttrs(canonicalVar.attributes);
  if (fromAttrs.length) return fromAttrs;

  if (rawVar) {
    const fromRaw = rawVariationPictureIds(rawVar);
    if (fromRaw.length) return fromRaw;
  }

  const imageUrl = String(canonicalVar.image_url ?? rawVar?.model_image_url ?? "");
  if (imageUrl) {
    const match = pictures.find(
      (p) =>
        String(p.url ?? "") === imageUrl ||
        String(p.secure_url ?? "") === imageUrl,
    );
    if (match?.external_picture_id) return [String(match.external_picture_id)];
  }

  return [];
}

/** Shape compatible with edit adapters (unified-like). */
function canonicalListingToModuleRow(
  listing: Record<string, unknown>,
  rawPayload?: unknown,
  marketplaceName?: string,
): Record<string, unknown> {
  const pics = Array.isArray(listing.pictures) ? listing.pictures : [];
  const canonicalVariations = Array.isArray(listing.variations) ? listing.variations : [];
  const rawVariations = rawVariationsFromPayload(
    rawPayload,
    String(marketplaceName ?? listing.marketplace_name ?? ""),
  );
  const shipping = (listing.shipping as Record<string, unknown>) ?? {};

  const pictures = pics.map((p: Record<string, unknown>) => ({
    id: p.external_picture_id,
    url: p.url,
    secure_url: p.secure_url,
  }));

  const rawByVariationId = new Map<string, Record<string, unknown>>();
  for (const rv of rawVariations) {
    const id = String(rv.model_id ?? rv.id ?? "");
    if (id) rawByVariationId.set(id, rv);
  }

  const mappedVariations =
    canonicalVariations.length > 0
      ? canonicalVariations.map((v: Record<string, unknown>) => {
          const vid = String(v.variation_id ?? "");
          const rawVar = rawByVariationId.get(vid);
          const { combinations } = decodePictureIdsFromAttrs(v.attributes);
          const picture_ids = resolvePictureIdsForVariation(v, rawVar, pics);

          return {
            id: v.variation_id,
            sku: v.sku,
            price: v.price,
            available_quantity: v.available_quantity,
            attribute_combinations: combinations.length
              ? combinations
              : rawVar && typeof rawVar.model_name === "string"
                ? [{ id: "variation", name: "Variação", value_name: rawVar.model_name }]
                : [],
            picture_ids,
            seller_sku: v.sku ?? rawVar?.model_sku ?? rawVar?.seller_sku,
            image_url: v.image_url ?? rawVar?.model_image_url ?? null,
          };
        })
      : rawVariations.map((rv) => ({
          id: rv.model_id ?? rv.id,
          sku: rv.model_sku ?? rv.seller_sku ?? rv.seller_custom_field,
          price:
            Array.isArray(rv.price_info) && rv.price_info[0]
              ? (rv.price_info[0] as Record<string, unknown>).current_price
              : rv.price,
          available_quantity: rv.available_quantity,
          attribute_combinations: Array.isArray(rv.attribute_combinations)
            ? rv.attribute_combinations
            : typeof rv.model_name === "string"
              ? [{ id: "variation", name: "Variação", value_name: rv.model_name }]
              : [],
          picture_ids: rawVariationPictureIds(rv),
          image_url: rv.model_image_url ?? null,
        }));

  const data =
    rawPayload && typeof rawPayload === "object"
      ? (rawPayload as Record<string, unknown>)
      : {};

  return {
    ...listing,
    id: listing.id,
    marketplace_item_id: listing.marketplace_item_id,
    marketplace_name: listing.marketplace_name,
    organizations_id: listing.organizations_id,
    title: listing.title,
    sku: listing.sku,
    price: listing.price,
    status: listing.status_raw ?? listing.status,
    listing_type_id: listing.listing_type_id,
    sold_quantity: listing.sold_quantity,
    pictures,
    variations: mappedVariations.length ? mappedVariations : undefined,
    data: Object.keys(data).length ? data : undefined,
    shipping_tags: shipping.logistic_types ?? [],
    package_length_cm: shipping.package_length_cm,
    package_width_cm: shipping.package_width_cm,
    package_height_cm: shipping.package_height_cm,
    package_weight_g: shipping.package_weight_g,
    listing_prices: listing.fees,
    performance_data: listing.quality,
    updated_at: listing.updated_at ?? listing.last_synced_at,
  };
}
