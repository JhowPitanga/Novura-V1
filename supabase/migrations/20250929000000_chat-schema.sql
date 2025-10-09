-- Chat schema: channels, members, messages with RLS and policies
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL, -- owner/root account (optional for scoping)
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

-- Enable Row Level Security
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies: users can see channels they belong to
CREATE POLICY "Select channels for members" ON public.chat_channels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = chat_channels.id AND m.user_id = auth.uid()
    )
  );

-- Only creators can insert channels
CREATE POLICY "Create channels by creator" ON public.chat_channels
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- Only channel owners can update/delete channels
CREATE POLICY "Update channels by owner" ON public.chat_channels
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = chat_channels.id AND m.user_id = auth.uid() AND m.role = 'owner'
    )
  );

CREATE POLICY "Delete channels by owner" ON public.chat_channels
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = chat_channels.id AND m.user_id = auth.uid() AND m.role = 'owner'
    )
  );

-- Members policies
CREATE POLICY "Select channel members for themselves" ON public.chat_channel_members
  FOR SELECT USING (user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.chat_channel_members m2
      WHERE m2.channel_id = chat_channel_members.channel_id AND m2.user_id = auth.uid() AND m2.role = 'owner'
    )
  );

-- Only owners can add or remove members
CREATE POLICY "Insert channel members by owner" ON public.chat_channel_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = chat_channel_members.channel_id AND m.user_id = auth.uid() AND m.role = 'owner'
    )
  );

CREATE POLICY "Delete channel members by owner" ON public.chat_channel_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = chat_channel_members.channel_id AND m.user_id = auth.uid() AND m.role = 'owner'
    )
  );

-- Messages policies: only members can read and send; sender must be auth.uid()
CREATE POLICY "Select messages for channel members" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = chat_messages.channel_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Insert messages by members" ON public.chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = chat_messages.channel_id AND m.user_id = auth.uid()
    )
  );

-- Triggers to update updated_at
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