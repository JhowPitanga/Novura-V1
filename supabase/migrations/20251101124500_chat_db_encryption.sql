-- Criptografia de mensagens apenas no banco de dados (pgcrypto)
-- Idempotente: recria tabela de chaves por organização, funções e triggers

BEGIN;

-- Extensão necessária
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Chave por organização para criptografia simétrica
CREATE TABLE IF NOT EXISTS public.chat_org_keys (
  organization_id uuid PRIMARY KEY,
  secret_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_org_keys ENABLE ROW LEVEL SECURITY;

-- Políticas mínimas: impedir leitura direta por clientes; apenas funções SECURITY DEFINER acessam
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_org_keys' AND policyname='select org key for members'
  ) THEN
    DROP POLICY "select org key for members" ON public.chat_org_keys;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_org_keys' AND policyname='chat_org_keys_insert_admins'
  ) THEN
    CREATE POLICY chat_org_keys_insert_admins ON public.chat_org_keys
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = chat_org_keys.organization_id
            AND om.user_id = auth.uid()
            AND om.role IN ('owner','admin')
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_org_keys' AND policyname='chat_org_keys_update_admins'
  ) THEN
    CREATE POLICY chat_org_keys_update_admins ON public.chat_org_keys
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = chat_org_keys.organization_id
            AND om.user_id = auth.uid()
            AND om.role IN ('owner','admin')
        )
      );
  END IF;
END $$;

-- Função: garantir/obter chave da organização (uso interno)
CREATE OR REPLACE FUNCTION public.ensure_chat_org_key(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id não pode ser NULL para criptografia';
  END IF;

  SELECT secret_key INTO v_key FROM public.chat_org_keys WHERE organization_id = p_org_id;
  IF v_key IS NULL THEN
    SELECT encode(gen_random_bytes(32), 'base64') INTO v_key;
    INSERT INTO public.chat_org_keys (organization_id, secret_key)
    VALUES (p_org_id, v_key)
    ON CONFLICT (organization_id)
    DO UPDATE SET secret_key = EXCLUDED.secret_key, updated_at = now();
  END IF;
  RETURN v_key;
END;
$$;

-- Trigger: criptografar conteúdo em INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.chat_encrypt_on_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  -- Apenas criptografa quando há conteúdo não vazio e não está marcado como criptografado
  IF NEW.content IS NOT NULL AND length(trim(NEW.content)) > 0 AND COALESCE(NEW.is_encrypted, false) = false THEN
    v_key := public.ensure_chat_org_key(NEW.organization_id);
    NEW.content := encode(pgp_sym_encrypt(NEW.content, v_key, 'cipher-algo=aes256,compress-algo=1'), 'base64');
    NEW.is_encrypted := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_encrypt_on_insert_update ON public.chat_messages;
CREATE TRIGGER chat_encrypt_on_insert_update
BEFORE INSERT OR UPDATE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.chat_encrypt_on_write();

-- Função auxiliar: descriptografar conteúdo
CREATE OR REPLACE FUNCTION public.decrypt_message_content(p_enc text, p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_enc IS NULL OR length(p_enc) = 0 THEN
    RETURN p_enc;
  END IF;
  v_key := public.ensure_chat_org_key(p_org_id);
  RETURN pgp_sym_decrypt(decode(p_enc, 'base64'), v_key);
END;
$$;

-- RPC: retornar mensagens do canal com conteúdo em texto claro
CREATE OR REPLACE FUNCTION public.get_channel_messages_plain(
  p_channel_id uuid,
  p_before timestamptz DEFAULT now(),
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  channel_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz,
  is_encrypted boolean,
  attachment_path text,
  attachment_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.channel_id,
    m.sender_id,
    public.decrypt_message_content(m.content, m.organization_id) AS content,
    m.created_at,
    m.is_encrypted,
    m.attachment_path,
    m.attachment_type
  FROM public.chat_messages m
  WHERE m.channel_id = p_channel_id
    AND m.created_at < p_before
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

-- RPC: retornar uma mensagem por id com conteúdo em texto claro
CREATE OR REPLACE FUNCTION public.get_message_plain(p_message_id uuid)
RETURNS TABLE (
  id uuid,
  channel_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz,
  is_encrypted boolean,
  attachment_path text,
  attachment_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.channel_id,
    m.sender_id,
    public.decrypt_message_content(m.content, m.organization_id) AS content,
    m.created_at,
    m.is_encrypted,
    m.attachment_path,
    m.attachment_type
  FROM public.chat_messages m
  WHERE m.id = p_message_id
  LIMIT 1;
$$;

COMMIT;