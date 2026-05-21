import type { ListingStatusCanonical } from '../types.ts';

const ML_STATUS_MAP: Record<string, ListingStatusCanonical> = {
  active: 'active',
  paused: 'paused',
  closed: 'closed',
  under_review: 'under_review',
  inactive: 'closed',
};

const SHOPEE_STATUS_MAP: Record<string, ListingStatusCanonical> = {
  NORMAL: 'active',
  UNLIST: 'paused',
  BANNED: 'deleted',
  DELETED: 'deleted',
  REVIEWING: 'under_review',
};

export function mapMercadoLivreStatus(raw: string | null | undefined): ListingStatusCanonical {
  if (!raw) return 'active';
  return ML_STATUS_MAP[raw.toLowerCase()] ?? 'active';
}

export function mapShopeeStatus(raw: string | null | undefined): ListingStatusCanonical {
  if (!raw) return 'active';
  return SHOPEE_STATUS_MAP[raw.toUpperCase()] ?? 'active';
}
