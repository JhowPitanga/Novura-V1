// Barrel — re-exports all public symbols from listings/ sub-services.
// Sub-modules must import SIBLINGS directly (never this barrel) to avoid cycles.
export type { ConnectedMarketplacesResult, MarketplaceStoreOption } from "./listings/integrations.service";
export {
  fetchConnectedMarketplaces,
  fetchMarketplaceStores,
} from "./listings/integrations.service";

export type {
  FetchListingsResult,
  FetchListingsCanonicalResult,
} from "./listings/fetch.service";
export {
  isListingsCanonicalEnabled,
  fetchListings,
  fetchListingsCanonical,
  deleteListingItem,
} from "./listings/fetch.service";

export {
  fetchDrafts,
  deleteDraft,
  deleteDrafts,
  createDraftFromListing,
} from "./listings/drafts.service";

export type { StockDistributionEntry } from "./listings/stock.service";
export {
  fetchFulfillmentStockForListings,
  fetchStockDistributionForListings,
} from "./listings/stock.service";

export {
  syncSingleListing,
  syncAllListings,
  syncSelectedListings,
  updateItemStatus,
  updateShopeeStock,
} from "./listings/sync.service";

export {
  createListingsChannel,
  removeListingsChannel,
} from "./listings/realtime.service";
