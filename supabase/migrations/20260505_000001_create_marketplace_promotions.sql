-- Universal promotions schema for Novura.
-- Supports Mercado Livre (SELLER_CAMPAIGN, LIGHTNING) and Shopee (discount, shop_flash_sale).
-- All writes happen via Edge Functions (service_role); reads are org-scoped.

BEGIN;

-- ─── marketplace_promotions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketplace_promotions (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id            uuid        REFERENCES public.marketplace_integrations(id) ON DELETE SET NULL,
  marketplace_key           text        NOT NULL,  -- 'mercado_livre' | 'shopee'
  external_id               text        NOT NULL,  -- C-MLB..., LGH-MLB..., discount_id, flash_sale_id
  promotion_type            text        NOT NULL CHECK (promotion_type IN ('STANDARD_DISCOUNT','FLASH_SALE')),
  source                    text        NOT NULL DEFAULT 'seller_created'
                                          CHECK (source IN ('seller_created','platform_invite','time_slot')),
  status                    text        NOT NULL DEFAULT 'pending'
                                          CHECK (status IN ('draft','pending','scheduled','active','ended','cancelled','candidate')),
  name                      text,
  start_date                timestamptz,
  finish_date               timestamptz,
  deadline_date             timestamptz,
  discount_percent          numeric(6,2),
  meli_percent              numeric(6,2),
  seller_percent            numeric(6,2),
  raw                       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at            timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_mp_org_marketplace_external
    UNIQUE (organizations_id, marketplace_key, external_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_org         ON public.marketplace_promotions(organizations_id);
CREATE INDEX IF NOT EXISTS idx_mp_integration ON public.marketplace_promotions(integration_id);
CREATE INDEX IF NOT EXISTS idx_mp_status      ON public.marketplace_promotions(status);
CREATE INDEX IF NOT EXISTS idx_mp_type        ON public.marketplace_promotions(promotion_type);
CREATE INDEX IF NOT EXISTS idx_mp_synced      ON public.marketplace_promotions(last_synced_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.mp_promotions_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mp_promotions_updated_at ON public.marketplace_promotions;
CREATE TRIGGER trg_mp_promotions_updated_at
  BEFORE UPDATE ON public.marketplace_promotions
  FOR EACH ROW EXECUTE FUNCTION public.mp_promotions_set_updated_at();

-- RLS
ALTER TABLE public.marketplace_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Promotions: org members can view" ON public.marketplace_promotions;
CREATE POLICY "Promotions: org members can view"
  ON public.marketplace_promotions FOR SELECT
  USING (public.is_org_member(auth.uid(), organizations_id));

DROP POLICY IF EXISTS "Promotions: service role can write" ON public.marketplace_promotions;
CREATE POLICY "Promotions: service role can write"
  ON public.marketplace_promotions FOR ALL
  USING (auth.role() = 'service_role');

-- ─── marketplace_promotion_items ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketplace_promotion_items (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id              uuid        NOT NULL REFERENCES public.marketplace_promotions(id) ON DELETE CASCADE,
  marketplace_item_id       text        NOT NULL,
  variation_id              text,       -- Shopee model_id or ML variation id; NULL for simple items
  status                    text        NOT NULL DEFAULT 'candidate'
                                          CHECK (status IN ('candidate','pending','started','finished','paused')),
  original_price            numeric(14,2),
  deal_price                numeric(14,2),
  top_deal_price            numeric(14,2),
  min_discounted_price      numeric(14,2),
  max_discounted_price      numeric(14,2),
  suggested_discounted_price numeric(14,2),
  promotion_stock           integer,
  purchase_limit            integer,
  raw                       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at            timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mpi_promotion_item_variation
  ON public.marketplace_promotion_items (promotion_id, marketplace_item_id, COALESCE(variation_id, ''));

CREATE INDEX IF NOT EXISTS idx_mpi_promotion    ON public.marketplace_promotion_items(promotion_id);
CREATE INDEX IF NOT EXISTS idx_mpi_item         ON public.marketplace_promotion_items(marketplace_item_id);
CREATE INDEX IF NOT EXISTS idx_mpi_status       ON public.marketplace_promotion_items(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.mp_promotion_items_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mpi_updated_at ON public.marketplace_promotion_items;
CREATE TRIGGER trg_mpi_updated_at
  BEFORE UPDATE ON public.marketplace_promotion_items
  FOR EACH ROW EXECUTE FUNCTION public.mp_promotion_items_set_updated_at();

-- RLS: row-level isolation via parent promotion's org
ALTER TABLE public.marketplace_promotion_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PromotionItems: org members can view" ON public.marketplace_promotion_items;
CREATE POLICY "PromotionItems: org members can view"
  ON public.marketplace_promotion_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_promotions mp
      WHERE mp.id = promotion_id
        AND public.is_org_member(auth.uid(), mp.organizations_id)
    )
  );

DROP POLICY IF EXISTS "PromotionItems: service role can write" ON public.marketplace_promotion_items;
CREATE POLICY "PromotionItems: service role can write"
  ON public.marketplace_promotion_items FOR ALL
  USING (auth.role() = 'service_role');

COMMIT;
