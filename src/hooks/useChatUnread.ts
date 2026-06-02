import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchUnreadCounts,
  upsertUnreadCount,
  markChannelRead as svcMarkChannelRead,
} from "@/services/team.service";

const unreadKey = (userId: string) => ['chat-unread', userId] as const;

const LS_KEY = (userId: string) => `chat_unread_counts:${userId}`;

function persistToLS(userId: string, counts: Record<string, number>) {
  try {
    if (typeof window !== 'undefined' && userId) {
      localStorage.setItem(LS_KEY(userId), JSON.stringify(counts));
    }
  } catch {}
}

/**
 * Manages unread chat counts for the current user.
 * Initial load: localStorage seed → DB fallback (useQuery).
 * Live updates: realtime postgres_changes + window event bus → queryClient.setQueryData.
 * Emits 'chat:unread-total' {total, source:'equipe'} on every change.
 *
 * @param activeChannelId The channel currently open (messages there don't accumulate unread).
 */
export function useChatUnread(activeChannelId: string | null) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const queryClient = useQueryClient();

  // ── Initial load (localStorage seed → DB fallback) ──────────────────────────

  const query = useQuery({
    queryKey: unreadKey(userId),
    queryFn: async (): Promise<Record<string, number>> => {
      if (!userId) return {};
      try {
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem(LS_KEY(userId));
          if (cached) {
            const parsed = JSON.parse(cached || '{}');
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
              return parsed as Record<string, number>;
            }
          }
        }
      } catch {}
      const { data, error } = await fetchUnreadCounts(userId);
      if (error || !data) return {};
      const map: Record<string, number> = {};
      (data as any[]).forEach((row) => { map[row.channel_id] = row.unread_count || 0; });
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(LS_KEY(userId), JSON.stringify(map));
        }
      } catch {}
      return map;
    },
    enabled: !!userId,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

  const unreadCounts: Record<string, number> = query.data ?? {};

  const unreadTotal = useMemo(
    () => Object.values(unreadCounts).reduce((sum, n) => sum + (n || 0), 0),
    [unreadCounts],
  );

  // ── Realtime subscription ────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`realtime-unread-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_unread_counts', filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const row = (payload?.new || payload?.old || {}) as any;
          const chId = row?.channel_id;
          const count = (payload?.new?.unread_count ?? row?.unread_count ?? 0) as number;
          if (!chId) return;
          queryClient.setQueryData(unreadKey(userId), (prev: Record<string, number> = {}) => {
            const next = { ...prev, [chId]: count };
            persistToLS(userId, next);
            return next;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, queryClient]);

  // ── chat:message-received ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (ev: any) => {
      const detail = ev?.detail || {};
      const chId: string | undefined = detail?.channelId;
      const msg = detail?.message || {};
      if (!chId) return;
      if (chId === activeChannelId) return; // canal ativo não acumula aqui
      if (!!user && msg?.sender_id === user.id) return; // ignora próprias
      let nextCount = 0;
      queryClient.setQueryData(unreadKey(userId), (prev: Record<string, number> = {}) => {
        nextCount = (prev[chId] || 0) + 1;
        const next = { ...prev, [chId]: nextCount };
        persistToLS(userId, next);
        return next;
      });
      if (userId) {
        try { upsertUnreadCount(chId, userId, nextCount); } catch {}
      }
    };
    window.addEventListener('chat:message-received', handler as any);
    return () => { window.removeEventListener('chat:message-received', handler as any); };
  }, [activeChannelId, user, userId, queryClient]);

  // ── chat:active-unread-changed ───────────────────────────────────────────────

  useEffect(() => {
    const handler = (ev: any) => {
      const { channelId, count } = ev?.detail || {};
      if (!channelId || typeof count !== 'number') return;
      queryClient.setQueryData(unreadKey(userId), (prev: Record<string, number> = {}) => {
        const next = { ...prev, [channelId]: count };
        persistToLS(userId, next);
        return next;
      });
      if (count === 0) {
        (async () => { try { await svcMarkChannelRead(channelId); } catch {} })();
      }
    };
    window.addEventListener('chat:active-unread-changed', handler as any);
    return () => { window.removeEventListener('chat:active-unread-changed', handler as any); };
  }, [userId, queryClient]);

  // ── Emit total to sidebar ────────────────────────────────────────────────────

  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((sum, n) => sum + (n || 0), 0);
    window.dispatchEvent(new CustomEvent('chat:unread-total', { detail: { total, source: 'equipe' } }));
  }, [unreadCounts]);

  // ── markRead ─────────────────────────────────────────────────────────────────

  const markRead = (channelId: string) => {
    queryClient.setQueryData(unreadKey(userId), (prev: Record<string, number> = {}) => {
      if (!(channelId in prev)) return prev;
      const next = { ...prev, [channelId]: 0 };
      persistToLS(userId, next);
      return next;
    });
    (async () => { try { await svcMarkChannelRead(channelId); } catch {} })();
  };

  return { unreadCounts, unreadTotal, markRead };
}
