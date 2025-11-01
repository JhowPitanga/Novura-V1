-- Correções de RLS e triggers para envio de mensagens e notificações
-- 1) Remover uso de row_security=off e tornar funções SECURITY DEFINER
-- 2) Garantir que triggers não sejam bloqueados ao inserir/atualizar contadores e notificações

BEGIN;

-- 1) Recriar função de notificações SEM set row_security off
CREATE OR REPLACE FUNCTION public.create_chat_notifications_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_members uuid[];
BEGIN
  -- Obter membros do canal (modelo atual com array; fallback para tabela legada)
  SELECT c.member_ids INTO v_members FROM public.chat_channels c WHERE c.id = NEW.channel_id;
  IF v_members IS NULL OR array_length(v_members, 1) IS NULL OR array_length(v_members, 1) = 0 THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = 'chat_channel_members'
    ) THEN
      SELECT COALESCE(array_agg(m.user_id), array[]::uuid[]) INTO v_members
      FROM public.chat_channel_members m WHERE m.channel_id = NEW.channel_id;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.chat_notifications (user_id, channel_id, message_id, type, payload)
  SELECT m, NEW.channel_id, NEW.id, 'message', jsonb_build_object(
    'sender_id', NEW.sender_id,
    'channel_id', NEW.channel_id
  )
  FROM unnest(v_members) AS m
  WHERE m <> NEW.sender_id
  ON CONFLICT (user_id, message_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2) Tornar a função de incremento de não lidas SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.increment_unread_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_members uuid[];
BEGIN
  SELECT c.member_ids INTO v_members FROM public.chat_channels c WHERE c.id = NEW.channel_id;
  IF v_members IS NULL OR array_length(v_members, 1) IS NULL OR array_length(v_members, 1) = 0 THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = 'chat_channel_members'
    ) THEN
      SELECT COALESCE(array_agg(m.user_id), array[]::uuid[]) INTO v_members
      FROM public.chat_channel_members m WHERE m.channel_id = NEW.channel_id;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.chat_unread_counts (channel_id, user_id, unread_count)
  SELECT NEW.channel_id, m, 1
  FROM unnest(v_members) AS m
  WHERE m <> NEW.sender_id
  ON CONFLICT (channel_id, user_id)
  DO UPDATE SET unread_count = public.chat_unread_counts.unread_count + 1,
                updated_at = now();

  RETURN NEW;
END;
$$;

-- 3) Ajustar política de INSERT para permitir upsert via função proprietária
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_unread_counts' AND policyname='chat_unread_counts_insert'
  ) THEN
    DROP POLICY chat_unread_counts_insert ON public.chat_unread_counts;
  END IF;
END $$;

-- Permitir INSERT (função SECURITY DEFINER roda como dono; clientes não usam INSERT direto)
CREATE POLICY chat_unread_counts_insert ON public.chat_unread_counts
  FOR INSERT
  WITH CHECK (true);

COMMIT;