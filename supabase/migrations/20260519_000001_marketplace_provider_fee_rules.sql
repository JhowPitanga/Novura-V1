-- Cache of marketplace commission/fee rules by category (channel-agnostic shape).
-- Populated from API sync, order history, or manual config. Used by listing adapters.

CREATE TABLE IF NOT EXISTS marketplace_provider_fee_rules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_name        text NOT NULL,
  category_id             text NOT NULL,
  site_id                 text NOT NULL DEFAULT 'BR',
  currency                text NOT NULL DEFAULT 'BRL',
  commission_percentage   numeric(5,2),
  commission_fixed_fee    numeric(14,2) NOT NULL DEFAULT 0,
  listing_fee_amount      numeric(14,2) NOT NULL DEFAULT 0,
  source                  text NOT NULL DEFAULT 'unknown',
  metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from          timestamptz,
  effective_until         timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_provider_fee_rules_unique
    UNIQUE (marketplace_name, category_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_fee_rules_mkt_category
  ON marketplace_provider_fee_rules (marketplace_name, category_id);

ALTER TABLE marketplace_provider_fee_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_fee_rules_select ON marketplace_provider_fee_rules
  FOR SELECT USING (true);

CREATE POLICY provider_fee_rules_service_write ON marketplace_provider_fee_rules
  FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION update_marketplace_provider_fee_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_fee_rules_updated_at ON marketplace_provider_fee_rules;
CREATE TRIGGER trg_provider_fee_rules_updated_at
  BEFORE UPDATE ON marketplace_provider_fee_rules
  FOR EACH ROW EXECUTE FUNCTION update_marketplace_provider_fee_rules_updated_at();

-- Shopee BR default commission bands (fallback until API/order-derived rules exist)
INSERT INTO marketplace_provider_fee_rules (
  marketplace_name, category_id, site_id, commission_percentage, source, metadata
) VALUES
  ('Shopee', '_default', 'BR', 14.00, 'platform_default', '{"note":"Shopee BR typical seller commission fallback"}'::jsonb)
ON CONFLICT (marketplace_name, category_id, site_id)
DO NOTHING;
