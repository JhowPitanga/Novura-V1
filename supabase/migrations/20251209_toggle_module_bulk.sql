ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS module_switches jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE OR REPLACE FUNCTION public.bulk_set_module_view(
  p_organization_id uuid,
  p_module text,
  p_view boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.organization_members
  SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    ARRAY[p_module, 'view'],
    to_jsonb(p_view),
    true
  )
  WHERE organization_id = p_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_global_module_switch(
  p_organization_id uuid,
  p_module text,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.organization_members
  SET module_switches = jsonb_set(
    COALESCE(module_switches, '{}'::jsonb),
    ARRAY['global', p_module, 'active'],
    to_jsonb(p_active),
    true
  )
  WHERE organization_id = p_organization_id;
END;
$$;

-- Define todas as ações do módulo como habilitadas/desabilitadas para admin/member, exceto nv_superadmin
CREATE OR REPLACE FUNCTION public.bulk_set_module_enabled(
  p_organization_id uuid,
  p_module text,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_module_id uuid;
  v_actions text[];
  v_json jsonb;
BEGIN
  SELECT id INTO v_module_id FROM public.system_modules WHERE name = p_module LIMIT 1;

  IF v_module_id IS NULL THEN
    -- fallback: apenas view
    v_json := jsonb_build_object('view', to_jsonb(p_enabled));
  ELSE
    SELECT array_agg(a.name) INTO v_actions FROM public.module_actions a WHERE a.module_id = v_module_id;
    IF v_actions IS NULL OR array_length(v_actions, 1) IS NULL THEN
      v_json := jsonb_build_object('view', to_jsonb(p_enabled));
    ELSE
      SELECT jsonb_object_agg(action_name, to_jsonb(p_enabled)) INTO v_json
      FROM unnest(v_actions) AS action_name;
    END IF;
  END IF;

  UPDATE public.organization_members om
  SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    ARRAY[p_module],
    v_json,
    true
  )
  FROM public.users u
  WHERE om.organization_id = p_organization_id
    AND om.user_id = u.id
    AND (u.global_role IS DISTINCT FROM 'nv_superadmin')
    AND om.role IN ('admin','member');
END;
$$;
