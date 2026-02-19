BEGIN;

CREATE OR REPLACE FUNCTION public.process_marketplace_order_presented_new()
RETURNS TRIGGER AS $$
DECLARE
  v_shp_order_status text;
  v_shp_order_status_raw text;
  v_shp_invoice_pending boolean;
  v_shp_fulfillment_ready boolean;
  v_shp_pickup_done boolean;
  v_shp_shipping_carrier text;
  v_created_at timestamptz;
  v_last_updated timestamptz;
  v_payment_total numeric;
  v_order_total numeric;
  v_customer_name text;
  v_buyer_id bigint;
  v_city text;
  v_town text;
  v_region text;
  v_state text;
  v_state_key text;
  v_state_uf text;
  v_zip text;
  v_address_line text;
  v_logistics_status text;
  v_logistics_status_raw text;
  v_items_count integer;
  v_items_total_quantity integer;
  v_items_total_amount numeric;
  v_items_total_full_amount numeric;
  v_items_total_sale_fee numeric;
  v_commission_fee numeric;
  v_service_fee numeric;
  v_items_currency_id text;
  v_first_item_id text;
  v_first_item_title text;
  v_first_item_sku text;
  v_first_item_variation_id bigint;
  v_variation_color_names text[];
  v_has_variations boolean;
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
  v_err_message text;
  v_err_detail text;
  v_err_hint text;
  v_err_context text;
  v_items_raw_count integer;
  v_items_deleted_count integer;
  v_items_inserted_count integer;
  v_items_source text;
  v_presented_exists boolean;
  v_items_jsonb jsonb;
  v_pack_id text;
