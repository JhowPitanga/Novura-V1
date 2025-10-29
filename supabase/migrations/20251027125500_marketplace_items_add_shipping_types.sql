-- Adiciona coluna shipping_types (lista de tipos de envio: full, flex, agencia)
BEGIN;

ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS shipping_types text[];

-- Índice opcional para consultas por organização e atualizações recentes
CREATE INDEX IF NOT EXISTS idx_marketplace_items_shipping_types
  ON public.marketplace_items (organizations_id, updated_at DESC);

COMMIT;