-- Retry and Dead Letter Queues for Mercado Livre API operations
create extension if not exists pgcrypto;

create table if not exists public.ml_retry_queue (
  id uuid primary key default gen_random_uuid(),
  job_type text not null, -- 'reviews' | 'metrics' | 'items' | etc
  organizations_id uuid not null,
  payload jsonb not null,
  attempts int not null default 0,
  max_attempts int not null default 5,
  next_retry_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ml_retry_queue_next_retry_idx on public.ml_retry_queue (next_retry_at asc);
create index if not exists ml_retry_queue_org_idx on public.ml_retry_queue (organizations_id);
create index if not exists ml_retry_queue_job_type_idx on public.ml_retry_queue (job_type);

create table if not exists public.ml_dead_letter_queue (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  organizations_id uuid not null,
  payload jsonb not null,
  attempts int not null,
  last_error text,
  failed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ml_dlq_org_idx on public.ml_dead_letter_queue (organizations_id);
create index if not exists ml_dlq_job_type_idx on public.ml_dead_letter_queue (job_type);


