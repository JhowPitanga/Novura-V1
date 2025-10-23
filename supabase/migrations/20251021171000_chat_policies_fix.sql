-- Fix recursive RLS on chat_channel_members by using SECURITY DEFINER helpers
BEGIN;

-- Helper: check if user is owner of a channel without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.is_channel_owner(p_channel_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channel_members m
    WHERE m.channel_id = p_channel_id AND m.user_id = p_user_id AND m.role = 'owner'
  ) INTO v_is_owner;
  RETURN COALESCE(v_is_owner, false);
END;
$$;

-- Replace policies on chat_channel_members to avoid self-referential SELECTs
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channel_members' AND policyname='Select channel members for themselves'
  ) THEN
    DROP POLICY "Select channel members for themselves" ON public.chat_channel_members;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channel_members' AND policyname='Insert channel members by owner'
  ) THEN
    DROP POLICY "Insert channel members by owner" ON public.chat_channel_members;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channel_members' AND policyname='Delete channel members by owner'
  ) THEN
    DROP POLICY "Delete channel members by owner" ON public.chat_channel_members;
  END IF;
END $$;

-- Recreate non-recursive policies
CREATE POLICY "Select channel members"
  ON public.chat_channel_members
  FOR SELECT
  USING (
    chat_channel_members.user_id = auth.uid()
    OR public.is_channel_owner(chat_channel_members.channel_id, auth.uid())
  );

CREATE POLICY "Insert channel members by owner"
  ON public.chat_channel_members
  FOR INSERT
  WITH CHECK (
    public.is_channel_owner(chat_channel_members.channel_id, auth.uid())
  );

CREATE POLICY "Delete channel members by owner"
  ON public.chat_channel_members
  FOR DELETE
  USING (
    public.is_channel_owner(chat_channel_members.channel_id, auth.uid())
  );

COMMIT;


