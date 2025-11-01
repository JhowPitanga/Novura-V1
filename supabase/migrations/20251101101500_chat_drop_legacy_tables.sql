-- Drop legacy chat tables no longer used after schema simplification
-- We keep `chat_channels` and `chat_messages` (now with array columns)
-- This migration removes member mapping, archives, and org keys.

DO $$ BEGIN
  -- Drop membership join table
  EXECUTE 'DROP TABLE IF EXISTS public.chat_channel_members CASCADE';
  -- Drop message archive table
  EXECUTE 'DROP TABLE IF EXISTS public.chat_messages_archive CASCADE';
  -- Drop organization chat keys table (encryption optional client-side)
  EXECUTE 'DROP TABLE IF EXISTS public.chat_org_keys CASCADE';
EXCEPTION WHEN OTHERS THEN
  -- Prevent migration failure if objects are missing or locked
  RAISE NOTICE 'Skipping drop of legacy chat tables: %', SQLERRM;
END $$;

-- Note: RPC functions referencing dropped tables may error if called.
-- The app already tolerates missing org key by sending plaintext messages.