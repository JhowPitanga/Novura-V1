BEGIN;

ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS playload_enviado jsonb;

CREATE OR REPLACE FUNCTION public.fn_reservar_e_numerar_notas(
  p_company_id uuid,
  p_order_id uuid,
  p_emissao_ambiente text,
  p_payload jsonb,
  p_marketplace text,
  p_marketplace_order_id text,
  p_pack_id text,
  p_tipo text,
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
  v_nf_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_max_row integer := 0;
  v_existing RECORD;
BEGIN
  PERFORM set_config('row_security','off', true);

  SELECT * INTO v_company
  FROM public.companies
  WHERE id = p_company_id
  FOR UPDATE;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Company % not found', p_company_id;
  END IF;

  v_serie := NULLIF(v_company.numero_serie, '');

  PERFORM pg_advisory_xact_lock(
    (('x' || substr(md5(p_company_id::text), 1, 8))::bit(32))::int,
    (('x' || substr(md5((p_emissao_ambiente || ':' || COALESCE(v_serie, ''))), 1, 8))::bit(32))::int
  );

  SELECT id, nfe_number, serie, playload_enviado
    INTO v_existing
  FROM public.notas_fiscais
  WHERE company_id = p_company_id
    AND order_id = p_order_id
    AND emissao_ambiente = p_emissao_ambiente
    AND nfe_number IS NOT NULL
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_existing IS NULL THEN
    SELECT id, nfe_number, serie, playload_enviado
      INTO v_existing
    FROM public.notas_fiscais
    WHERE company_id = p_company_id
      AND order_id = p_order_id
      AND emissao_ambiente = p_emissao_ambiente
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_existing IS NOT NULL THEN
    v_nf_id := v_existing.id;
    v_next := v_existing.nfe_number;
    IF v_next IS NULL THEN
      IF v_serie IS NOT NULL THEN
        SELECT COALESCE(MAX(nfe_number), 0) INTO v_max_row
        FROM public.notas_fiscais
        WHERE company_id = p_company_id
          AND emissao_ambiente = p_emissao_ambiente
          AND serie = v_serie;
      ELSE
        SELECT COALESCE(MAX(nfe_number), 0) INTO v_max_row
        FROM public.notas_fiscais
        WHERE company_id = p_company_id
          AND emissao_ambiente = p_emissao_ambiente;
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
    UPDATE public.notas_fiscais
      SET nfe_number = v_next,
          serie = v_serie,
          status = 'processando_autorizacao',
          playload_enviado = p_payload,
          total_value = p_total_value,
          tipo = NULLIF(p_tipo, '')
    WHERE id = v_nf_id;
    RETURN jsonb_build_object(
      'nf_id', v_nf_id,
      'numero', v_next,
      'serie', v_serie,
      'payload', p_payload
    );
  END IF;

  IF v_serie IS NOT NULL THEN
    SELECT COALESCE(MAX(nfe_number), 0) INTO v_max_row
    FROM public.notas_fiscais
    WHERE company_id = p_company_id
      AND emissao_ambiente = p_emissao_ambiente
      AND serie = v_serie;
  ELSE
    SELECT COALESCE(MAX(nfe_number), 0) INTO v_max_row
    FROM public.notas_fiscais
    WHERE company_id = p_company_id
      AND emissao_ambiente = p_emissao_ambiente;
  END IF;

  v_next := GREATEST(v_max_row, COALESCE(NULLIF(v_company.proxima_nfe, 0), 0));
  v_next := CASE WHEN v_next <= 0 THEN 1 ELSE v_next + 1 END;

  p_payload := jsonb_set(p_payload, '{numero}', to_jsonb(v_next), true);
  IF v_serie IS NOT NULL THEN
    p_payload := jsonb_set(p_payload, '{serie}', to_jsonb(v_serie), true);
  END IF;

  INSERT INTO public.notas_fiscais (
    id, company_id, order_id, nfe_number, serie, status, created_at,
    marketplace, marketplace_order_id, pack_id, emissao_ambiente, tipo, total_value, playload_enviado
  ) VALUES (
    v_nf_id, p_company_id, p_order_id, v_next, v_serie, 'processando_autorizacao', v_now,
    NULLIF(p_marketplace, ''), NULLIF(p_marketplace_order_id, ''), NULLIF(p_pack_id, ''), p_emissao_ambiente, NULLIF(p_tipo, ''), p_total_value, p_payload
  );

  RETURN jsonb_build_object(
    'nf_id', v_nf_id,
    'numero', v_next,
    'serie', v_serie,
    'payload', p_payload
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_reservar_e_numerar_notas(uuid, uuid, text, jsonb, text, text, text, text, numeric) TO authenticated;

COMMIT;
