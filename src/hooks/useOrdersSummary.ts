import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { calendarStartOfDaySPEpochMs, calendarEndOfDaySPEpochMs } from "@/lib/datetime";

type BreakdownItem = {
  marketplace: string;
  total: number;
};

export function useOrdersSummary(range?: DateRange, marketplace?: string) {
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        setError(null);

        const from = range?.from ? new Date(range.from) : undefined;
        const to = range?.to ? new Date(range.to) : undefined;

        // If we don't have a complete range, skip fetching
        if (!from || !to) {
          setBreakdown([]);
          setLoading(false);
          return;
        }

        // Use São Paulo timezone day boundaries to build the filter window
        const fromISO = new Date(calendarStartOfDaySPEpochMs(from)).toISOString();
        const toISO = new Date(calendarEndOfDaySPEpochMs(to)).toISOString();

        // Consultar resumo a partir da view apresentada
        let query = supabase
          .from("marketplace_orders_presented")
          .select("marketplace, order_total, created_at")
          .gte("created_at", fromISO)
          .lte("created_at", toISO);

        if (marketplace && marketplace !== "todos") {
          query = query.eq("marketplace", marketplace);
        }

        const { data, error } = await query;

        if (error) throw error;

        const map = new Map<string, number>();
        (data || []).forEach((o: any) => {
          const m = o.marketplace || "Desconhecido";
          const val = typeof o.order_total === "number" ? o.order_total : Number(o.order_total) || 0;
          map.set(m, (map.get(m) || 0) + val);
        });

        const result: BreakdownItem[] = Array.from(map.entries()).map(([marketplace, total]) => ({ marketplace, total }));
        setBreakdown(result);
      } catch (err: any) {
        setError(err?.message || "Erro ao buscar pedidos");
        setBreakdown([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [range?.from?.toString(), range?.to?.toString(), marketplace]);

  return { breakdown, loading, error };
}