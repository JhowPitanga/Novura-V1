-- Performance module: fn_perf_listings_sold
-- Returns all listings (by marketplace_item_id) that had at least 1 unit sold
-- in the given period, along with aggregated metrics and margin % when unit_cost is set.

CREATE OR REPLACE FUNCTION public.fn_perf_listings_sold(
  p_org_id      uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_marketplace text DEFAULT NULL
)
RETURNS TABLE (
  id          text,
  titulo      text,
  sku         text,
  marketplace text,
  image_url   text,
  pedidos     bigint,
  unidades    bigint,
  valor       numeric,
  margin_pct  numeric,
  pct         numeric,
  cum_pct     numeric,
  tag         char(1)
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
      AND (
        p_marketplace IS NULL
        OR p_marketplace = 'todos'
        OR REPLACE(REPLACE(LOWER(o.marketplace), '_', ''), ' ', '') =
           REPLACE(REPLACE(LOWER(p_marketplace), '_', ''), ' ', '')
      )
  ),
  aggregated AS (
    SELECT
      oi.marketplace_item_id                                             AS item_id,
      MAX(oi.title)                                                      AS titulo,
      MAX(oi.sku)                                                        AS sku,
      MAX(os.marketplace)                                                AS marketplace,
      MAX(oi.image_url)                                                  AS image_url,
      COUNT(DISTINCT oi.order_id)::bigint                                AS pedidos,
      SUM(oi.quantity)::bigint                                           AS unidades,
      SUM(oi.quantity::numeric * oi.unit_price)::numeric                 AS valor,
      SUM(
        CASE WHEN oi.unit_cost IS NOT NULL
          THEN oi.quantity::numeric * oi.unit_cost
          ELSE NULL
        END
      )                                                                  AS total_cost,
      SUM(oi.quantity::numeric * oi.unit_price)                         AS total_revenue
    FROM order_items oi
    INNER JOIN order_scope os ON os.id = oi.order_id
    WHERE oi.marketplace_item_id IS NOT NULL AND oi.marketplace_item_id != ''
    GROUP BY oi.marketplace_item_id
  ),
  ranked AS (
    SELECT
      a.*,
      CASE
        WHEN SUM(a.valor) OVER () > 0
          THEN ROUND((a.valor / SUM(a.valor) OVER ()) * 100, 2)
        ELSE 0
      END AS pct,
      ROW_NUMBER() OVER (ORDER BY a.valor DESC) AS rn
    FROM aggregated a
    WHERE a.unidades > 0
  ),
  with_cum AS (
    SELECT
      r.*,
      SUM(r.pct) OVER (ORDER BY r.rn ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_pct
    FROM ranked r
  )
  SELECT
    c.item_id,
    COALESCE(c.titulo, 'Anúncio ' || c.item_id),
    COALESCE(c.sku, ''),
    c.marketplace,
    c.image_url,
    c.pedidos,
    c.unidades,
    c.valor,
    CASE
      WHEN c.total_cost IS NOT NULL AND c.total_revenue > 0
        THEN ROUND(((c.total_revenue - c.total_cost) / c.total_revenue) * 100, 2)
      ELSE NULL
    END AS margin_pct,
    c.pct,
    ROUND(c.cum_pct, 2),
    CASE
      WHEN (c.cum_pct - c.pct) < 80 THEN 'A'
      WHEN (c.cum_pct - c.pct) < 95 THEN 'B'
      ELSE 'C'
    END::char(1)
  FROM with_cum c
  ORDER BY c.valor DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.fn_perf_listings_sold(uuid, timestamptz, timestamptz, text) TO authenticated;
