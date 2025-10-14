-- Create view that omits secrets for frontend consumption
CREATE OR REPLACE VIEW public.apps_public_view AS
SELECT id, name, description, logo_url, category, price_type, auth_url, created_at, updated_at
FROM public.apps;

-- RLS for the view is inherited from base table visibility