-- Atomic NFe number reservation operating on the canonical invoices table.
-- Replaces fn_reservar_e_numerar_notas which operated on the legacy notas_fiscais table.
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_reservar_e_numerar_invoices(
  p_organization_id uuid,
  p_company_id uuid,
  p_order_id uuid,
  p_emission_environment text,
  p_payload jsonb,
  p_marketplace text,
  p_marketplace_order_id text,
  p_pack_id text,
  p_total_value numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company RECORD;
  v_serie text;
  v_next integer;
  v_inv_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_max_row integer := 0;
  v_existing RECORD;
  v_idempotency_key text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  v_idempotency_key := p_organization_id::text || ':' || p_order_id::text || ':' || p_emission_environment;

  SELECT * INTO v_company
  FROM public.companies
  WHERE id = p_company_id
  FOR UPDATE;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Company % not found', p_company_id;
  END IF;

  v_serie := NULLIF(v_company.numero_serie, '');

  -- Advisory lock scoped to company + environment + serie to prevent races
  PERFORM pg_advisory_xact_lock(
    (('x' || substr(md5(p_company_id::text), 1, 8))::bit(32))::int,
    (('x' || substr(md5((p_emission_environment || ':' || COALESCE(v_serie, ''))), 1, 8))::bit(32))::int
  );

  -- Check for existing invoice by idempotency_key (with nfe_number assigned first)
  SELECT id, nfe_number, serie, payload_sent
    INTO v_existing
  FROM public.invoices
  WHERE idempotency_key = v_idempotency_key
    AND nfe_number IS NOT NULL
  FOR UPDATE;

  IF v_existing IS NULL THEN
    SELECT id, nfe_number, serie, payload_sent
      INTO v_existing
    FROM public.invoices
    WHERE idempotency_key = v_idempotency_key
    FOR UPDATE;
  END IF;

  IF v_existing IS NOT NULL THEN
    v_inv_id := v_existing.id;
    v_next := v_existing.nfe_number;
    IF v_next IS NULL THEN
      IF v_serie IS NOT NULL THEN
        SELECT COALESCE(MAX(nfe_number), 0) INTO v_max_row
        FROM public.invoices
        WHERE company_id = p_company_id
          AND emission_environment = p_emission_environment
          AND serie = v_serie;
      ELSE
        SELECT COALESCE(MAX(nfe_number), 0) INTO v_max_row
        FROM public.invoices
        WHERE company_id = p_company_id
          AND emission_environment = p_emission_environment;
      END IF;
      v_next := GREATEST(v_max_row, COALESCE(NULLIF(v_company.proxima_nfe, 0), 0));
      v_next := CASE WHEN v_next <= 0 THEN 1 ELSE v_next + 1 END;
    END IF;
    IF v_existing.serie IS NOT NULL THEN
      v_serie := v_existing.serie;
    END IF;
    p_payload := jsonb_set(p_payload, '{numero}', to_jsonb(v_next), true);
    IF v_serie IS NOT NULL THEN
      p_payload := jsonb_set(p_payload, '{serie}', to_jsonb(v_serie), true);
    END IF;
    UPDATE public.invoices
      SET nfe_number = v_next,
          serie = v_serie,
          status = 'processing',
          payload_sent = p_payload,
          total_value = p_total_value,
          updated_at = v_now
    WHERE id = v_inv_id;
    RETURN jsonb_build_object(
      'invoice_id', v_inv_id,
      'numero', v_next,
      'serie', v_serie,
      'payload', p_payload
    );
  END IF;

  -- No existing row: resolve next number
  IF v_serie IS NOT NULL THEN
    SELECT COALESCE(MAX(nfe_number), 0) INTO v_max_row
    FROM public.invoices
    WHERE company_id = p_company_id
      AND emission_environment = p_emission_environment
      AND serie = v_serie;
  ELSE
    SELECT COALESCE(MAX(nfe_number), 0) INTO v_max_row
    FROM public.invoices
    WHERE company_id = p_company_id
      AND emission_environment = p_emission_environment;
  END IF;

  v_next := GREATEST(v_max_row, COALESCE(NULLIF(v_company.proxima_nfe, 0), 0));
  v_next := CASE WHEN v_next <= 0 THEN 1 ELSE v_next + 1 END;

  p_payload := jsonb_set(p_payload, '{numero}', to_jsonb(v_next), true);
  IF v_serie IS NOT NULL THEN
    p_payload := jsonb_set(p_payload, '{serie}', to_jsonb(v_serie), true);
  END IF;

  INSERT INTO public.invoices (
    id, organization_id, company_id, order_id, idempotency_key,
    nfe_number, serie, status, emission_environment,
    marketplace, marketplace_order_id, pack_id,
    total_value, payload_sent, created_at, updated_at
  ) VALUES (
    v_inv_id, p_organization_id, p_company_id, p_order_id, v_idempotency_key,
    v_next, v_serie, 'processing', p_emission_environment,
    NULLIF(p_marketplace, ''), NULLIF(p_marketplace_order_id, ''), NULLIF(p_pack_id, ''),
    p_total_value, p_payload, v_now, v_now
  );

  RETURN jsonb_build_object(
    'invoice_id', v_inv_id,
    'numero', v_next,
    'serie', v_serie,
    'payload', p_payload
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_reservar_e_numerar_invoices(uuid, uuid, uuid, text, jsonb, text, text, text, numeric) TO authenticated;

COMMIT;
