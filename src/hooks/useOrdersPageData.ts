import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAllOrders,
  fetchOrderById as fetchOrderByIdService,
  resolveOrgId,
} from "@/services/orders.service";
import type { Order } from "@/types/orders";
import { isAbortLikeError } from "@/utils/orderUtils";

interface UseOrdersPageDataParams {
  organizationId: string | null | undefined;
  user: any;
}

interface UseOrdersPageDataResult {
  pedidos: Order[];
  setPedidos: React.Dispatch<React.SetStateAction<Order[]>>;
  isLoading: boolean;
  listReady: boolean;
  totalPedidosCount: number | null;
  refetch: (opts?: { background?: boolean }) => Promise<void>;
}

/**
 * Facade: encapsulates order data fetching, localStorage caching, and realtime
 * subscription. Keeps Orders.tsx focused on UI orchestration.
 */
export function useOrdersPageData({
  organizationId,
  user,
}: UseOrdersPageDataParams): UseOrdersPageDataResult {
  const [pedidos, setPedidos] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [totalPedidosCount, setTotalPedidosCount] = useState<number | null>(null);

  const loadRunIdRef = useRef(0);
  const initialLoadDoneRef = useRef(false);

  // Stable ref so the realtime handler always reads the current orgId
  // without needing the channel to re-subscribe on org changes.
  const orgIdRef = useRef(organizationId);
  orgIdRef.current = organizationId;

  const loadPedidos = useCallback(async (opts?: { background?: boolean }) => {
    const background = Boolean(opts?.background);
    if (!background) setIsLoading(true);
    try {
      if (!user && !organizationId) {
        setPedidos([]);
        setListReady(true);
        return;
      }

      let orgIdResolved: string | null = organizationId ?? null;
      if (!orgIdResolved) {
        orgIdResolved = await resolveOrgId(user.id);
      }

      const cacheKey = `pedidos_cache_${organizationId || ''}`;
      if (!background) {
        try {
          const raw = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
          if (raw) {
            const cached = JSON.parse(raw);
            if (Array.isArray(cached)) {
              startTransition(() => setPedidos(cached));
              setListReady(true);
            }
          }
        } catch { }
      }

      if (!orgIdResolved) {
        setPedidos([]);
        setListReady(true);
        return;
      }

      const lightParsed = await fetchAllOrders(orgIdResolved);
      setTotalPedidosCount(null);

      ++loadRunIdRef.current;
      startTransition(() => setPedidos(lightParsed));
      try {
        if (typeof window !== 'undefined') localStorage.setItem(cacheKey, JSON.stringify(lightParsed));
      } catch { }
      setListReady(true);
    } catch (err) {
      if (!isAbortLikeError(err)) {
        console.error("Erro ao buscar pedidos:", err);
        setPedidos([]);
        setListReady(true);
      }
    } finally {
      if (!background) setIsLoading(false);
    }
  }, [organizationId, user]);

  // Initial fetch — runs once per org change. Ref guard prevents double-invocation
  // from React StrictMode without adding loadPedidos as a dep (which would re-run after
  // every background refresh).
  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      loadPedidos();
      initialLoadDoneRef.current = true;
    }
  }, [organizationId, loadPedidos]);

  // Realtime subscription — re-subscribes when org changes.
  useEffect(() => {
    try {
      const channel = (supabase as any).channel('orders_changes');
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload: any) => {
          const o: any = payload?.new || payload?.old;
          if (!o) return;
          const orderId = o.id;
          const currentOrgId = orgIdRef.current;
          if (payload?.eventType === 'DELETE') {
            startTransition(() => setPedidos(prev => prev.filter(p => p.id !== orderId)));
          } else if (currentOrgId && orderId) {
            try {
              const updated = await fetchOrderByIdService(currentOrgId, orderId);
              startTransition(() => setPedidos(prev => {
                const idx = prev.findIndex(p => p.id === orderId);
                const next = [...prev];
                if (idx >= 0) next[idx] = updated; else next.unshift(updated);
                try {
                  localStorage.setItem(`pedidos_cache_${currentOrgId}`, JSON.stringify(next));
                } catch { }
                return next;
              }));
            } catch { }
          }
        })
        .subscribe();
      return () => {
        try { (supabase as any).removeChannel(channel); } catch { }
      };
    } catch { }
  }, [organizationId]);

  return { pedidos, setPedidos, isLoading, listReady, totalPedidosCount, refetch: loadPedidos };
}
