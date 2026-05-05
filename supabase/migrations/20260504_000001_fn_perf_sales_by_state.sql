-- Performance module: fn_perf_sales_by_state
-- Aggregates sales by buyer state (UF) for a given org + date range.
-- Primary source: order_shipping.state_uf; fallback: orders.buyer_state.
-- SECURITY INVOKER — RLS on orders/order_items applies to the caller.

CREATE OR REPLACE FUNCTION public.fn_perf_sales_by_state(
  p_org_id    uuid,
  p_from      timestamptz,
  p_to        timestamptz,
  p_marketplace text DEFAULT NULL
)
RETURNS TABLE (
  uf           text,
  state_name   text,
  pedidos      bigint,
  unidades     bigint,
  total        numeric,
  ticket_medio numeric,
  pct_total    numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  WITH order_scope AS (
    SELECT
      o.id,
      o.gross_amount,
      COALESCE(
        NULLIF(UPPER(TRIM(os.state_uf)), ''),
        NULLIF(UPPER(TRIM(o.buyer_state)), '')
      ) AS uf
    FROM orders o
    LEFT JOIN order_shipping os ON os.order_id = o.id
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
  item_qty AS (
    SELECT oi.order_id, SUM(oi.quantity) AS qty
    FROM order_items oi
    WHERE oi.order_id IN (SELECT id FROM order_scope)
    GROUP BY oi.order_id
  ),
  by_uf AS (
    SELECT
      COALESCE(NULLIF(o.uf, ''), 'N/D') AS uf,
      COUNT(DISTINCT o.id)              AS pedidos,
      SUM(COALESCE(iq.qty, 0))          AS unidades,
      SUM(COALESCE(o.gross_amount, 0))  AS total
    FROM order_scope o
    LEFT JOIN item_qty iq ON iq.order_id = o.id
    GROUP BY COALESCE(NULLIF(o.uf, ''), 'N/D')
  ),
  grand AS (SELECT SUM(total) AS gt FROM by_uf WHERE uf != 'N/D')
  SELECT
    b.uf,
    CASE b.uf
      WHEN 'AC' THEN 'Acre'
      WHEN 'AL' THEN 'Alagoas'
      WHEN 'AP' THEN 'Amapá'
      WHEN 'AM' THEN 'Amazonas'
      WHEN 'BA' THEN 'Bahia'
      WHEN 'CE' THEN 'Ceará'
      WHEN 'DF' THEN 'Distrito Federal'
      WHEN 'ES' THEN 'Espírito Santo'
      WHEN 'GO' THEN 'Goiás'
      WHEN 'MA' THEN 'Maranhão'
      WHEN 'MT' THEN 'Mato Grosso'
      WHEN 'MS' THEN 'Mato Grosso do Sul'
      WHEN 'MG' THEN 'Minas Gerais'
      WHEN 'PA' THEN 'Pará'
      WHEN 'PB' THEN 'Paraíba'
      WHEN 'PR' THEN 'Paraná'
      WHEN 'PE' THEN 'Pernambuco'
      WHEN 'PI' THEN 'Piauí'
      WHEN 'RJ' THEN 'Rio de Janeiro'
      WHEN 'RN' THEN 'Rio Grande do Norte'
      WHEN 'RS' THEN 'Rio Grande do Sul'
      WHEN 'RO' THEN 'Rondônia'
      WHEN 'RR' THEN 'Roraima'
      WHEN 'SC' THEN 'Santa Catarina'
      WHEN 'SP' THEN 'São Paulo'
      WHEN 'SE' THEN 'Sergipe'
      WHEN 'TO' THEN 'Tocantins'
      ELSE b.uf
    END AS state_name,
    b.pedidos::bigint,
    b.unidades::bigint,
    b.total,
    CASE WHEN b.pedidos > 0 THEN ROUND(b.total / b.pedidos, 2) ELSE 0 END AS ticket_medio,
    CASE WHEN g.gt > 0     THEN ROUND((b.total / g.gt) * 100, 2) ELSE 0 END AS pct_total
  FROM by_uf b
  CROSS JOIN grand g
  WHERE b.uf != 'N/D'
  ORDER BY b.total DESC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_perf_sales_by_state(uuid, timestamptz, timestamptz, text) TO authenticated;
