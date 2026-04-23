-- Create marketplace_providers catalog table.
-- This normalizes provider metadata (auth URLs, protocol, refresh thresholds)
-- that was previously hardcoded in individual Edge Functions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,                    -- 'mercado_livre', 'shopee', 'amazon', ...
  display_name text NOT NULL,                  -- 'Mercado Livre', 'Shopee', ...
  category text NOT NULL DEFAULT 'marketplaces',  -- marketplaces | logistics | dropshipping | others
  logo_url text,
  description text,
  auth_protocol text NOT NULL DEFAULT 'oauth2_pkce',  -- oauth2_pkce | oauth2_hmac | api_key
  auth_url text,               -- base URL for the authorization endpoint
  token_url text,              -- URL for authorization_code → token exchange
  refresh_url text,            -- URL for token refresh (may equal token_url)
  refresh_threshold_minutes integer NOT NULL DEFAULT 30,  -- start refreshing this many minutes before expiry
  scopes text[] DEFAULT '{}',
  supports_webhook boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,   -- provider-specific metadata (signing algo, extra endpoints, etc.)
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.marketplace_providers_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_providers_updated_at ON public.marketplace_providers;
CREATE TRIGGER trg_marketplace_providers_updated_at
  BEFORE UPDATE ON public.marketplace_providers
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_providers_set_updated_at();

-- RLS: authenticated users can read the catalog; only service_role can mutate.
ALTER TABLE public.marketplace_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MarketplaceProviders: authenticated can read" ON public.marketplace_providers;
CREATE POLICY "MarketplaceProviders: authenticated can read"
  ON public.marketplace_providers FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

-- Seed Mercado Livre
INSERT INTO public.marketplace_providers
  (key, display_name, category, auth_protocol, auth_url, token_url, refresh_url,
   refresh_threshold_minutes, supports_webhook, config, description)
VALUES (
  'mercado_livre',
  'Mercado Livre',
  'marketplaces',
  'oauth2_pkce',
  'https://auth.mercadolivre.com.br/authorization',
  'https://api.mercadolibre.com/oauth/token',
  'https://api.mercadolibre.com/oauth/token',
  30,
  true,
  '{"seller_id_field": "user_id", "code_challenge_method": "S256"}'::jsonb,
  'Integração Mercado Livre (OAuth2 com PKCE) para sincronizar anúncios e pedidos.'
)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  auth_url     = EXCLUDED.auth_url,
  token_url    = EXCLUDED.token_url,
  refresh_url  = EXCLUDED.refresh_url,
  config       = EXCLUDED.config,
  updated_at   = now();

-- Seed Shopee
INSERT INTO public.marketplace_providers
  (key, display_name, category, auth_protocol, auth_url, token_url, refresh_url,
   refresh_threshold_minutes, supports_webhook, config, description)
VALUES (
  'shopee',
  'Shopee',
  'marketplaces',
  'oauth2_hmac',
  'https://partner.shopeemobile.com/api/v2/shop/auth_partner',
  'https://openplatform.shopee.com.br/api/v2/auth/token/get',
  'https://openplatform.shopee.com.br/api/v2/auth/access_token',
  20,
  true,
  '{"seller_id_field": "shop_id", "sign_algo": "HMAC-SHA256", "auth_path": "/api/v2/shop/auth_partner", "token_path": "/api/v2/auth/token/get", "refresh_path": "/api/v2/auth/access_token"}'::jsonb,
  'Integração Shopee (OAuth2 com HMAC-SHA256) para sincronizar anúncios e pedidos.'
)
ON CONFLICT (key) DO UPDATE SET
  display_name          = EXCLUDED.display_name,
  auth_url              = EXCLUDED.auth_url,
  token_url             = EXCLUDED.token_url,
  refresh_url           = EXCLUDED.refresh_url,
  refresh_threshold_minutes = EXCLUDED.refresh_threshold_minutes,
  config                = EXCLUDED.config,
  updated_at            = now();

COMMIT;
