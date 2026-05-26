-- Performance module: fn_perf_abc_products + fn_perf_abc_listings
-- Computes ABC Pareto (80/15/5) curves for products or listings.
-- criterion: 'valor' (revenue) or 'unidades' (quantity sold).
-- Tag assignment: prior-to-current cum_pct < 80 → A, < 95 → B, else → C.

-- ─── fn_perf_abc_products ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_perf_abc_products(
  p_org_id      uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_marketplace text    DEFAULT NULL,
  p_criterion   text    DEFAULT 'valor'
)
RETURNS TABLE (
  id       uuid,
  nome     text,
  valor    numeric,
  unidades bigint,
  pct      numeric,
  cum_pct  numeric,
  tag      char(1)
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_criterion NOT IN ('valor', 'unidades') THEN
    RAISE EXCEPTION 'p_criterion must be ''valor'' or ''unidades''';
  END IF;

  RETURN QUERY
  WITH order_scope AS (
    SELECT o.id
    FROM orders o
    WHERE o.organization_id = p_org_id
      AND o.created_at >= p_from
      AND o.created_at <= p_to
      AND (p_marketplace IS NULL OR p_marketplace = 'todos' OR o.marketplace = p_marketplace)
  ),
  by_product AS (
    SELECT
      oi.product_id,
      SUM(oi.quantity::numeric * oi.unit_price)::numeric AS valor,
      SUM(oi.quantity)::bigint                           AS unidades
    FROM order_items oi
    INNER JOIN order_scope os ON os.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
    GROUP BY oi.product_id
  ),
  totals AS (
    SELECT SUM(valor) AS total_valor, SUM(unidades) AS total_unidades
    FROM by_product
  ),
  ranked AS (
    SELECT
      bp.product_id,
      COALESCE(p.name, bp.product_id::text) AS nome,
      bp.valor,
      bp.unidades,
      CASE
        WHEN p_criterion = 'valor'    AND t.total_valor    > 0 THEN ROUND((bp.valor              / t.total_valor)    * 100, 2)
        WHEN p_criterion = 'unidades' AND t.total_unidades > 0 THEN ROUND((bp.unidades::numeric  / t.total_unidades) * 100, 2)
        ELSE 0
      END AS pct,
      ROW_NUMBER() OVER (
        ORDER BY CASE WHEN p_criterion = 'valor' THEN bp.valor ELSE bp.unidades::numeric END DESC
      ) AS rn
    FROM by_product bp
    CROSS JOIN totals t
    LEFT JOIN products p ON p.id = bp.product_id
  ),
  with_cum AS (
    SELECT
      r.*,
      SUM(r.pct) OVER (ORDER BY r.rn ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_pct
    FROM ranked r
  )
  SELECT
    c.product_id                                                       AS id,
    c.nome,
    c.valor,
    c.unidades,
    c.pct,
    ROUND(c.cum_pct, 2)                                                AS cum_pct,
    CASE
      WHEN (c.cum_pct - c.pct) < 80 THEN 'A'
      WHEN (c.cum_pct - c.pct) < 95 THEN 'B'
      ELSE 'C'
    END::char(1)                                                       AS tag
  FROM with_cum c
  ORDER BY c.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_perf_abc_products(uuid, timestamptz, timestamptz, text, text) TO authenticated;

-- ─── fn_perf_abc_listings ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_perf_abc_listings(
  p_org_id      uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_marketplace text    DEFAULT NULL,
  p_criterion   text    DEFAULT 'valor'
)
RETURNS TABLE (
  id          text,
  titulo      text,
  marketplace text,
  valor       numeric,
  unidades    bigint,
  pct         numeric,
  cum_pct     numeric,
  tag         char(1)
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_criterion NOT IN ('valor', 'unidades') THEN
    RAISE EXCEPTION 'p_criterion must be ''valor'' or ''unidades''';
  END IF;

  RETURN QUERY
  WITH order_scope AS (
    SELECT o.id, o.marketplace
    FROM orders o
    WHERE o.organization_id = p_org_id
      AND o.created_at >= p_from
      AND o.created_at <= p_to
      AND (p_marketplace IS NULL OR p_marketplace = 'todos' OR o.marketplace = p_marketplace)
  ),
  by_listing AS (
    SELECT
      oi.marketplace_item_id                               AS item_id,
      MAX(oi.title)                                        AS titulo,
      MAX(os.marketplace)                                  AS marketplace,
      SUM(oi.quantity::numeric * oi.unit_price)::numeric   AS valor,
      SUM(oi.quantity)::bigint                             AS unidades
    FROM order_items oi
    INNER JOIN order_scope os ON os.id = oi.order_id
    WHERE oi.marketplace_item_id IS NOT NULL AND oi.marketplace_item_id != ''
    GROUP BY oi.marketplace_item_id
  ),
  totals AS (
    SELECT SUM(valor) AS total_valor, SUM(unidades) AS total_unidades
    FROM by_listing
  ),
  ranked AS (
    SELECT
      bl.*,
      CASE
        WHEN p_criterion = 'valor'    AND t.total_valor    > 0 THEN ROUND((bl.valor             / t.total_valor)    * 100, 2)
        WHEN p_criterion = 'unidades' AND t.total_unidades > 0 THEN ROUND((bl.unidades::numeric / t.total_unidades) * 100, 2)
        ELSE 0
      END AS pct,
      ROW_NUMBER() OVER (
        ORDER BY CASE WHEN p_criterion = 'valor' THEN bl.valor ELSE bl.unidades::numeric END DESC
      ) AS rn
    FROM by_listing bl
    CROSS JOIN totals t
  ),
  with_cum AS (
    SELECT r.*, SUM(r.pct) OVER (ORDER BY r.rn ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_pct
    FROM ranked r
  )
  SELECT
    c.item_id,
    COALESCE(c.titulo, 'Anúncio ' || c.item_id)                       AS titulo,
    c.marketplace,
    c.valor,
    c.unidades,
    c.pct,
    ROUND(c.cum_pct, 2)                                                AS cum_pct,
    CASE
      WHEN (c.cum_pct - c.pct) < 80 THEN 'A'
      WHEN (c.cum_pct - c.pct) < 95 THEN 'B'
      ELSE 'C'
    END::char(1)                                                       AS tag
  FROM with_cum c
  ORDER BY c.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_perf_abc_listings(uuid, timestamptz, timestamptz, text, text) TO authenticated;
