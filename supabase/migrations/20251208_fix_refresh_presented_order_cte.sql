BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_presented_order(p_order_id uuid)
RETURNS void AS $$
DECLARE rec RECORD;
DECLARE items_agg record;
DECLARE payments_agg record;
DECLARE shipments_agg record;
DECLARE buyer_agg record;
DECLARE shipping_address_agg record;
DECLARE v_status_interno text;
DECLARE v_has_unlinked_items boolean;
DECLARE v_unlinked_items_count integer;
DECLARE v_shipping_type text;
DECLARE v_shipment_status text;
DECLARE v_shipment_substatus text;
DECLARE v_is_full boolean;
DECLARE v_is_cancelled boolean;
DECLARE v_is_refunded boolean;
DECLARE v_is_returned boolean;
DECLARE v_printed_label boolean;
DECLARE v_linked_products jsonb;
DECLARE v_printed_schedule timestamp with time zone;
DECLARE v_label_cached boolean;
DECLARE v_label_response_type text;
DECLARE v_label_fetched_at timestamp with time zone;
DECLARE v_label_size_bytes integer;
DECLARE v_label_content_base64 text;
DECLARE v_label_content_type text;
DECLARE v_label_pdf_base64 text;
DECLARE v_label_zpl2_base64 text;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  CREATE EXTENSION IF NOT EXISTS unaccent;
  SELECT * INTO rec FROM public.marketplace_orders_raw WHERE id = p_order_id LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT
    CASE WHEN jsonb_typeof(rec.buyer->'id') = 'number' THEN (rec.buyer->>'id')::bigint
         WHEN jsonb_typeof(rec.buyer->'id') = 'string' THEN CASE WHEN (rec.buyer->>'id') ~ '^\\d+$' THEN (rec.buyer->>'id')::bigint ELSE NULL END
         ELSE NULL END as id_buyer,
    rec.buyer->>'first_name' as first_name,
    rec.buyer->>'last_name' as last_name,
    COALESCE(rec.buyer->>'nickname', (rec.buyer->>'first_name') || ' ' || (rec.buyer->>'last_name')) as customer_name
  INTO buyer_agg;

  SELECT
    COALESCE(
      rec.shipments->0->'destination'->'shipping_address'->'city'->>'name',
      rec.shipments->0->'receiver_address'->'city'->>'name',
      rec.data->'shipping'->'receiver_address'->'city'->>'name',
      rec.data->'shipping'->'shipping_address'->'city'->>'name'
    ) AS city,
    COALESCE(
      rec.shipments->0->'destination'->'shipping_address'->'state'->>'name',
      rec.shipments->0->'receiver_address'->'state'->>'name',
      rec.data->'shipping'->'receiver_address'->'state'->>'name',
      rec.data->'shipping'->'shipping_address'->'state'->>'name'
    ) AS state_name,
    COALESCE(
      NULLIF(split_part(rec.shipments->0->'destination'->'shipping_address'->'state'->>'id','-',2), ''),
      NULLIF(split_part(rec.shipments->0->'receiver_address'->'state'->>'id','-',2), ''),
      NULLIF(split_part(rec.data->'shipping'->'shipping_address'->'state'->>'id','-',2), '')
    ) AS state_uf
  INTO shipping_address_agg;

  SELECT
    jsonb_array_length(rec.order_items) AS items_count,
    COALESCE(SUM(COALESCE((oi->>'quantity')::int, 1)), 0) AS items_total_quantity,
    COALESCE(SUM(COALESCE((oi->>'unit_price')::numeric, 0) * COALESCE((oi->>'quantity')::int, 1)), 0) AS items_total_amount,
    COALESCE(SUM(COALESCE((oi->>'full_unit_price')::numeric, 0) * COALESCE((oi->>'quantity')::int, 1)), 0) AS items_total_full_amount,
    COALESCE(SUM(COALESCE((oi->>'sale_fee')::numeric, 0)), 0) AS items_total_sale_fee,
    rec.order_items->0->>'currency_id' as currency_id,
    rec.order_items->0->>'id' as first_item_id,
    rec.order_items->0->'item'->>'title' as first_item_title,
    rec.order_items->0->'item'->>'seller_sku' as first_item_sku,
    CASE WHEN jsonb_typeof(rec.order_items->0->'item'->'variation_id') = 'number' THEN (rec.order_items->0->'item'->>'variation_id')::bigint
         WHEN jsonb_typeof(rec.order_items->0->'item'->'variation_id') = 'string' THEN CASE WHEN (rec.order_items->0->'item'->>'variation_id') ~ '^\\d+$' THEN (rec.order_items->0->'item'->>'variation_id')::bigint ELSE 0 END
         ELSE 0 END as first_item_variation_id,
    CASE
      WHEN NULLIF(COALESCE(rec.order_items->0->'item'->>'id', rec.order_items->0->>'item_id', rec.order_items->0->>'id'), '') IS NOT NULL
       AND NULLIF(COALESCE(rec.order_items->0->'item'->>'title', rec.order_items->0->>'title'), '') IS NOT NULL
      THEN (
        'https://produto.mercadolivre.com.br/' ||
        regexp_replace(upper(COALESCE(rec.order_items->0->'item'->>'id', rec.order_items->0->>'item_id', rec.order_items->0->>'id')),
                       '^([A-Z]+)(\-)?(\d+)$', '\1-\3') ||
        '-' ||
        regexp_replace(
          regexp_replace(lower(unaccent(COALESCE(rec.order_items->0->'item'->>'title', rec.order_items->0->>'title'))), '[^a-z0-9]+', '-', 'g'),
          '(^-+|-+$)', '', 'g'
        ) ||
        '_JM'
      )
      ELSE COALESCE(rec.order_items->0->'item'->>'permalink', rec.order_items->0->>'permalink')
    END as first_item_permalink,
    ARRAY(
      SELECT jsonb_array_elements_text(
        jsonb_path_query_array(
          rec.order_items,
          '$[*].item.variation_attributes[*] ? (@.name == "Cor").value_name'
        )
      )
    ) as variation_color_names,
    COALESCE(ARRAY_AGG(DISTINCT oi->'item'->>'category_id'), '{}'::text[]) as category_ids,
    COALESCE(ARRAY_AGG(DISTINCT oi->>'listing_type_id'), '{}'::text[]) as listing_type_ids,
    COALESCE(ARRAY_AGG(DISTINCT oi->'stock'->>'node_id'), '{}'::text[]) as stock_node_ids,
    COALESCE(BOOL_OR((oi->'item'->>'variation_id') IS NOT NULL), false) AS has_variations,
    COALESCE(BOOL_OR((oi->>'bundle') IS NOT NULL), false) AS has_bundle,
    COALESCE(BOOL_OR((oi->>'kit_instance_id') IS NOT NULL), false) AS has_kit
  INTO items_agg
  FROM jsonb_array_elements(COALESCE(rec.order_items, '[]'::jsonb)) oi;

  SELECT
    p->>'status' as payment_status,
    (p->>'total_paid_amount')::numeric as total_paid_amount,
    (p->>'marketplace_fee')::numeric as marketplace_fee,
    (p->>'shipping_cost')::numeric as shipping_cost,
    (p->>'date_created')::timestamp with time zone as date_created,
    (p->>'date_approved')::timestamp with time zone as date_approved,
    COALESCE(BOOL_OR(lower(p->>'status') = 'cancelled'), false) AS is_cancelled,
    COALESCE(BOOL_OR(lower(p->>'status') = 'refunded'), false) AS is_refunded,
    (jsonb_path_query_first(rec.data, '$.refunds[*].amount')->>0)::numeric as refunded_amount
  INTO payments_agg
  FROM jsonb_array_elements(COALESCE(rec.payments, '[]'::jsonb)) p
  GROUP BY p;

  SELECT
    COALESCE(
      rec.data->'shipping'->>'logistic_type',
      rec.shipments->0->'logistic'->>'type',
      rec.data->'shipping'->'logistic'->>'type'
    ) AS shipping_type,
    lower(COALESCE(rec.shipments->0->>'status', '')) AS shipment_status,
    lower(COALESCE(rec.shipments->0->>'substatus', '')) AS shipment_substatus,
    COALESCE(
      rec.shipments->0->'lead_time'->'shipping_method'->>'name',
      rec.shipments->0->'shipping_method'->>'name',
      rec.data->'shipping'->'shipping_method'->>'name',
      rec.data->'shipping'->'shipping_option'->>'name'
    ) AS shipping_method_name,
    COALESCE(
      (rec.shipments->0->'lead_time'->'estimated_delivery_limit'->>'date')::timestamptz,
      (rec.shipments->0->'lead_time'->'estimated_delivery_final'->>'date')::timestamptz,
      (rec.shipments->0->'shipping_option'->'estimated_delivery_limit'->>'date')::timestamptz,
      (rec.data->'shipping'->'estimated_delivery_limit'->>'date')::timestamptz
    ) AS estimated_delivery_limit_at,
    (
      SELECT COALESCE(s->'sla'->>'status', s->>'sla_status')
      FROM jsonb_array_elements(COALESCE(rec.shipments, '[]'::jsonb)) s
      WHERE COALESCE(s->'sla'->>'status', s->>'sla_status') IS NOT NULL AND COALESCE(s->'sla'->>'status', s->>'sla_status') <> ''
      LIMIT 1
    ) AS shipment_sla_status,
    (
      SELECT COALESCE(s->'sla'->>'service', s->>'sla_service')
      FROM jsonb_array_elements(COALESCE(rec.shipments, '[]'::jsonb)) s
      WHERE COALESCE(s->'sla'->>'service', s->>'sla_service') IS NOT NULL AND COALESCE(s->'sla'->>'service', s->>'sla_service') <> ''
      LIMIT 1
    ) AS shipment_sla_service,
    COALESCE(
      (rec.shipments->0->'sla'->>'expected_date')::timestamptz,
      (rec.shipments->0->>'sla_expected_date')::timestamptz,
      (rec.shipments->0->'lead_time'->'estimated_delivery_limit'->>'date')::timestamptz
    ) AS shipment_sla_expected_date,
    COALESCE(
      (rec.shipments->0->'sla'->>'last_updated')::timestamptz,
      (rec.shipments->0->>'sla_last_updated')::timestamptz,
      rec.last_updated
    ) AS shipment_sla_last_updated,
    COALESCE(rec.shipments->0->'delays', '[]'::jsonb) AS shipment_delays
  INTO shipments_agg;

  v_printed_label := EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(rec.shipments, '[]'::jsonb)) s
    WHERE lower(COALESCE(s->>'substatus','')) = 'printed' OR (s->>'date_first_printed') IS NOT NULL
  );

  v_printed_schedule := COALESCE(
    (SELECT MAX((s->>'date_first_printed')::timestamptz)
     FROM jsonb_array_elements(COALESCE(rec.shipments, '[]'::jsonb)) s),
    (SELECT MAX((s->'sla'->>'expected_date')::timestamptz)
     FROM jsonb_array_elements(COALESCE(rec.shipments, '[]'::jsonb)) s
     WHERE lower(COALESCE(s->>'substatus','')) = 'buffered'),
    shipments_agg.shipment_sla_expected_date,
    shipments_agg.estimated_delivery_limit_at
  );

  v_is_returned := EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(rec.shipments, '[]'::jsonb)) s
    WHERE lower(COALESCE(s->>'status','')) = 'not_delivered' AND lower(COALESCE(s->>'substatus','')) = 'returned_to_warehouse'
  );

  SELECT COUNT(*) INTO v_unlinked_items_count
  FROM (
    WITH order_items_parsed AS (
      SELECT
        COALESCE(oi->'item'->>'id', oi->>'item_id', oi->>'id') AS item_id_text,
        COALESCE(NULLIF(oi->'item'->>'variation_id',''), NULLIF(oi->>'variation_id',''), '') AS variation_id_text,
        COALESCE(oi->'item'->>'seller_sku', oi->>'seller_sku', '') AS seller_sku_text
      FROM jsonb_array_elements(COALESCE(rec.order_items, '[]'::jsonb)) AS oi
    ), ephemeral_links AS (
      SELECT
        COALESCE(e->>'marketplace_item_id','') AS marketplace_item_id,
        COALESCE(e->>'variation_id','') AS variation_id,
        NULLIF(e->>'product_id','')::uuid AS product_id
      FROM jsonb_array_elements(
        COALESCE((SELECT linked_products FROM public.marketplace_orders_presented_new WHERE id = rec.id), '[]'::jsonb)
      ) e
    )
    SELECT
      oip.item_id_text,
      oip.variation_id_text,
      oip.seller_sku_text,
      COALESCE(mipl.product_id, eph.product_id) AS product_id
    FROM order_items_parsed oip
    LEFT JOIN public.marketplace_item_product_links mipl
      ON mipl.organizations_id = rec.organizations_id
     AND mipl.marketplace_name = rec.marketplace_name
     AND mipl.marketplace_item_id = oip.item_id_text
     AND mipl.variation_id = oip.variation_id_text
    LEFT JOIN ephemeral_links eph
      ON eph.marketplace_item_id = oip.item_id_text
     AND eph.variation_id = oip.variation_id_text
  ) o
  WHERE (o.product_id IS NULL AND COALESCE(o.seller_sku_text, '') = '')
    AND COALESCE(o.item_id_text, '') <> '';

  SELECT jsonb_agg(jsonb_build_object(
    'marketplace_item_id', o.item_id_text,
    'variation_id', o.variation_id_text,
    'product_id', o.product_id,
    'sku', o.product_sku,
    'source', o.source
  )) INTO v_linked_products
  FROM (
    WITH order_items_parsed AS (
      SELECT COALESCE(oi->'item'->>'id', oi->>'item_id', oi->>'id') AS item_id_text,
             COALESCE(NULLIF(oi->'item'->>'variation_id',''), NULLIF(oi->>'variation_id',''), '') AS variation_id_text
      FROM jsonb_array_elements(COALESCE(rec.order_items, '[]'::jsonb)) AS oi
    ), ephemeral_links AS (
      SELECT COALESCE(e->>'marketplace_item_id','') AS marketplace_item_id,
             COALESCE(e->>'variation_id','') AS variation_id,
             NULLIF(e->>'product_id','')::uuid AS product_id
      FROM jsonb_array_elements(
        COALESCE((SELECT linked_products FROM public.marketplace_orders_presented_new WHERE id = rec.id), '[]'::jsonb)
      ) e
    )
    SELECT oip.item_id_text,
           oip.variation_id_text,
           COALESCE(mipl.product_id, eph.product_id) AS product_id,
           COALESCE(p.sku, '') AS product_sku,
           CASE WHEN mipl.product_id IS NOT NULL THEN 'permanent'
                WHEN eph.product_id IS NOT NULL THEN 'ephemeral'
                ELSE NULL END AS source
    FROM order_items_parsed oip
    LEFT JOIN public.marketplace_item_product_links mipl
      ON mipl.organizations_id = rec.organizations_id
     AND mipl.marketplace_name = rec.marketplace_name
     AND mipl.marketplace_item_id = oip.item_id_text
     AND mipl.variation_id = oip.variation_id_text
    LEFT JOIN ephemeral_links eph
      ON eph.marketplace_item_id = oip.item_id_text
     AND eph.variation_id = oip.variation_id_text
    LEFT JOIN public.products p
      ON p.id = COALESCE(mipl.product_id, eph.product_id)
  ) o
  WHERE o.product_id IS NOT NULL;

  v_has_unlinked_items := v_unlinked_items_count > 0;
  v_shipping_type := shipments_agg.shipping_type;
  v_shipment_status := lower(COALESCE(NULLIF(shipments_agg.shipment_status, ''), rec.data->'shipping'->>'status'));
  v_shipment_substatus := lower(COALESCE(NULLIF(shipments_agg.shipment_substatus, ''), rec.data->'shipping'->>'substatus'));
  v_is_full := lower(v_shipping_type) = 'fulfillment';
  v_is_cancelled := lower(rec.status) = 'cancelled' OR payments_agg.is_cancelled OR v_shipment_status = 'cancelled';
  v_is_refunded := payments_agg.is_refunded;
  v_printed_label := v_printed_label;

  IF v_is_cancelled OR v_is_refunded THEN v_status_interno := 'Cancelado';
  ELSIF v_is_returned THEN v_status_interno := 'Devolução';
  ELSIF v_shipment_status = 'pending' AND v_shipment_substatus = 'buffered' AND v_has_unlinked_items THEN v_status_interno := 'A vincular';
  ELSIF v_is_full THEN v_status_interno := 'Enviado';
  ELSIF v_has_unlinked_items THEN v_status_interno := 'A vincular';
  ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'invoice_pending' THEN v_status_interno := 'Emissao NF';
  ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'ready_to_print' THEN v_status_interno := 'Impressao';
  ELSIF v_shipment_status = 'ready_to_ship' AND v_printed_label THEN v_status_interno := 'Aguardando Coleta';
  ELSIF v_shipment_status IN ('shipped','in_transit','handed_to_carrier','on_route','out_for_delivery','delivery_in_progress','collected','delivered') THEN v_status_interno := 'Enviado';
  ELSE v_status_interno := 'Pendente'; END IF;

  v_label_cached := COALESCE((rec.labels ? 'content_base64'), false)
                    OR (v_shipment_status = 'pending' AND v_shipment_substatus = 'buffered');
  v_label_response_type := rec.labels->>'response_type';
  v_label_fetched_at := (rec.labels->>'fetched_at')::timestamptz;
  v_label_size_bytes := (rec.labels->>'size_bytes')::int;
  v_label_content_base64 := rec.labels->>'content_base64';
  v_label_content_type := rec.labels->>'content_type';
  v_label_pdf_base64 := rec.labels->>'pdf_base64';
  v_label_zpl2_base64 := rec.labels->>'zpl2_base64';

  INSERT INTO public.marketplace_orders_presented_new (
    id, organizations_id, company_id, marketplace, marketplace_order_id, status, status_detail, order_total,
    shipping_type, customer_name, id_buyer, first_name_buyer, last_name_buyer, shipping_city_name,
    shipping_state_name, shipping_state_uf, shipment_status, shipment_substatus, shipping_method_name,
    estimated_delivery_limit_at, shipment_sla_status, shipment_sla_service, shipment_sla_expected_date,
    shipment_sla_last_updated, shipment_delays, printed_label, printed_schedule, payment_status, payment_total_paid_amount,
    payment_marketplace_fee, payment_shipping_cost, payment_date_created, payment_date_approved,
    payment_refunded_amount, items_count, items_total_quantity, items_total_amount, items_total_full_amount,
    items_total_sale_fee, items_currency_id, first_item_id, first_item_title, first_item_sku,
    first_item_variation_id, first_item_permalink, variation_color_names, category_ids, listing_type_ids,
    stock_node_ids, has_variations, has_bundle, has_kit, pack_id,
    label_cached, label_response_type, label_fetched_at, label_size_bytes, label_content_base64, label_content_type, label_pdf_base64, label_zpl2_base64,
    unlinked_items_count, has_unlinked_items, linked_products, created_at, last_updated, last_synced_at, status_interno
  )
  VALUES (
    rec.id, rec.organizations_id, rec.company_id, rec.marketplace_name, rec.marketplace_order_id, rec.status, rec.status_detail::text, (rec.data->>'total_amount')::numeric,
    v_shipping_type, buyer_agg.customer_name, buyer_agg.id_buyer, buyer_agg.first_name, buyer_agg.last_name, shipping_address_agg.city,
    shipping_address_agg.state_name, shipping_address_agg.state_uf, v_shipment_status, v_shipment_substatus, shipments_agg.shipping_method_name,
    shipments_agg.estimated_delivery_limit_at, shipments_agg.shipment_sla_status, shipments_agg.shipment_sla_service, shipments_agg.shipment_sla_expected_date,
    shipments_agg.shipment_sla_last_updated, shipments_agg.shipment_delays, v_printed_label, v_printed_schedule, payments_agg.payment_status, payments_agg.total_paid_amount,
    payments_agg.marketplace_fee, payments_agg.shipping_cost, payments_agg.date_created, payments_agg.date_approved,
    payments_agg.refunded_amount, items_agg.items_count, items_agg.items_total_quantity, items_agg.items_total_amount, items_agg.items_total_full_amount,
    items_agg.items_total_sale_fee, items_agg.currency_id, items_agg.first_item_id, items_agg.first_item_title, items_agg.first_item_sku,
    items_agg.first_item_variation_id, items_agg.first_item_permalink, items_agg.variation_color_names, items_agg.category_ids, items_agg.listing_type_ids,
    items_agg.stock_node_ids, items_agg.has_variations, items_agg.has_bundle, items_agg.has_kit,
    CASE WHEN jsonb_typeof(rec.data->'pack_id') = 'number' THEN (rec.data->>'pack_id')::bigint
         WHEN jsonb_typeof(rec.data->'pack_id') = 'string' THEN CASE WHEN (rec.data->>'pack_id') ~ '^\d+$' THEN (rec.data->>'pack_id')::bigint ELSE NULL END
         ELSE NULL END,
    v_label_cached, v_label_response_type, v_label_fetched_at, v_label_size_bytes, v_label_content_base64, v_label_content_type, v_label_pdf_base64, v_label_zpl2_base64,
    v_unlinked_items_count, v_has_unlinked_items, v_linked_products,
    rec.date_created, rec.last_updated, rec.last_synced_at, v_status_interno
  )
  ON CONFLICT (id) DO UPDATE SET
    organizations_id = EXCLUDED.organizations_id,
    company_id = EXCLUDED.company_id,
    marketplace = EXCLUDED.marketplace,
    marketplace_order_id = EXCLUDED.marketplace_order_id,
    status = EXCLUDED.status,
    status_detail = EXCLUDED.status_detail,
    order_total = EXCLUDED.order_total,
    shipping_type = EXCLUDED.shipping_type,
    customer_name = EXCLUDED.customer_name,
    id_buyer = EXCLUDED.id_buyer,
    first_name_buyer = EXCLUDED.first_name_buyer,
    last_name_buyer = EXCLUDED.last_name_buyer,
    shipping_city_name = EXCLUDED.shipping_city_name,
    shipping_state_name = EXCLUDED.shipping_state_name,
    shipping_state_uf = EXCLUDED.shipping_state_uf,
    shipment_status = EXCLUDED.shipment_status,
    shipment_substatus = EXCLUDED.shipment_substatus,
    shipping_method_name = EXCLUDED.shipping_method_name,
    estimated_delivery_limit_at = EXCLUDED.estimated_delivery_limit_at,
    shipment_sla_status = EXCLUDED.shipment_sla_status,
    shipment_sla_service = EXCLUDED.shipment_sla_service,
    shipment_sla_expected_date = EXCLUDED.shipment_sla_expected_date,
    shipment_sla_last_updated = EXCLUDED.shipment_sla_last_updated,
    shipment_delays = EXCLUDED.shipment_delays,
    printed_label = EXCLUDED.printed_label,
    printed_schedule = EXCLUDED.printed_schedule,
    payment_status = EXCLUDED.payment_status,
    payment_total_paid_amount = EXCLUDED.payment_total_paid_amount,
    payment_marketplace_fee = EXCLUDED.payment_marketplace_fee,
    payment_shipping_cost = EXCLUDED.payment_shipping_cost,
    payment_date_created = EXCLUDED.payment_date_created,
    payment_date_approved = EXCLUDED.payment_date_approved,
    payment_refunded_amount = EXCLUDED.payment_refunded_amount,
    items_count = EXCLUDED.items_count,
    items_total_quantity = EXCLUDED.items_total_quantity,
    items_total_amount = EXCLUDED.items_total_amount,
    items_total_full_amount = EXCLUDED.items_total_full_amount,
    items_total_sale_fee = EXCLUDED.items_total_sale_fee,
    items_currency_id = EXCLUDED.items_currency_id,
    first_item_id = EXCLUDED.first_item_id,
    first_item_title = EXCLUDED.first_item_title,
    first_item_sku = EXCLUDED.first_item_sku,
    first_item_variation_id = EXCLUDED.first_item_variation_id,
    first_item_permalink = EXCLUDED.first_item_permalink,
    variation_color_names = EXCLUDED.variation_color_names,
    category_ids = EXCLUDED.category_ids,
    listing_type_ids = EXCLUDED.listing_type_ids,
    stock_node_ids = EXCLUDED.stock_node_ids,
    has_variations = EXCLUDED.has_variations,
    has_bundle = EXCLUDED.has_bundle,
    has_kit = EXCLUDED.has_kit,
    pack_id = EXCLUDED.pack_id,
    label_cached = EXCLUDED.label_cached,
    label_response_type = EXCLUDED.label_response_type,
    label_fetched_at = EXCLUDED.label_fetched_at,
    label_size_bytes = EXCLUDED.label_size_bytes,
    label_content_base64 = EXCLUDED.label_content_base64,
    label_content_type = EXCLUDED.label_content_type,
    label_pdf_base64 = EXCLUDED.label_pdf_base64,
    label_zpl2_base64 = EXCLUDED.label_zpl2_base64,
    unlinked_items_count = EXCLUDED.unlinked_items_count,
    has_unlinked_items = EXCLUDED.has_unlinked_items,
    linked_products = EXCLUDED.linked_products,
    last_updated = EXCLUDED.last_updated,
    last_synced_at = EXCLUDED.last_synced_at,
    status_interno = EXCLUDED.status_interno;
  PERFORM set_config('row_security', 'on', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
