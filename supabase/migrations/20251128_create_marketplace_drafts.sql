-- Create marketplace_drafts table
create table if not exists public.marketplace_drafts (
  id uuid primary key default gen_random_uuid(),
  organizations_id uuid not null,
  company_id uuid,
  user_id uuid,
  marketplace_name text not null,
  site_id text not null,
  title text,
  category_id text,
  condition text,
  attributes jsonb default '[]'::jsonb,
  variations jsonb default '[]'::jsonb,
  pictures jsonb default '[]'::jsonb,
  price numeric,
  listing_type_id text,
  shipping jsonb default '{}'::jsonb,
  sale_terms jsonb default '[]'::jsonb,
  description text,
  available_quantity int default 0,
  last_step int default 1,
  status text default 'draft',
  autosave_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_drafts enable row level security;

create index if not exists marketplace_drafts_org_idx on public.marketplace_drafts (organizations_id);
create index if not exists marketplace_drafts_status_idx on public.marketplace_drafts (status);

create trigger marketplace_drafts_updated_at
before update on public.marketplace_drafts
for each row execute procedure public.set_updated_at();

create policy "org members can view drafts" on public.marketplace_drafts
  for select using (
    public.is_org_member(auth.uid(), organizations_id)
  );

create policy "org members can insert drafts" on public.marketplace_drafts
  for insert with check (
    public.is_org_member(auth.uid(), organizations_id)
  );

create policy "org members can update drafts" on public.marketplace_drafts
  for update using (
    public.is_org_member(auth.uid(), organizations_id)
  );
