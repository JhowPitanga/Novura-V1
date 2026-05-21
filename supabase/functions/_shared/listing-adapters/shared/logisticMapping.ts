import type { LogisticTypeCanonical } from '../types.ts';

// ---------------------------------------------------------------------------
// Mercado Livre
// ---------------------------------------------------------------------------

const ML_LOGISTIC_MAP: Record<string, LogisticTypeCanonical> = {
  fulfillment: 'full',
  fbm: 'full',
  self_service: 'flex',
  xd_drop_off: 'envios',
  cross_docking: 'envios',
  drop_off: 'correios',
  me1: 'custom',
  custom: 'custom',
  not_specified: 'custom',
};

export function mapMercadoLivreLogistic(rawType: string | null | undefined): LogisticTypeCanonical {
  if (!rawType) return 'unknown';
  return ML_LOGISTIC_MAP[rawType.toLowerCase()] ?? 'custom';
}

/** Maps ML shipping tags to canonical types (aligned with marketplace_items_unified view). */
export function mapMercadoLivreShippingTags(
  tags: string[] | null | undefined,
): LogisticTypeCanonical[] {
  if (!Array.isArray(tags) || tags.length === 0) return [];
  const seen = new Set<LogisticTypeCanonical>();
  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (t === 'fulfillment' || t === 'fbm') seen.add('full');
    else if (t === 'self_service_in' || t === 'flex') seen.add('flex');
    else if (t === 'drop_off') seen.add('correios');
    else if (t === 'cross_docking' || t === 'xd_drop_off' || t === 'xd_drop') seen.add('envios');
    else if (t === 'me1' || t === 'custom') seen.add('custom');
    // Ignore capability hints: self_service_available, self_service_out, mandatory_free_shipping
  }
  return [...seen];
}

/** Primary logistic_type must always appear in logistic_types[]. */
export function mergeMercadoLivreLogisticTypes(
  primary: LogisticTypeCanonical,
  rawLogisticType: string | null | undefined,
  tags: string[] | null | undefined,
): LogisticTypeCanonical[] {
  let fromTags = mapMercadoLivreShippingTags(tags);
  const rawLt = String(rawLogisticType ?? '').toLowerCase();
  if (
    tags?.some((t) => String(t).toLowerCase() === 'self_service_out') &&
    rawLt !== 'self_service'
  ) {
    fromTags = fromTags.filter((t) => t !== 'flex');
  }
  const seen = new Set<LogisticTypeCanonical>([primary, ...fromTags]);
  return [...seen];
}

// ---------------------------------------------------------------------------
// Shopee
// The priority order for "primary" logistic: full > shopee_xpress > flex > correios > retire
// ---------------------------------------------------------------------------

const LOGISTIC_PRIORITY: LogisticTypeCanonical[] = [
  'full',
  'shopee_xpress',
  'flex',
  'correios',
  'retire',
  'custom',
  'unknown',
];

/** Known Shopee BR logistic_id → canonical (91003 = SPX / Entrega acelerada). */
const SHOPEE_LOGISTIC_ID_MAP: Record<number, LogisticTypeCanonical> = {
  91003: 'shopee_xpress',
  91014: 'shopee_xpress',
  91015: 'shopee_xpress',
  70011: 'correios',
  70012: 'correios',
  90024: 'retire',
  90022: 'retire',
};

function shopeeLogisticFromEntry(
  name: string,
  logisticId?: number | string | null,
): LogisticTypeCanonical {
  const idNum = logisticId != null ? Number(logisticId) : NaN;
  if (Number.isFinite(idNum) && SHOPEE_LOGISTIC_ID_MAP[idNum]) {
    return SHOPEE_LOGISTIC_ID_MAP[idNum];
  }
  const n = name.toLowerCase();
  if (n.includes('fulfillment') || n.includes('fbs')) return 'full';
  if (n.includes('xpress') || n.includes('express') || n.includes('spx')) return 'shopee_xpress';
  if (n.includes('same day') || n.includes('sameday')) return 'flex';
  if (n.includes('retire') || n.includes('retirada') || n.includes('pickup')) return 'retire';
  if (n.includes('padrão') || n.includes('padrao') || n.includes('standard')) return 'correios';
  return 'correios';
}

export function mapShopeeLogistics(
  logisticInfo: Array<{ logistic_name?: string; enabled?: boolean; is_fulfillment_by_shopee?: boolean }> | null | undefined,
): { logisticType: LogisticTypeCanonical; logisticTypes: LogisticTypeCanonical[] } {
  if (!Array.isArray(logisticInfo) || logisticInfo.length === 0) {
    return { logisticType: 'unknown', logisticTypes: [] };
  }

  const enabled = logisticInfo.filter((l) => l.enabled !== false);
  const seen = new Set<LogisticTypeCanonical>();

  for (const l of enabled) {
    if (l.is_fulfillment_by_shopee) {
      seen.add('full');
      continue;
    }
    if (l.logistic_name) {
      seen.add(shopeeLogisticFromEntry(l.logistic_name, l.logistic_id));
    }
  }

  const types = [...seen];
  // Determine primary type by priority order
  const primary =
    LOGISTIC_PRIORITY.find((p) => types.includes(p)) ?? (types[0] ?? 'unknown');

  return { logisticType: primary, logisticTypes: types };
}
