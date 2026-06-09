-- ============================================================
-- Stock Sync Motor: Migration 3/7
-- Resilience state tables:
--   channel_circuit_state  → Circuit Breaker state per outbound channel
--   channel_rate_buckets   → Token Bucket state per outbound channel
-- ============================================================
BEGIN;

-- Circuit Breaker: persisted state per channel (Shopee, Mercado Livre, etc.)
-- States: closed (normal), open (failing, skip calls), half_open (probe mode).
CREATE TABLE IF NOT EXISTS public.channel_circuit_state (
  channel          text        PRIMARY KEY,
  state            text        NOT NULL DEFAULT 'closed'
                               CHECK (state IN ('closed', 'open', 'half_open')),
  failure_count    integer     NOT NULL DEFAULT 0,
  last_failure_at  timestamptz,
  -- When state = 'open', skip all calls until this timestamp.
  opens_until      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Token Bucket: rate limiting state per channel.
-- Worker refills tokens proportionally to elapsed time before each API call.
-- If tokens < 1, the worker waits (backpressure).
CREATE TABLE IF NOT EXISTS public.channel_rate_buckets (
  channel          text        PRIMARY KEY,
  tokens           numeric     NOT NULL DEFAULT 100,
  max_tokens       numeric     NOT NULL DEFAULT 100,
  -- Tokens replenished per second.
  refill_rate      numeric     NOT NULL DEFAULT 10,
  last_refill_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed initial state for known channels.
INSERT INTO public.channel_circuit_state (channel, state) VALUES
  ('Shopee',        'closed'),
  ('Mercado Livre', 'closed')
ON CONFLICT (channel) DO NOTHING;

-- Shopee: ~100 req/10s burst, 10/s sustained.
-- Mercado Livre: conservative 3/s to avoid 429 spikes.
INSERT INTO public.channel_rate_buckets (channel, max_tokens, tokens, refill_rate) VALUES
  ('Shopee',        100, 100, 10),
  ('Mercado Livre',  60,  60,  3)
ON CONFLICT (channel) DO NOTHING;

COMMIT;
