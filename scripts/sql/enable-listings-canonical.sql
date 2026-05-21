-- ANN-FLAG-01 / ANN-FLAG-02: enable canonical listing reads for an organization.
-- Replace <ORG_UUID> before running in Supabase SQL Editor.

UPDATE marketplace_integrations
SET config = COALESCE(config, '{}'::jsonb) || '{"listings_canonical": true}'::jsonb
WHERE organizations_id = '<ORG_UUID>'
  AND marketplace_name IN ('Mercado Livre', 'Shopee');
