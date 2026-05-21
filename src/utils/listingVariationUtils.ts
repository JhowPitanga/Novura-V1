/** Mirrors edge `_shared/listing-adapters/variationAttrs.ts` for the edit UI. */

export const PICTURE_IDS_ATTR_ID = "_picture_ids";

export function decodePictureIdsFromAttrs(
  attributes: unknown,
): { combinations: Array<Record<string, unknown>>; picture_ids: string[] } {
  if (!Array.isArray(attributes)) {
    return { combinations: [], picture_ids: [] };
  }
  const combinations: Array<Record<string, unknown>> = [];
  let picture_ids: string[] = [];
  for (const a of attributes) {
    if (!a || typeof a !== "object") continue;
    const row = a as Record<string, unknown>;
    if (row.id === PICTURE_IDS_ATTR_ID) {
      const raw = row.value_name ?? row.value_id;
      if (typeof raw === "string" && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            picture_ids = parsed.map((x) => String(x)).filter(Boolean);
          }
        } catch {
          picture_ids = [raw.trim()];
        }
      } else if (Array.isArray(raw)) {
        picture_ids = raw.map((x) => String(x)).filter(Boolean);
      }
      continue;
    }
    combinations.push(row);
  }
  return { combinations, picture_ids };
}

export function rawVariationsFromPayload(
  rawPayload: unknown,
  marketplaceName: string,
): Array<Record<string, unknown>> {
  if (!rawPayload || typeof rawPayload !== "object") return [];
  const raw = rawPayload as Record<string, unknown>;
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const mkt = String(marketplaceName).toLowerCase();

  if (mkt.includes("shopee")) {
    if (Array.isArray(data.model_list)) return data.model_list as Array<Record<string, unknown>>;
    if (Array.isArray(raw.variations)) return raw.variations as Array<Record<string, unknown>>;
    return [];
  }

  if (Array.isArray(data.variations)) return data.variations as Array<Record<string, unknown>>;
  if (Array.isArray(raw.variations)) return raw.variations as Array<Record<string, unknown>>;
  return [];
}

export function rawVariationPictureIds(v: Record<string, unknown>): string[] {
  if (Array.isArray(v.picture_ids)) {
    return v.picture_ids.map((x) => String(x)).filter(Boolean);
  }
  if (v.picture_id != null) return [String(v.picture_id)];
  return [];
}
