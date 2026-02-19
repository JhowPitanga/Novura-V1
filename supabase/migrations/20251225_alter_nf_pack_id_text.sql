BEGIN;

ALTER TABLE public.notas_fiscais
  ALTER COLUMN pack_id TYPE text USING pack_id::text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_notas_fiscais_pack_id' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_notas_fiscais_pack_id ON public.notas_fiscais (pack_id);
  END IF;
END $$;

COMMIT;
