-- =============================================================================
-- Migration: listings_canonical
-- Creates the canonical listing tables that replace marketplace_items_raw
-- and marketplace_items_unified view. These tables are channel-agnostic and
-- populated by the listing adapters in _shared/listing-adapters/.
-- Additive-only: existing tables are untouched.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_status_canonical') THEN
    CREATE TYPE listing_status_canonical AS ENUM (
      'active',
      'paused',
      'closed',
      'deleted',
      'under_review'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'logistic_type_canonical') THEN
    CREATE TYPE logistic_type_canonical AS ENUM (
      'full',          -- Fulfillment / FBS (Mercado Livre Full, Shopee Fulfillment)
      'flex',          -- Mercado Envios Flex / Shopee Same Day
      'shopee_xpress', -- Shopee Xpress (entrega acelerada operada pela Shopee)
      'envios',        -- Mercado Envios padrão / drop-off do canal
      'correios',      -- Correios / Shopee Padrão
      'agencia',       -- Agência (Mercado Livre)
      'retire',        -- Retirada local / Shopee Retire
      'custom',        -- ME1 (Mercado Livre) / outros não mapeados
      'unknown'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_quality_level_canonical') THEN
    CREATE TYPE listing_quality_level_canonical AS ENUM (
      'excellent',
      'good',
      'medium',
      'low',
      'incomplete',
      'unknown'
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 1. marketplace_listings (core)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id             uuid REFERENCES companies(id),
  integration_id         uuid REFERENCES marketplace_integrations(id),

  marketplace_name       text NOT NULL,  -- 'Mercado Livre' | 'Shopee'
  marketplace_item_id    text NOT NULL,  -- MLBxxxx | Shopee item_id

  -- Display
  title                  text NOT NULL,
  sku                    text,
  category_id            text,
  category_path          text,
  permalink              text,
  thumbnail_url          text,
  has_variations         boolean NOT NULL DEFAULT false,
  condition              text,           -- 'new' | 'used' | 'refurbished'

  -- Canonical status + raw channel value
  status                 listing_status_canonical NOT NULL DEFAULT 'active',
  status_raw             text,           -- 'NORMAL' | 'paused' | …
  sub_status             text[],
  pause_reason           text,

  -- Price snapshot (details in marketplace_listing_fees)
  price                  numeric(14,2),
  original_price         numeric(14,2),
  promo_price            numeric(14,2),
  currency               text NOT NULL DEFAULT 'BRL',

  -- Aggregated stock
  available_quantity     integer NOT NULL DEFAULT 0,
  sold_quantity          integer NOT NULL DEFAULT 0,

  -- Mercado Livre catalog fields
  listing_type_id        text,
  catalog_listing        boolean,
  catalog_product_id     text,

  -- Timestamps
  marketplace_created_at timestamptz,
  marketplace_updated_at timestamptz,
  last_synced_at         timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketplace_listings_unique
    UNIQUE (organizations_id, marketplace_name, marketplace_item_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_org_mkt_status
  ON marketplace_listings (organizations_id, marketplace_name, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_org_updated
  ON marketplace_listings (organizations_id, marketplace_updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_fulltext
  ON marketplace_listings USING gin (to_tsvector('portuguese', coalesce(title, '')));

-- ---------------------------------------------------------------------------
-- 2. marketplace_listing_variations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_listing_variations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id             uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id       uuid NOT NULL,
  marketplace_name       text NOT NULL,
  marketplace_item_id    text NOT NULL,
  variation_id           text NOT NULL,  -- Mercado Livre: variation.id / Shopee: model_id

  sku                    text,
  price                  numeric(14,2),
  original_price         numeric(14,2),
  promo_price            numeric(14,2),
  available_quantity     integer NOT NULL DEFAULT 0,
  sold_quantity          integer NOT NULL DEFAULT 0,
  image_url              text,
  attributes             jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_for_listing    boolean NOT NULL DEFAULT false,

  last_synced_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketplace_listing_variations_unique
    UNIQUE (organizations_id, marketplace_name, marketplace_item_id, variation_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listing_variations_listing
  ON marketplace_listing_variations (listing_id);

-- ---------------------------------------------------------------------------
-- 3. marketplace_listing_pictures
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_listing_pictures (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id             uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  variation_id           uuid REFERENCES marketplace_listing_variations(id) ON DELETE CASCADE,
  organizations_id       uuid NOT NULL,
  marketplace_name       text NOT NULL,
  marketplace_item_id    text NOT NULL,
  external_picture_id    text,
  url                    text NOT NULL,
  secure_url             text,
  position               integer NOT NULL DEFAULT 0,
  is_video               boolean NOT NULL DEFAULT false,
  video_url              text
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listing_pictures_listing_pos
  ON marketplace_listing_pictures (listing_id, position);

-- ---------------------------------------------------------------------------
-- 4. marketplace_listing_attributes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_listing_attributes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id             uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id       uuid NOT NULL,
  marketplace_name       text NOT NULL,
  marketplace_item_id    text NOT NULL,
  attribute_id           text NOT NULL,  -- 'BRAND', 'GTIN', 'COLOR', …
  attribute_name         text,
  value_id               text,
  value_name             text,
  value_struct           jsonb,          -- number_unit: { number, unit }
  is_required            boolean,
  is_variation_attr      boolean,

  CONSTRAINT marketplace_listing_attributes_unique
    UNIQUE (listing_id, attribute_id)
);

-- ---------------------------------------------------------------------------
-- 5. marketplace_listing_shipping
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_listing_shipping (
  listing_id              uuid PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id        uuid NOT NULL,
  marketplace_name        text NOT NULL,
  marketplace_item_id     text NOT NULL,

  logistic_type           logistic_type_canonical NOT NULL DEFAULT 'unknown',
  logistic_types          logistic_type_canonical[] NOT NULL DEFAULT '{}',
  shipping_mode           text,   -- 'ME1' | 'ME2' | 'shopee_logistics' | …

  free_shipping           boolean NOT NULL DEFAULT false,
  mandatory_free_shipping boolean NOT NULL DEFAULT false,
  local_pick_up           boolean NOT NULL DEFAULT false,

  package_length_cm       numeric(8,2),
  package_width_cm        numeric(8,2),
  package_height_cm       numeric(8,2),
  package_weight_g        numeric(10,2),

  last_synced_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. marketplace_listing_metrics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_listing_metrics (
  listing_id              uuid PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id        uuid NOT NULL,
  marketplace_name        text NOT NULL,
  marketplace_item_id     text NOT NULL,

  visits_total            integer NOT NULL DEFAULT 0,
  visits_last_30_days     integer NOT NULL DEFAULT 0,
  impressions             integer,
  sales_total             integer NOT NULL DEFAULT 0,
  sales_last_30_days      integer,
  conversion_rate         numeric(6,4) NOT NULL DEFAULT 0,

  -- Shopee engagement
  likes_total             integer NOT NULL DEFAULT 0,
  comments_total          integer NOT NULL DEFAULT 0,

  -- Reviews
  rating_average          numeric(3,2),
  reviews_count           integer NOT NULL DEFAULT 0,

  last_visits_update      timestamptz,
  last_reviews_update     timestamptz,
  last_synced_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. marketplace_listing_quality
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_listing_quality (
  listing_id              uuid PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id        uuid NOT NULL,
  marketplace_name        text NOT NULL,
  marketplace_item_id     text NOT NULL,

  quality_score           numeric(5,2),   -- 0-100 (Mercado Livre listing_quality)
  quality_level           listing_quality_level_canonical NOT NULL DEFAULT 'unknown',
  missing_attributes      text[] NOT NULL DEFAULT '{}',
  unfinished_tasks        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- Shopee content_diagnosis_result

  last_synced_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 8. marketplace_listing_fees
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_listing_fees (
  listing_id              uuid PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id        uuid NOT NULL,
  marketplace_name        text NOT NULL,
  marketplace_item_id     text NOT NULL,

  currency                text NOT NULL DEFAULT 'BRL',
  commission_amount       numeric(14,2),   -- total fee charged
  commission_percentage   numeric(5,2),    -- % applied
  commission_fixed_fee    numeric(14,2),   -- fixed floor
  listing_fee_amount      numeric(14,2),   -- Mercado Livre listing/publication fee
  shipping_subsidy        numeric(14,2),   -- shipping cost offset
  total_fees_estimated    numeric(14,2),   -- sum estimate

  source_payload_version  integer,
  last_synced_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 9. marketplace_listings_raw (versioned payload store)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_listings_raw (
  id                      bigserial PRIMARY KEY,
  organizations_id        uuid NOT NULL,
  marketplace_name        text NOT NULL,
  marketplace_item_id     text NOT NULL,
  integration_id          uuid REFERENCES marketplace_integrations(id),
  payload                 jsonb NOT NULL,
  payload_version         integer NOT NULL DEFAULT 1,
  payload_source          text NOT NULL,  -- 'sync-items' | 'webhook' | 'sync-one' | 'backfill'
  fetched_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketplace_listings_raw_unique
    UNIQUE (organizations_id, marketplace_name, marketplace_item_id, payload_version)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_raw_lookup
  ON marketplace_listings_raw (organizations_id, marketplace_name, marketplace_item_id, fetched_at DESC);

-- ---------------------------------------------------------------------------
-- 10. marketplace_listing_sync_jobs (audit trail for single-item sync)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_listing_sync_jobs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id        uuid NOT NULL,
  marketplace_name        text NOT NULL,
  marketplace_item_id     text NOT NULL,
  triggered_by_user_id    uuid REFERENCES auth.users(id),
  scope                   text NOT NULL,  -- 'full' | 'metrics' | 'fees' | 'quality' | 'backfill'
  status                  text NOT NULL DEFAULT 'queued',  -- 'queued'|'running'|'success'|'error'
  error_message           text,
  duration_ms             integer,
  started_at              timestamptz,
  finished_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listing_sync_jobs_lookup
  ON marketplace_listing_sync_jobs (organizations_id, marketplace_name, marketplace_item_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- marketplace_listings
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_listings_select ON marketplace_listings
  FOR SELECT USING (
    organizations_id IN (
      SELECT organizations_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY marketplace_listings_service_write ON marketplace_listings
  FOR ALL USING (auth.role() = 'service_role');

-- marketplace_listing_variations
ALTER TABLE marketplace_listing_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_listing_variations_select ON marketplace_listing_variations
  FOR SELECT USING (
    organizations_id IN (
      SELECT organizations_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY marketplace_listing_variations_service_write ON marketplace_listing_variations
  FOR ALL USING (auth.role() = 'service_role');

-- marketplace_listing_pictures
ALTER TABLE marketplace_listing_pictures ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_listing_pictures_select ON marketplace_listing_pictures
  FOR SELECT USING (
    organizations_id IN (
      SELECT organizations_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY marketplace_listing_pictures_service_write ON marketplace_listing_pictures
  FOR ALL USING (auth.role() = 'service_role');

-- marketplace_listing_attributes
ALTER TABLE marketplace_listing_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_listing_attributes_select ON marketplace_listing_attributes
  FOR SELECT USING (
    organizations_id IN (
      SELECT organizations_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY marketplace_listing_attributes_service_write ON marketplace_listing_attributes
  FOR ALL USING (auth.role() = 'service_role');

-- marketplace_listing_shipping
ALTER TABLE marketplace_listing_shipping ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_listing_shipping_select ON marketplace_listing_shipping
  FOR SELECT USING (
    organizations_id IN (
      SELECT organizations_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY marketplace_listing_shipping_service_write ON marketplace_listing_shipping
  FOR ALL USING (auth.role() = 'service_role');

-- marketplace_listing_metrics
ALTER TABLE marketplace_listing_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_listing_metrics_select ON marketplace_listing_metrics
  FOR SELECT USING (
    organizations_id IN (
      SELECT organizations_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY marketplace_listing_metrics_service_write ON marketplace_listing_metrics
  FOR ALL USING (auth.role() = 'service_role');

-- marketplace_listing_quality
ALTER TABLE marketplace_listing_quality ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_listing_quality_select ON marketplace_listing_quality
  FOR SELECT USING (
    organizations_id IN (
      SELECT organizations_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY marketplace_listing_quality_service_write ON marketplace_listing_quality
  FOR ALL USING (auth.role() = 'service_role');

-- marketplace_listing_fees
ALTER TABLE marketplace_listing_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_listing_fees_select ON marketplace_listing_fees
  FOR SELECT USING (
    organizations_id IN (
      SELECT organizations_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY marketplace_listing_fees_service_write ON marketplace_listing_fees
  FOR ALL USING (auth.role() = 'service_role');

-- marketplace_listings_raw (read restricted to owner/admin via application layer)
ALTER TABLE marketplace_listings_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_listings_raw_service_only ON marketplace_listings_raw
  FOR ALL USING (auth.role() = 'service_role');

-- marketplace_listing_sync_jobs
ALTER TABLE marketplace_listing_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_listing_sync_jobs_select ON marketplace_listing_sync_jobs
  FOR SELECT USING (
    organizations_id IN (
      SELECT organizations_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY marketplace_listing_sync_jobs_service_write ON marketplace_listing_sync_jobs
  FOR ALL USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- updated_at trigger for marketplace_listings
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_marketplace_listings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_listings_updated_at ON marketplace_listings;
CREATE TRIGGER trg_marketplace_listings_updated_at
  BEFORE UPDATE ON marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION update_marketplace_listings_updated_at();
