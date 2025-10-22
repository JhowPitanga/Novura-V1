-- Bootstrap chat schema if missing on remote
BEGIN;

-- Base tables
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('dm','team')),
  name TEXT,
  category TEXT CHECK (category IN ('Logística','Comercial','Financeiro','Marketing','Geral')),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for channels
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channels' AND policyname='Select channels for members'
  ) THEN
    CREATE POLICY "Select channels for members" ON public.chat_channels
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.chat_channel_members m
          WHERE m.channel_id = chat_channels.id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channels' AND policyname='Create channels by creator'
  ) THEN
    CREATE POLICY "Create channels by creator" ON public.chat_channels
      FOR INSERT WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channels' AND policyname='Update channels by owner'
  ) THEN
    CREATE POLICY "Update channels by owner" ON public.chat_channels
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM public.chat_channel_members m
          WHERE m.channel_id = chat_channels.id AND m.user_id = auth.uid() AND m.role = 'owner'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channels' AND policyname='Delete channels by owner'
  ) THEN
    CREATE POLICY "Delete channels by owner" ON public.chat_channels
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.chat_channel_members m
          WHERE m.channel_id = chat_channels.id AND m.user_id = auth.uid() AND m.role = 'owner'
        )
      );
  END IF;
END $$;

-- Members policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channel_members' AND policyname='Select channel members for themselves'
  ) THEN
    CREATE POLICY "Select channel members for themselves" ON public.chat_channel_members
      FOR SELECT USING (user_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM public.chat_channel_members m2
          WHERE m2.channel_id = chat_channel_members.channel_id AND m2.user_id = auth.uid() AND m2.role = 'owner'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channel_members' AND policyname='Insert channel members by owner'
  ) THEN
    CREATE POLICY "Insert channel members by owner" ON public.chat_channel_members
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.chat_channel_members m
          WHERE m.channel_id = chat_channel_members.channel_id AND m.user_id = auth.uid() AND m.role = 'owner'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channel_members' AND policyname='Delete channel members by owner'
  ) THEN
    CREATE POLICY "Delete channel members by owner" ON public.chat_channel_members
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.chat_channel_members m
          WHERE m.channel_id = chat_channel_members.channel_id AND m.user_id = auth.uid() AND m.role = 'owner'
        )
      );
  END IF;
END $$;

-- Messages policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages' AND policyname='Select messages for channel members'
  ) THEN
    CREATE POLICY "Select messages for channel members" ON public.chat_messages
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.chat_channel_members m
          WHERE m.channel_id = chat_messages.channel_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages' AND policyname='Insert messages by members'
  ) THEN
    CREATE POLICY "Insert messages by members" ON public.chat_messages
      FOR INSERT WITH CHECK (
        sender_id = auth.uid() AND EXISTS (
          SELECT 1 FROM public.chat_channel_members m
          WHERE m.channel_id = chat_messages.channel_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Trigger to keep updated_at fresh
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

COMMIT;

