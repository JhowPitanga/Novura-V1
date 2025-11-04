BEGIN;

-- Converter registros antigos de marketplace_stock_distribution com shipping_type='agencia'
-- para 'envios' quando a origem é do vendedor (seller_warehouse ou selling_address).
-- Se o item tiver logistic_type='drop_off', converter para 'correios'; caso contrário, 'envios'.
UPDATE public.marketplace_stock_distribution AS msd
SET shipping_type = CASE 
      WHEN lower(coalesce(mi.data -> 'shipping' ->> 'logistic_type','')) = 'drop_off' THEN 'correios'
      ELSE 'envios'
    END,
    updated_at = now()
FROM public.marketplace_items mi
WHERE msd.shipping_type = 'agencia'
  AND msd.location_type IN ('seller_warehouse', 'selling_address')
  AND mi.organizations_id = msd.organizations_id
  AND mi.marketplace_name = msd.marketplace_name
  AND mi.marketplace_item_id = msd.marketplace_item_id
  AND mi.marketplace_name = 'Mercado Livre';

-- Recalcular shipping_types dos itens a partir da distribuição atualizada
WITH agg AS (
  SELECT
    mi.organizations_id,
    mi.marketplace_name,
    mi.marketplace_item_id,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT msd.shipping_type), NULL) AS shipping_types_new
  FROM public.marketplace_items mi
  JOIN public.marketplace_stock_distribution msd
    ON msd.organizations_id = mi.organizations_id
   AND msd.marketplace_name = mi.marketplace_name
   AND msd.marketplace_item_id = mi.marketplace_item_id
  WHERE msd.shipping_type IS NOT NULL
  GROUP BY mi.organizations_id, mi.marketplace_name, mi.marketplace_item_id
)
UPDATE public.marketplace_items mi
SET shipping_types = COALESCE(agg.shipping_types_new, mi.shipping_types),
    updated_at = now()
FROM agg
WHERE mi.organizations_id = agg.organizations_id
  AND mi.marketplace_name = agg.marketplace_name
  AND mi.marketplace_item_id = agg.marketplace_item_id;

-- Atualizar o campo JSONB stock_distribution.shipping_types para refletir os tipos recalculados
WITH agg2 AS (
  SELECT
    mi.organizations_id,
    mi.marketplace_name,
    mi.marketplace_item_id,
    to_jsonb(mi.shipping_types) AS shipping_types_json
  FROM public.marketplace_items mi
  WHERE mi.shipping_types IS NOT NULL
)
UPDATE public.marketplace_items mi
SET stock_distribution = jsonb_set(
      COALESCE(mi.stock_distribution, '{}'::jsonb),
      '{shipping_types}',
      COALESCE(agg2.shipping_types_json, '[]'::jsonb),
      true
    ),
    updated_at = now()
FROM agg2
WHERE mi.organizations_id = agg2.organizations_id
  AND mi.marketplace_name = agg2.marketplace_name
  AND mi.marketplace_item_id = agg2.marketplace_item_id;

COMMIT;