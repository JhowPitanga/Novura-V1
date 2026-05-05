-- Performance module: fn_perf_product_sales_breakdown
-- Returns sales breakdown per product × marketplace for channel-mix charts.
-- Used by ProductChannelMixCell to show stacked marketplace bars.

CREATE OR REPLACE FUNCTION public.fn_perf_product_sales_breakdown(
  p_org_id      uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_marketplace text DEFAULT NULL
)
RETURNS TABLE (
  product_id         uuid,
  marketplace        text,
  valor              numeric,
  unidades           bigint,
  pct_within_product numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  WITH order_scope AS (
    SELECT o.id, o.marketplace
    FROM orders o
    WHERE o.organization_id = p_org_id
      AND o.created_at >= p_from
      AND o.created_at <= p_to
      AND (p_marketplace IS NULL OR p_marketplace = 'todos' OR o.marketplace = p_marketplace)
  ),
  by_prod_mkt AS (
    SELECT
      oi.product_id,
      os.marketplace,
      SUM(oi.quantity::numeric * oi.unit_price)::numeric AS valor,
      SUM(oi.quantity)::bigint                           AS unidades
    FROM order_items oi
    INNER JOIN order_scope os ON os.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
    GROUP BY oi.product_id, os.marketplace
  ),
  prod_totals AS (
    SELECT product_id, SUM(valor) AS total_valor
    FROM by_prod_mkt
    GROUP BY product_id
  )
  SELECT
    bpm.product_id,
    bpm.marketplace,
    bpm.valor,
    bpm.unidades,
    CASE WHEN pt.total_valor > 0
      THEN ROUND((bpm.valor / pt.total_valor) * 100, 2)
      ELSE 0
    END AS pct_within_product
  FROM by_prod_mkt bpm
  JOIN prod_totals pt ON pt.product_id = bpm.product_id
  ORDER BY bpm.product_id, bpm.valor DESC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_perf_product_sales_breakdown(uuid, timestamptz, timestamptz, text) TO authenticated;
