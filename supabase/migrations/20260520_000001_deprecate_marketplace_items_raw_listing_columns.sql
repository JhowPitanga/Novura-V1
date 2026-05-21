-- ANN-CLEAN-03: mark legacy JSON columns on marketplace_items_raw as deprecated.
-- Do not drop columns until all edge functions stop writing them.

COMMENT ON COLUMN marketplace_items_raw.performance_data IS
  'DEPRECATED (listings canonical): use marketplace_listing_quality / marketplace_listing_metrics.';

COMMENT ON COLUMN marketplace_items_raw.item_perfomance IS
  'DEPRECATED (typo, listings canonical): use marketplace_listing_metrics.';

COMMENT ON COLUMN marketplace_items_raw.promotion_price IS
  'DEPRECATED (listings canonical): use marketplace_listings.promo_price.';
