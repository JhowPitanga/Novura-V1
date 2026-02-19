BEGIN;

CREATE OR REPLACE FUNCTION public.fn_get_default_storage(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_storage uuid;
BEGIN
  SELECT s.id INTO v_storage
  FROM public.storage s
  WHERE s.organizations_id = p_org_id AND s.active = true
  ORDER BY s.created_at ASC
  LIMIT 1;
  RETURN v_storage;
END;
$$;

COMMIT;
