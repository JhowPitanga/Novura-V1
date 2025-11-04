-- Adiciona coluna para cache de etiquetas em marketplace_orders_raw

BEGIN;

ALTER TABLE public.marketplace_orders_raw
  ADD COLUMN IF NOT EXISTS labels jsonb;

-- Índice parcial para acelerar filtros por existência de labels
CREATE INDEX IF NOT EXISTS idx_mor_labels_nonnull
  ON public.marketplace_orders_raw (marketplace_order_id)
  WHERE labels IS NOT NULL;

COMMIT;