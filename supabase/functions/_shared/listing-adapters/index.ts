// Entry point for the listing adapter layer.
// Call resolveAdapter(channel) to get the right adapter.

import { mercadoLivreAdapter } from './mercadoLivre.ts';
import { shopeeAdapter } from './shopee.ts';
import type { ListingAdapter } from './types.ts';

export type SupportedChannel = 'mercado-livre' | 'shopee';

const ADAPTERS: Record<SupportedChannel, ListingAdapter> = {
  'mercado-livre': mercadoLivreAdapter,
  'shopee': shopeeAdapter,
};

export function resolveAdapter(channel: string): ListingAdapter {
  const key = normalizeChannelKey(channel);
  const adapter = ADAPTERS[key];
  if (!adapter) {
    throw new Error(`No listing adapter found for channel: "${channel}"`);
  }
  return adapter;
}

function normalizeChannelKey(channel: string): SupportedChannel {
  const c = channel.toLowerCase().trim();
  if (c === 'mercado livre' || c === 'mercado-livre' || c === 'ml') return 'mercado-livre';
  if (c === 'shopee') return 'shopee';
  throw new Error(`Unknown channel: "${channel}"`);
}

export * from './types.ts';
export { mercadoLivreAdapter } from './mercadoLivre.ts';
export { shopeeAdapter } from './shopee.ts';
export { shouldWriteCanonical } from './shouldWriteCanonical.ts';
export { syncCanonicalFromPayload } from './syncCanonicalFromPayload.ts';
export { prepareAdapterPayload } from './prepareAdapterPayload.ts';
export {
  reconcileCanonicalFromStoredRaw,
  fetchMlSupplementary,
  fetchShopeeSupplementary,
  fetchChannelSupplementary,
  isMercadoLivreChannel,
  isShopeeChannel,
} from './reconcileCanonical.ts';
export { resolveCanonicalFees } from './shared/feesResolve.ts';
