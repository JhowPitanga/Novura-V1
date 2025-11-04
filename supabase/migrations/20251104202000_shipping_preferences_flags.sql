BEGIN;

-- Adiciona colunas para armazenar preferências de envio do seller e flags agregadas
ALTER TABLE public.marketplace_integrations
  ADD COLUMN IF NOT EXISTS shipping_preferences jsonb,
  ADD COLUMN IF NOT EXISTS preferences_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS flex_enabled boolean,
  ADD COLUMN IF NOT EXISTS envios_enabled boolean,
  ADD COLUMN IF NOT EXISTS correios_enabled boolean,
  ADD COLUMN IF NOT EXISTS full_enabled boolean;

-- Opcional: índices para consulta por marketplace/organização
CREATE INDEX IF NOT EXISTS marketplace_integrations_org_marketplace_idx
  ON public.marketplace_integrations (organizations_id, marketplace_name);

COMMIT;