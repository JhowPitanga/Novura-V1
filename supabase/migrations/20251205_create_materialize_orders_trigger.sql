
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
        NEW.data->'shipping'->'receiver_address'->>'city' as city,
        NEW.data->'shipping'->'receiver_address'->'state'->>'name' as state_name,
        NEW.data->'shipping'->'receiver_address'->'state'->>'id' as state_uf
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
        NEW.order_items->0->'item'->>'permalink' as first_item_permalink,
        ARRAY(SELECT jsonb_array_elements_text(jsonb_path_query_array(NEW.order_items, '$[*].item.variation_attributes[*].value_name ? (@.name == "Cor")'))) as variation_color_names,
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
        COALESCE(NEW.data->'shipping'->>'logistic_type', s->'logistic'->>'type') AS shipping_type,
        lower(COALESCE(s->>'status', '')) AS shipment_status,
        lower(COALESCE(s->>'substatus', '')) AS shipment_substatus,
        s->'shipping_option'->>'name' as shipping_method_name,
        (s->'shipping_option'->'estimated_delivery_limit'->>'date')::timestamp with time zone as estimated_delivery_limit_at,
        s->'sla'->>'status' as shipment_sla_status,
        s->'sla'->>'service' as shipment_sla_service,
        (s->'sla'->>'expected_date')::timestamp with time zone as shipment_sla_expected_date,
        (s->'sla'->>'last_updated')::timestamp with time zone as shipment_sla_last_updated,
        COALESCE(s->'delays', '[]'::jsonb) as shipment_delays,
        COALESCE(BOOL_OR(lower(s->>'status') = 'not_delivered' AND lower(s->>'substatus') = 'returned_to_warehouse'), false) AS is_returned
    INTO shipments_agg
    FROM jsonb_array_elements(COALESCE(NEW.shipments, '[]'::jsonb)) s
    GROUP BY s;

    -- 2. Calculate derived values
    WITH order_items_parsed AS (
        SELECT
            COALESCE(oi->'item'->>'id', oi->>'item_id', oi->>'id') AS item_id_text,
            COALESCE(NULLIF(oi->'item'->>'variation_id',''), NULLIF(oi->>'variation_id',''), '') AS variation_id_text
        FROM jsonb_array_elements(COALESCE(NEW.order_items, '[]'::jsonb)) AS oi
    )
    SELECT COUNT(*) INTO v_unlinked_items_count
    FROM order_items_parsed oip
    LEFT JOIN public.marketplace_item_product_links l
      ON l.organizations_id = NEW.organizations_id
     AND l.marketplace_name = NEW.marketplace_name
     AND l.marketplace_item_id = oip.item_id_text
     AND l.variation_id = oip.variation_id_text
    WHERE l.product_id IS NULL OR oip.item_id_text IS NULL OR oip.item_id_text = '';

    v_has_unlinked_items := v_unlinked_items_count > 0;
    v_shipping_type := shipments_agg.shipping_type;
    v_shipment_status := lower(COALESCE(NULLIF(shipments_agg.shipment_status, ''), NEW.data->'shipping'->>'status'));
    v_shipment_substatus := lower(COALESCE(NULLIF(shipments_agg.shipment_substatus, ''), NEW.data->'shipping'->>'substatus'));
    v_is_full := lower(v_shipping_type) = 'fulfillment';
    v_is_cancelled := lower(NEW.status) = 'cancelled' OR payments_agg.is_cancelled OR v_shipment_status = 'cancelled';
    v_is_refunded := payments_agg.is_refunded;
    v_is_returned := shipments_agg.is_returned;
    v_printed_label := v_shipment_substatus = 'printed';

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
    ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'invoice_pending' THEN
        v_status_interno := 'Emissao NF';
    ELSIF v_shipment_status = 'ready_to_ship' AND v_shipment_substatus = 'ready_to_print' THEN
        v_status_interno := 'Impressao';
    ELSIF v_shipment_status = 'ready_to_ship' AND v_printed_label THEN
        v_status_interno := 'Aguardando Coleta';
    ELSIF v_shipment_status IN ('shipped', 'in_transit', 'handed_to_carrier', 'on_route', 'out_for_delivery', 'delivery_in_progress', 'collected', 'delivered') THEN
        v_status_interno := 'Enviado';
    ELSE
        v_status_interno := 'Pendente';
    END IF;

    -- 4. INSERT or UPDATE the marketplace_orders_presented_new table
    INSERT INTO public.marketplace_orders_presented_new (
        id, organizations_id, company_id, marketplace, marketplace_order_id, status, status_detail, order_total,
        shipping_type, customer_name, id_buyer, first_name_buyer, last_name_buyer, shipping_city_name,
        shipping_state_name, shipping_state_uf, shipment_status, shipment_substatus, shipping_method_name,
        estimated_delivery_limit_at, shipment_sla_status, shipment_sla_service, shipment_sla_expected_date,
        shipment_sla_last_updated, shipment_delays, printed_label, payment_status, payment_total_paid_amount,
        payment_marketplace_fee, payment_shipping_cost, payment_date_created, payment_date_approved,
        payment_refunded_amount, items_count, items_total_quantity, items_total_amount, items_total_full_amount,
        items_total_sale_fee, items_currency_id, first_item_id, first_item_title, first_item_sku,
        first_item_variation_id, first_item_permalink, variation_color_names, category_ids, listing_type_ids,
        stock_node_ids, has_variations, has_bundle, has_kit, pack_id, unlinked_items_count, has_unlinked_items,
        created_at, last_updated, last_synced_at, status_interno
    )
    VALUES (
        NEW.id, NEW.organizations_id, NEW.company_id, NEW.marketplace_name, NEW.marketplace_order_id, NEW.status, NEW.status_detail::text, (NEW.data->>'total_amount')::numeric,
        v_shipping_type, buyer_agg.customer_name, buyer_agg.id_buyer, buyer_agg.first_name, buyer_agg.last_name, shipping_address_agg.city,
        shipping_address_agg.state_name, shipping_address_agg.state_uf, v_shipment_status, v_shipment_substatus, shipments_agg.shipping_method_name,
        shipments_agg.estimated_delivery_limit_at, shipments_agg.shipment_sla_status, shipments_agg.shipment_sla_service, shipments_agg.shipment_sla_expected_date,
        shipments_agg.shipment_sla_last_updated, shipments_agg.shipment_delays, v_printed_label, payments_agg.payment_status, payments_agg.total_paid_amount,
        payments_agg.marketplace_fee, payments_agg.shipping_cost, payments_agg.date_created, payments_agg.date_approved,
        payments_agg.refunded_amount, items_agg.items_count, items_agg.items_total_quantity, items_agg.items_total_amount, items_agg.items_total_full_amount,
        items_agg.items_total_sale_fee, items_agg.currency_id, items_agg.first_item_id, items_agg.first_item_title, items_agg.first_item_sku,
        items_agg.first_item_variation_id, items_agg.first_item_permalink, items_agg.variation_color_names, items_agg.category_ids, items_agg.listing_type_ids,
        items_agg.stock_node_ids, items_agg.has_variations, items_agg.has_bundle, items_agg.has_kit,
        CASE
            WHEN jsonb_typeof(NEW.data->'pack_id') = 'number' THEN (NEW.data->>'pack_id')::bigint
            WHEN jsonb_typeof(NEW.data->'pack_id') = 'string' THEN CASE WHEN (NEW.data->>'pack_id') ~ '^\d+$' THEN (NEW.data->>'pack_id')::bigint ELSE NULL END
            ELSE NULL
        END,
        v_unlinked_items_count, v_has_unlinked_items,
        NEW.date_created, NEW.last_updated, NEW.last_synced_at, v_status_interno
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
        last_updated = EXCLUDED.last_updated,
        last_synced_at = EXCLUDED.last_synced_at,
        status_interno = EXCLUDED.status_interno;

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
