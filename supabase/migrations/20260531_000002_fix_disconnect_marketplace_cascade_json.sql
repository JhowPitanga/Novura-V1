-- PostgREST returns 404 (PGRST202) when required RPC params are omitted from the JSON body.
-- Add a jsonb overload so a single payload object always resolves both arguments.

BEGIN;

CREATE OR REPLACE FUNCTION public.disconnect_marketplace_cascade(jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payload alias for $1;
  v_organizations_id uuid;
  v_marketplace_name text;
BEGIN
  v_organizations_id := COALESCE(
    NULLIF(v_payload->>'p_organizations_id', '')::uuid,
    NULLIF(v_payload->>'p_organization_id', '')::uuid,
    NULLIF(v_payload->>'organization_id', '')::uuid,
    NULLIF(v_payload->>'organizations_id', '')::uuid
  );
  v_marketplace_name := COALESCE(
    NULLIF(v_payload->>'p_marketplace_name', ''),
    NULLIF(v_payload->>'marketplace_name', ''),
    NULLIF(v_payload->>'marketplaceName', '')
  );

  IF v_organizations_id IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_ID_REQUIRED';
  END IF;
  IF v_marketplace_name IS NULL OR btrim(v_marketplace_name) = '' THEN
    RAISE EXCEPTION 'MARKETPLACE_NAME_REQUIRED';
  END IF;

  PERFORM public.disconnect_marketplace_cascade(v_organizations_id, v_marketplace_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_cascade(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_cascade(jsonb) TO anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
