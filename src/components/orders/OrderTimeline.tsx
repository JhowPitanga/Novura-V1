import { Loader2 } from "lucide-react";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeSP } from "@/lib/datetime";
import { mapOrderStatusLabel, mapOrderStatusSourceLabel } from "@/utils/orderUtils";
import type { OrderStatusHistoryEntry } from "@/services/orders.service";
import { OrderDrawerSection } from "./OrderDrawerSection";
import { useOrderStatusHistory } from "@/hooks/useOrderStatusHistory";

function formatHistoryLabel(entry: OrderStatusHistoryEntry): string {
  const to = mapOrderStatusLabel(entry.toStatus);
  if (!entry.fromStatus) return to;
  const from = mapOrderStatusLabel(entry.fromStatus);
  if (from === to) return to;
  return `${from} → ${to}`;
}

interface OrderTimelineProps {
  orderId: string;
  drawerOpen: boolean;
}

export function OrderTimeline({ orderId, drawerOpen }: OrderTimelineProps) {
  const { entries, loading, error } = useOrderStatusHistory(orderId, drawerOpen);

  return (
    <OrderDrawerSection title="Linha do Tempo" icon={History}>
      {loading ? (
        <div className="flex items-center justify-center py-6 text-purple-600">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 text-center py-4">{error}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">Nenhuma alteração de status registrada.</p>
      ) : (
        <ol className="relative border-l-2 border-purple-100 ml-2 space-y-0">
          {entries.map((entry, index) => {
            const isLast = index === entries.length - 1;
            return (
              <li key={entry.id} className="relative pl-6 pb-6 last:pb-0">
                <span
                  className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                    isLast ? "bg-purple-600 ring-2 ring-purple-200" : "bg-green-500"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${isLast ? "text-purple-800" : "text-gray-900"}`}>
                    {formatHistoryLabel(entry)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-600 border-gray-200">
                      {mapOrderStatusSourceLabel(entry.source)}
                    </Badge>
                    <span className="text-xs text-gray-500 font-mono">
                      {formatDateTimeSP(entry.changedAt)}
                    </span>
                  </div>
                  {entry.fromStatus && entry.toStatus !== entry.fromStatus ? (
                    <p className="text-[11px] text-gray-400 mt-1 font-mono">
                      {entry.fromStatus} → {entry.toStatus}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </OrderDrawerSection>
  );
}
