import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export type ChatChannel = {
  id: string;
  type: 'dm' | 'team';
  name?: string | null;
  category?: string | null;
  created_by: string;
  isStarred?: boolean;
  member_ids?: string[];
};

export type ChatMember = {
  user_id: string;
  role: 'owner' | 'member';
};

export type ChatMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_encrypted?: boolean;
  attachment_path?: string | null;
  attachment_type?: string | null;
  isPending?: boolean;
};

export function useChatChannels() {
  const { user, organizationId } = useAuth();
  const { toast } = useToast();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchChannels = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // Prefer simplified schema: channels with array membership
      let mapped: ChatChannel[] = [];
      const { data: chData, error: chErr } = await supabase
        .from('chat_channels')
        .select('id,type,name,category,created_by,member_ids,starred_by')
        .contains('member_ids', [user.id]);
      if (!chErr && chData) {
        mapped = (chData as any[]).map((c: any) => ({
          id: c.id,
          type: c.type,
          name: c.name,
          category: c.category,
          created_by: c.created_by,
          isStarred: Array.isArray(c.starred_by) ? c.starred_by.includes(user.id) : false,
          member_ids: Array.isArray(c.member_ids) ? c.member_ids : [],
        }));
      } else {
        // Fallback to legacy join if array column not available
        const { data, error } = await supabase
          .from('chat_channel_members')
          .select(`
            channel_id,
            is_starred,
            chat_channels:channel_id (
              id,
              type,
              name,
              category,
              created_by
            )
          `)
          .eq('user_id', user.id);
        if (error) throw error;
        mapped = (data || [])
          .map((row: any) => ({ ...(row.chat_channels || {}), isStarred: !!row.is_starred, member_ids: [] }))
          .filter((c: any) => !!c.id);
      }

      setChannels(mapped);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Falha ao carregar canais', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
    if (!user) return;

    const channel = supabase
      .channel('realtime-chat-channels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_channels' }, fetchChannels)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const directChannels = useMemo(() => channels.filter(c => c.type === 'dm'), [channels]);
  const teamChannels = useMemo(() => channels.filter(c => c.type === 'team'), [channels]);

  const createTeam = async (name: string, memberIds: string[]) => {
    if (!user) return { error: 'Usuário não autenticado' };
    try {
      const members = Array.from(new Set([user.id, ...memberIds]));
      const { data: channel, error: chError } = await supabase
        .from('chat_channels')
        .insert({ type: 'team', name, category: null, account_id: user.id, created_by: user.id, organization_id: organizationId, member_ids: members, starred_by: [] })
        .select('*')
        .single();
      if (chError) throw chError;

      toast({ title: 'Equipe criada', description: 'Canal de equipe criado com sucesso.' });
      await fetchChannels();
      return { data: channel };
    } catch (err: any) {
      toast({ title: 'Erro ao criar equipe', description: err.message, variant: 'destructive' });
      return { error: err.message };
    }
  };

  const startDirectMessage = async (otherUserId: string) => {
    if (!user) return { error: 'Usuário não autenticado' };
    try {
      let dmChannelId: string | null = null;
      // Find DM channel via array membership
      const { data: existingDm, error: findErr } = await supabase
        .from('chat_channels')
        .select('id, member_ids')
        .eq('type', 'dm')
        .contains('member_ids', [user.id, otherUserId]);

      if (!findErr && existingDm && existingDm.length) {
        const exact = (existingDm as any[]).find((c: any) => Array.isArray(c.member_ids) && c.member_ids.length === 2);
        dmChannelId = (exact || existingDm[0] as any).id;
      } else {
        const members = Array.from(new Set([user.id, otherUserId]));
        const { data: newChannel, error: chErr } = await supabase
          .from('chat_channels')
          .insert({ type: 'dm', account_id: user.id, created_by: user.id, organization_id: organizationId, member_ids: members, starred_by: [] })
          .select('*')
          .single();
        if (chErr) throw chErr;
        dmChannelId = newChannel.id;
      }

      await fetchChannels();
      return { ok: true, channelId: dmChannelId };
    } catch (err: any) {
      toast({ title: 'Erro ao iniciar DM', description: err.message, variant: 'destructive' });
      return { error: err.message };
    }
  };

  const toggleStar = async (channelId: string, starred: boolean) => {
    if (!user) return { error: 'Sem usuário' };
    // Fetch channel and update starred_by array
    const { data: ch, error: getErr } = await supabase
      .from('chat_channels')
      .select('starred_by')
      .eq('id', channelId)
      .single();
    if (getErr) return { error: getErr.message };
    const current = Array.isArray((ch as any)?.starred_by) ? (ch as any).starred_by as string[] : [];
    const next = starred ? Array.from(new Set([...current, user.id])) : current.filter((id) => id !== user.id);
    const { error } = await supabase
      .from('chat_channels')
      .update({ starred_by: next })
      .eq('id', channelId);
    if (error) return { error: error.message };
    await fetchChannels();
    return { ok: true };
  };

  const deleteChannel = async (channelId: string) => {
    try {
      // Enforce creator-only deletion on client side
      const { data: ch, error: getErr } = await supabase
        .from('chat_channels')
        .select('id, created_by')
        .eq('id', channelId)
        .single();
      if (getErr) throw getErr;
      if (!user || (ch as any)?.created_by !== user.id) {
        throw new Error('Apenas o criador do grupo pode excluir esta conversa.');
      }

      const { error } = await supabase
        .from('chat_channels')
        .delete()
        .eq('id', channelId);
      if (error) throw error;
      await fetchChannels();
      return { ok: true };
    } catch (e: any) {
      return { error: e?.message || 'Erro ao excluir canal' };
    }
  };

  return { loading, channels, directChannels, teamChannels, fetchChannels, createTeam, startDirectMessage, toggleStar, deleteChannel };
}

