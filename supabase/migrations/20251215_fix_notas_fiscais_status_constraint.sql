BEGIN;

ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS status text;

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notas_fiscais_status_check'
      AND conrelid = 'public.notas_fiscais'::regclass
  ) THEN
    ALTER TABLE public.notas_fiscais
      ADD CONSTRAINT notas_fiscais_status_check
      CHECK (status IS NULL OR status IN ('autorizada','rejeitada','denegada','cancelada','pendente'));
  END IF;
END $$;

UPDATE public.notas_fiscais
SET status = CASE
  WHEN status ILIKE 'autoriz%' THEN 'autorizada'
  WHEN status ILIKE 'rejeit%' THEN 'rejeitada'
  WHEN status ILIKE 'deneg%' THEN 'denegada'
  WHEN status ILIKE 'cancel%' THEN 'cancelada'
  WHEN status ILIKE 'penden%' THEN 'pendente'
  ELSE NULL
END
WHERE status IS NOT NULL;

COMMIT;

