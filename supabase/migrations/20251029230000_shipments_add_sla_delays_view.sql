-- Atualiza a VIEW marketplace_shipments para expor campos de SLA e atrasos
-- provenientes do JSONB shipments em marketplace_orders_raw.

BEGIN;

-- Recriar a view para adicionar novas colunas sem perder compatibilidade
DROP VIEW IF EXISTS public.marketplace_shipments CASCADE;

CREATE VIEW public.marketplace_shipments AS
SELECT
  mor.organizations_id,
  mor.company_id,
  mor.marketplace_name,
  mor.marketplace_order_id,
  (elem->>'id') AS marketplace_shipment_id,
  elem->>'status' AS status,
  elem->>'substatus' AS substatus,
  elem->>'logistic_type' AS logistic_type,
  elem->>'mode' AS mode,
  elem->>'shipping_mode' AS shipping_mode,
  elem->>'service_id' AS service_id,
  elem->>'carrier' AS carrier,
  elem->>'tracking_number' AS tracking_number,
  elem->>'tracking_url' AS tracking_url,
  elem->'receiver_address' AS receiver_address,
  elem->'sender_address' AS sender_address,
  elem->'costs' AS costs,
  elem->'items' AS items,
  elem->'promise' AS promise,
  elem->'tags' AS tags,
  elem->'dimensions' AS dimensions,
  elem->'data' AS data,
  (elem->>'date_created')::timestamptz AS date_created,
  (elem->>'last_updated')::timestamptz AS last_updated,
  (elem->>'date_ready_to_ship')::timestamptz AS date_ready_to_ship,
  (elem->>'date_first_printed')::timestamptz AS date_first_printed,
  (elem->>'last_synced_at')::timestamptz AS last_synced_at,

  -- Novos campos de SLA do despacho
  elem->>'sla_status' AS sla_status,
  elem->>'sla_service' AS sla_service,
  (elem->>'sla_expected_date')::timestamptz AS sla_expected_date,
  (elem->>'sla_last_updated')::timestamptz AS sla_last_updated,

  -- Atrasos (array JSONB, seguindo o formato da API)
  elem->'delays' AS delays
FROM public.marketplace_orders_raw mor
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(mor.shipments, '[]'::jsonb)) elem
WHERE mor.organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), mor.organizations_id);

-- Reaplicar permissões de SELECT
GRANT SELECT ON public.marketplace_shipments TO authenticated;
GRANT SELECT ON public.marketplace_shipments TO anon;

COMMIT;