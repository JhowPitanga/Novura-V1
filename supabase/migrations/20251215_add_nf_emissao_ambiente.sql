BEGIN;

ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS emissao_ambiente text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notas_fiscais_emissao_ambiente_check'
      AND conrelid = 'public.notas_fiscais'::regclass
  ) THEN
    ALTER TABLE public.notas_fiscais
      ADD CONSTRAINT notas_fiscais_emissao_ambiente_check
      CHECK (emissao_ambiente IS NULL OR emissao_ambiente IN ('homologacao','producao'));
  END IF;
END $$;

COMMIT;
