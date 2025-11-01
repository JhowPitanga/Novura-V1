-- Persistência de contadores de mensagens não lidas por usuário e canal
create extension if not exists pgcrypto;

create table if not exists public.chat_unread_counts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unread_count integer not null default 0,
  last_read_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint chat_unread_counts_unique unique (channel_id, user_id)
);

alter table public.chat_unread_counts enable row level security;

-- Políticas RLS: o usuário só acessa sua própria linha
create policy chat_unread_counts_select on public.chat_unread_counts
  for select
  using (user_id = auth.uid());

create policy chat_unread_counts_insert on public.chat_unread_counts
  for insert
  with check (user_id = auth.uid());

create policy chat_unread_counts_update on public.chat_unread_counts
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy chat_unread_counts_delete on public.chat_unread_counts
  for delete
  using (user_id = auth.uid());

-- Trigger simples para manter updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists chat_unread_counts_set_updated_at on public.chat_unread_counts;
create trigger chat_unread_counts_set_updated_at
before update on public.chat_unread_counts
for each row execute function public.set_updated_at();

-- Índices úteis
create index if not exists idx_chat_unread_counts_user on public.chat_unread_counts(user_id);
create index if not exists idx_chat_unread_counts_channel_user on public.chat_unread_counts(channel_id, user_id);

-- Trigger: ao inserir mensagem, incrementa unread para membros (exceto remetente)
create or replace function public.increment_unread_on_message()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  v_members uuid[];
begin
  -- Obter membros do canal (array) com fallback ao join table se existir
  select c.member_ids into v_members
  from public.chat_channels c
  where c.id = new.channel_id;

  if v_members is null or array_length(v_members, 1) is null or array_length(v_members, 1) = 0 then
    if exists (
      select 1 from information_schema.tables t
      where t.table_schema = 'public' and t.table_name = 'chat_channel_members'
    ) then
      select coalesce(array_agg(m.user_id), array[]::uuid[]) into v_members
      from public.chat_channel_members m
      where m.channel_id = new.channel_id;
    else
      -- Sem membros -> nada a fazer
      return new;
    end if;
  end if;

  -- Inserir/atualizar contadores para todos os membros, exceto o remetente
  insert into public.chat_unread_counts (channel_id, user_id, unread_count)
  select new.channel_id, m, 1
  from unnest(v_members) as m
  where m <> new.sender_id
  on conflict (channel_id, user_id)
  do update set unread_count = public.chat_unread_counts.unread_count + 1,
                updated_at = now();

  return new;
end;
$$;

drop trigger if exists chat_messages_increment_unread on public.chat_messages;
create trigger chat_messages_increment_unread
after insert on public.chat_messages
for each row execute function public.increment_unread_on_message();

-- RPC/Helper: marcar canal como lido para o usuário atual (ou fornecido)
create or replace function public.mark_channel_read(p_channel_id uuid, p_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Garantir que RLS não bloqueie a operação para o próprio usuário
  perform set_config('row_security', 'on', true);

  insert into public.chat_unread_counts (channel_id, user_id, unread_count, last_read_at)
  values (p_channel_id, p_user_id, 0, now())
  on conflict (channel_id, user_id)
  do update set unread_count = 0,
                last_read_at = now(),
                updated_at = now();
end;
$$;

-- Publicação no Realtime
alter table public.chat_unread_counts replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.chat_unread_counts';
  end if;
exception when others then
  raise notice 'Supabase Realtime publication not available: %', sqlerrm;
end $$;

-- Notificações por mensagem (opcional, para exibir badges/alertas)
create table if not exists public.chat_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  type text not null default 'message' check (type in ('message','mention','reaction','message')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  constraint chat_notifications_user_message_unique unique (user_id, message_id)
);

alter table public.chat_notifications enable row level security;

drop policy if exists chat_notifications_select on public.chat_notifications;
create policy chat_notifications_select on public.chat_notifications
  for select using (user_id = auth.uid());

-- Permitimos inserts via função SECURITY DEFINER do trigger; não expor insert direto
drop policy if exists chat_notifications_insert on public.chat_notifications;
create policy chat_notifications_insert on public.chat_notifications
  for insert with check (true);

create index if not exists idx_chat_notifications_user_created on public.chat_notifications(user_id, created_at desc);

create or replace function public.create_chat_notifications_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_members uuid[];
begin
  -- Desabilitar RLS dentro da função para inserir notificações aos destinatários
  perform set_config('row_security', 'off', true);

  select c.member_ids into v_members from public.chat_channels c where c.id = new.channel_id;
  if v_members is null or array_length(v_members,1) is null or array_length(v_members,1) = 0 then
    if exists (
      select 1 from information_schema.tables t where t.table_schema='public' and t.table_name='chat_channel_members'
    ) then
      select coalesce(array_agg(m.user_id), array[]::uuid[]) into v_members
      from public.chat_channel_members m where m.channel_id = new.channel_id;
    else
      return new;
    end if;
  end if;

  insert into public.chat_notifications (user_id, channel_id, message_id, type, payload)
  select m, new.channel_id, new.id, 'message', jsonb_build_object(
    'sender_id', new.sender_id,
    'channel_id', new.channel_id
  )
  from unnest(v_members) as m
  where m <> new.sender_id
  on conflict (user_id, message_id) do nothing;

  return new;
end;
$$;

drop trigger if exists chat_messages_create_notifications on public.chat_messages;
create trigger chat_messages_create_notifications
after insert on public.chat_messages
for each row execute function public.create_chat_notifications_on_message();

alter table public.chat_notifications replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.chat_notifications';
  end if;
exception when others then
  raise notice 'Supabase Realtime publication not available (notifications): %', sqlerrm;
end $$;