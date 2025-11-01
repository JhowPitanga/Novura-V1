-- Publicar chat_messages no Realtime e garantir REPLICA IDENTITY FULL
BEGIN;

-- Garantir que alterações emitam payloads completos
ALTER TABLE IF EXISTS public.chat_messages REPLICA IDENTITY FULL;

-- Adicionar tabela à publicação supabase_realtime (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages';
    EXCEPTION WHEN duplicate_object THEN
      -- Já está publicada, ignorar
      NULL;
    END;
  END IF;
END $$;

COMMIT;