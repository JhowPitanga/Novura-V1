-- Adiciona coluna shipping_type para armazenar o tipo de envio (flex, full, agencia)
BEGIN;

ALTER TABLE public.marketplace_stock_distribution
  ADD COLUMN IF NOT EXISTS shipping_type text;

COMMIT;