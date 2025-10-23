-- Link chat data to organizations and backfill
BEGIN;

-- 1) Add organization_id to chat_channels
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- Backfill from creator's membership (prefer owner > admin > member)
UPDATE public.chat_channels cc
SET organization_id = sub.organization_id
FROM (
  SELECT om.organization_id, om.user_id
  FROM public.organization_members om
  WHERE (om.user_id, CASE om.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END)
    IN (
      SELECT user_id, MIN(CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END)
      FROM public.organization_members
      GROUP BY user_id
    )
) sub
WHERE cc.organization_id IS NULL
  AND sub.user_id = cc.created_by;

-- If still NULL, try to infer from existing members of the channel
UPDATE public.chat_channels cc
SET organization_id = (
  SELECT om.organization_id
  FROM public.chat_channel_members m
  JOIN public.organization_members om ON om.user_id = m.user_id
  WHERE m.channel_id = cc.id
  ORDER BY CASE om.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
  LIMIT 1
)
WHERE cc.organization_id IS NULL;

-- Optional: enforce NOT NULL once backfilled
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.chat_channels WHERE organization_id IS NULL
  ) THEN
    RAISE NOTICE 'Some chat_channels rows still have NULL organization_id. Please backfill manually.';
  ELSE
    ALTER TABLE public.chat_channels ALTER COLUMN organization_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_chat_channels_org_updated_at ON public.chat_channels (organization_id, updated_at DESC);
  END IF;
END $$;

-- 2) Add organization_id to chat_channel_members (from channel)
ALTER TABLE public.chat_channel_members
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

UPDATE public.chat_channel_members m
SET organization_id = cc.organization_id
FROM public.chat_channels cc
WHERE m.organization_id IS NULL AND cc.id = m.channel_id;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.chat_channel_members WHERE organization_id IS NULL
  ) THEN
    RAISE NOTICE 'Some chat_channel_members rows still have NULL organization_id. Please backfill manually.';
  ELSE
    ALTER TABLE public.chat_channel_members ALTER COLUMN organization_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_chat_channel_members_org_channel ON public.chat_channel_members (organization_id, channel_id);
  END IF;
END $$;

-- 3) Add organization_id to chat_messages (from channel)
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

UPDATE public.chat_messages msg
SET organization_id = cc.organization_id
FROM public.chat_channels cc
WHERE msg.organization_id IS NULL AND cc.id = msg.channel_id;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.chat_messages WHERE organization_id IS NULL
  ) THEN
    RAISE NOTICE 'Some chat_messages rows still have NULL organization_id. Please backfill manually.';
  ELSE
    ALTER TABLE public.chat_messages ALTER COLUMN organization_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_chat_messages_org_channel_created ON public.chat_messages (organization_id, channel_id, created_at DESC);
  END IF;
END $$;

COMMIT;


