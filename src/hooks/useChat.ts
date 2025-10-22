import { useEffect, useMemo, useState } from "react";
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
      // Get channels where current user is a member with is_starred
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

      const mapped: ChatChannel[] = (data || [])
        .map((row: any) => ({ ...(row.chat_channels || {}), isStarred: !!row.is_starred }))
        .filter((c: any) => !!c.id);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_channel_members' }, fetchChannels)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const directChannels = useMemo(() => channels.filter(c => c.type === 'dm'), [channels]);
  const teamChannels = useMemo(() => channels.filter(c => c.type === 'team'), [channels]);

  const createTeam = async (name: string, category: string, memberIds: string[]) => {
    if (!user) return { error: 'Usuário não autenticado' };
    try {
      const { data: channel, error: chError } = await supabase
        .from('chat_channels')
        .insert({ type: 'team', name, category, account_id: user.id, created_by: user.id, organization_id: organizationId })
        .select('*')
        .single();
      if (chError) throw chError;

      // Add creator as owner and members
      const membersPayload = [
        { channel_id: channel.id, user_id: user.id, role: 'owner' },
        ...memberIds.filter(id => id !== user.id).map(id => ({ channel_id: channel.id, user_id: id, role: 'member' }))
      ];

      const { error: mError } = await supabase
        .from('chat_channel_members')
        .insert(membersPayload);
      if (mError) throw mError;

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
      // Check if DM already exists (channel with two members: current user and other user)
      const { data: existing, error: exError } = await supabase
        .rpc('get_or_create_dm_channel', { p_user_a: user.id, p_user_b: otherUserId });
      // If function not found, fallback: try to find channel manually
      if (exError || !existing) {
        const { data: candidateChannels } = await supabase
          .from('chat_channels')
          .select('id')
          .eq('type', 'dm');

        let foundId: string | null = null;
        if (candidateChannels) {
          for (const ch of candidateChannels) {
            const { data: members } = await supabase
              .from('chat_channel_members')
              .select('user_id')
              .eq('channel_id', ch.id);
            const memberIds = (members || []).map(m => m.user_id);
            if (memberIds.length === 2 && memberIds.includes(user.id) && memberIds.includes(otherUserId)) {
              foundId = ch.id; break;
            }
          }
        }

        if (!foundId) {
          const { data: newChannel, error: chErr } = await supabase
            .from('chat_channels')
            .insert({ type: 'dm', account_id: user.id, created_by: user.id, organization_id: organizationId })
            .select('*')
            .single();
          if (chErr) throw chErr;

          const { error: memErr } = await supabase
            .from('chat_channel_members')
            .insert([
              { channel_id: newChannel.id, user_id: user.id, role: 'owner' },
              { channel_id: newChannel.id, user_id: otherUserId, role: 'member' },
            ]);
          if (memErr) throw memErr;
          dmChannelId = newChannel.id;
        } else { dmChannelId = foundId; }
      } else {
        // If RPC returns a channel id
        const chId = (Array.isArray(existing) ? (existing[0] as any)?.id : (existing as any)?.id) as string | undefined;
        dmChannelId = chId ?? null;
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
    const { error } = await supabase
      .from('chat_channel_members')
      .update({ is_starred: starred })
      .eq('channel_id', channelId)
      .eq('user_id', user.id);
    if (error) return { error: error.message };
    await fetchChannels();
    return { ok: true };
  };

  const deleteChannel = async (channelId: string) => {
    try {
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
  const [orgKey, setOrgKey] = useState<string | null>(null);
  const [oldestTs, setOldestTs] = useState<string | null>(null);

  // Load or create organization chat key (for client-side encryption)
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_or_create_chat_org_key');
        if (error) throw error;
        const key = (Array.isArray(data) ? data[0]?.secret_key : (data as any)?.secret_key) as string | undefined;
        setOrgKey(key || null);
      } catch (e) {
        // no-op, messages can still load unencrypted
      }
    })();
  }, []);

  const subtle = typeof window !== 'undefined' ? window.crypto?.subtle : undefined;

  async function importKey(base64: string) {
    try {
      const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      return await subtle!.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } catch {
      return null;
    }
  }

  async function encryptContent(plain: string): Promise<{ ciphertext: string; iv: string } | null> {
    if (!subtle || !orgKey) return null;
    const key = await importKey(orgKey);
    if (!key) return null;
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
    const ct = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const ivb64 = btoa(String.fromCharCode(...iv));
    return { ciphertext: `${ivb64}:${ct}`, iv: ivb64 };
  }

  async function decryptContent(payload: string): Promise<string | null> {
    if (!subtle || !orgKey) return null;
    const [ivb64, ct] = (payload || '').split(':');
    if (!ivb64 || !ct) return null;
    const key = await importKey(orgKey);
    if (!key) return null;
    const iv = Uint8Array.from(atob(ivb64), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(ct), c => c.charCodeAt(0));
    try {
      const buf = await subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
      return new TextDecoder().decode(buf);
    } catch {
      return null;
    }
  }

  const fetchMessages = async () => {
    if (!channelId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_channel_messages', { p_channel_id: channelId, p_limit: 20 });
      if (error) throw error;
      const rows = (data as any[]) || [];
      const decrypted = await Promise.all(rows.reverse().map(async (m) => {
        if (m.is_encrypted) {
          const plain = await decryptContent(m.content);
          return { ...m, content: plain ?? m.content } as ChatMessage;
        }
        return m as ChatMessage;
      }));
      setMessages(decrypted);
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
        let content = m.content;
        if (m.is_encrypted) {
          const plain = await decryptContent(m.content);
          content = plain ?? m.content;
        }
        setMessages((prev) => [...prev, { ...(m as ChatMessage), content }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [channelId]);

  const sendMessage = async (content: string) => {
    if (!user || !channelId || !content.trim()) return;
    try {
      setSending(true);
      // Try to encrypt content; fallback to plaintext
      let payload = content;
      let isEncrypted = false;
      const encrypted = await encryptContent(content);
      if (encrypted) {
        payload = encrypted.ciphertext;
        isEncrypted = true;
      }
      const { error } = await supabase
        .from('chat_messages')
        .insert({ channel_id: channelId, sender_id: user.id, content: payload, is_encrypted: isEncrypted, organization_id: organizationId });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: 'Erro ao enviar mensagem', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const loadOlder = async () => {
    if (!channelId || !hasMore || loading) return;
    try {
      setLoading(true);
      const before = oldestTs ?? new Date().toISOString();
      const { data, error } = await supabase.rpc('get_channel_messages', { p_channel_id: channelId, p_before: before, p_limit: 20 });
      if (error) throw error;
      const rows = (data as any[]) || [];
      const decrypted = await Promise.all(rows.map(async (m) => {
        if (m.is_encrypted) {
          const plain = await decryptContent(m.content);
          return { ...m, content: plain ?? m.content } as ChatMessage;
        }
        return m as ChatMessage;
      }));
      setMessages((prev) => [...decrypted, ...prev]);
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

  return { messages, sendMessage, sending, loadOlder, hasMore, uploadAttachment };
}

// Hook: search members within the same organization
export function useOrgMemberSearch(term: string) {
  const { organizationId } = useAuth();
  const { toast } = useToast();
  const [results, setResults] = useState<Array<{ id: string; email?: string | null; nome?: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!organizationId || !term || term.trim().length < 2) { setResults([]); return; }
      try {
        setLoading(true);
        // Use RPC to search members within org (handles RLS and filtering server-side)
        const { data, error } = await supabase
          .rpc('search_org_members', { p_org_id: organizationId, p_term: term, p_limit: 20 });
        if (error) throw error;
        setResults((data as any[]) || []);
      } catch (e: any) {
        toast({ title: 'Erro', description: e.message || 'Falha ao buscar membros', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [term, organizationId]);

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