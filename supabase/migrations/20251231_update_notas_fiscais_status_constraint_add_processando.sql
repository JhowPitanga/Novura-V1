BEGIN;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notas_fiscais_status_check'
      AND conrelid = 'public.notas_fiscais'::regclass
  ) THEN
    ALTER TABLE public.notas_fiscais
      DROP CONSTRAINT notas_fiscais_status_check;
  END IF;
END $$;

ALTER TABLE public.notas_fiscais
  ADD CONSTRAINT notas_fiscais_status_check
  CHECK (status IS NULL OR status IN ('autorizada','rejeitada','denegada','cancelada','pendente','processando_autorizacao'));

COMMIT;
