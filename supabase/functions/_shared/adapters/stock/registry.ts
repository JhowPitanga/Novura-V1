/**
 * StockAdapterRegistry — maps marketplace_name to its IStockChannelAdapter provider.
 *
 * To add a new channel:
 *   1. Implement IStockChannelAdapter in providers/<channel>.ts
 *   2. Import and register it in REGISTRY below
 *   3. Create PGMQ queue + pg_cron config (migration)
 *   4. Create thin edge function wrapper
 *   See: docs/prds/PLANO-MIGRACAO-ADAPTADORES-UNIVERSAIS-ESTOQUE.md §3.2
 */

import type { IStockChannelAdapter } from "../../domain/stock/ports/IStockChannelAdapter.ts";
import { ShopeeStockProvider }        from "./providers/shopee.ts";
import { MercadoLivreStockProvider }  from "./providers/mercado-livre.ts";

const REGISTRY = new Map<string, IStockChannelAdapter>([
  ["Shopee",        new ShopeeStockProvider()],
  ["Mercado Livre", new MercadoLivreStockProvider()],
  // To add Amazon: ["Amazon", new AmazonStockProvider()]
]);

/**
 * Returns the IStockChannelAdapter registered for the given marketplace name.
 * Throws if the marketplace has no registered provider — this is always a
 * configuration error that should never reach production silently.
 */
export function getStockAdapter(marketplaceName: string): IStockChannelAdapter {
  const adapter = REGISTRY.get(marketplaceName);
  if (!adapter) {
    throw new Error(
      `StockAdapterRegistry: no provider registered for marketplace '${marketplaceName}'. ` +
      `Registered keys: ${[...REGISTRY.keys()].join(", ")}`
    );
  }
  return adapter;
}

/** Returns all registered marketplace names (used by the dispatcher for routing). */
export function registeredMarketplaces(): string[] {
  return [...REGISTRY.keys()];
}
