-- Merge normalized shipments data into marketplace_orders_raw.shipments
-- Goal: keep all order-related data in a single table (marketplace_orders_raw)
-- This migration aggregates marketplace_shipments rows per order and unions them
-- with existing marketplace_orders_raw.shipments JSONB array, deduplicating by 'id'.

DO $$
BEGIN
  -- Ensure target table exists
  IF to_regclass('public.marketplace_orders_raw') IS NULL THEN
    RAISE NOTICE 'Table public.marketplace_orders_raw does not exist; skipping merge.';
    RETURN;
  END IF;

  -- Aggregate shipments per order from marketplace_shipments
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
  )
  UPDATE public.marketplace_orders_raw mor
  SET shipments = (
        SELECT jsonb_agg(elem)
        FROM (
          SELECT DISTINCT ON (elem->>'id') elem
          FROM (
            SELECT jsonb_array_elements(COALESCE(mor.shipments, '[]'::jsonb)) AS elem
            UNION ALL
            SELECT jsonb_array_elements(COALESCE(spo.shipments_json, '[]'::jsonb)) AS elem
          ) combined
          ORDER BY (elem->>'id'), elem
        ) dedup
      ),
      updated_at = NOW(),
      last_synced_at = NOW()
  FROM shipments_per_order spo
  WHERE mor.organizations_id = spo.organizations_id
    AND mor.marketplace_name = spo.marketplace_name
    AND mor.marketplace_order_id = spo.marketplace_order_id;
END $$;