export function useChannelMessages(channelId?: string) {
  const { user, organizationId } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [oldestTs, setOldestTs] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const realtimeChannelRef = useRef<any | null>(null);
  const typingTimeoutsRef = useRef<Record<string, any>>({});
  const lastMsgTsRef = useRef<Record<string, number>>({});
  const lastTypingTsRef = useRef<Record<string, number>>({});

  const fetchMessages = async () => {
    if (!channelId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .rpc('get_channel_messages_plain', { p_channel_id: channelId, p_before: new Date().toISOString(), p_limit: 20 });
      if (error) throw error;
      const rows = ((data as any[]) || []).reverse();
      setMessages(rows as ChatMessage[]);
      setHasMore(rows.length >= 20);
      setOldestTs(rows.length ? rows[rows.length - 1].created_at : null);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Falha ao carregar mensagens', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    if (!channelId) return;
    const channel = supabase
      .channel(`realtime-chat-messages-${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channelId}` }, async (payload) => {
        const m = payload.new as any;
        let plainRow: any = null;
        try {
          const { data } = await supabase.rpc('get_message_plain', { p_message_id: m.id });
          if (Array.isArray(data)) plainRow = data[0]; else plainRow = data;
        } catch {}
        const resolved = (plainRow && plainRow.content) ? plainRow : { ...(m as any), content: m.content };
        setMessages((prev) => {
          const filtered = prev.filter(pm => !(pm.isPending && pm.sender_id === resolved.sender_id && pm.content === resolved.content));
          return [...filtered, resolved as ChatMessage];
        });
        // Clear typing indicator for this sender immediately and mark message ts
        lastMsgTsRef.current[resolved.sender_id] = Date.now();
        if (typingTimeoutsRef.current[m.sender_id]) {
          clearTimeout(typingTimeoutsRef.current[m.sender_id]);
          delete typingTimeoutsRef.current[m.sender_id];
        }
        setTypingUsers((prev) => prev.filter(id => id !== resolved.sender_id));

        // Notificação: emitir evento global para nova mensagem recebida
        try {
          if (typeof window !== 'undefined' && user && m.sender_id !== user.id) {
            const detail = {
              module: 'equipe',
              channelId,
              message: resolved as ChatMessage,
              // unreadTotal pode ser atualizado pelo módulo Equipe via outro evento agregado
            } as any;
            window.dispatchEvent(new CustomEvent('chat:message-received', { detail }));
          }
        } catch {
          // ignore notification errors
        }
      })
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        const otherId = payload?.payload?.user_id as string | undefined;
        if (!otherId || otherId === user?.id) return;
        const now = Date.now();
        lastTypingTsRef.current[otherId] = now;
        const lastMsgTs = lastMsgTsRef.current[otherId];
        // Ignore late typing events that arrive shortly after a message from the same sender
        if (lastMsgTs && now - lastMsgTs < 1200) {
          return;
        }
        setTypingUsers((prev) => (prev.includes(otherId) ? prev : [...prev, otherId]));
        // Clear after 2.5s
        if (typingTimeoutsRef.current[otherId]) clearTimeout(typingTimeoutsRef.current[otherId]);
        typingTimeoutsRef.current[otherId] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter(id => id !== otherId));
          delete typingTimeoutsRef.current[otherId];
        }, 2500);
      })
      .on('broadcast', { event: 'typing_stop' }, (payload: any) => {
        const otherId = payload?.payload?.user_id as string | undefined;
        if (!otherId || otherId === user?.id) return;
        if (typingTimeoutsRef.current[otherId]) {
          clearTimeout(typingTimeoutsRef.current[otherId]);
          delete typingTimeoutsRef.current[otherId];
        }
        setTypingUsers((prev) => prev.filter(id => id !== otherId));
      })
      .subscribe();
    realtimeChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [channelId]);

  const sendMessage = async (content: string) => {
    if (!user || !channelId || !content.trim()) return;
    try {
      setSending(true);
      // Otimista: exibe imediatamente para o remetente (conteúdo em claro)
      const optimistic: ChatMessage = {
        id: `local-${crypto.randomUUID()}`,
        channel_id: channelId,
        sender_id: user.id,
        content: content,
        created_at: new Date().toISOString(),
        is_encrypted: false,
        attachment_path: null,
        attachment_type: null,
        isPending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      const { error } = await supabase
        .from('chat_messages')
        .insert({ channel_id: channelId, sender_id: user.id, content: content, organization_id: organizationId });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: 'Erro ao enviar mensagem', description: err.message || 'Falha ao enviar', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const emitTyping = async () => {
    try {
      const ch = realtimeChannelRef.current;
      if (!ch || !user || !channelId) return;
      await ch.send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id, channel_id: channelId } });
    } catch {
      // ignore broadcast errors
    }
  };

  const emitTypingStop = async () => {
    try {
      const ch = realtimeChannelRef.current;
      if (!ch || !user || !channelId) return;
      await ch.send({ type: 'broadcast', event: 'typing_stop', payload: { user_id: user.id, channel_id: channelId } });
    } catch {
      // ignore broadcast errors
    }
  };

  const loadOlder = async () => {
    if (!channelId || !hasMore || loading) return;
    try {
      setLoading(true);
      const before = oldestTs ?? new Date().toISOString();
      const { data, error } = await supabase
        .rpc('get_channel_messages_plain', { p_channel_id: channelId, p_before: before, p_limit: 20 });
      if (error) throw error;
      const rows = (data as any[]) || [];
      setMessages((prev) => [...rows, ...prev]);
      setHasMore(rows.length >= 20);
      setOldestTs(rows.length ? rows[rows.length - 1].created_at : oldestTs);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Falha ao carregar histórico', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const uploadAttachment = async (channelIdArg: string, file: File) => {
    // Enforce 1MB limit after compression attempt for images
    const isImage = /^image\//.test(file.type);
    let toUpload = file;
    if (isImage) {
      try {
        toUpload = await compressImage(file, 0.8, 1280);
      } catch {
        // ignore
      }
    }
    if (toUpload.size > 1024 * 1024) {
      throw new Error('Arquivo excede 1MB após compressão');
    }
    const path = `${channelIdArg}/${crypto.randomUUID()}/${toUpload.name}`;
    const { error: upErr } = await supabase.storage.from('chat-attachments').upload(path, toUpload, { upsert: false, contentType: toUpload.type });
    if (upErr) throw upErr;
    const { error: insErr } = await supabase.from('chat_messages').insert({ channel_id: channelIdArg, sender_id: user!.id, content: '', is_encrypted: false, attachment_path: path, attachment_type: toUpload.type, organization_id: organizationId });
    if (insErr) throw insErr;
  };

  async function compressImage(file: File, quality = 0.8, maxDim = 1280): Promise<File> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    });
    const canvas = document.createElement('canvas');
    let { width, height } = img;
    if (width > height && width > maxDim) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else if (height > maxDim) {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', quality));
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  }

  return { messages, sendMessage, sending, loadOlder, hasMore, uploadAttachment, typingUsers, emitTyping, emitTypingStop };
}

