BEGIN;

-- Garantir colunas de capacidades de logística (booleans)
ALTER TABLE public.marketplace_integrations
  ADD COLUMN IF NOT EXISTS drop_off boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS xd_drop_off boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS self_service boolean DEFAULT false;

-- Backfill inicial das colunas com base em shipping_preferences
WITH flags AS (
  SELECT
    mi.id,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(mi.shipping_preferences->'logistics', '[]'::jsonb)) AS l
      JOIN LATERAL jsonb_array_elements(COALESCE(l->'types', '[]'::jsonb)) AS t ON true
      WHERE lower(COALESCE(t->>'type','')) = 'drop_off'
        AND lower(COALESCE(t->>'status','')) IN ('active','enabled','true')
    ) AS has_drop_off,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(mi.shipping_preferences->'logistics', '[]'::jsonb)) AS l
      JOIN LATERAL jsonb_array_elements(COALESCE(l->'types', '[]'::jsonb)) AS t ON true
      WHERE lower(COALESCE(t->>'type','')) = 'xd_drop_off'
        AND lower(COALESCE(t->>'status','')) IN ('active','enabled','true')
    ) AS has_xd_drop_off,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(mi.shipping_preferences->'logistics', '[]'::jsonb)) AS l
      JOIN LATERAL jsonb_array_elements(COALESCE(l->'types', '[]'::jsonb)) AS t ON true
      WHERE lower(COALESCE(t->>'type','')) = 'self_service'
        AND lower(COALESCE(t->>'status','')) IN ('active','enabled','true')
    ) AS has_self_service
  FROM public.marketplace_integrations mi
  WHERE mi.marketplace_name = 'Mercado Livre'
)
UPDATE public.marketplace_integrations mi
SET drop_off = flags.has_drop_off,
    xd_drop_off = flags.has_xd_drop_off,
    self_service = flags.has_self_service
FROM flags
WHERE mi.id = flags.id;

-- Trigger para manter colunas atualizadas quando shipping_preferences for modificado
CREATE OR REPLACE FUNCTION public.marketplace_integrations_sync_caps()
RETURNS trigger AS $$
DECLARE has_drop_off boolean := false;
DECLARE has_xd_drop_off boolean := false;
DECLARE has_self_service boolean := false;
DECLARE rec_l RECORD;
DECLARE rec_t RECORD;
BEGIN
  -- Processa logistics.types e ativa flags quando status estiver ativo
  FOR rec_l IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.shipping_preferences->'logistics', '[]'::jsonb)) LOOP
    FOR rec_t IN SELECT value FROM jsonb_array_elements(COALESCE(rec_l.value->'types', '[]'::jsonb)) LOOP
      IF lower(COALESCE(rec_t.value->>'status','')) IN ('active','enabled','true') THEN
        CASE lower(COALESCE(rec_t.value->>'type',''))
          WHEN 'drop_off' THEN has_drop_off := true;
          WHEN 'xd_drop_off' THEN has_xd_drop_off := true;
          WHEN 'self_service' THEN has_self_service := true;
        END CASE;
      END IF;
    END LOOP;
  END LOOP;

  NEW.drop_off := has_drop_off;
  NEW.xd_drop_off := has_xd_drop_off;
  NEW.self_service := has_self_service;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketplace_integrations_sync_caps ON public.marketplace_integrations;
CREATE TRIGGER trg_marketplace_integrations_sync_caps
BEFORE INSERT OR UPDATE OF shipping_preferences
ON public.marketplace_integrations
FOR EACH ROW
EXECUTE PROCEDURE public.marketplace_integrations_sync_caps();

COMMIT;
