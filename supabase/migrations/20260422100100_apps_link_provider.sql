-- Link apps table to marketplace_providers and refresh the public view
-- to expose provider_key and category to the frontend.

BEGIN;

-- Add provider_id FK to apps
ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS provider_id uuid
    REFERENCES public.marketplace_providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_apps_provider_id
  ON public.apps(provider_id)
  WHERE provider_id IS NOT NULL;

-- Backfill: link existing apps to their provider by matching name
UPDATE public.apps a
SET provider_id = mp.id
FROM public.marketplace_providers mp
WHERE mp.key = 'mercado_livre'
  AND regexp_replace(lower(a.name), '[\s_\-]+', '', 'g') =
      regexp_replace(lower(mp.display_name), '[\s_\-]+', '', 'g')
  AND a.provider_id IS NULL;

UPDATE public.apps a
SET provider_id = mp.id
FROM public.marketplace_providers mp
WHERE mp.key = 'shopee'
  AND lower(a.name) = lower(mp.display_name)
  AND a.provider_id IS NULL;

-- Refresh the public view to include provider_key and category from the provider
CREATE OR REPLACE VIEW public.apps_public_view AS
SELECT
  a.id,
  a.name,
  a.description,
  a.logo_url,
  a.category,
  a.price_type,
  a.auth_url,
  a.created_at,
  a.updated_at,
  a.provider_id,
  mp.key   AS provider_key,
  mp.category AS provider_category,
  mp.auth_protocol,
  mp.refresh_threshold_minutes
FROM public.apps a
LEFT JOIN public.marketplace_providers mp ON mp.id = a.provider_id;

COMMIT;
