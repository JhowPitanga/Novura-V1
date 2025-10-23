-- Create marketplace_metrics table to store performance metrics for marketplace items
-- Includes organization isolation, helpful indexes, RLS policies, and Realtime publication

-- 1) Table definition
CREATE TABLE IF NOT EXISTS public.marketplace_metrics (
  id BIGSERIAL PRIMARY KEY,
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_item_id text NOT NULL,
  marketplace_name text NOT NULL DEFAULT 'Mercado Livre',
  
  -- Métricas de Reviews/Opiniões
  rating_average numeric(3,2), -- Ex: 4.85 (0.00 a 5.00)
  reviews_count integer DEFAULT 0,
  reviews_data jsonb, -- Dados completos das reviews da API
  
  -- Métricas de Performance/Qualidade
  listing_quality numeric, -- Score de qualidade (0-100)
  quality_level text, -- Nível de qualidade (básica, satisfatória, profissional)
  performance_data jsonb, -- Dados completos da API de performance
  
  -- Métricas de Visitas (quando disponíveis)
  visits_total integer DEFAULT 0,
  visits_last_30_days integer DEFAULT 0,
  visits_data jsonb, -- Para dados históricos de visitas
  
  -- Métricas de Conversão
  conversion_rate numeric(5,2), -- Taxa de conversão em %
  impressions integer DEFAULT 0, -- Impressões do anúncio
  
  -- Controle de atualização
  last_quality_update timestamptz,
  last_reviews_update timestamptz,
  last_visits_update timestamptz,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2) Uniqueness to avoid duplicates per org+marketplace+item
ALTER TABLE public.marketplace_metrics
  ADD CONSTRAINT uq_marketplace_metrics_org_marketplace_item UNIQUE (organizations_id, marketplace_name, marketplace_item_id);

-- 3) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_metrics_org ON public.marketplace_metrics(organizations_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_metrics_item_id ON public.marketplace_metrics(marketplace_item_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_metrics_marketplace ON public.marketplace_metrics(marketplace_name);
CREATE INDEX IF NOT EXISTS idx_marketplace_metrics_quality ON public.marketplace_metrics(listing_quality);
CREATE INDEX IF NOT EXISTS idx_marketplace_metrics_rating ON public.marketplace_metrics(rating_average);
CREATE INDEX IF NOT EXISTS idx_marketplace_metrics_updated ON public.marketplace_metrics(last_updated DESC);

-- 4) Enable RLS
ALTER TABLE public.marketplace_metrics ENABLE ROW LEVEL SECURITY;

-- 5) Policies
-- SELECT: allow members of the org to view metrics
DROP POLICY IF EXISTS "Marketplace metrics: members can view" ON public.marketplace_metrics;
CREATE POLICY "Marketplace metrics: members can view"
ON public.marketplace_metrics
FOR SELECT
USING (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

-- INSERT: service-side writes or privileged roles; require org match and owners/admins
DROP POLICY IF EXISTS "Marketplace metrics: owners/admins can insert" ON public.marketplace_metrics;
CREATE POLICY "Marketplace metrics: owners/admins can insert"
ON public.marketplace_metrics
FOR INSERT
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- UPDATE: only owners/admins in the row org
DROP POLICY IF EXISTS "Marketplace metrics: owners/admins can update" ON public.marketplace_metrics;
CREATE POLICY "Marketplace metrics: owners/admins can update"
ON public.marketplace_metrics
FOR UPDATE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- DELETE: only owners/admins in the row org
DROP POLICY IF EXISTS "Marketplace metrics: owners/admins can delete" ON public.marketplace_metrics;
CREATE POLICY "Marketplace metrics: owners/admins can delete"
ON public.marketplace_metrics
FOR DELETE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- 6) Realtime replication
ALTER TABLE public.marketplace_metrics REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_metrics';
  END IF;
END $$;

-- 7) Create view for easy querying with marketplace_items
CREATE OR REPLACE VIEW public.marketplace_items_with_metrics AS
SELECT 
  mi.id,
  mi.organizations_id,
  mi.company_id,
  mi.marketplace_name,
  mi.marketplace_item_id,
  mi.title,
  mi.sku,
  mi.condition,
  mi.status,
  mi.price,
  mi.available_quantity,
  mi.sold_quantity,
  mi.category_id,
  mi.permalink,
  mi.attributes,
  mi.variations,
  mi.pictures,
  mi.tags,
  mi.seller_id,
  mi.data,
  mi.published_at,
  mi.last_synced_at,
  mi.created_at,
  mi.updated_at,
  -- Métricas da tabela marketplace_metrics
  mm.rating_average,
  mm.reviews_count,
  mm.listing_quality as metrics_listing_quality,
  mm.quality_level as metrics_quality_level,
  mm.visits_total,
  mm.visits_last_30_days,
  mm.conversion_rate,
  mm.impressions,
  mm.last_quality_update,
  mm.last_reviews_update,
  mm.last_visits_update,
  mm.last_updated as metrics_last_updated
FROM public.marketplace_items mi
LEFT JOIN public.marketplace_metrics mm 
  ON mi.organizations_id = mm.organizations_id 
  AND mi.marketplace_item_id = mm.marketplace_item_id 
  AND mi.marketplace_name = mm.marketplace_name;

-- 8) Grant permissions on the view
GRANT SELECT ON public.marketplace_items_with_metrics TO authenticated;
GRANT SELECT ON public.marketplace_items_with_metrics TO anon;
