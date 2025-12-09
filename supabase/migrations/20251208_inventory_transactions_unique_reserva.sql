BEGIN;

WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY pack_id, product_id, storage_id, movement_type
           ORDER BY timestamp ASC, id ASC
         ) AS rn
  FROM public.inventory_transactions
  WHERE movement_type = 'RESERVA' AND pack_id IS NOT NULL
)
DELETE FROM public.inventory_transactions t
USING dups d
WHERE t.id = d.id
  AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reserva_pack_product_storage
ON public.inventory_transactions (pack_id, product_id, storage_id)
WHERE movement_type = 'RESERVA';

COMMIT;
