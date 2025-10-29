BEGIN;

-- Adiciona coluna para persistir o tipo de localização retornado pela API do Mercado Livre
ALTER TABLE public.marketplace_stock_distribution
  ADD COLUMN IF NOT EXISTS location_type text;

-- Índice para filtros e análises por tipo de localização
CREATE INDEX IF NOT EXISTS idx_marketplace_stock_distribution_location_type
  ON public.marketplace_stock_distribution(location_type);

COMMIT;