// Parses dimension and weight data from both Mercado Livre and Shopee payloads.

export interface ParsedDimensions {
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  weight_g: number | null;
}

// Mercado Livre stores dimensions as a string: "HxWxL,weight"
// e.g. "12x8x20,800"  or "12.5x8.0x20.0,850.0"
export function parseMercadoLivreDimensions(raw: string | null | undefined): ParsedDimensions {
  if (!raw) return { length_cm: null, width_cm: null, height_cm: null, weight_g: null };

  const cleaned = raw.replace(/\s/g, '');
  const [dimPart, weightPart] = cleaned.split(',');
  const dims = (dimPart ?? '').split('x').map(Number);

  return {
    height_cm: isFinite(dims[0]) ? dims[0] : null,
    width_cm: isFinite(dims[1]) ? dims[1] : null,
    length_cm: isFinite(dims[2]) ? dims[2] : null,
    weight_g: weightPart != null && isFinite(Number(weightPart)) ? Number(weightPart) : null,
  };
}

// Mercado Livre also stores explicit package_*_cm columns (from sync jobs)
export function parseMercadoLivrePackage(item: Record<string, unknown>): ParsedDimensions {
  // Try explicit columns first (already numeric)
  const h = num(item['package_height_cm'] ?? item['package_height']);
  const w = num(item['package_width_cm'] ?? item['package_width']);
  const l = num(item['package_length_cm'] ?? item['package_length']);
  const weight = num(item['package_weight_g'] ?? item['package_weight']);

  if (h !== null || w !== null || l !== null || weight !== null) {
    return { height_cm: h, width_cm: w, length_cm: l, weight_g: weight };
  }

  // Fall back to the dimensions string in data.shipping.dimensions
  const data = item['data'] as Record<string, unknown> | undefined;
  const shipping = data?.['shipping'] as Record<string, unknown> | undefined;
  const dimString = shipping?.['dimensions'] as string | undefined;
  return parseMercadoLivreDimensions(dimString);
}

// Shopee stores dimensions in base_info.dimension (object) and base_info.weight (grams)
export function parseShopeeDimensions(
  dimension: { package_length?: number; package_width?: number; package_height?: number } | null | undefined,
  weightGrams: number | null | undefined,
): ParsedDimensions {
  return {
    length_cm: dimension?.package_length ?? null,
    width_cm: dimension?.package_width ?? null,
    height_cm: dimension?.package_height ?? null,
    weight_g: weightGrams ?? null,
  };
}

function num(value: unknown): number | null {
  const n = Number(value);
  return value != null && value !== '' && isFinite(n) ? n : null;
}
