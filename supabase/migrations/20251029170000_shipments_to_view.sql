-- Migração total: consolidar marketplace_shipments em marketplace_orders_raw.shipments (JSONB)
-- e converter a tabela marketplace_shipments em uma VIEW compatível para leitura.

BEGIN;

-- 1) Se a tabela física existir, unir novamente os dados incluindo date_created
DO $$
DECLARE shipments_tbl_exists boolean;
BEGIN
  shipments_tbl_exists := to_regclass('public.marketplace_shipments') IS NOT NULL;

  IF shipments_tbl_exists THEN
    -- Preferir os elementos vindos da tabela normalizada (ms) ao deduplicar por 'id'
    WITH shipments_per_order AS (
      SELECT
        ms.organizations_id,
        ms.marketplace_name,
        ms.marketplace_order_id,
        jsonb_agg(
          jsonb_build_object(
            'id', ms.marketplace_shipment_id,
            'status', ms.status,
            'substatus', ms.substatus,
            'logistic_type', ms.logistic_type,
            'mode', ms.mode,
            'shipping_mode', ms.shipping_mode,
            'service_id', ms.service_id,
            'carrier', ms.carrier,
            'tracking_number', ms.tracking_number,
            'tracking_url', ms.tracking_url,
            'tracking_history', ms.tracking_history,
            'receiver_address', ms.receiver_address,
            'sender_address', ms.sender_address,
            'costs', ms.costs,
            'items', ms.items,
            'promise', ms.promise,
            'tags', ms.tags,
            'dimensions', ms.dimensions,
            'data', ms.data,
            'date_created', ms.date_created,
            'last_updated', ms.last_updated,
            'date_ready_to_ship', ms.date_ready_to_ship,
            'date_first_printed', ms.date_first_printed,
            'last_synced_at', ms.last_synced_at
          )
        ) AS shipments_json
      FROM public.marketplace_shipments ms
      GROUP BY ms.organizations_id, ms.marketplace_name, ms.marketplace_order_id
    ),
    combined AS (
      SELECT
        mor.organizations_id,
        mor.marketplace_name,
        mor.marketplace_order_id,
        jsonb_array_elements(COALESCE(mor.shipments, '[]'::jsonb)) AS elem,
        2 AS src_priority
      FROM public.marketplace_orders_raw mor
      UNION ALL
      SELECT
        spo.organizations_id,
        spo.marketplace_name,
        spo.marketplace_order_id,
        jsonb_array_elements(COALESCE(spo.shipments_json, '[]'::jsonb)) AS elem,
        1 AS src_priority
      FROM shipments_per_order spo
    ),
    dedup AS (
      SELECT
        organizations_id,
        marketplace_name,
        marketplace_order_id,
        jsonb_agg(elem ORDER BY src_priority) AS shipments_json
      FROM (
        SELECT DISTINCT ON (organizations_id, marketplace_name, marketplace_order_id, elem->>'id')
          organizations_id, marketplace_name, marketplace_order_id, elem, src_priority
        FROM combined
        ORDER BY organizations_id, marketplace_name, marketplace_order_id, (elem->>'id'), src_priority
      ) s
      GROUP BY organizations_id, marketplace_name, marketplace_order_id
    )
    UPDATE public.marketplace_orders_raw mor
    SET shipments = d.shipments_json,
        updated_at = now(),
        last_synced_at = now()
    FROM dedup d
    WHERE mor.organizations_id = d.organizations_id
      AND mor.marketplace_name = d.marketplace_name
      AND mor.marketplace_order_id = d.marketplace_order_id;

    -- Remover publicação Realtime para a tabela, se existir
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'marketplace_shipments'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.marketplace_shipments';
    END IF;

    -- Remover a tabela física
    DROP TABLE IF EXISTS public.marketplace_shipments CASCADE;
  END IF;
END $$;

-- 2) Criar VIEW compatível: desnormaliza o JSONB shipments em linhas legíveis
CREATE OR REPLACE VIEW public.marketplace_shipments AS
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
  elem->'tracking_history' AS tracking_history,
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
  (elem->>'last_synced_at')::timestamptz AS last_synced_at
FROM public.marketplace_orders_raw mor
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(mor.shipments, '[]'::jsonb)) elem
WHERE mor.organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), mor.organizations_id);

-- 3) Conceder permissões de SELECT na VIEW
GRANT SELECT ON public.marketplace_shipments TO authenticated;
GRANT SELECT ON public.marketplace_shipments TO anon;

COMMIT;