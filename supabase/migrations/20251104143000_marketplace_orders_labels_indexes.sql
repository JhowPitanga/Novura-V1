-- Índices para acelerar buscas de etiquetas em marketplace_orders_raw.labels

BEGIN;

-- Índice parcial por organização e response_type (filtra Mercado Livre)
CREATE INDEX IF NOT EXISTS idx_mor_labels_resp_type_org
  ON public.marketplace_orders_raw (
    organizations_id,
    ((labels->>'response_type'))
  )
  WHERE labels IS NOT NULL AND marketplace_name = 'Mercado Livre';

-- Índice parcial composto para localizar rapidamente pedidos com labels
CREATE INDEX IF NOT EXISTS idx_mor_labels_nonnull_org_marketplace
  ON public.marketplace_orders_raw (
    organizations_id,
    marketplace_name,
    marketplace_order_id
  )
  WHERE labels IS NOT NULL;

COMMIT;