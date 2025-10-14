-- Bootstrap de organização para usuário existente
-- Cria organização se não existir, vincula como owner, e gera permissões padrão
-- Segurança: SECURITY DEFINER + RLS off dentro da função

create or replace function public.rpc_bootstrap_user_org(p_user_id uuid)
returns table(organization_id uuid, created boolean)
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_created boolean := false;
  v_permissions jsonb := '{}'::jsonb;
begin
  -- Desliga RLS dentro da função
  perform set_config('row_security', 'off', true);

  -- 1) Garante que exista org com owner = p_user_id
  select id into v_org_id
  from public.organizations
  where owner_user_id = p_user_id
  limit 1;

  if v_org_id is null then
    insert into public.organizations (owner_user_id, name, created_at)
    values (p_user_id, 'Minha Organização', now())
    returning id into v_org_id;
    v_created := true;
  end if;

  -- 2) Gera permissões padrão (todas as ações verdadeiras por módulo, se existirem tabelas de catálogo)
  -- Ignora falhas se catálogo não existir
  begin
    with actions as (
      select m.name as module_name, a.name as action_name
      from public.system_modules m
      join public.module_actions a on a.module_id = m.id
    ),
    per_mod as (
      select module_name, jsonb_object_agg(action_name, true) as actions_json
      from actions
      group by module_name
    )
    select coalesce(jsonb_object_agg(module_name, actions_json), '{}'::jsonb)
    into v_permissions
    from per_mod;
  exception when others then
    -- Se tabelas não existirem, segue com objeto vazio (role=owner cobre permissões)
    v_permissions := '{}'::jsonb;
  end;

  -- 3) Garante membership como owner
  insert into public.organization_members (organization_id, user_id, role, permissions, created_at)
  values (v_org_id, p_user_id, 'owner', v_permissions, now())
  on conflict (organization_id, user_id) do update
    set role = excluded.role,
        permissions = coalesce(organization_members.permissions, '{}'::jsonb) || excluded.permissions;

  -- 4) Atualiza tabela public.users com organization_id (se existir coluna)
  begin
    update public.users
    set organization_id = v_org_id
    where id = p_user_id;
  exception when others then
    -- Se a coluna/linha não existir, ignora
    null;
  end;

  -- Retorna
  return query select v_org_id, v_created;
end;
$$;

-- Dono e permissões de execução
alter function public.rpc_bootstrap_user_org(uuid) owner to postgres;
grant execute on function public.rpc_bootstrap_user_org(uuid) to authenticated, anon, service_role;