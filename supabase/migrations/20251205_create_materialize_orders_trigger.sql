
DROP TRIGGER IF EXISTS on_marketplace_orders_raw_change_new ON public.marketplace_orders_raw;
DROP TRIGGER IF EXISTS on_marketplace_orders_raw_change ON public.marketplace_orders_raw;
DROP FUNCTION IF EXISTS public.process_marketplace_order_presented_new();
DROP FUNCTION IF EXISTS public.process_marketplace_order_presented();

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE c.relname = 'marketplace_orders_raw'
      AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND p.proname = 'process_marketplace_order_presented'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.marketplace_orders_raw', r.tgname);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_marketplace_orders_raw_stock_flow ON public.marketplace_orders_raw;
DROP TRIGGER IF EXISTS trg_marketplace_orders_raw_inventory_only ON public.marketplace_orders_raw;
DROP TRIGGER IF EXISTS trg_sanitize_raw_json ON public.marketplace_orders_raw;
DROP FUNCTION IF EXISTS public.sanitize_marketplace_orders_raw_json();

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.process_marketplace_order_presented_new()
RETURNS TRIGGER AS $$
DECLARE
    -- Aggregation records
    items_agg record;
    payments_agg record;
    shipments_agg record;
    buyer_agg record;
    shipping_address_agg record;

    -- Calculated fields
    v_status_interno text;
    v_has_unlinked_items boolean;
    v_unlinked_items_count integer;
    v_shipping_type text;
    v_shipment_status text;
    v_shipment_substatus text;
    v_is_full boolean;
    v_is_cancelled boolean;
    v_is_refunded boolean;
    v_is_returned boolean;
    v_printed_label boolean;
    v_linked_products jsonb;
    v_printed_schedule timestamp with time zone;
    v_label_cached boolean;
    v_label_response_type text;
    v_label_fetched_at timestamp with time zone;
    v_label_size_bytes integer;
    v_label_content_base64 text;
    v_label_content_type text;
    v_label_pdf_base64 text;
    v_label_zpl2_base64 text;
    -- Billing fields
    v_billing_doc_number text;
    v_billing_doc_type text;
    v_billing_email text;
    v_billing_phone text;
    v_billing_name text;
    v_billing_state_registration text;
    v_billing_taxpayer_type text;
    v_billing_cust_type text;
    v_billing_is_normalized boolean;
    v_billing_address jsonb;

