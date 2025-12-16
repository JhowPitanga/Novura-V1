BEGIN;

ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS total_value numeric(18,2);

CREATE INDEX IF NOT EXISTS idx_notas_fiscais_company_tipo
  ON public.notas_fiscais (company_id, tipo);

COMMIT;
