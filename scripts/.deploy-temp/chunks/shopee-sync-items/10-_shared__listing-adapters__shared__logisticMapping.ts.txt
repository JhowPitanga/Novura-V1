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

// Mercado Livre items may expose multiple shipping tags; each tag maps to a type
export function mapMercadoLivreShippingTags(
  tags: string[] | null | undefined,
): LogisticTypeCanonical[] {
  if (!Array.isArray(tags) || tags.length === 0) return [];
  const seen = new Set<LogisticTypeCanonical>();
  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (t.includes('fulfillment') || t.includes('fbm')) seen.add('full');
    else if (t.includes('self_service') || t.includes('flex')) seen.add('flex');
    else if (t.includes('drop_off')) seen.add('correios');
    else if (t.includes('cross_docking') || t.includes('xd_drop')) seen.add('envios');
    else if (t.includes('me1')) seen.add('custom');
  }
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

function shopeeLogisticFromName(name: string): LogisticTypeCanonical {
  const n = name.toLowerCase();
  if (n.includes('fulfillment') || n.includes('fbs')) return 'full';
  if (n.includes('xpress')) return 'shopee_xpress';
  if (n.includes('same day') || n.includes('sameday')) return 'flex';
  if (n.includes('retire') || n.includes('retirada') || n.includes('pickup')) return 'retire';
  // "Padrão", "Standard", or generic drop-off maps to correios
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
      seen.add(shopeeLogisticFromName(l.logistic_name));
    }
  }

  const types = [...seen];
  // Determine primary type by priority order
  const primary =
    LOGISTIC_PRIORITY.find((p) => types.includes(p)) ?? (types[0] ?? 'unknown');

  return { logisticType: primary, logisticTypes: types };
}
