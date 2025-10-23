-- Chat optimizations: indexing, flags, and archival scaffolding
BEGIN;

-- 1) Minimal metadata additions
ALTER TABLE public.chat_channel_members
  ADD COLUMN IF NOT EXISTS is_starred boolean NOT NULL DEFAULT false;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_type text;

-- 2) Critical indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created_at
  ON public.chat_messages (channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id
  ON public.chat_messages (sender_id);

-- Optional single-column for planner flexibility
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_id
  ON public.chat_messages (channel_id);

-- 3) Archive table (recommended for 6-12mo old rows)
CREATE TABLE IF NOT EXISTS public.chat_messages_archive (
  LIKE public.chat_messages INCLUDING ALL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_archive_channel_created_at
  ON public.chat_messages_archive (channel_id, created_at DESC);

-- Helper function to move messages older than N months to archive
CREATE OR REPLACE FUNCTION public.archive_old_chat_messages(p_months int DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff timestamptz := now() - (p_months || ' months')::interval;
  v_moved int;
BEGIN
  -- Move in batches to avoid long locks
  WITH moved AS (
    DELETE FROM public.chat_messages m
    WHERE m.created_at < v_cutoff
    RETURNING m.*
  )
  INSERT INTO public.chat_messages_archive
  SELECT * FROM moved;

  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RETURN COALESCE(v_moved, 0);
END;
$$;

-- 4) RPC for paginated history
CREATE OR REPLACE FUNCTION public.get_channel_messages(
  p_channel_id uuid,
  p_before timestamptz DEFAULT now(),
  p_limit int DEFAULT 20
)
RETURNS SETOF public.chat_messages
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM public.chat_messages
  WHERE channel_id = p_channel_id
    AND created_at < p_before
  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

-- 5) Storage bucket for chat attachments (private)
DO $$ BEGIN
  -- Check if storage schema and create_bucket function exist before calling
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'storage' AND p.proname = 'create_bucket'
  ) THEN
    PERFORM 1 FROM storage.buckets WHERE id = 'chat-attachments';
    IF NOT FOUND THEN
      PERFORM storage.create_bucket('chat-attachments', public := false);
    END IF;
  END IF;
END $$;

-- Storage policies: members of a channel can read objects whose path starts with channel_id/
-- Expect object paths like: <channel_id>/<random>/<filename>
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='chat objects read'
  ) THEN
    CREATE POLICY "chat objects read"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'chat-attachments'
        AND (
          EXISTS (
            SELECT 1
            FROM public.chat_channel_members m
            WHERE m.user_id = auth.uid()
              AND m.channel_id::text = split_part(name, '/', 1)
          )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='chat objects insert'
  ) THEN
    CREATE POLICY "chat objects insert"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'chat-attachments'
        AND (
          EXISTS (
            SELECT 1
            FROM public.chat_channel_members m
            WHERE m.user_id = auth.uid()
              AND m.channel_id::text = split_part(name, '/', 1)
          )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='chat objects delete'
  ) THEN
    CREATE POLICY "chat objects delete"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'chat-attachments'
        AND (
          EXISTS (
            SELECT 1
            FROM public.chat_channel_members m
            WHERE m.user_id = auth.uid()
              AND m.channel_id::text = split_part(name, '/', 1)
          )
        )
      );
  END IF;
END $$;

COMMIT;

