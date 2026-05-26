/**
 * Canonical listing schema (see migration 20260518_000001_listings_canonical.sql).
 * Regenerate into Database types when `supabase gen types` is run against remote.
 */

export type ListingStatusCanonical =
  | 'active'
  | 'paused'
  | 'closed'
  | 'deleted'
  | 'under_review';

export type LogisticTypeCanonical =
  | 'full'
  | 'flex'
  | 'shopee_xpress'
  | 'envios'
  | 'correios'
  | 'agencia'
  | 'retire'
  | 'custom'
  | 'unknown';

export interface MarketplaceListingRow {
  id: string;
  organizations_id: string;
  marketplace_name: string;
  marketplace_item_id: string;
  title: string;
  sku?: string | null;
  price?: number | null;
  status: ListingStatusCanonical;
  status_raw?: string | null;
  listing_type_id?: string | null;
  available_quantity?: number;
  sold_quantity?: number;
  thumbnail_url?: string | null;
  updated_at?: string;
  last_synced_at?: string;
  shipping?: Record<string, unknown> | null;
  metrics?: Record<string, unknown> | null;
  quality?: Record<string, unknown> | null;
  fees?: Record<string, unknown> | null;
  variations?: Record<string, unknown>[] | null;
  pictures?: Record<string, unknown>[] | null;
}