BEGIN
  IF NEW.marketplace_name = 'Shopee' THEN
    BEGIN
      v_shp_order_status_raw := COALESCE(
        NEW.data->'order_detail'->>'order_status',
        NEW.data->'order_list_item'->>'order_status',
        NEW.data->'notification'->>'order_status',
        NEW.data->'notification'->>'status',
        ''
      );
      v_shp_order_status := lower(COALESCE(v_shp_order_status_raw,''));
      IF v_shp_order_status = 'unpaid' THEN
        RETURN NEW;
      END IF;

      v_pack_id := NULLIF(COALESCE(
        NEW.data->'order_detail'->>'order_sn',
        NEW.data->'order_list_item'->>'order_sn',
        NEW.data->'notification'->>'order_sn',
        NEW.marketplace_order_id
      ), '');

      v_shp_invoice_pending := lower(COALESCE(NEW.data->'order_detail'->'invoice_data'->>'invoice_status', NEW.data->'notification'->'invoice_data'->>'invoice_status','')) = 'pending'
                               OR v_shp_order_status = 'invoice_pending'
                               OR (NEW.data->'order_detail'->'invoice_data'->>'invoice_number') IS NULL;
      v_shp_fulfillment_ready := lower(COALESCE(
        NEW.data->'order_detail'->>'logistics_status',
        NEW.data->'order_list_item'->>'logistics_status',
        NEW.data->'notification'->>'logistics_status',
        ''
      )) IN ('logistics_ready','logistics_request_created');
      v_shp_pickup_done := (NEW.data->'order_detail'->>'pickup_done_time') IS NOT NULL;
      v_shp_shipping_carrier := COALESCE(NEW.data->'order_detail'->>'shipping_carrier', NEW.data->'order_list_item'->>'shipping_carrier', NEW.data->'notification'->>'shipping_carrier', '');

      v_order_total := COALESCE(
        NULLIF(replace(regexp_replace(COALESCE(NEW.data->'order_detail'->>'order_selling_price',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
        NULLIF(replace(regexp_replace(COALESCE(NEW.data->'escrow_detail'->'response'->'order_income'->>'order_selling_price',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
        NULLIF(replace(regexp_replace(COALESCE(NEW.data->'order_list_item'->>'order_selling_price',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
        NULLIF(replace(regexp_replace(COALESCE(NEW.data->'notification'->>'order_selling_price',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric
      );
      v_payment_total := COALESCE(
        NULLIF(replace(regexp_replace(COALESCE(NEW.data->'order_detail'->>'total_amount',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
        NULLIF(replace(regexp_replace(COALESCE(NEW.data->'order_list_item'->>'total_amount',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
        NULLIF(replace(regexp_replace(COALESCE(NEW.data->'notification'->>'total_amount',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
        v_order_total
      );

      v_customer_name := COALESCE(NEW.data->'order_detail'->>'buyer_username', NEW.data->'order_list_item'->>'buyer_username', NEW.data->'notification'->>'buyer_username','');
      v_buyer_id := CASE
        WHEN NULLIF(NEW.data->'order_detail'->>'buyer_user_id','') IS NOT NULL THEN (NEW.data->'order_detail'->>'buyer_user_id')::bigint
        WHEN NULLIF(NEW.data->'order_list_item'->>'buyer_user_id','') IS NOT NULL THEN (NEW.data->'order_list_item'->>'buyer_user_id')::bigint
        WHEN NULLIF(NEW.data->'notification'->>'buyer_user_id','') IS NOT NULL THEN (NEW.data->'notification'->>'buyer_user_id')::bigint
        ELSE NULL
      END;

      v_city := COALESCE(NEW.data->'order_detail'->'recipient_address'->>'city', NEW.data->'order_list_item'->'recipient_address'->>'city', NEW.data->'notification'->'recipient_address'->>'city');
      v_town := COALESCE(NEW.data->'order_detail'->'recipient_address'->>'town', NEW.data->'order_list_item'->'recipient_address'->>'town', NEW.data->'notification'->'recipient_address'->>'town');
      v_region := COALESCE(NEW.data->'order_detail'->'recipient_address'->>'region', NEW.data->'order_list_item'->'recipient_address'->>'region', NEW.data->'notification'->'recipient_address'->>'region');
      v_state := v_region;
      v_state_uf := NULL;
      v_zip := COALESCE(NEW.data->'order_detail'->'recipient_address'->>'zipcode', NEW.data->'order_list_item'->'recipient_address'->>'zipcode', NEW.data->'notification'->'recipient_address'->>'zipcode');
      v_address_line := COALESCE(NEW.data->'order_detail'->'recipient_address'->>'full_address', NEW.data->'order_list_item'->'recipient_address'->>'full_address', NEW.data->'notification'->'recipient_address'->>'full_address');

      v_logistics_status := lower(COALESCE(NEW.data->'order_detail'->>'logistics_status', NEW.data->'order_list_item'->>'logistics_status', NEW.data->'notification'->>'logistics_status',''));
      v_logistics_status_raw := COALESCE(
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
      );

      v_created_at := CASE
        WHEN NULLIF(NEW.data->'order_detail'->>'create_time','') IS NOT NULL THEN to_timestamp((NEW.data->'order_detail'->>'create_time')::bigint)
        WHEN NULLIF(NEW.data->'order_list_item'->>'create_time','') IS NOT NULL THEN to_timestamp((NEW.data->'order_list_item'->>'create_time')::bigint)
        WHEN NULLIF(NEW.data->'notification'->>'create_time','') IS NOT NULL THEN to_timestamp((NEW.data->'notification'->>'create_time')::bigint)
        ELSE NEW.date_created
      END;

      v_last_updated := CASE
        WHEN NULLIF(NEW.data->'order_detail'->>'update_time','') IS NOT NULL THEN to_timestamp((NEW.data->'order_detail'->>'update_time')::bigint)
        WHEN NULLIF(NEW.data->'order_list_item'->>'update_time','') IS NOT NULL THEN to_timestamp((NEW.data->'order_list_item'->>'update_time')::bigint)
        WHEN NULLIF(NEW.data->'notification'->>'update_time','') IS NOT NULL THEN to_timestamp((NEW.data->'notification'->>'update_time')::bigint)
        ELSE NEW.last_updated
      END;

      v_items_count := COALESCE(jsonb_array_length(COALESCE(NEW.data->'order_detail'->'item_list','[]'::jsonb)), 0);
      SELECT
        COALESCE(SUM(COALESCE(NULLIF(regexp_replace(COALESCE(oi->>'model_quantity_purchased',''), '[^0-9-]+', '', 'g'),'')::int, NULLIF(regexp_replace(COALESCE(oi->>'quantity',''), '[^0-9-]+', '', 'g'),'')::int, 1)), 0),
        COALESCE(SUM(
          COALESCE(
            NULLIF(replace(regexp_replace(COALESCE(oi->>'item_price',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
            NULLIF(replace(regexp_replace(COALESCE(oi->>'original_price',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
            0
          )
          * COALESCE(NULLIF(regexp_replace(COALESCE(oi->>'model_quantity_purchased',''), '[^0-9-]+', '', 'g'),'')::int, NULLIF(regexp_replace(COALESCE(oi->>'quantity',''), '[^0-9-]+', '', 'g'),'')::int, 1)
        ), 0)::numeric,
        COALESCE(SUM(
          COALESCE(
            NULLIF(replace(regexp_replace(COALESCE(oi->>'original_price',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
            NULLIF(replace(regexp_replace(COALESCE(oi->>'item_price',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
            0
          )
          * COALESCE(NULLIF(regexp_replace(COALESCE(oi->>'model_quantity_purchased',''), '[^0-9-]+', '', 'g'),'')::int, NULLIF(regexp_replace(COALESCE(oi->>'quantity',''), '[^0-9-]+', '', 'g'),'')::int, 1)
        ), 0)::numeric,
        COALESCE(BOOL_OR(NULLIF(oi->>'model_id','') IS NOT NULL), false)
      INTO v_items_total_quantity, v_items_total_amount, v_items_total_full_amount, v_has_variations
      FROM jsonb_array_elements(COALESCE(NEW.data->'order_detail'->'item_list','[]'::jsonb)) oi;

      v_commission_fee := COALESCE(
        NULLIF(replace(regexp_replace(COALESCE(NEW.data->'escrow_detail'->'response'->'order_income'->>'commission_fee',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
        NULLIF(replace(regexp_replace(COALESCE(((NEW.data->'escrow_detail'->>'response')::jsonb -> 'order_income' ->> 'commission_fee'),''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
        0
      );
      v_service_fee := COALESCE(
        NULLIF(replace(regexp_replace(COALESCE(NEW.data->'escrow_detail'->'response'->'order_income'->>'service_fee',''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
        NULLIF(replace(regexp_replace(COALESCE(((NEW.data->'escrow_detail'->>'response')::jsonb -> 'order_income' ->> 'service_fee'),''), '[^0-9.,-]+', '', 'g'), ',', '.'),'')::numeric,
        0
      );
      v_items_total_sale_fee := COALESCE(v_commission_fee, 0) + COALESCE(v_service_fee, 0);
      v_items_currency_id := COALESCE(NEW.data->'order_detail'->>'currency', NEW.data->'escrow_detail'->>'currency', NEW.data->'order_list_item'->>'currency');

      v_first_item_id := NULLIF(COALESCE(NEW.data->'order_detail'->'item_list'->0->>'item_id', NEW.data->'order_list_item'->'item_list'->0->>'item_id'), '');
      v_first_item_title := NULLIF(COALESCE(NEW.data->'order_detail'->'item_list'->0->>'item_name', NEW.data->'order_list_item'->'item_list'->0->>'item_name'), '');
      v_first_item_sku := COALESCE(NULLIF(NEW.data->'order_detail'->'item_list'->0->>'model_sku',''), NULLIF(NEW.data->'order_detail'->'item_list'->0->>'sku',''), NULLIF(NEW.data->'order_list_item'->'item_list'->0->>'model_sku',''), NULLIF(NEW.data->'order_list_item'->'item_list'->0->>'sku',''));
      v_first_item_variation_id := CASE
        WHEN NULLIF(COALESCE(NEW.data->'order_detail'->'item_list'->0->>'model_id', NEW.data->'order_list_item'->'item_list'->0->>'model_id'), '') IS NOT NULL
        THEN COALESCE(NEW.data->'order_detail'->'item_list'->0->>'model_id', NEW.data->'order_list_item'->'item_list'->0->>'model_id')::bigint
        ELSE NULL
      END;

      v_variation_color_names := COALESCE(
        ARRAY(
          SELECT DISTINCT NULLIF(oi->>'model_name','')
          FROM jsonb_array_elements(COALESCE(NEW.data->'order_detail'->'item_list','[]'::jsonb)) oi
          WHERE NULLIF(oi->>'model_name','') IS NOT NULL
        ),
        '{}'::text[]
      );

      SELECT COUNT(*) INTO v_unlinked_items_count
      FROM (
        WITH order_items_parsed AS (
          SELECT
            COALESCE(oi->>'item_id','') AS item_id_text,
            COALESCE(NULLIF(oi->>'model_id',''), '') AS variation_id_text,
            COALESCE(oi->>'model_sku', oi->>'sku', '') AS seller_sku_text
          FROM jsonb_array_elements(COALESCE(NEW.data->'order_detail'->'item_list','[]'::jsonb)) AS oi
        ), ephemeral_links AS (
          SELECT
            COALESCE(e->>'marketplace_item_id','') AS marketplace_item_id,
            COALESCE(e->>'variation_id','') AS variation_id,
            NULLIF(e->>'product_id','')::uuid AS product_id
          FROM jsonb_array_elements(
            COALESCE(NEW.linked_products, '[]'::jsonb)
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
          SELECT COALESCE(oi->>'item_id','') AS item_id_text,
                 COALESCE(NULLIF(oi->>'model_id',''), '') AS variation_id_text
          FROM jsonb_array_elements(COALESCE(NEW.data->'order_detail'->'item_list','[]'::jsonb)) AS oi
        ), ephemeral_links AS (
          SELECT COALESCE(e->>'marketplace_item_id','') AS marketplace_item_id,
                 COALESCE(e->>'variation_id','') AS variation_id,
                 NULLIF(e->>'product_id','')::uuid AS product_id
          FROM jsonb_array_elements(COALESCE(NEW.linked_products, '[]'::jsonb)) e
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
          ON mipl.organizations_id = NEW.organizations_id
         AND mipl.marketplace_name = NEW.marketplace_name
         AND mipl.marketplace_item_id = oip.item_id_text
         AND mipl.variation_id = oip.variation_id_text
        LEFT JOIN ephemeral_links eph
          ON eph.marketplace_item_id = oip.item_id_text
         AND eph.variation_id = oip.variation_id_text
        LEFT JOIN public.products p
          ON p.id = COALESCE(mipl.product_id, eph.product_id)
      ) o
      WHERE o.product_id IS NOT NULL;

      v_has_unlinked_items := COALESCE(v_unlinked_items_count, 0) > 0;

      v_status_interno := CASE
        WHEN v_shp_order_status IN ('cancelled','in_cancel') THEN 'Cancelado'
        WHEN v_shp_order_status = 'to_return' THEN 'Devolução'
        WHEN (v_shp_order_status = 'ready_to_ship' OR v_shp_fulfillment_ready) AND v_has_unlinked_items THEN 'A vincular'
        WHEN v_shp_order_status = 'ready_to_ship' AND v_shp_invoice_pending THEN 'Emissao NF'
        WHEN v_shp_order_status IN ('ready_to_ship','processed') OR v_shp_fulfillment_ready THEN 'Impressao'
        WHEN v_shp_order_status = 'retry_ship' THEN 'Aguardando Coleta'
        WHEN v_shp_order_status IN ('shipped','to_confirm_receive','completed') OR v_shp_pickup_done THEN 'Enviado'
        ELSE 'Pendente'
      END;

      PERFORM set_config('row_security', 'off', true);
      INSERT INTO public.marketplace_orders_presented_new (
        id, organizations_id, company_id, marketplace, marketplace_order_id, status, status_detail, order_total,
        shipping_type, customer_name, id_buyer, first_name_buyer, last_name_buyer,
        shipping_city_name, shipping_state_name, shipping_state_uf,
        shipping_street_name, shipping_street_number, shipping_neighborhood_name, shipping_zip_code, shipping_comment, shipping_address_line,
        shipment_status, shipment_substatus, shipping_method_name,
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
        NEW.id, NEW.organizations_id, NEW.company_id, NEW.marketplace_name, NEW.marketplace_order_id, COALESCE(NEW.status, v_shp_order_status), NEW.status_detail::text, v_order_total,
        v_shp_shipping_carrier, v_customer_name, v_buyer_id, NULL, NULL,
        v_city, v_state, v_state_uf,
        NULL, NULL, NULL, v_zip, NULL, v_address_line,
        v_logistics_status_raw, NULL, v_shp_shipping_carrier,
        NULL, NULL, NULL, NULL,
        v_last_updated, '[]'::jsonb, false, NULL, NULL, v_payment_total,
        NULL, NULL, NULL, NULL,
        NULL, v_items_count, v_items_total_quantity, v_items_total_amount, v_items_total_full_amount,
        v_items_total_sale_fee, v_items_currency_id, v_first_item_id, v_first_item_title, v_first_item_sku,
        v_first_item_variation_id, NULL, v_variation_color_names, '{}'::text[], '{}'::text[],
        '{}'::text[], v_has_variations, false, false,
        CASE
          WHEN NEW.marketplace_name = 'Shopee' THEN NULL
          ELSE NULL
        END,
        false, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        COALESCE(v_unlinked_items_count, 0), COALESCE(v_has_unlinked_items, false), COALESCE(v_linked_products, '[]'::jsonb), COALESCE(NEW.date_created, v_created_at), COALESCE(NEW.last_updated, v_last_updated), NEW.last_synced_at, v_status_interno
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
        status_interno = EXCLUDED.status_interno;

      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_message = MESSAGE_TEXT,
                              v_err_detail  = PG_EXCEPTION_DETAIL,
                              v_err_hint    = PG_EXCEPTION_HINT,
                              v_err_context = PG_EXCEPTION_CONTEXT;
      RAISE NOTICE 'Shopee items error: order_id=%, message=%, detail=%, hint=%, context=%',
        NEW.id, v_err_message, v_err_detail, v_err_hint, v_err_context;
      PERFORM set_config('row_security', 'on', true);
      RETURN NEW;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

BEGIN;

ALTER TABLE public.marketplace_orders_presented_new
  ADD COLUMN IF NOT EXISTS printed_label boolean,
  ADD COLUMN IF NOT EXISTS label_printed_on timestamptz;

CREATE OR REPLACE FUNCTION public.rpc_marketplace_order_print_label(p_order_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_rows integer;
BEGIN
  UPDATE public.marketplace_orders_presented_new
  SET
    status_interno = 'Aguardando Coleta',
    printed_label = true,
    label_printed_on = now()
  WHERE id = ANY(p_order_ids)
    AND COALESCE(label_cached, false) = true;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows > 0 THEN
    RETURN jsonb_build_object('ok', true, 'updated_rows', v_updated_rows, 'message', 'Etiquetas marcadas como impressas');
  ELSE
    RETURN jsonb_build_object('ok', false, 'updated_rows', 0, 'message', 'Etiquetas não encontradas ou não disponíveis');
  END IF;
END;
$$;

COMMIT;
