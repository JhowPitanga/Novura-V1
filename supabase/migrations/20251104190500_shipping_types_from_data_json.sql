BEGIN;

-- Recomputar shipping_types em marketplace_items a partir do JSON "data.shipping"
-- Regras (sem inferir FLEX apenas por tag):
--  - Flex: logistic_type = 'self_service'
--  - Envios: logistic_type IN ('xd_drop_off','cross_docking')
--  - Correios: logistic_type = 'drop_off'
--  - Full: logistic_type IN ('fulfillment','fbm') OU stock_distribution.locations contém 'full' ou warehouse 'meli_facility'

WITH recompute AS (
  SELECT
    mi.organizations_id,
    mi.marketplace_name,
    mi.marketplace_item_id,
    ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        CASE WHEN lower(coalesce(mi.data -> 'shipping' ->> 'logistic_type','')) = 'self_service' THEN 'flex' END,
        CASE WHEN lower(coalesce(mi.data -> 'shipping' ->> 'logistic_type','')) IN ('xd_drop_off','cross_docking') THEN 'envios' END,
        CASE WHEN lower(coalesce(mi.data -> 'shipping' ->> 'logistic_type','')) = 'drop_off' THEN 'correios' END,
        CASE WHEN lower(coalesce(mi.data -> 'shipping' ->> 'logistic_type','')) IN ('fulfillment','fbm') THEN 'full' END,
        CASE WHEN (mi.stock_distribution -> 'locations') @> '[{"shipping_type":"full"}]'::jsonb THEN 'full' END,
        CASE WHEN (mi.stock_distribution -> 'locations') @> '[{"warehouse_id":"meli_facility"}]'::jsonb THEN 'full' END
      ]) AS t(x)
      WHERE x IS NOT NULL
    ) AS shipping_types_new
  FROM public.marketplace_items mi
  WHERE mi.marketplace_name = 'Mercado Livre'
)
UPDATE public.marketplace_items mi
SET shipping_types = COALESCE(recompute.shipping_types_new, mi.shipping_types),
    updated_at = now()
FROM recompute
WHERE mi.organizations_id = recompute.organizations_id
  AND mi.marketplace_name = recompute.marketplace_name
  AND mi.marketplace_item_id = recompute.marketplace_item_id;

-- Atualizar o campo JSONB stock_distribution.shipping_types para refletir os tipos recalculados
WITH src AS (
  SELECT
    mi.organizations_id,
    mi.marketplace_name,
    mi.marketplace_item_id,
    to_jsonb(mi.shipping_types) AS shipping_types_json
  FROM public.marketplace_items mi
  WHERE mi.marketplace_name = 'Mercado Livre'
)
UPDATE public.marketplace_items mi
SET stock_distribution = jsonb_set(
      COALESCE(mi.stock_distribution, '{}'::jsonb),
      '{shipping_types}',
      COALESCE(src.shipping_types_json, '[]'::jsonb),
      true
    ),
    updated_at = now()
FROM src
WHERE mi.organizations_id = src.organizations_id
  AND mi.marketplace_name = src.marketplace_name
  AND mi.marketplace_item_id = src.marketplace_item_id;

-- Sanitização adicional: alinhar marketplace_stock_distribution.shipping_type ao logistic_type do item
-- Correios: forçar 'correios' quando logistic_type = 'drop_off'
UPDATE public.marketplace_stock_distribution AS msd
SET shipping_type = 'correios',
    updated_at = now()
FROM public.marketplace_items mi
WHERE mi.organizations_id = msd.organizations_id
  AND mi.marketplace_name = msd.marketplace_name
  AND mi.marketplace_item_id = msd.marketplace_item_id
  AND mi.marketplace_name = 'Mercado Livre'
  AND lower(coalesce(mi.data -> 'shipping' ->> 'logistic_type','')) = 'drop_off'
  AND msd.location_type IN ('seller_warehouse','selling_address');

-- Envios: forçar 'envios' quando logistic_type IN ('xd_drop_off','cross_docking')
UPDATE public.marketplace_stock_distribution AS msd
SET shipping_type = 'envios',
    updated_at = now()
FROM public.marketplace_items mi
WHERE mi.organizations_id = msd.organizations_id
  AND mi.marketplace_name = msd.marketplace_name
  AND mi.marketplace_item_id = msd.marketplace_item_id
  AND mi.marketplace_name = 'Mercado Livre'
  AND lower(coalesce(mi.data -> 'shipping' ->> 'logistic_type','')) IN ('xd_drop_off','cross_docking')
  AND msd.location_type IN ('seller_warehouse','selling_address');

-- Flex: forçar 'flex' quando logistic_type = 'self_service'
UPDATE public.marketplace_stock_distribution AS msd
SET shipping_type = 'flex',
    updated_at = now()
FROM public.marketplace_items mi
WHERE mi.organizations_id = msd.organizations_id
  AND mi.marketplace_name = msd.marketplace_name
  AND mi.marketplace_item_id = msd.marketplace_item_id
  AND mi.marketplace_name = 'Mercado Livre'
  AND lower(coalesce(mi.data -> 'shipping' ->> 'logistic_type','')) = 'self_service'
  AND msd.location_type IN ('seller_warehouse','selling_address');

-- Full: forçar 'full' apenas em 'meli_facility' quando logistic_type IN ('fulfillment','fbm')
UPDATE public.marketplace_stock_distribution AS msd
SET shipping_type = 'full',
    updated_at = now()
FROM public.marketplace_items mi
WHERE mi.organizations_id = msd.organizations_id
  AND mi.marketplace_name = msd.marketplace_name
  AND mi.marketplace_item_id = msd.marketplace_item_id
  AND mi.marketplace_name = 'Mercado Livre'
  AND lower(coalesce(mi.data -> 'shipping' ->> 'logistic_type','')) IN ('fulfillment','fbm')
  AND msd.location_type = 'meli_facility';

COMMIT;