BEGIN
    BEGIN
    -- 1. Aggregate data from the NEW jsonb record

    -- Buyer
    SELECT
        CASE
            WHEN jsonb_typeof(NEW.buyer->'id') = 'number' THEN (NEW.buyer->>'id')::bigint
            WHEN jsonb_typeof(NEW.buyer->'id') = 'string' THEN CASE WHEN (NEW.buyer->>'id') ~ '^\d+$' THEN (NEW.buyer->>'id')::bigint ELSE NULL END
            ELSE NULL
        END as id_buyer,
        NEW.buyer->>'first_name' as first_name,
        NEW.buyer->>'last_name' as last_name,
        COALESCE(NEW.buyer->>'nickname', (NEW.buyer->>'first_name') || ' ' || (NEW.buyer->>'last_name')) as customer_name
    INTO buyer_agg;

    -- Shipping Address
    SELECT
        COALESCE(
          NEW.shipments->0->'destination'->'shipping_address'->'city'->>'name',
          NEW.shipments->0->'receiver_address'->'city'->>'name',
          NEW.data->'shipping'->'receiver_address'->'city'->>'name',
          NEW.data->'shipping'->'shipping_address'->'city'->>'name'
        ) AS city,
        COALESCE(
          NEW.shipments->0->'destination'->'shipping_address'->'state'->>'name',
          NEW.shipments->0->'receiver_address'->'state'->>'name',
          NEW.data->'shipping'->'receiver_address'->'state'->>'name',
          NEW.data->'shipping'->'shipping_address'->'state'->>'name'
        ) AS state_name,
        COALESCE(
          NULLIF(split_part(NEW.shipments->0->'destination'->'shipping_address'->'state'->>'id','-',2), ''),
          NULLIF(split_part(NEW.shipments->0->'receiver_address'->'state'->>'id','-',2), ''),
          NULLIF(split_part(NEW.data->'shipping'->'shipping_address'->'state'->>'id','-',2), '')
        ) AS state_uf,
        COALESCE(
          NEW.shipments->0->'destination'->'shipping_address'->>'street_name',
          NEW.shipments->0->'receiver_address'->>'street_name',
          NEW.data->'shipping'->'receiver_address'->>'street_name',
          NEW.data->'shipping'->'shipping_address'->>'street_name'
        ) AS street_name,
        COALESCE(
          NEW.shipments->0->'destination'->'shipping_address'->>'street_number',
          NEW.shipments->0->'receiver_address'->>'street_number',
          NEW.data->'shipping'->'receiver_address'->>'street_number',
          NEW.data->'shipping'->'shipping_address'->>'street_number'
        ) AS street_number,
        COALESCE(
          NEW.shipments->0->'destination'->'shipping_address'->'neighborhood'->>'name',
          NEW.shipments->0->'receiver_address'->'neighborhood'->>'name',
          NEW.data->'shipping'->'receiver_address'->'neighborhood'->>'name',
          NEW.data->'shipping'->'shipping_address'->'neighborhood'->>'name',
          NEW.shipments->0->'destination'->'shipping_address'->'neighborhood'->>'id',
          NEW.shipments->0->'receiver_address'->'neighborhood'->>'id'
        ) AS neighborhood_name,
        COALESCE(
          NEW.shipments->0->'destination'->'shipping_address'->>'zip_code',
          NEW.shipments->0->'receiver_address'->>'zip_code',
          NEW.data->'shipping'->'receiver_address'->>'zip_code',
          NEW.data->'shipping'->'shipping_address'->>'zip_code'
        ) AS zip_code,
        COALESCE(
          NEW.shipments->0->'destination'->'shipping_address'->>'comment',
          NEW.shipments->0->'receiver_address'->>'comment',
          NEW.data->'shipping'->'receiver_address'->>'comment',
          NEW.data->'shipping'->'shipping_address'->>'comment'
        ) AS comment,
        COALESCE(
          NEW.shipments->0->'destination'->'shipping_address'->>'address_line',
          NEW.shipments->0->'receiver_address'->>'address_line',
          NEW.data->'shipping'->'receiver_address'->>'address_line',
          NEW.data->'shipping'->'shipping_address'->>'address_line'
        ) AS address_line
    INTO shipping_address_agg;

    -- Items
    SELECT
        jsonb_array_length(NEW.order_items) AS items_count,
        COALESCE(SUM(COALESCE((oi->>'quantity')::int, 1)), 0) AS items_total_quantity,
        COALESCE(SUM(COALESCE((oi->>'unit_price')::numeric, 0) * COALESCE((oi->>'quantity')::int, 1)), 0) AS items_total_amount,
        COALESCE(SUM(COALESCE((oi->>'full_unit_price')::numeric, 0) * COALESCE((oi->>'quantity')::int, 1)), 0) AS items_total_full_amount,
        COALESCE(SUM(COALESCE((oi->>'sale_fee')::numeric, 0)), 0) AS items_total_sale_fee,
        NEW.order_items->0->>'currency_id' as currency_id,
        NEW.order_items->0->>'id' as first_item_id,
        NEW.order_items->0->'item'->>'title' as first_item_title,
        NEW.order_items->0->'item'->>'seller_sku' as first_item_sku,
        CASE
            WHEN jsonb_typeof(NEW.order_items->0->'item'->'variation_id') = 'number' THEN (NEW.order_items->0->'item'->>'variation_id')::bigint
            WHEN jsonb_typeof(NEW.order_items->0->'item'->'variation_id') = 'string' THEN CASE WHEN (NEW.order_items->0->'item'->>'variation_id') ~ '^\d+$' THEN (NEW.order_items->0->'item'->>'variation_id')::bigint ELSE 0 END
            ELSE 0
        END as first_item_variation_id,
        CASE
          WHEN NULLIF(COALESCE(NEW.order_items->0->'item'->>'id', NEW.order_items->0->>'item_id', NEW.order_items->0->>'id'), '') IS NOT NULL
           AND NULLIF(COALESCE(NEW.order_items->0->'item'->>'title', NEW.order_items->0->>'title'), '') IS NOT NULL
          THEN (
            'https://produto.mercadolivre.com.br/' ||
            regexp_replace(upper(COALESCE(NEW.order_items->0->'item'->>'id', NEW.order_items->0->>'item_id', NEW.order_items->0->>'id')),
                           '^([A-Z]+)(\-)?(\d+)$', '\1-\3') ||
            '-' ||
            regexp_replace(
              regexp_replace(lower(unaccent(COALESCE(NEW.order_items->0->'item'->>'title', NEW.order_items->0->>'title'))), '[^a-z0-9]+', '-', 'g'),
              '(^-+|-+$)', '', 'g'
            ) ||
            '_JM'
          )
          ELSE COALESCE(NEW.order_items->0->'item'->>'permalink', NEW.order_items->0->>'permalink')
        END as first_item_permalink,
        ARRAY(
          SELECT jsonb_array_elements_text(
            jsonb_path_query_array(
              NEW.order_items,
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
    FROM jsonb_array_elements(COALESCE(NEW.order_items, '[]'::jsonb)) oi;

    -- Payments
    SELECT
        p->>'status' as payment_status,
        (p->>'total_paid_amount')::numeric as total_paid_amount,
        (p->>'marketplace_fee')::numeric as marketplace_fee,
        (p->>'shipping_cost')::numeric as shipping_cost,
        (p->>'date_created')::timestamp with time zone as date_created,
        (p->>'date_approved')::timestamp with time zone as date_approved,
        COALESCE(BOOL_OR(lower(p->>'status') = 'cancelled'), false) AS is_cancelled,
        COALESCE(BOOL_OR(lower(p->>'status') = 'refunded'), false) AS is_refunded,
        (jsonb_path_query_first(NEW.data, '$.refunds[*].amount')->>0)::numeric as refunded_amount
    INTO payments_agg
    FROM jsonb_array_elements(COALESCE(NEW.payments, '[]'::jsonb)) p
    GROUP BY p;

    -- Shipments
    SELECT
        COALESCE(
          NEW.data->'shipping'->>'logistic_type',
          NEW.shipments->0->'logistic'->>'type',
          NEW.data->'shipping'->'logistic'->>'type'
        ) AS shipping_type,
        lower(COALESCE(NEW.shipments->0->>'status', '')) AS shipment_status,
        lower(COALESCE(NEW.shipments->0->>'substatus', '')) AS shipment_substatus,
        COALESCE(
          NEW.shipments->0->'lead_time'->'shipping_method'->>'name',
          NEW.shipments->0->'shipping_method'->>'name',
          NEW.data->'shipping'->'shipping_method'->>'name',
          NEW.data->'shipping'->'shipping_option'->>'name'
        ) AS shipping_method_name,
        COALESCE(
          (NEW.shipments->0->'lead_time'->'estimated_delivery_limit'->>'date')::timestamptz,
          (NEW.shipments->0->'lead_time'->'estimated_delivery_final'->>'date')::timestamptz,
          (NEW.shipments->0->'shipping_option'->'estimated_delivery_limit'->>'date')::timestamptz,
          (NEW.data->'shipping'->'estimated_delivery_limit'->>'date')::timestamptz
        ) AS estimated_delivery_limit_at,
        (
          SELECT COALESCE(s->'sla'->>'status', s->>'sla_status')
          FROM jsonb_array_elements(COALESCE(NEW.shipments, '[]'::jsonb)) s
          WHERE COALESCE(s->'sla'->>'status', s->>'sla_status') IS NOT NULL AND COALESCE(s->'sla'->>'status', s->>'sla_status') <> ''
          LIMIT 1
        ) AS shipment_sla_status,
        (
          SELECT COALESCE(s->'sla'->>'service', s->>'sla_service')
          FROM jsonb_array_elements(COALESCE(NEW.shipments, '[]'::jsonb)) s
          WHERE COALESCE(s->'sla'->>'service', s->>'sla_service') IS NOT NULL AND COALESCE(s->'sla'->>'service', s->>'sla_service') <> ''
          LIMIT 1
        ) AS shipment_sla_service,
        COALESCE(
          (NEW.shipments->0->'sla'->>'expected_date')::timestamptz,
          (NEW.shipments->0->>'sla_expected_date')::timestamptz,
          (NEW.shipments->0->'lead_time'->'estimated_delivery_limit'->>'date')::timestamptz
        ) AS shipment_sla_expected_date,
        COALESCE(
          (NEW.shipments->0->'sla'->>'last_updated')::timestamptz,
          (NEW.shipments->0->>'sla_last_updated')::timestamptz,
          NEW.last_updated
        ) AS shipment_sla_last_updated,
        COALESCE(NEW.shipments->0->'delays', '[]'::jsonb) AS shipment_delays
    INTO shipments_agg;

    v_printed_label := EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.shipments, '[]'::jsonb)) s
      WHERE lower(COALESCE(s->>'substatus','')) = 'printed' OR (s->>'date_first_printed') IS NOT NULL
    );

    v_printed_schedule := COALESCE(
      (SELECT MAX((s->>'date_first_printed')::timestamptz)
       FROM jsonb_array_elements(COALESCE(NEW.shipments, '[]'::jsonb)) s),
      (SELECT MAX((s->'sla'->>'expected_date')::timestamptz)
       FROM jsonb_array_elements(COALESCE(NEW.shipments, '[]'::jsonb)) s
       WHERE lower(COALESCE(s->>'substatus','')) = 'buffered'),
      shipments_agg.shipment_sla_expected_date,
      shipments_agg.estimated_delivery_limit_at
    );

    v_is_returned := EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.shipments, '[]'::jsonb)) s
      WHERE lower(COALESCE(s->>'status','')) = 'not_delivered' AND lower(COALESCE(s->>'substatus','')) = 'returned_to_warehouse'
    );

    -- 2. Calculate derived values
    SELECT COUNT(*) INTO v_unlinked_items_count
    FROM (
      WITH order_items_parsed AS (
          SELECT
              COALESCE(oi->'item'->>'id', oi->>'item_id', oi->>'id') AS item_id_text,
              COALESCE(NULLIF(oi->'item'->>'variation_id',''), NULLIF(oi->>'variation_id',''), '') AS variation_id_text,
              COALESCE(oi->'item'->>'seller_sku', oi->>'seller_sku', '') AS seller_sku_text
          FROM jsonb_array_elements(COALESCE(NEW.order_items, '[]'::jsonb)) AS oi
      ), ephemeral_links AS (
          SELECT
              COALESCE(e->>'marketplace_item_id','') AS marketplace_item_id,
              COALESCE(e->>'variation_id','') AS variation_id,
              NULLIF(e->>'product_id','')::uuid AS product_id
          FROM jsonb_array_elements(
            COALESCE(
              (SELECT linked_products FROM public.marketplace_orders_presented_new WHERE id = NEW.id),
              '[]'::jsonb
            )
          ) e
      )
      SELECT
          oip.item_id_text,
          oip.variation_id_text,
          oip.seller_sku_text,
          COALESCE(mipl.product_id, eph.product_id) AS product_id
      FROM order_items_parsed oip
      LEFT JOIN public.marketplace_item_product_links mipl
        ON mipl.organizations_id = NEW.organizations_id
       AND mipl.marketplace_name = NEW.marketplace_name
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
          SELECT
              COALESCE(oi->'item'->>'id', oi->>'item_id', oi->>'id') AS item_id_text,
              COALESCE(NULLIF(oi->'item'->>'variation_id',''), NULLIF(oi->>'variation_id',''), '') AS variation_id_text
          FROM jsonb_array_elements(COALESCE(NEW.order_items, '[]'::jsonb)) AS oi
      ), ephemeral_links AS (
          SELECT
              COALESCE(e->>'marketplace_item_id','') AS marketplace_item_id,
              COALESCE(e->>'variation_id','') AS variation_id,
              NULLIF(e->>'product_id','')::uuid AS product_id
          FROM jsonb_array_elements(
            COALESCE(
              (SELECT linked_products FROM public.marketplace_orders_presented_new WHERE id = NEW.id),
              '[]'::jsonb
            )
          ) e
      )
      SELECT
          oip.item_id_text,
          oip.variation_id_text,
          COALESCE(mipl.product_id, eph.product_id) AS product_id,
          COALESCE(p.sku, '') AS product_sku,
          CASE
            WHEN mipl.product_id IS NOT NULL THEN 'permanent'
            WHEN eph.product_id IS NOT NULL THEN 'ephemeral'
            ELSE NULL
          END AS source
      FROM order_items_parsed oip
      LEFT JOIN public.marketplace_item_product_links mipl
        ON mipl.organizations_id = NEW.organizations_id
       AND mipl.marketplace_name = NEW.marketplace_name
       AND mipl.marketplace_item_id = oip.item_id_text
       AND mipl.variation_id = oip.variation_id_text
      LEFT JOIN ephemeral_links eph
        ON eph.marketplace_item_id = oip.item_id_text
       AND eph.variation_id = oip.variation_id_text
      LEFT JOIN public.products p
        ON p.id = COALESCE(mipl.product_id, eph.product_id)
    ) o;

    v_has_unlinked_items := v_unlinked_items_count > 0;
    v_shipping_type := shipments_agg.shipping_type;
    v_shipment_status := lower(COALESCE(NULLIF(shipments_agg.shipment_status, ''), NEW.data->'shipping'->>'status'));
    v_shipment_substatus := lower(COALESCE(NULLIF(shipments_agg.shipment_substatus, ''), NEW.data->'shipping'->>'substatus'));
    v_is_full := lower(v_shipping_type) = 'fulfillment';
    v_is_cancelled := lower(NEW.status) = 'cancelled' OR payments_agg.is_cancelled OR v_shipment_status = 'cancelled';
    v_is_refunded := payments_agg.is_refunded;
    v_printed_label := v_printed_label;

    -- 3. Calculate status_interno based on priority
    IF v_is_cancelled OR v_is_refunded THEN
        v_status_interno := 'Cancelado';
    ELSIF v_is_returned THEN
        v_status_interno := 'Devolução';
    ELSIF v_shipment_status = 'pending' AND v_shipment_substatus = 'buffered' AND v_has_unlinked_items THEN
        v_status_interno := 'A vincular';
    ELSIF v_is_full THEN
        v_status_interno := 'Enviado';
    ELSIF v_has_unlinked_items THEN
        v_status_interno := 'A vincular';
    ELSIF v_shipment_status = 'pending' AND v_shipment_substatus = 'buffered' THEN
        v_status_interno := 'Impressao';
    ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'invoice_pending' THEN
        v_status_interno := 'Emissao NF';
    ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'ready_to_print' THEN
        v_status_interno := 'Impressao';
    ELSIF v_shipment_status = 'ready_to_ship' AND v_printed_label THEN
        v_status_interno := 'Aguardando Coleta';
    ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'dropped_off'
          AND (lower(COALESCE(NEW.status,'')) = 'paid' OR lower(COALESCE(payments_agg.payment_status,'')) = 'paid') THEN
        v_status_interno := 'Enviado';
    ELSIF v_shipment_status IN ('shipped', 'dropped_off', 'in_transit', 'handed_to_carrier', 'on_route', 'out_for_delivery', 'delivery_in_progress', 'collected', 'delivered') THEN
        v_status_interno := 'Enviado';
    ELSE
        v_status_interno := 'Pendente';
    END IF;

    -- 4. INSERT or UPDATE the marketplace_orders_presented_new table
    v_label_cached := COALESCE((NEW.labels ? 'content_base64'), false)
                      OR (v_shipment_status = 'pending' AND v_shipment_substatus = 'buffered');
    v_label_response_type := NEW.labels->>'response_type';
    v_label_fetched_at := (NEW.labels->>'fetched_at')::timestamptz;
    v_label_size_bytes := (NEW.labels->>'size_bytes')::int;
    v_label_content_base64 := NEW.labels->>'content_base64';
    v_label_content_type := NEW.labels->>'content_type';
    v_label_pdf_base64 := NEW.labels->>'pdf_base64';
    v_label_zpl2_base64 := NEW.labels->>'zpl2_base64';

    -- Billing extraction from NEW.billing_info (shipments endpoint) with fallbacks
    v_billing_doc_number := COALESCE(
      NEW.billing_info->'receiver'->'identification'->>'number',
      NEW.billing_info->'receiver'->'document'->>'value',
      NEW.data->'buyer'->'billing_info'->'identification'->>'number',
      NEW.buyer->'identification'->>'number',
      NULL
    );
    v_billing_doc_type := COALESCE(
      NEW.billing_info->'receiver'->'identification'->>'type',
      NEW.billing_info->'receiver'->'document'->>'id',
      NEW.data->'buyer'->'billing_info'->'identification'->>'type',
      NULL
    );
    IF v_billing_doc_type IS NULL AND COALESCE(v_billing_doc_number, '') <> '' THEN
      -- infer type by digits length
      IF length(regexp_replace(v_billing_doc_number, '\D', '', 'g')) = 11 THEN
        v_billing_doc_type := 'CPF';
      ELSIF length(regexp_replace(v_billing_doc_number, '\D', '', 'g')) = 14 THEN
        v_billing_doc_type := 'CNPJ';
      END IF;
    END IF;
    v_billing_email := COALESCE(
      NEW.data->'buyer'->>'email',
      NEW.buyer->>'email',
      NEW.data->'buyer'->'billing_info'->>'email',
      NULL
    );
    v_billing_phone := COALESCE(
      NEW.data->'buyer'->'phone'->>'number',
      NEW.buyer->'phone'->>'number',
      NEW.data->'buyer'->'billing_info'->>'phone',
      NULL
    );
    v_billing_name := COALESCE(
      NEW.billing_info->'receiver'->>'name',
      NEW.data->'buyer'->'billing_info'->>'name',
      NULLIF(concat_ws(' ', NEW.buyer->>'first_name', NEW.buyer->>'last_name'), ''),
      NEW.buyer->>'nickname',
      NULL
    );
    v_billing_state_registration := COALESCE(
      NEW.data->'buyer'->'billing_info'->'taxes'->'inscriptions'->>'state_registration',
      NEW.billing_info->'receiver'->'taxes'->'inscriptions'->>'state_registration',
      NULL
    );
    v_billing_taxpayer_type := COALESCE(
      NEW.data->'buyer'->'billing_info'->'taxes'->'taxpayer_type'->>'description',
      NEW.billing_info->'receiver'->'taxes'->'taxpayer_type'->>'description',
      NULL
    );
    v_billing_cust_type := COALESCE(
      NEW.data->'buyer'->'billing_info'->'attributes'->>'cust_type',
      NEW.billing_info->'receiver'->'attributes'->>'cust_type',
      NULL
    );
    v_billing_is_normalized := COALESCE(
      (NEW.data->'buyer'->'billing_info'->'attributes'->>'is_normalized')::boolean,
      (NEW.billing_info->'receiver'->'attributes'->>'is_normalized')::boolean,
      false
    );
    v_billing_address := COALESCE(
      NEW.data->'buyer'->'billing_info'->'address',
      NEW.billing_info->'receiver'->'address',
      NULL
    );

    RAISE NOTICE 'Materialize insert: id=%, marketplace=%, sale_fee=%',
      NEW.id,
      NEW.marketplace_name,
      CASE
        WHEN NEW.marketplace_name = 'Shopee' THEN
          COALESCE(NULLIF(NEW.data->'escrow_detail'->'response'->'order_income'->>'commission_fee','')::numeric, 0)
          + COALESCE(NULLIF(NEW.data->'escrow_detail'->'response'->'order_income'->>'service_fee','')::numeric, 0)
        ELSE COALESCE(items_agg.items_total_sale_fee, 0)
      END;
    INSERT INTO public.marketplace_orders_presented_new (
        id, organizations_id, company_id, marketplace, marketplace_order_id, status, status_detail, order_total,
        shipping_type, customer_name, id_buyer, first_name_buyer, last_name_buyer, shipping_city_name,
        shipping_state_name, shipping_state_uf, shipping_street_name, shipping_street_number, shipping_neighborhood_name, shipping_zip_code, shipping_comment, shipping_address_line,
        shipment_status, shipment_substatus, shipping_method_name,
        estimated_delivery_limit_at, shipment_sla_status, shipment_sla_service, shipment_sla_expected_date,
        shipment_sla_last_updated, shipment_delays, printed_label, printed_schedule, payment_status, payment_total_paid_amount,
        payment_marketplace_fee, payment_shipping_cost, payment_date_created, payment_date_approved,
        payment_refunded_amount, items_count, items_total_quantity, items_total_amount, items_total_full_amount,
        items_total_sale_fee, items_currency_id, first_item_id, first_item_title, first_item_sku,
        first_item_variation_id, first_item_permalink, variation_color_names, category_ids, listing_type_ids,
        stock_node_ids, has_variations, has_bundle, has_kit, pack_id,
        label_cached, label_response_type, label_fetched_at, label_size_bytes, label_content_base64, label_content_type, label_pdf_base64, label_zpl2_base64,
        unlinked_items_count, has_unlinked_items, linked_products, created_at, last_updated, last_synced_at, status_interno,
        billing_doc_number, billing_doc_type, billing_email, billing_phone,
        billing_name, billing_state_registration, billing_taxpayer_type, billing_cust_type, billing_is_normalized, billing_address
    )
    VALUES (
        NEW.id, NEW.organizations_id, NEW.company_id, NEW.marketplace_name, NEW.marketplace_order_id, NEW.status, NEW.status_detail::text,
        CASE
          WHEN NEW.marketplace_name = 'Shopee' THEN COALESCE(
            NULLIF(NEW.data->'order_detail'->>'order_selling_price','')::numeric,
            NULLIF(NEW.data->'escrow_detail'->'response'->'order_income'->>'order_selling_price','')::numeric,
            NULLIF(NEW.data->'order_list_item'->>'order_selling_price','')::numeric,
            NULLIF(NEW.data->'notification'->>'order_selling_price','')::numeric,
            NULLIF(NEW.data->'order_detail'->>'total_amount','')::numeric,
            NULLIF(NEW.data->'order_list_item'->>'total_amount','')::numeric,
            NULLIF(NEW.data->'notification'->>'total_amount','')::numeric
          )
          ELSE (NEW.data->>'total_amount')::numeric
        END,
        v_shipping_type, buyer_agg.customer_name, buyer_agg.id_buyer, buyer_agg.first_name, buyer_agg.last_name, shipping_address_agg.city,
        shipping_address_agg.state_name, shipping_address_agg.state_uf, shipping_address_agg.street_name, shipping_address_agg.street_number, shipping_address_agg.neighborhood_name, shipping_address_agg.zip_code, shipping_address_agg.comment, shipping_address_agg.address_line,
        CASE
          WHEN NEW.marketplace_name = 'Shopee' THEN COALESCE(
            CASE
              WHEN jsonb_typeof(NEW.data->'order_detail'->'package_list') = 'array' THEN NEW.data->'order_detail'->'package_list'->0->>'logistics_status'
              WHEN jsonb_typeof(NEW.data->'order_detail'->'package_list') = 'object' THEN NEW.data->'order_detail'->'package_list'->>'logistics_status'
              ELSE NULL
            END,
            CASE
              WHEN jsonb_typeof(NEW.data->'order_list_item'->'package_list') = 'array' THEN NEW.data->'order_list_item'->'package_list'->0->>'logistics_status'
              WHEN jsonb_typeof(NEW.data->'order_list_item'->'package_list') = 'object' THEN NEW.data->'order_list_item'->'package_list'->>'logistics_status'
              ELSE NULL
            END,
            CASE
              WHEN jsonb_typeof(NEW.data->'notification'->'package_list') = 'array' THEN NEW.data->'notification'->'package_list'->0->>'logistics_status'
              WHEN jsonb_typeof(NEW.data->'notification'->'package_list') = 'object' THEN NEW.data->'notification'->'package_list'->>'logistics_status'
              ELSE NULL
            END
          )
          ELSE v_shipment_status
        END,
        v_shipment_substatus, shipments_agg.shipping_method_name,
        shipments_agg.estimated_delivery_limit_at, shipments_agg.shipment_sla_status, shipments_agg.shipment_sla_service, shipments_agg.shipment_sla_expected_date,
        shipments_agg.shipment_sla_last_updated, shipments_agg.shipment_delays, v_printed_label, v_printed_schedule, payments_agg.payment_status, payments_agg.total_paid_amount,
        payments_agg.marketplace_fee, payments_agg.shipping_cost, payments_agg.date_created, payments_agg.date_approved,
        payments_agg.refunded_amount, items_agg.items_count, items_agg.items_total_quantity, items_agg.items_total_amount, items_agg.items_total_full_amount,
        CASE
          WHEN NEW.marketplace_name = 'Shopee' THEN
            COALESCE(NULLIF(NEW.data->'escrow_detail'->'response'->'order_income'->>'commission_fee','')::numeric, 0)
            + COALESCE(NULLIF(NEW.data->'escrow_detail'->'response'->'order_income'->>'service_fee','')::numeric, 0)
          ELSE items_agg.items_total_sale_fee
        END, items_agg.currency_id, items_agg.first_item_id, items_agg.first_item_title, items_agg.first_item_sku,
        items_agg.first_item_variation_id, items_agg.first_item_permalink, items_agg.variation_color_names, items_agg.category_ids, items_agg.listing_type_ids,
        items_agg.stock_node_ids, items_agg.has_variations, items_agg.has_bundle, items_agg.has_kit,
        CASE
          WHEN NEW.marketplace_name = 'Shopee' THEN
            NULLIF(COALESCE(
              NEW.data->'order_detail'->>'order_sn',
              NEW.data->'order_list_item'->>'order_sn',
              NEW.data->'notification'->>'order_sn',
              NEW.marketplace_order_id
            ), '')
          ELSE
            CASE
              WHEN jsonb_typeof(NEW.data->'pack_id') = 'number' THEN NEW.data->>'pack_id'
              WHEN jsonb_typeof(NEW.data->'pack_id') = 'string' THEN CASE WHEN (NEW.data->>'pack_id') ~ '^\d+$' THEN NEW.data->>'pack_id' ELSE NULL END
              ELSE NULL
            END
        END,
        v_label_cached, v_label_response_type, v_label_fetched_at, v_label_size_bytes, v_label_content_base64, v_label_content_type, v_label_pdf_base64, v_label_zpl2_base64,
        v_unlinked_items_count, v_has_unlinked_items, v_linked_products,
        NEW.date_created, NEW.last_updated, NEW.last_synced_at, v_status_interno,
        v_billing_doc_number, v_billing_doc_type, v_billing_email, v_billing_phone,
        v_billing_name, v_billing_state_registration, v_billing_taxpayer_type, v_billing_cust_type, v_billing_is_normalized, v_billing_address
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
        shipping_street_name = EXCLUDED.shipping_street_name,
        shipping_street_number = EXCLUDED.shipping_street_number,
        shipping_neighborhood_name = EXCLUDED.shipping_neighborhood_name,
        shipping_zip_code = EXCLUDED.shipping_zip_code,
        shipping_comment = EXCLUDED.shipping_comment,
        shipping_address_line = EXCLUDED.shipping_address_line,
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
        status_interno = EXCLUDED.status_interno,
        billing_doc_number = EXCLUDED.billing_doc_number,
        billing_doc_type = EXCLUDED.billing_doc_type,
        billing_email = EXCLUDED.billing_email,
        billing_phone = EXCLUDED.billing_phone,
        billing_name = EXCLUDED.billing_name,
        billing_state_registration = EXCLUDED.billing_state_registration,
        billing_taxpayer_type = EXCLUDED.billing_taxpayer_type,
        billing_cust_type = EXCLUDED.billing_cust_type,
        billing_is_normalized = EXCLUDED.billing_is_normalized,
        billing_address = EXCLUDED.billing_address;

        RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW;
    END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_marketplace_orders_raw_change_new
AFTER INSERT OR UPDATE ON public.marketplace_orders_raw
FOR EACH ROW
EXECUTE FUNCTION public.process_marketplace_order_presented_new();

CREATE OR REPLACE FUNCTION public.upsert_marketplace_order_raw(
  p_organizations_id uuid,
  p_company_id uuid,
  p_marketplace_name text,
  p_marketplace_order_id text,
  p_status text,
  p_status_detail text,
  p_order_items jsonb,
  p_buyer jsonb,
  p_seller jsonb,
  p_payments jsonb,
  p_shipments jsonb,
  p_feedback jsonb,
  p_tags jsonb,
  p_data jsonb,
  p_date_created timestamptz,
  p_date_closed timestamptz,
  p_last_updated timestamptz,
  p_last_synced_at timestamptz
)
RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  IF p_buyer IS NOT NULL AND (p_buyer ? 'id') THEN
    IF jsonb_typeof(p_buyer->'id') = 'string' THEN
      IF (p_buyer->>'id') ~ '^\d+$' THEN
        p_buyer := jsonb_set(p_buyer, '{id}', to_jsonb(((p_buyer->>'id')::bigint)), true);
      ELSE
        p_buyer := p_buyer - 'id';
      END IF;
    ELSIF jsonb_typeof(p_buyer->'id') = 'null' THEN
      p_buyer := p_buyer - 'id';
    ELSIF jsonb_typeof(p_buyer->'id') NOT IN ('number') THEN
      p_buyer := p_buyer - 'id';
    END IF;
  END IF;

  IF p_data IS NOT NULL AND (p_data ? 'pack_id') THEN
    IF jsonb_typeof(p_data->'pack_id') = 'string' THEN
      IF (p_data->>'pack_id') ~ '^\d+$' THEN
        p_data := jsonb_set(p_data, '{pack_id}', to_jsonb(((p_data->>'pack_id')::bigint)), true);
      ELSE
        p_data := p_data - 'pack_id';
      END IF;
    ELSIF jsonb_typeof(p_data->'pack_id') = 'null' THEN
      p_data := p_data - 'pack_id';
    ELSIF jsonb_typeof(p_data->'pack_id') NOT IN ('number') THEN
      p_data := p_data - 'pack_id';
    END IF;
  END IF;

  IF p_data IS NOT NULL AND (p_data ? 'buyer') AND jsonb_typeof(p_data->'buyer') = 'object' THEN
    IF jsonb_typeof(p_data->'buyer'->'id') = 'string' THEN
      IF (p_data->'buyer'->>'id') ~ '^\d+$' THEN
        p_data := jsonb_set(p_data, '{buyer,id}', to_jsonb(((p_data->'buyer'->>'id')::bigint)), true);
      ELSE
        p_data := jsonb_set(p_data, '{buyer}', (p_data->'buyer') - 'id', true);
      END IF;
    ELSIF jsonb_typeof(p_data->'buyer'->'id') = 'null' THEN
      p_data := jsonb_set(p_data, '{buyer}', (p_data->'buyer') - 'id', true);
    ELSIF jsonb_typeof(p_data->'buyer'->'id') NOT IN ('number') THEN
      p_data := jsonb_set(p_data, '{buyer}', (p_data->'buyer') - 'id', true);
    END IF;
  END IF;

  INSERT INTO public.marketplace_orders_raw (
    organizations_id, company_id, marketplace_name, marketplace_order_id, status, status_detail, order_items, buyer, seller, payments, shipments, feedback, tags, data, date_created, date_closed, last_updated, last_synced_at, updated_at
  )
  VALUES (
    p_organizations_id, p_company_id, p_marketplace_name, p_marketplace_order_id, p_status, p_status_detail, COALESCE(p_order_items, '[]'::jsonb), p_buyer, p_seller, COALESCE(p_payments, '[]'::jsonb), COALESCE(p_shipments, '[]'::jsonb), p_feedback, COALESCE(p_tags, '[]'::jsonb), p_data, p_date_created, p_date_closed, p_last_updated, p_last_synced_at, now()
  )
  ON CONFLICT (organizations_id, marketplace_name, marketplace_order_id) DO UPDATE SET
    status = EXCLUDED.status,
    status_detail = EXCLUDED.status_detail,
    order_items = EXCLUDED.order_items,
    buyer = EXCLUDED.buyer,
    seller = EXCLUDED.seller,
    payments = EXCLUDED.payments,
    shipments = EXCLUDED.shipments,
    feedback = EXCLUDED.feedback,
    tags = EXCLUDED.tags,
    data = EXCLUDED.data,
    date_created = EXCLUDED.date_created,
    date_closed = EXCLUDED.date_closed,
    last_updated = EXCLUDED.last_updated,
    last_synced_at = EXCLUDED.last_synced_at,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
DECLARE v_billing_doc_number text;
DECLARE v_billing_doc_type text;
DECLARE v_billing_email text;
DECLARE v_billing_phone text;
DECLARE v_billing_name text;
DECLARE v_billing_state_registration text;
DECLARE v_billing_taxpayer_type text;
DECLARE v_billing_cust_type text;
DECLARE v_billing_is_normalized boolean;
DECLARE v_billing_address jsonb;
BEGIN
  SELECT * INTO rec FROM public.marketplace_orders_raw WHERE id = p_order_id LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT
    CASE WHEN jsonb_typeof(rec.buyer->'id') = 'number' THEN (rec.buyer->>'id')::bigint
         WHEN jsonb_typeof(rec.buyer->'id') = 'string' THEN CASE WHEN (rec.buyer->>'id') ~ '^\d+$' THEN (rec.buyer->>'id')::bigint ELSE NULL END
         ELSE NULL END as id_buyer,
    rec.buyer->>'first_name' as first_name,
    rec.buyer->>'last_name' as last_name,
    COALESCE(rec.buyer->>'nickname', (rec.buyer->>'first_name') || ' ' || (rec.buyer->>'last_name')) as customer_name
  INTO buyer_agg;
  SELECT
    rec.data->'shipping'->'receiver_address'->>'city' as city,
    rec.data->'shipping'->'receiver_address'->'state'->>'name' as state_name,
    rec.data->'shipping'->'receiver_address'->'state'->>'id' as state_uf
  INTO shipping_address_agg;
  -- Expand shipping_address_agg with street details and fallbacks
  SELECT
    COALESCE(
      rec.shipments->0->'destination'->'shipping_address'->>'street_name',
      rec.shipments->0->'receiver_address'->>'street_name',
      rec.data->'shipping'->'receiver_address'->>'street_name',
      rec.data->'shipping'->'shipping_address'->>'street_name'
    ) AS street_name,
    COALESCE(
      rec.shipments->0->'destination'->'shipping_address'->>'street_number',
      rec.shipments->0->'receiver_address'->>'street_number',
      rec.data->'shipping'->'receiver_address'->>'street_number',
      rec.data->'shipping'->'shipping_address'->>'street_number'
    ) AS street_number,
    COALESCE(
      rec.shipments->0->'destination'->'shipping_address'->'neighborhood'->>'name',
      rec.shipments->0->'receiver_address'->'neighborhood'->>'name',
      rec.data->'shipping'->'receiver_address'->'neighborhood'->>'name',
      rec.data->'shipping'->'shipping_address'->'neighborhood'->>'name',
      rec.shipments->0->'destination'->'shipping_address'->'neighborhood'->>'id',
      rec.shipments->0->'receiver_address'->'neighborhood'->>'id'
    ) AS neighborhood_name,
    COALESCE(
      rec.shipments->0->'destination'->'shipping_address'->>'zip_code',
      rec.shipments->0->'receiver_address'->>'zip_code',
      rec.data->'shipping'->'receiver_address'->>'zip_code',
      rec.data->'shipping'->'shipping_address'->>'zip_code'
    ) AS zip_code,
    COALESCE(
      rec.shipments->0->'destination'->'shipping_address'->>'comment',
      rec.shipments->0->'receiver_address'->>'comment',
      rec.data->'shipping'->'receiver_address'->>'comment',
      rec.data->'shipping'->'shipping_address'->>'comment'
    ) AS comment,
    COALESCE(
      rec.shipments->0->'destination'->'shipping_address'->>'address_line',
      rec.shipments->0->'receiver_address'->>'address_line',
      rec.data->'shipping'->'receiver_address'->>'address_line',
      rec.data->'shipping'->'shipping_address'->>'address_line'
    ) AS address_line
  INTO STRICT shipping_address_agg;
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
         WHEN jsonb_typeof(rec.order_items->0->'item'->'variation_id') = 'string' THEN CASE WHEN (rec.order_items->0->'item'->>'variation_id') ~ '^\d+$' THEN (rec.order_items->0->'item'->>'variation_id')::bigint ELSE 0 END
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
    ARRAY(SELECT jsonb_array_elements_text(jsonb_path_query_array(rec.order_items, '$[*].item.variation_attributes[*].value_name ? (@.name == "Cor")'))) as variation_color_names,
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
    COALESCE(rec.data->'shipping'->>'logistic_type', s->'logistic'->>'type') AS shipping_type,
    lower(COALESCE(s->>'status', '')) AS shipment_status,
    lower(COALESCE(s->>'substatus', '')) AS shipment_substatus,
    s->'shipping_option'->>'name' as shipping_method_name,
    (s->'shipping_option'->'estimated_delivery_limit'->>'date')::timestamp with time zone as estimated_delivery_limit_at,
    COALESCE(s->'sla'->>'status', s->>'sla_status') as shipment_sla_status,
    COALESCE(s->'sla'->>'service', s->>'sla_service') as shipment_sla_service,
    (s->'sla'->>'expected_date')::timestamp with time zone as shipment_sla_expected_date,
    (s->'sla'->>'last_updated')::timestamp with time zone as shipment_sla_last_updated,
    COALESCE(s->'delays', '[]'::jsonb) as shipment_delays,
    COALESCE(BOOL_OR(lower(s->>'status') = 'not_delivered' AND lower(s->>'substatus') = 'returned_to_warehouse'), false) AS is_returned
  INTO shipments_agg
  FROM jsonb_array_elements(COALESCE(rec.shipments, '[]'::jsonb)) s
  GROUP BY s;
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
  v_is_returned := shipments_agg.is_returned;
  v_printed_label := v_shipment_substatus = 'printed';
  -- Billing extraction from rec.billing_info with fallbacks
  v_billing_doc_number := COALESCE(
    rec.billing_info->'receiver'->'identification'->>'number',
    rec.billing_info->'receiver'->'document'->>'value',
    rec.data->'buyer'->'billing_info'->'identification'->>'number',
    rec.buyer->'identification'->>'number',
    NULL
  );
  v_billing_doc_type := COALESCE(
    rec.billing_info->'receiver'->'identification'->>'type',
    rec.billing_info->'receiver'->'document'->>'id',
    rec.data->'buyer'->'billing_info'->'identification'->>'type',
    NULL
  );
  IF v_billing_doc_type IS NULL AND COALESCE(v_billing_doc_number, '') <> '' THEN
    IF length(regexp_replace(v_billing_doc_number, '\D', '', 'g')) = 11 THEN
      v_billing_doc_type := 'CPF';
    ELSIF length(regexp_replace(v_billing_doc_number, '\D', '', 'g')) = 14 THEN
      v_billing_doc_type := 'CNPJ';
    END IF;
  END IF;
  v_billing_email := COALESCE(
    rec.data->'buyer'->>'email',
    rec.buyer->>'email',
    rec.data->'buyer'->'billing_info'->>'email',
    NULL
  );
  v_billing_phone := COALESCE(
    rec.data->'buyer'->'phone'->>'number',
    rec.buyer->'phone'->>'number',
    rec.data->'buyer'->'billing_info'->>'phone',
    NULL
  );
  v_billing_name := COALESCE(
    rec.billing_info->'receiver'->>'name',
    rec.data->'buyer'->'billing_info'->>'name',
    NULLIF(concat_ws(' ', rec.buyer->>'first_name', rec.buyer->>'last_name'), ''),
    rec.buyer->>'nickname',
    NULL
  );
  v_billing_state_registration := COALESCE(
    rec.data->'buyer'->'billing_info'->'taxes'->'inscriptions'->>'state_registration',
    rec.billing_info->'receiver'->'taxes'->'inscriptions'->>'state_registration',
    NULL
  );
  v_billing_taxpayer_type := COALESCE(
    rec.data->'buyer'->'billing_info'->'taxes'->'taxpayer_type'->>'description',
    rec.billing_info->'receiver'->'taxes'->'taxpayer_type'->>'description',
    NULL
  );
  v_billing_cust_type := COALESCE(
    rec.data->'buyer'->'billing_info'->'attributes'->>'cust_type',
    rec.billing_info->'receiver'->'attributes'->>'cust_type',
    NULL
  );
  v_billing_is_normalized := COALESCE(
    (rec.data->'buyer'->'billing_info'->'attributes'->>'is_normalized')::boolean,
    (rec.billing_info->'receiver'->'attributes'->>'is_normalized')::boolean,
    false
  );
  v_billing_address := COALESCE(
    rec.data->'buyer'->'billing_info'->'address',
    rec.billing_info->'receiver'->'address',
    NULL
  );
  IF v_is_cancelled OR v_is_refunded THEN v_status_interno := 'Cancelado';
  ELSIF v_is_returned THEN v_status_interno := 'Devolução';
  ELSIF v_shipment_status = 'pending' AND v_shipment_substatus = 'buffered' AND v_has_unlinked_items THEN v_status_interno := 'A vincular';
  ELSIF v_is_full THEN v_status_interno := 'Enviado';
  ELSIF v_has_unlinked_items THEN v_status_interno := 'A vincular';
  ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'invoice_pending' THEN v_status_interno := 'Emissao NF';
  ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'ready_to_print' THEN v_status_interno := 'Impressao';
  ELSIF v_shipment_status = 'ready_to_ship' AND v_printed_label THEN v_status_interno := 'Aguardando Coleta';
  ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'dropped_off'
        AND (lower(COALESCE(rec.status,'')) = 'paid' OR lower(COALESCE(payments_agg.payment_status,'')) = 'paid') THEN v_status_interno := 'Enviado';
  ELSIF v_shipment_status IN ('shipped','dropped_off','in_transit','handed_to_carrier','on_route','out_for_delivery','delivery_in_progress','collected','delivered') THEN v_status_interno := 'Enviado';
  ELSE v_status_interno := 'Pendente'; END IF;
  RAISE NOTICE 'Materialize refresh: id=%, marketplace=%, sale_fee=%',
    rec.id,
    rec.marketplace_name,
    CASE
      WHEN rec.marketplace_name = 'Shopee' THEN
        COALESCE(NULLIF(rec.data->'escrow_detail'->'response'->'order_income'->>'commission_fee','')::numeric, 0)
        + COALESCE(NULLIF(rec.data->'escrow_detail'->'response'->'order_income'->>'service_fee','')::numeric, 0)
      ELSE COALESCE(items_agg.items_total_sale_fee, 0)
    END;
  INSERT INTO public.marketplace_orders_presented_new (
    id, organizations_id, company_id, marketplace, marketplace_order_id, status, status_detail, order_total,
    shipping_type, customer_name, id_buyer, first_name_buyer, last_name_buyer, shipping_city_name,
    shipping_state_name, shipping_state_uf, shipping_street_name, shipping_street_number, shipping_neighborhood_name, shipping_zip_code, shipping_comment, shipping_address_line,
    shipment_status, shipment_substatus, shipping_method_name,
    estimated_delivery_limit_at, shipment_sla_status, shipment_sla_service, shipment_sla_expected_date,
    shipment_sla_last_updated, shipment_delays, printed_label, printed_schedule, payment_status, payment_total_paid_amount,
    payment_marketplace_fee, payment_shipping_cost, payment_date_created, payment_date_approved,
    payment_refunded_amount, items_count, items_total_quantity, items_total_amount, items_total_full_amount,
    items_total_sale_fee, items_currency_id, first_item_id, first_item_title, first_item_sku,
    first_item_variation_id, first_item_permalink, variation_color_names, category_ids, listing_type_ids,
    stock_node_ids, has_variations, has_bundle, has_kit, pack_id, unlinked_items_count, has_unlinked_items,
    linked_products, created_at, last_updated, last_synced_at, status_interno,
    billing_doc_number, billing_doc_type, billing_email, billing_phone,
    billing_name, billing_state_registration, billing_taxpayer_type, billing_cust_type, billing_is_normalized, billing_address
  )
  VALUES (
    rec.id, rec.organizations_id, rec.company_id, rec.marketplace_name, rec.marketplace_order_id, rec.status, rec.status_detail::text,
    CASE
      WHEN rec.marketplace_name = 'Shopee' THEN COALESCE(
        NULLIF(rec.data->'order_detail'->>'order_selling_price','')::numeric,
        NULLIF(rec.data->'escrow_detail'->'response'->'order_income'->>'order_selling_price','')::numeric,
        NULLIF(rec.data->'order_list_item'->>'order_selling_price','')::numeric,
        NULLIF(rec.data->'notification'->>'order_selling_price','')::numeric
      )
      ELSE (rec.data->>'total_amount')::numeric
    END,
    v_shipping_type, buyer_agg.customer_name, buyer_agg.id_buyer, buyer_agg.first_name, buyer_agg.last_name, shipping_address_agg.city,
    shipping_address_agg.state_name, shipping_address_agg.state_uf, shipping_address_agg.street_name, shipping_address_agg.street_number, shipping_address_agg.neighborhood_name, shipping_address_agg.zip_code, shipping_address_agg.comment, shipping_address_agg.address_line,
    CASE
      WHEN rec.marketplace_name = 'Shopee' THEN COALESCE(
        CASE
          WHEN jsonb_typeof(rec.data->'order_detail'->'package_list') = 'array' THEN rec.data->'order_detail'->'package_list'->0->>'logistics_status'
          WHEN jsonb_typeof(rec.data->'order_detail'->'package_list') = 'object' THEN rec.data->'order_detail'->'package_list'->>'logistics_status'
          ELSE NULL
        END,
        CASE
          WHEN jsonb_typeof(rec.data->'order_list_item'->'package_list') = 'array' THEN rec.data->'order_list_item'->'package_list'->0->>'logistics_status'
          WHEN jsonb_typeof(rec.data->'order_list_item'->'package_list') = 'object' THEN rec.data->'order_list_item'->'package_list'->>'logistics_status'
          ELSE NULL
        END
      )
      ELSE v_shipment_status
    END,
    v_shipment_substatus, shipments_agg.shipping_method_name,
    shipments_agg.estimated_delivery_limit_at, shipments_agg.shipment_sla_status, shipments_agg.shipment_sla_service, shipments_agg.shipment_sla_expected_date,
    shipments_agg.shipment_sla_last_updated, shipments_agg.shipment_delays, v_printed_label, v_printed_schedule, payments_agg.payment_status, payments_agg.total_paid_amount,
    payments_agg.marketplace_fee, payments_agg.shipping_cost, payments_agg.date_created, payments_agg.date_approved,
    payments_agg.refunded_amount, items_agg.items_count, items_agg.items_total_quantity, items_agg.items_total_amount, items_agg.items_total_full_amount,
    CASE
      WHEN rec.marketplace_name = 'Shopee' THEN
        COALESCE(NULLIF(rec.data->'escrow_detail'->'response'->'order_income'->>'commission_fee','')::numeric, 0)
        + COALESCE(NULLIF(rec.data->'escrow_detail'->'response'->'order_income'->>'service_fee','')::numeric, 0)
      ELSE items_agg.items_total_sale_fee
    END, items_agg.currency_id, items_agg.first_item_id, items_agg.first_item_title, items_agg.first_item_sku,
    items_agg.first_item_variation_id, items_agg.first_item_permalink, items_agg.variation_color_names, items_agg.category_ids, items_agg.listing_type_ids,
    items_agg.stock_node_ids, items_agg.has_variations, items_agg.has_bundle, items_agg.has_kit,
    CASE
      WHEN rec.marketplace_name = 'Shopee' THEN
        NULLIF(COALESCE(
          rec.data->'order_detail'->>'order_sn',
          rec.data->'order_list_item'->>'order_sn',
          rec.data->'notification'->>'order_sn',
          rec.marketplace_order_id
        ), '')
      ELSE
        CASE
          WHEN jsonb_typeof(rec.data->'pack_id') = 'number' THEN rec.data->>'pack_id'
          WHEN jsonb_typeof(rec.data->'pack_id') = 'string' THEN CASE WHEN (rec.data->>'pack_id') ~ '^\d+$' THEN rec.data->>'pack_id' ELSE NULL END
          ELSE NULL
        END
    END,
    v_unlinked_items_count, v_has_unlinked_items, v_linked_products,
    rec.date_created, rec.last_updated, rec.last_synced_at, v_status_interno,
    v_billing_doc_number, v_billing_doc_type, v_billing_email, v_billing_phone,
    v_billing_name, v_billing_state_registration, v_billing_taxpayer_type, v_billing_cust_type, v_billing_is_normalized, v_billing_address
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
    unlinked_items_count = EXCLUDED.unlinked_items_count,
    has_unlinked_items = EXCLUDED.has_unlinked_items,
    linked_products = EXCLUDED.linked_products,
    last_updated = EXCLUDED.last_updated,
    last_synced_at = EXCLUDED.last_synced_at,
    status_interno = EXCLUDED.status_interno,
    billing_doc_number = EXCLUDED.billing_doc_number,
    billing_doc_type = EXCLUDED.billing_doc_type,
    billing_email = EXCLUDED.billing_email,
    billing_phone = EXCLUDED.billing_phone,
    billing_name = EXCLUDED.billing_name,
    billing_state_registration = EXCLUDED.billing_state_registration,
    billing_taxpayer_type = EXCLUDED.billing_taxpayer_type,
    billing_cust_type = EXCLUDED.billing_cust_type,
    billing_is_normalized = EXCLUDED.billing_is_normalized,
    billing_address = EXCLUDED.billing_address;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION public.refresh_presented_order(uuid) TO authenticated;
