-- Concede todas as permissões de todos os módulos ao perfil específico
-- Perfil alvo: 8b04ad0e-d533-477c-b86d-a9dde8399188
-- Observação: atualiza todas as memberships existentes desse usuário.

DO $$
DECLARE
  v_user_id uuid := '8b04ad0e-d533-477c-b86d-a9dde8399188';
  v_permissions jsonb;
BEGIN
  -- Monta um JSON com todas as ações = true para todos os módulos cadastrados
  SELECT jsonb_object_agg(m.name, actions.actions_json) INTO v_permissions
  FROM public.system_modules m
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_object_agg(a.name, true), '{}'::jsonb) AS actions_json
    FROM public.module_actions a
    WHERE a.module_id = m.id
  ) actions;

  v_permissions := COALESCE(v_permissions, '{}'::jsonb);

  -- Atualiza todas as memberships do usuário alvo, concedendo acesso total
  UPDATE public.organization_members om
  SET permissions = v_permissions
  WHERE om.user_id = v_user_id;
END
$$;