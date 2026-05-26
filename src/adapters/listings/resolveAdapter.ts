import type { MarketplaceAdapter, ChannelSlug } from './types';
import { mercadoLivreAdapter } from './mercadoLivre/adapter';
import { shopeeAdapter } from './shopee/adapter';

const ADAPTERS: Record<ChannelSlug, MarketplaceAdapter> = {
  'mercado-livre': mercadoLivreAdapter,
  shopee: shopeeAdapter,
};

/** Normalizes a marketplace display name or slug to a ChannelSlug. */
function toChannelSlug(value: string): ChannelSlug | null {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  if (raw === 'mercado-livre' || raw === 'mercadolivre' || raw === 'mercado' || raw === 'ml') return 'mercado-livre';
  if (raw === 'shopee') return 'shopee';
  return null;
}

/**
 * Resolves the correct MarketplaceAdapter for a given slug or display name.
 * Returns null when the marketplace is not supported.
 */
export function resolveAdapter(marketplaceSlugOrName: string): MarketplaceAdapter | null {
  const slug = toChannelSlug(marketplaceSlugOrName);
  if (!slug) return null;
  return ADAPTERS[slug] ?? null;
}

export type { MarketplaceAdapter, ChannelSlug };