// Hook: search members within the same organization
export function useOrgMemberSearch(term: string, options?: { alwaysList?: boolean }) {
  const { organizationId } = useAuth();
  const { toast } = useToast();
  const [results, setResults] = useState<Array<{ id: string; email?: string | null; nome?: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      const alwaysList = !!options?.alwaysList;
      if (!organizationId) { setResults([]); return; }
      if (!alwaysList && (!term || term.trim().length < 2)) { setResults([]); return; }
      try {
        setLoading(true);
        // Use RPC to search members within org (handles RLS and filtering server-side)
        const { data, error } = await supabase
          .rpc('search_org_members', { p_org_id: organizationId, p_term: (term && term.trim().length >= 2) ? term : null, p_limit: 20 });
        if (error) throw error;
        setResults((data as any[]) || []);
      } catch (e: any) {
        toast({ title: 'Erro', description: e.message || 'Falha ao buscar membros', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [term, organizationId, options?.alwaysList]);

  return { results, loading };
}

export async function fetchAccountMembers(currentUserId: string) {
  // Members are users invited by current user (owner) plus the owner
  const { data, error } = await supabase
    .from('user_invitations')
    .select('id, email, nome, invited_by_user_id')
    .eq('invited_by_user_id', currentUserId);
  if (error) throw error;
  const invited = (data || []).map(inv => ({ id: inv.invited_by_user_id, email: inv.email, nome: inv.nome }));
  // Fallback: just return the owner for now (the list of actual user IDs may differ post sign-up)
  return invited;
}