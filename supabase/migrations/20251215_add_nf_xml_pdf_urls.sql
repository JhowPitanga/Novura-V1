BEGIN;

ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS xml_url text,
  ADD COLUMN IF NOT EXISTS pdf_url text;

COMMIT;
