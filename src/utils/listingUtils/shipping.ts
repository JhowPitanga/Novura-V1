import type { ShippingCaps } from "@/types/listings";

function normalizeShippingTag(tag: string): string {
  const t = String(tag || "").toLowerCase();
  if (t.includes("full")) return "full";
  if (t.includes("flex")) return "flex";
  if (t.includes("correios") || t.includes("drop_off")) return "correios";
  if (
    t.includes("envios") ||
    t.includes("xd_drop_off") ||
    t.includes("cross_docking") ||
    t.includes("me2") ||
    t.includes("custom")
  )
    return "envios";
  if (t.includes("no_shipping")) return "no_shipping";
  return t;
}

const IGNORED_SHIPPING_TAGS = new Set([
  "mandatory_free_shipping",
  "self_service_available",
  "self_service_out",
]);

/**
 * Resolves shipping tags for a legacy marketplace_items row.
 * NOT exported from the barrel — used only by parseListingRow.ts.
 */
export function resolveShippingTags(row: any, shippingCaps: ShippingCaps | null): string[] {
  let tags: string[] = [];

  if ((row as any)?.cap_full) tags.push("full");
  if ((row as any)?.cap_flex) tags.push("flex");
  if ((row as any)?.cap_envios) tags.push("envios");
  if ((row as any)?.cap_correios) tags.push("correios");
  tags = Array.from(new Set(tags));

  const shippingInfo = (row as any)?.data?.shipping || (row as any)?.shipping;
  const logisticType = String(
    [
      shippingInfo?.logistic_type,
      shippingInfo?.mode,
      (row as any)?.logistic_type,
      (row as any)?.shipping_logistic_type,
      (row as any)?.data?.shipping?.logistic_type,
      (row as any)?.data?.shipping?.logistic?.type,
      (row as any)?.shipping?.logistic?.type,
    ].find((v: any) => v && String(v).trim().length > 0) || "",
  ).toLowerCase();

  const rawTagsSource = Array.isArray(shippingInfo?.tags)
    ? shippingInfo.tags
    : Array.isArray((row as any)?.data?.shipping?.tags)
    ? (row as any)?.data?.shipping?.tags
    : Array.isArray((row as any)?.shipping?.tags)
    ? (row as any)?.shipping?.tags
    : [];
  const rawTags: string[] = (rawTagsSource as any[]).map((t: any) =>
    String(t || "").toLowerCase(),
  );
  const tagSet = new Set<string>(tags);
  if (rawTags.includes("self_service_in")) tagSet.add("flex");
  if (rawTags.includes("self_service_out") && logisticType !== "self_service") tagSet.delete("flex");
  tags = Array.from(tagSet);

  tags = Array.from(new Set(tags.map(normalizeShippingTag)));
  tags = tags.filter((t) => !IGNORED_SHIPPING_TAGS.has(t));

  if (shippingCaps) {
    const has = (v?: boolean) => v === undefined || v === true;
    tags = tags.filter((t) => {
      if (t === "full") return has(shippingCaps.full);
      if (t === "flex") return has(shippingCaps.flex);
      if (t === "envios") return has(shippingCaps.envios);
      if (t === "correios") return has(shippingCaps.correios);
      return true;
    });
  }

  return tags;
}
