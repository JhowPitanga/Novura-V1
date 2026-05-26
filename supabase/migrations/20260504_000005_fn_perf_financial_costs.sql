-- Performance module: fn_perf_financial_costs (Fase 4 — preparatória para tab Financeiro)
-- Aggregates marketplace fees, shipping costs and sale fees per listing from the
-- richer marketplace_orders_presented_new view. Not yet consumed by the frontend
-- in Phase 1, but the RPC validates data availability and is ready for Phase 4 UI.

CREATE OR REPLACE FUNCTION public.fn_perf_financial_costs(
  p_org_id      uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_marketplace text DEFAULT NULL
)
RETURNS TABLE (
  marketplace      text,
  item_id          text,
  item_title       text,
  total_revenue    numeric,
  marketplace_fee  numeric,
  shipping_cost    numeric,
  sale_fee         numeric,
  total_cost       numeric,
  pct_revenue      numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT
    o.marketplace::text,
    COALESCE(o.first_item_id, '')::text           AS item_id,
    COALESCE(o.first_item_title, '')::text         AS item_title,
    SUM(COALESCE(o.order_total, 0))                AS total_revenue,
    SUM(COALESCE(o.payment_marketplace_fee, 0))    AS marketplace_fee,
    SUM(COALESCE(o.payment_shipping_cost, 0))      AS shipping_cost,
    SUM(COALESCE(o.items_total_sale_fee, 0))       AS sale_fee,
    SUM(
      COALESCE(o.payment_marketplace_fee, 0)
      + COALESCE(o.payment_shipping_cost, 0)
      + COALESCE(o.items_total_sale_fee, 0)
    )                                              AS total_cost,
    CASE
      WHEN SUM(COALESCE(o.order_total, 0)) > 0 THEN
        ROUND(
          SUM(
            COALESCE(o.payment_marketplace_fee, 0)
            + COALESCE(o.payment_shipping_cost, 0)
            + COALESCE(o.items_total_sale_fee, 0)
          ) / SUM(COALESCE(o.order_total, 0)) * 100,
          2
        )
      ELSE 0
    END                                            AS pct_revenue
  FROM marketplace_orders_presented_new o
  WHERE o.organizations_id = p_org_id
    AND o.created_at >= p_from
    AND o.created_at <= p_to
    AND (p_marketplace IS NULL OR p_marketplace = 'todos' OR o.marketplace = p_marketplace)
  GROUP BY o.marketplace, o.first_item_id, o.first_item_title
  ORDER BY total_revenue DESC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_perf_financial_costs(uuid, timestamptz, timestamptz, text) TO authenticated;

-- Financial overview from canonical orders table.
-- This is the current frontend source for the Financeiro overview while the
-- detailed per-listing evolution remains backed by fn_perf_financial_costs.
CREATE OR REPLACE FUNCTION public.fn_perf_financial_overview(
  p_org_id      uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_marketplace text DEFAULT NULL
)
RETURNS TABLE (
  total_revenue    numeric,
  net_revenue      numeric,
  tax_amount       numeric,
  marketplace_fee  numeric,
  shipping_cost    numeric,
  total_spent      numeric,
  pct_revenue      numeric,
  orders_count     bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT
    SUM(COALESCE(o.gross_amount, 0)) AS total_revenue,
    SUM(COALESCE(o.net_amount, o.gross_amount, 0)) AS net_revenue,
    GREATEST(
      SUM(COALESCE(o.gross_amount, 0))
      - SUM(COALESCE(o.net_amount, o.gross_amount, 0))
      - SUM(COALESCE(o.marketplace_fee, 0))
      - SUM(COALESCE(o.shipping_cost, 0)),
      0
    ) AS tax_amount,
    SUM(COALESCE(o.marketplace_fee, 0)) AS marketplace_fee,
    SUM(COALESCE(o.shipping_cost, 0)) AS shipping_cost,
    SUM(COALESCE(o.marketplace_fee, 0) + COALESCE(o.shipping_cost, 0))
    + GREATEST(
      SUM(COALESCE(o.gross_amount, 0))
      - SUM(COALESCE(o.net_amount, o.gross_amount, 0))
      - SUM(COALESCE(o.marketplace_fee, 0))
      - SUM(COALESCE(o.shipping_cost, 0)),
      0
    ) AS total_spent,
    CASE
      WHEN SUM(COALESCE(o.gross_amount, 0)) > 0 THEN
        ROUND(
          (
            SUM(COALESCE(o.marketplace_fee, 0) + COALESCE(o.shipping_cost, 0))
            + GREATEST(
              SUM(COALESCE(o.gross_amount, 0))
              - SUM(COALESCE(o.net_amount, o.gross_amount, 0))
              - SUM(COALESCE(o.marketplace_fee, 0))
              - SUM(COALESCE(o.shipping_cost, 0)),
              0
            )
          )
          / SUM(COALESCE(o.gross_amount, 0)) * 100,
          2
        )
      ELSE 0
    END AS pct_revenue,
    COUNT(*)::bigint AS orders_count
  FROM orders o
  WHERE o.organization_id = p_org_id
    AND o.created_at >= p_from
    AND o.created_at <= p_to
    AND (
      p_marketplace IS NULL
      OR p_marketplace = 'todos'
      OR REPLACE(REPLACE(LOWER(o.marketplace), '_', ''), ' ', '') =
         REPLACE(REPLACE(LOWER(p_marketplace), '_', ''), ' ', '')
    );
$$;

GRANT EXECUTE ON FUNCTION public.fn_perf_financial_overview(uuid, timestamptz, timestamptz, text) TO authenticated;
