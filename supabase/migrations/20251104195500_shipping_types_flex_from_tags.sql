BEGIN;

-- Adicionar FLEX quando tag 'self_service_in' estiver presente, ou quando logistic_type = 'self_service'.
-- Não adicionar FLEX quando houver 'self_service_out' e logistic_type <> 'self_service'.

-- Recomputar apenas a presença/ausência de 'flex' dentro de marketplace_items.shipping_types
WITH base AS (
  SELECT
    mi.organizations_id,
    mi.marketplace_name,
    mi.marketplace_item_id,
    (mi.data -> 'shipping' -> 'tags') @> '["self_service_in"]'::jsonb AS has_flex_in,
    (mi.data -> 'shipping' -> 'tags') @> '["self_service_out"]'::jsonb AS has_flex_out,
    lower(coalesce(mi.data -> 'shipping' ->> 'logistic_type','')) AS lg_type,
    mi.shipping_types AS current_types
  FROM public.marketplace_items mi
  WHERE mi.marketplace_name = 'Mercado Livre'
),
recompute AS (
  SELECT
    b.organizations_id,
    b.marketplace_name,
    b.marketplace_item_id,
    CASE
      -- Se está explicitamente desabilitado e não é logistic_type self_service, remover 'flex'
      WHEN b.has_flex_out = TRUE AND b.lg_type <> 'self_service' THEN (
        SELECT ARRAY(
          SELECT DISTINCT x FROM unnest(COALESCE(b.current_types, ARRAY[]::text[])) AS t(x)
          WHERE x <> 'flex'
        )
      )
      -- Se 'self_service_in' presente ou logistic_type é self_service, garantir 'flex' presente
      WHEN b.has_flex_in = TRUE OR b.lg_type = 'self_service' THEN (
        SELECT ARRAY(
          SELECT DISTINCT x FROM unnest(COALESCE(b.current_types, ARRAY[]::text[]) || ARRAY['flex']) AS t(x)
        )
      )
      -- Caso contrário, manter como está
      ELSE b.current_types
    END AS shipping_types_new
  FROM base b
)
UPDATE public.marketplace_items mi
SET shipping_types = COALESCE(r.shipping_types_new, mi.shipping_types),
    stock_distribution = jsonb_set(
      COALESCE(mi.stock_distribution, '{}'::jsonb),
      '{shipping_types}',
      to_jsonb(COALESCE(r.shipping_types_new, mi.shipping_types)),
      true
    ),
    updated_at = now()
FROM recompute r
WHERE mi.organizations_id = r.organizations_id
  AND mi.marketplace_name = r.marketplace_name
  AND mi.marketplace_item_id = r.marketplace_item_id;

COMMIT;