-- Create tax rules catalog (global reference, public read)
create extension if not exists "pgcrypto";

-- 1) Global catalog of tax rules
create table if not exists public.tax_rules_catalog (
  id uuid primary key default gen_random_uuid(),
  code text, -- optional human code/id for the rule
  title text not null,
  description text,
  scope text not null, -- e.g., 'ICMS', 'IPI', 'PIS', 'COFINS'
  jurisdiction_country text default 'BR',
  jurisdiction_state text, -- e.g., 'SP', 'RJ'
  regime text, -- e.g., 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO'
  effective_from date,
  effective_to date,
  active boolean not null default true,
  payload jsonb not null,
  created_by uuid, -- auth.users.id (optional)
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tax_rules_catalog is 'Global catalog of tax rules with versioning windows. Publicly readable.';
comment on column public.tax_rules_catalog.payload is 'Structured JSON for rule details (cfop, csosn, cst, alíquotas, cenários).';

-- 2) Company-bound tax configurations (user form persistence)
create table if not exists public.company_tax_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  observacao text,
  is_default boolean not null default false,
  payload jsonb not null,
  selected_rule_ids uuid[] default '{}', -- optional references to catalog entries (no FK)
  created_by uuid, -- auth.users.id
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.company_tax_configs is 'Per-company tax configuration payloads linked to organization and company.';
comment on column public.company_tax_configs.payload is 'Full user-chosen configuration (basics, icms, ipi, pis, cofins, adicionais).';

-- Ensure at most one default per company
create unique index if not exists company_tax_configs_one_default_per_company
  on public.company_tax_configs (company_id)
  where is_default;

-- Simple updated_at maintenance via trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger set_updated_at_tax_rules_catalog
  before update on public.tax_rules_catalog
  for each row execute procedure public.set_updated_at();

create trigger set_updated_at_company_tax_configs
  before update on public.company_tax_configs
  for each row execute procedure public.set_updated_at();

-- RLS policies
alter table public.tax_rules_catalog enable row level security;
alter table public.company_tax_configs enable row level security;

-- Public read for catalog
create policy tax_rules_catalog_public_select on public.tax_rules_catalog
  for select using (true);

-- Manage catalog restricted to configuration editors
create policy tax_rules_catalog_insert on public.tax_rules_catalog
  for insert
  with check (public.current_user_has_permission('configuracoes', 'edit'));

create policy tax_rules_catalog_update on public.tax_rules_catalog
  for update using (public.current_user_has_permission('configuracoes', 'edit'))
  with check (public.current_user_has_permission('configuracoes', 'edit'));

create policy tax_rules_catalog_delete on public.tax_rules_catalog
  for delete using (public.current_user_has_permission('configuracoes', 'edit'));

-- Company-bound configs: org-scoped with permission checks
create policy company_tax_configs_select on public.company_tax_configs
  for select using (
    company_tax_configs.organization_id = public.get_current_user_organization_id()
    and (
      public.current_user_has_permission('configuracoes', 'view')
      or public.current_user_has_permission('configuracoes', 'edit')
    )
  );

create policy company_tax_configs_insert on public.company_tax_configs
  for insert with check (
    company_tax_configs.organization_id = public.get_current_user_organization_id()
    and public.current_user_has_permission('configuracoes', 'edit')
  );

create policy company_tax_configs_update on public.company_tax_configs
  for update using (
    company_tax_configs.organization_id = public.get_current_user_organization_id()
    and public.current_user_has_permission('configuracoes', 'edit')
  ) with check (
    company_tax_configs.organization_id = public.get_current_user_organization_id()
    and public.current_user_has_permission('configuracoes', 'edit')
  );

create policy company_tax_configs_delete on public.company_tax_configs
  for delete using (
    company_tax_configs.organization_id = public.get_current_user_organization_id()
    and public.current_user_has_permission('configuracoes', 'edit')
  );