-- Adds ml_kind column to marketplace_promotions to store the native ML promotion type
-- (DEAL, MARKETPLACE_CAMPAIGN, VOLUME, DOD, LIGHTNING, PRICE_DISCOUNT, PRE_NEGOTIATED,
--  SMART, PRICE_MATCHING, PRICE_MATCHING_MELI_ALL, UNHEALTHY_STOCK,
--  SELLER_COUPON_CAMPAIGN, BANK).
-- The promotion_type column keeps 'STANDARD_DISCOUNT' | 'FLASH_SALE' for cross-marketplace compat.
-- Shopee rows will have ml_kind = NULL.

BEGIN;

ALTER TABLE public.marketplace_promotions
  ADD COLUMN IF NOT EXISTS ml_kind text;

CREATE INDEX IF NOT EXISTS idx_mp_ml_kind
  ON public.marketplace_promotions(ml_kind);

COMMENT ON COLUMN public.marketplace_promotions.ml_kind IS
  'Native Mercado Livre promotion_type (e.g. DEAL, MARKETPLACE_CAMPAIGN, BANK). NULL for Shopee.';

COMMIT;
