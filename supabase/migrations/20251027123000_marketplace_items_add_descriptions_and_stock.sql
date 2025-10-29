-- Adiciona colunas para descrição e distribuição de estoque em marketplace_items
BEGIN;

ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS description_plain_text text,
  ADD COLUMN IF NOT EXISTS description_html text,
  ADD COLUMN IF NOT EXISTS last_description_update timestamptz,
  ADD COLUMN IF NOT EXISTS stock_distribution jsonb,
  ADD COLUMN IF NOT EXISTS last_stock_update timestamptz;

-- Índices opcionais úteis para consultas por atualização recente
CREATE INDEX IF NOT EXISTS idx_marketplace_items_last_description_update
  ON public.marketplace_items (organizations_id, last_description_update DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_items_last_stock_update
  ON public.marketplace_items (organizations_id, last_stock_update DESC);

COMMIT;