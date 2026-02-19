BEGIN;

WITH dups AS (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY order_id, product_id, storage_id, movement_type
        ORDER BY timestamp ASC, id ASC
      ) AS rn
    FROM public.inventory_transactions
    WHERE order_id IS NOT NULL
      AND movement_type IN ('RESERVA','SAIDA','CANCELAMENTO_RESERVA')
  ) s
  WHERE s.rn > 1
)
DELETE FROM public.inventory_transactions t
USING dups d
WHERE t.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reserva_order_product_storage
ON public.inventory_transactions (order_id, product_id, storage_id, movement_type)
WHERE movement_type = 'RESERVA' AND order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_saida_order_product_storage
ON public.inventory_transactions (order_id, product_id, storage_id, movement_type)
WHERE movement_type = 'SAIDA' AND order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_cancel_order_product_storage
ON public.inventory_transactions (order_id, product_id, storage_id, movement_type)
WHERE movement_type = 'CANCELAMENTO_RESERVA' AND order_id IS NOT NULL;

COMMIT;
