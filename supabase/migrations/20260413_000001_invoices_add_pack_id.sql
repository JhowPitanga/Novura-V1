-- Add pack_id to invoices for Mercado Livre pack grouping support.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS pack_id text;
CREATE INDEX IF NOT EXISTS invoices_pack_id_idx ON public.invoices (pack_id);
