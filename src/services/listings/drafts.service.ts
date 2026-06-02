import { supabase } from "@/integrations/supabase/client";
import type { ListingDraft } from "@/types/listings";

export async function fetchDrafts(orgId: string): Promise<ListingDraft[]> {
  const { data, error } = await (supabase as any)
    .from("marketplace_drafts")
    .select("*")
    .eq("organizations_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export async function deleteDraft(orgId: string, draftId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("marketplace_drafts")
    .delete()
    .eq("id", draftId)
    .eq("organizations_id", orgId);
  if (error) throw error;
}

export async function deleteDrafts(orgId: string, draftIds: string[]): Promise<void> {
  if (!draftIds.length) return;
  const { error } = await (supabase as any)
    .from("marketplace_drafts")
    .delete()
    .eq("organizations_id", orgId)
    .in("id", draftIds);
  if (error) throw error;
}

export async function createDraftFromListing(
  orgId: string,
  itemRow: any,
  listingTypeId: string | null,
): Promise<string> {
  const idVal = String(itemRow?.marketplace_item_id || itemRow?.id);
  const picsArr = Array.isArray(itemRow?.pictures) ? itemRow.pictures : [];
  const pictureUrls: string[] = picsArr
    .map((p: any) => (typeof p === "string" ? p : p?.url || p?.secure_url || ""))
    .filter(Boolean);
  const attrs = Array.isArray(itemRow?.attributes) ? itemRow.attributes : [];
  const rawVars = Array.isArray(itemRow?.variations) ? itemRow.variations : [];
  const mappedVars = rawVars.map((v: any) => {
    const combos = Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : [];
    const varAttrs = Array.isArray(v?.attributes) ? v.attributes : [];
    const qty = typeof v?.available_quantity === "number" ? v.available_quantity : 0;
    const obj: any = { attribute_combinations: combos, available_quantity: qty };
    if (typeof v?.price === "number") obj.price = v.price;
    if (varAttrs.length > 0) obj.attributes = varAttrs;
    const skuVal = v?.seller_sku ?? v?.sku ?? null;
    if (skuVal) obj.sku = skuVal;
    const picIds = Array.isArray(v?.picture_ids)
      ? v.picture_ids
      : v?.picture_id
      ? [v.picture_id]
      : [];
    if (picIds.length > 0) {
      const urls = picIds
        .map((pid: any) => {
          const m = picsArr.find(
            (p: any) =>
              typeof p !== "string" && String(p?.id || p?.picture_id) === String(pid),
          );
          return typeof m === "string" ? m : m?.url || m?.secure_url || "";
        })
        .filter(Boolean);
      if (urls.length > 0) obj.pictures = urls;
    }
    return obj;
  });

  const shippingRaw = (itemRow as any)?.data?.shipping || (itemRow as any)?.shipping || {};
  const dimsText = String((shippingRaw as any)?.dimensions || "");
  let dimsObj: any;
  let weightNum: number | undefined;
  if (dimsText) {
    const m = dimsText.match(
      /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i,
    );
    if (m) {
      dimsObj = {
        length: Math.round(Number(m[1])),
        height: Math.round(Number(m[2])),
        width: Math.round(Number(m[3])),
      };
      weightNum = Math.round(Number(m[4]));
    }
  }
  const ship: any = {};
  const modeRaw = (shippingRaw as any)?.mode ?? (shippingRaw as any)?.logistic_type ?? null;
  if (modeRaw) ship.mode = String(modeRaw);
  if (typeof (shippingRaw as any)?.local_pick_up !== "undefined")
    ship.local_pick_up = !!(shippingRaw as any).local_pick_up;
  if (typeof (shippingRaw as any)?.free_shipping !== "undefined")
    ship.free_shipping = !!(shippingRaw as any).free_shipping;
  if (dimsObj) ship.dimensions = dimsObj;
  if (typeof weightNum === "number") ship.weight = weightNum;

  let descriptionText: string | undefined;
  try {
    const { data: descRow } = await (supabase as any)
      .from("marketplace_item_descriptions")
      .select("plain_text")
      .eq("organizations_id", orgId)
      .eq("marketplace_name", "Mercado Livre")
      .eq("marketplace_item_id", idVal)
      .limit(1)
      .single();
    if (descRow && typeof (descRow as any)?.plain_text === "string") {
      descriptionText = String((descRow as any).plain_text);
    }
  } catch {}

  const saleTerms = Array.isArray((itemRow as any)?.data?.sale_terms)
    ? (itemRow as any).data.sale_terms
    : Array.isArray((itemRow as any)?.sale_terms)
    ? (itemRow as any).sale_terms
    : [];

  const draft = {
    organizations_id: orgId,
    marketplace_name: "Mercado Livre",
    site_id: String((itemRow as any)?.data?.site_id || "MLB"),
    title: itemRow?.title || null,
    category_id: itemRow?.category_id || null,
    condition: itemRow?.condition || undefined,
    attributes: attrs,
    variations: mappedVars,
    pictures: pictureUrls,
    price:
      typeof itemRow?.price === "number" ? itemRow.price : Number(itemRow?.price) || 0,
    listing_type_id: listingTypeId || null,
    shipping: ship,
    sale_terms: saleTerms,
    description: descriptionText,
    available_quantity:
      typeof itemRow?.available_quantity === "number"
        ? itemRow.available_quantity
        : Number(itemRow?.available_quantity) || 0,
    last_step: 1,
    status: "draft",
    api_cache: {},
  };

  const { data, error } = await (supabase as any)
    .from("marketplace_drafts")
    .insert(draft)
    .select("id")
    .single();
  if (error) throw error;
  return String((data as any)?.id || "");
}
