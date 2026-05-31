import { useEffect, useState } from "react";
import { fetchOrderStatusHistory, type OrderStatusHistoryEntry } from "@/services/orders.service";

export function useOrderStatusHistory(orderId: string | null | undefined, enabled: boolean) {
  const [entries, setEntries] = useState<OrderStatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !orderId) {
      setEntries([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchOrderStatusHistory(orderId)
      .then((rows) => {
        if (!cancelled) {
          setEntries(rows);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setEntries([]);
          setError(e instanceof Error ? e.message : "Erro ao carregar histórico");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orderId, enabled]);

  return { entries, loading, error };
}
