/** Helpers for edit-listing load/normalize (price, shipping). */

export function resolveUniversalSalePrice(mi: any, variations?: any[]): string {
  const direct = typeof mi?.price === 'number' ? mi.price : Number(mi?.price);
  if (Number.isFinite(direct) && direct > 0) return String(direct);

  const pi0 = Array.isArray(mi?.price_info) ? mi.price_info[0] : null;
  const fromPi = Number(
    pi0?.current_price ?? pi0?.inflated_price_of_current_price ?? NaN,
  );
  if (Number.isFinite(fromPi) && fromPi > 0) return String(fromPi);

  const fromExtra = Number(mi?.current_price ?? mi?.original_price ?? NaN);
  if (Number.isFinite(fromExtra) && fromExtra > 0) return String(fromExtra);

  const vars = Array.isArray(variations) ? variations : Array.isArray(mi?.variations) ? mi.variations : [];
  for (const v of vars) {
    const vpi = Array.isArray(v?.price_info) ? v.price_info[0] : null;
    const vp = Number(
      vpi?.current_price ??
        vpi?.inflated_price_of_current_price ??
        v?.current_price ??
        v?.price ??
        NaN,
    );
    if (Number.isFinite(vp) && vp > 0) return String(vp);
  }

  return '0';
}

function pickDim(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (c === '' || c == null || c === undefined) continue;
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return String(n);
    const s = String(c).trim();
    if (s && s !== '0') return s;
  }
  return '';
}

/** Parses ML dimensions string e.g. "20 x 15 x 10, 500" (L x H x W, weight g). */
export function parseMLDimensionsString(raw: string): {
  length: string;
  height: string;
  width: string;
  weight: string;
} {
  const empty = { length: '', height: '', width: '', weight: '' };
  const s = String(raw || '').trim();
  if (!s) return empty;

  const m = s.match(
    /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)(?:\s*,\s*(\d+(?:[.,]\d+)?))?/i,
  );
  if (!m) return empty;

  const norm = (v: string) => String(v).replace(',', '.');
  return {
    length: norm(m[1]),
    height: norm(m[2]),
    width: norm(m[3]),
    weight: m[4] ? norm(m[4]) : '',
  };
}

function extractPackageDimensions(mi: any): {
  height: string;
  width: string;
  length: string;
  weightG: string;
} {
  const data = mi?.data && typeof mi.data === 'object' ? mi.data : {};
  const ship = { ...(mi?.shipping || {}), ...(data?.shipping || {}) };
  const extra = data?.item || data?.item_base || data?.base_info || {};
  const dimsRaw = ship?.dimensions;
  const dimsObj =
    dimsRaw && typeof dimsRaw === 'object' && !Array.isArray(dimsRaw) ? dimsRaw : {};

  let parsed = { length: '', height: '', width: '', weight: '' };
  if (typeof dimsRaw === 'string') {
    parsed = parseMLDimensionsString(dimsRaw);
  } else if (typeof data?.shipping?.dimensions === 'string') {
    parsed = parseMLDimensionsString(data.shipping.dimensions);
  }

  const height = pickDim(
    mi?.package_height_cm,
    mi?.package_height,
    extra?.package_height,
    dimsObj?.height,
    parsed.height,
    data?.package_height,
  );
  const width = pickDim(
    mi?.package_width_cm,
    mi?.package_width,
    extra?.package_width,
    dimsObj?.width,
    parsed.width,
    data?.package_width,
  );
  const length = pickDim(
    mi?.package_length_cm,
    mi?.package_length,
    extra?.package_length,
    dimsObj?.length,
    parsed.length,
    data?.package_length,
  );
  const weightG = pickDim(
    mi?.package_weight_g,
    mi?.package_weight,
    extra?.package_weight,
    ship?.weight,
    dimsObj?.weight,
    parsed.weight,
    data?.package_weight,
  );

  return { height, width, length, weightG };
}

export function normalizeEditShipping(mi: any, marketplace: 'mercado-livre' | 'shopee'): Record<string, unknown> {
  const { height, width, length, weightG } = extractPackageDimensions(mi);

  if (marketplace === 'shopee') {
    const kgRaw =
      mi?.package_weight_kg ??
      (weightG ? Number(weightG) / 1000 : null) ??
      mi?.shipping?.weight ??
      '';
    const kg =
      typeof kgRaw === 'number' && Number.isFinite(kgRaw)
        ? String(kgRaw)
        : pickDim(kgRaw);

    return {
      weight: kg,
      dimensions: { height, width, length },
    };
  }

  const weightVal = weightG || '';
  const ship = mi?.shipping || {};
  const data = mi?.data?.shipping || {};

  return {
    ...ship,
    mode: ship?.mode ?? data?.mode ?? 'me2',
    logistic_type: ship?.logistic_type ?? mi?.logistic_type ?? data?.logistic_type ?? '',
    free_shipping:
      typeof mi?.free_shipping === 'boolean'
        ? mi.free_shipping
        : String(mi?.free_shipping || '').toLowerCase() === 'true',
    weight: weightVal,
    dimensions: {
      height,
      width,
      length,
      weight: weightVal,
    },
  };
}

export function formatBRLPrice(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}
