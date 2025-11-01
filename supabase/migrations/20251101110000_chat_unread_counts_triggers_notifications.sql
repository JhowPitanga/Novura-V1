-- Incremental migration: unread counters triggers/RPC and notifications
-- Idempotent updates to ensure correct counting and realtime notifications

begin;

-- Fix FK on user_id to reference auth.users (if previously pointed to user_profiles)
do $$
declare v_fk_name text;
begin
  select tc.constraint_name into v_fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'chat_unread_counts'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'user_id'
  limit 1;

  if v_fk_name is not null then
    begin
      execute format('alter table public.chat_unread_counts drop constraint %I', v_fk_name);
    exception when others then
      raise notice 'Could not drop existing FK on chat_unread_counts.user_id: %', sqlerrm;
    end;
  end if;

  -- Ensure new FK to auth.users
  begin
    alter table public.chat_unread_counts
      add constraint chat_unread_counts_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  exception when others then
    raise notice 'FK to auth.users not added (may already exist): %', sqlerrm;
  end;
end $$;

-- Keep updated_at fresh
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

-- Helpful indexes
create index if not exists idx_chat_unread_counts_user on public.chat_unread_counts(user_id);
create index if not exists idx_chat_unread_counts_channel_user on public.chat_unread_counts(channel_id, user_id);

-- Increment unread on new message for all members except sender
create or replace function public.increment_unread_on_message()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  v_members uuid[];
begin
  select c.member_ids into v_members from public.chat_channels c where c.id = new.channel_id;
  if v_members is null or array_length(v_members, 1) is null or array_length(v_members, 1) = 0 then
    if exists (
      select 1 from information_schema.tables t where t.table_schema = 'public' and t.table_name = 'chat_channel_members'
    ) then
      select coalesce(array_agg(m.user_id), array[]::uuid[]) into v_members
      from public.chat_channel_members m where m.channel_id = new.channel_id;
    else
      return new;
    end if;
  end if;

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

-- RPC: mark channel read for current user or provided user
create or replace function public.mark_channel_read(p_channel_id uuid, p_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform set_config('row_security', 'on', true);
  insert into public.chat_unread_counts (channel_id, user_id, unread_count, last_read_at)
  values (p_channel_id, p_user_id, 0, now())
  on conflict (channel_id, user_id)
  do update set unread_count = 0,
                last_read_at = now(),
                updated_at = now();
end;
$$;

-- Realtime publication
alter table public.chat_unread_counts replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.chat_unread_counts';
  end if;
exception when others then
  raise notice 'Realtime publication for chat_unread_counts skipped: %', sqlerrm;
end $$;

-- Notifications table and trigger
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
  select m, new.channel_id, new.id, 'message', jsonb_build_object('sender_id', new.sender_id, 'channel_id', new.channel_id)
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
  raise notice 'Realtime publication for chat_notifications skipped: %', sqlerrm;
end $$;

commit;