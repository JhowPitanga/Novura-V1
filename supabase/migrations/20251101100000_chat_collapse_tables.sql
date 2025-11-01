-- Collapse chat schema to minimize tables and streamline realtime usage
-- Introduces: member_ids (uuid[]) and starred_by (uuid[]) on chat_channels
-- Updates RLS policies to rely on channel.member_ids instead of chat_channel_members
-- Backfills data from chat_channel_members where present

BEGIN;

-- 1) Add columns to channels
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS member_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS starred_by uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

-- 2) Backfill member_ids and starred_by from chat_channel_members (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_channel_members'
  ) THEN
    WITH agg AS (
      SELECT
        channel_id,
        COALESCE(array_agg(user_id ORDER BY user_id), ARRAY[]::uuid[]) AS members,
        COALESCE(array_agg(user_id) FILTER (WHERE COALESCE(is_starred, false)), ARRAY[]::uuid[]) AS star_members
      FROM public.chat_channel_members
      GROUP BY channel_id
    )
    UPDATE public.chat_channels c
      SET member_ids = CASE WHEN (c.member_ids IS NULL OR array_length(c.member_ids, 1) IS NULL OR array_length(c.member_ids, 1) = 0) THEN a.members ELSE c.member_ids END,
          starred_by = CASE WHEN (c.starred_by IS NULL OR array_length(c.starred_by, 1) IS NULL) THEN a.star_members ELSE c.starred_by END
    FROM agg a
    WHERE c.id = a.channel_id;
  END IF;
END $$;

-- 3) RLS Policies based on member_ids
-- Enable RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop old policies referencing chat_channel_members if they exist
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channels' AND policyname='Select channels for members'
  ) THEN
    DROP POLICY "Select channels for members" ON public.chat_channels;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channels' AND policyname='Create channels by creator'
  ) THEN
    DROP POLICY "Create channels by creator" ON public.chat_channels;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channels' AND policyname='Update channels by owner'
  ) THEN
    DROP POLICY "Update channels by owner" ON public.chat_channels;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channels' AND policyname='Delete channels by owner'
  ) THEN
    DROP POLICY "Delete channels by owner" ON public.chat_channels;
  END IF;
END $$;

-- New policies using member_ids
CREATE POLICY "Select channels for members (array)" ON public.chat_channels
  FOR SELECT USING (auth.uid() = ANY(member_ids));

CREATE POLICY "Insert channels by creator (array)" ON public.chat_channels
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Update channels by members (array)" ON public.chat_channels
  FOR UPDATE USING (auth.uid() = ANY(member_ids)) WITH CHECK (auth.uid() = ANY(member_ids));

CREATE POLICY "Delete channels by creator (array)" ON public.chat_channels
  FOR DELETE USING (created_by = auth.uid());

-- Messages policies now reference channel.member_ids
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages' AND policyname='Select messages for channel members'
  ) THEN
    DROP POLICY "Select messages for channel members" ON public.chat_messages;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages' AND policyname='Insert messages by members'
  ) THEN
    DROP POLICY "Insert messages by members" ON public.chat_messages;
  END IF;
END $$;

CREATE POLICY "Select messages for channel members (array)" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_messages.channel_id AND auth.uid() = ANY(c.member_ids)
    )
  );

CREATE POLICY "Insert messages by members (array)" ON public.chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_messages.channel_id AND auth.uid() = ANY(c.member_ids)
    )
  );

-- 4) Trigger to update updated_at on chat_channels
CREATE OR REPLACE FUNCTION public.update_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_channels_updated_at ON public.chat_channels;
CREATE TRIGGER chat_channels_updated_at
BEFORE UPDATE ON public.chat_channels
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_updated_at();

-- 5) (Optional) Deprecate old tables without dropping immediately to allow migration rollout
-- You can drop these after confirming backfill success:
-- DROP TABLE IF EXISTS public.chat_channel_members;
-- DROP TABLE IF EXISTS public.chat_messages_archive;
-- DROP TABLE IF EXISTS public.chat_org_keys;

COMMIT;