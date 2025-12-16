BEGIN;

ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS focus_nfe_id text,
  ADD COLUMN IF NOT EXISTS nfe_key text,
  ADD COLUMN IF NOT EXISTS nfe_number integer,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS status_focus text,
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS xml_base64 text,
  ADD COLUMN IF NOT EXISTS pdf_base64 text,
  ADD COLUMN IF NOT EXISTS marketplace text,
  ADD COLUMN IF NOT EXISTS marketplace_order_id text,
  ADD COLUMN IF NOT EXISTS pack_id bigint,
  ADD COLUMN IF NOT EXISTS marketplace_submission_status text,
  ADD COLUMN IF NOT EXISTS marketplace_submission_response jsonb,
  ADD COLUMN IF NOT EXISTS marketplace_fiscal_document_id text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_notas_fiscais_company_nfe_key' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_notas_fiscais_company_nfe_key ON public.notas_fiscais (company_id, nfe_key);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_notas_fiscais_pack_id' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_notas_fiscais_pack_id ON public.notas_fiscais (pack_id);
  END IF;
END $$;

COMMIT;
