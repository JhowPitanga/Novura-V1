-- Seed Mercado Livre app into public.apps with UPSERT by name
INSERT INTO public.apps (id, name, description, logo_url, category, price_type, auth_url)
VALUES (
  'mercado_livre',
  'Mercado Livre',
  'Integração Mercado Livre (OAuth) para sincronizar anúncios e pedidos.',
  '/placeholder.svg',
  'marketplaces',
  'free',
  'https://auth.mercadolivre.com.br/authorization'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  logo_url = EXCLUDED.logo_url,
  category = EXCLUDED.category,
  price_type = EXCLUDED.price_type,
  auth_url = EXCLUDED.auth_url;