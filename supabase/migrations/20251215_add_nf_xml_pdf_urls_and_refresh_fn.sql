BEGIN;

ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS xml_url text,
  ADD COLUMN IF NOT EXISTS pdf_url text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'http') THEN
    CREATE EXTENSION http;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_presented_order_xml(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_marketplace_order_id text;
  v_xml_url text;
  v_xml_b64 text;
  v_xml_text text;
  v_emissao_ambiente text;
  v_focus_token text;
  v_focus_id text;
  v_links jsonb;
  v_base_url text;
  v_has_http boolean;
  v_status integer;
  v_content bytea;
BEGIN
  SELECT nf.company_id,
         nf.marketplace_order_id,
         nf.xml_url,
         nf.xml_base64,
         nf.emissao_ambiente,
         nf.focus_nfe_id,
         nf.marketplace_submission_response
  INTO v_company_id, v_marketplace_order_id, v_xml_url, v_xml_b64, v_emissao_ambiente, v_focus_id, v_links
  FROM public.notas_fiscais nf
  JOIN public.marketplace_orders_presented_new mopn
    ON nf.company_id = mopn.company_id
   AND nf.marketplace_order_id = mopn.marketplace_order_id
  WHERE mopn.id = p_order_id
    AND lower(coalesce(nf.status_focus,'')) LIKE 'autoriz%'
  ORDER BY nf.created_at DESC
  LIMIT 1;

  IF v_company_id IS NULL OR v_marketplace_order_id IS NULL THEN
    RETURN false;
  END IF;

  -- Base URL por ambiente (Focus NFe)
  v_base_url := CASE WHEN v_emissao_ambiente = 'homologacao'
                     THEN 'https://homologacao.focusnfe.com.br'
                     ELSE 'https://api.focusnfe.com.br'
                END;

  -- Fallback: se xml_url estiver vazio, tentar montar a URL pelo caminho retornado em marketplace_submission_response.links.caminho_xml
  IF v_xml_url IS NULL AND v_links IS NOT NULL THEN
    DECLARE
      v_path text;
    BEGIN
      v_path := COALESCE(v_links->'links'->>'caminho_xml', NULL);
      IF v_path IS NOT NULL THEN
        IF left(v_path, 4) = 'http' THEN
          v_xml_url := v_path;
        ELSE
          -- garantir barra
          IF left(v_path, 1) = '/' THEN
            v_xml_url := v_base_url || v_path;
          ELSE
            v_xml_url := v_base_url || '/' || v_path;
          END IF;
        END IF;
      END IF;
    END;
  END IF;

  -- Fallback adicional: se ainda sem URL e existir focus_nfe_id, usar endpoint direto do XML por id
  IF v_xml_url IS NULL AND v_focus_id IS NOT NULL THEN
    v_xml_url := v_base_url || '/v2/nfe/' || v_focus_id || '/xml';
  END IF;

  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'http') INTO v_has_http;

  -- Tentar baixar via URL (quando disponível e extensão http ativa)
  IF v_xml_url IS NOT NULL AND v_has_http THEN
    SELECT CASE WHEN v_emissao_ambiente = 'homologacao'
                THEN c.focus_token_homologacao
                ELSE c.focus_token_producao
           END
    INTO v_focus_token
    FROM public.companies c
    WHERE c.id = v_company_id;

    IF v_focus_token IS NOT NULL THEN
      SELECT status, content
      INTO v_status, v_content
      FROM http_get(
        v_xml_url,
        json_build_object(
          'Authorization', 'Basic ' || encode(convert_to(v_focus_token || ':', 'UTF8'), 'base64')
        )
      );
    ELSE
      SELECT status, content
      INTO v_status, v_content
      FROM http_get(v_xml_url);
    END IF;

    IF coalesce(v_status, 0) = 200 AND v_content IS NOT NULL THEN
      v_xml_text := convert_from(v_content, 'UTF8');
    END IF;
  END IF;

  -- Fallback para base64 já presente
  IF v_xml_text IS NULL AND v_xml_b64 IS NOT NULL THEN
    BEGIN
      v_xml_text := convert_from(decode(v_xml_b64, 'base64'), 'UTF8');
    EXCEPTION WHEN others THEN
      v_xml_text := NULL;
    END;
  END IF;

  IF v_xml_text IS NOT NULL THEN
    UPDATE public.marketplace_orders_presented_new
      SET xml_to_submit = v_xml_text
    WHERE id = p_order_id;
    IF FOUND THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

SELECT public.refresh_presented_order_xml('0ad9da94-7033-4adc-af9a-51e6f889e317');

COMMIT;
