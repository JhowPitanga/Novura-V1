-- Correção de criptografia: evitar gen_random_bytes e padronizar base64
BEGIN;

-- Garantir extensão necessária
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Atualiza função: usa gen_random_uuid() como segredo textual
CREATE OR REPLACE FUNCTION public.ensure_chat_org_key(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id não pode ser NULL para criptografia';
  END IF;

  SELECT secret_key INTO v_key FROM public.chat_org_keys WHERE organization_id = p_org_id;
  IF v_key IS NULL THEN
    -- Segredo textual forte o suficiente para pgp_sym_encrypt
    SELECT gen_random_uuid()::text INTO v_key;
    INSERT INTO public.chat_org_keys (organization_id, secret_key)
    VALUES (p_org_id, v_key)
    ON CONFLICT (organization_id)
    DO UPDATE SET secret_key = EXCLUDED.secret_key, updated_at = now();
  END IF;
  RETURN v_key;
END;
$$;

-- Reafirma trigger: armazenar conteúdo criptografado em base64
CREATE OR REPLACE FUNCTION public.chat_encrypt_on_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
BEGIN
  IF NEW.content IS NOT NULL AND length(trim(NEW.content)) > 0 AND COALESCE(NEW.is_encrypted, false) = false THEN
    v_key := public.ensure_chat_org_key(NEW.organization_id);
    NEW.content := encode(pgp_sym_encrypt(NEW.content, v_key, 'cipher-algo=aes256,compress-algo=1'), 'base64');
    NEW.is_encrypted := true;
  END IF;
  RETURN NEW;
END;
$$;

-- Reafirma descriptografia: decodifica base64 antes de pgp_sym_decrypt
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
  v_key := public.ensure_chat_org_key(p_org_id);
  RETURN pgp_sym_decrypt(decode(p_enc, 'base64'), v_key);
END;
$$;

COMMIT;