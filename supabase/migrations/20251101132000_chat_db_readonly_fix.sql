-- Fix: evitar escrita em transações de leitura (GET) nas RPCs
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Função somente leitura para obter a chave da organização
CREATE OR REPLACE FUNCTION public.get_chat_org_key(p_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT secret_key FROM public.chat_org_keys WHERE organization_id = p_org_id;
$$;

-- Descriptografia sem escrita: não cria chave se não existir
CREATE OR REPLACE FUNCTION public.decrypt_message_content(p_enc text, p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_enc IS NULL OR length(p_enc) = 0 THEN
    RETURN p_enc;
  END IF;
  v_key := public.get_chat_org_key(p_org_id);
  IF v_key IS NULL THEN
    -- Sem chave, retorna conteúdo como está (evita escrita em GET)
    RETURN p_enc;
  END IF;
  RETURN pgp_sym_decrypt(decode(p_enc, 'base64'), v_key);
END;
$$;

-- RPC de listagem: só descriptografa quando is_encrypted = true
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
SET search_path = public, extensions
AS $$
  SELECT
    m.id,
    m.channel_id,
    m.sender_id,
    CASE WHEN m.is_encrypted
      THEN public.decrypt_message_content(m.content, m.organization_id)
      ELSE m.content
    END AS content,
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

-- RPC para uma mensagem: mesma lógica de gating
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
SET search_path = public, extensions
AS $$
  SELECT
    m.id,
    m.channel_id,
    m.sender_id,
    CASE WHEN m.is_encrypted
      THEN public.decrypt_message_content(m.content, m.organization_id)
      ELSE m.content
    END AS content,
    m.created_at,
    m.is_encrypted,
    m.attachment_path,
    m.attachment_type
  FROM public.chat_messages m
  WHERE m.id = p_message_id
  LIMIT 1;
$$;

COMMIT;