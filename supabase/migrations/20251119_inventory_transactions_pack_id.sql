BEGIN;

-- Adiciona pack_id e retroalimenta a partir de source_ref quando possível
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS pack_id bigint;

UPDATE public.inventory_transactions it
SET pack_id = NULLIF(regexp_replace(it.source_ref, '^PEDIDO\[(\d+)\]$', '\1'), '')::bigint
WHERE it.source_ref LIKE 'PEDIDO[%]'
  AND it.pack_id IS NULL;

-- Remove a FK e a coluna order_id, padronizando referência por pack_id
ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_order_id_fkey;

ALTER TABLE public.inventory_transactions
  DROP COLUMN IF EXISTS order_id;

-- Índice por pack_id para auditoria e consultas
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_pack ON public.inventory_transactions(pack_id);

COMMIT;