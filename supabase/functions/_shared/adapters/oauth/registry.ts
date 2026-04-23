// Provider registry for the universal OAuth adapter.
// To add a new marketplace: implement OAuthProviderAdapter and register it here.

import type { OAuthProviderAdapter } from "../../domain/oauth/oauth-provider.types.ts";
import { mercadoLivreAdapter } from "./providers/mercado-livre.ts";
import { shopeeAdapter } from "./providers/shopee.ts";

const REGISTRY = new Map<string, OAuthProviderAdapter>([
  [mercadoLivreAdapter.key, mercadoLivreAdapter],
  [shopeeAdapter.key, shopeeAdapter],
]);

/** Retrieve a provider adapter by its key. Throws if not registered. */
export function getProvider(key: string): OAuthProviderAdapter {
  const provider = REGISTRY.get(key);
  if (!provider) {
    throw new Error(`unknown_provider:${key}`);
  }
  return provider;
}

/** List all registered provider keys */
export function listProviderKeys(): string[] {
  return Array.from(REGISTRY.keys());
}

/** Check whether a provider key is registered */
export function hasProvider(key: string): boolean {
  return REGISTRY.has(key);
}
