import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABELS: Record<string, string> = {
  paid: "Pago",
  pending: "Pendente",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  returned: "Devolvido",
  failed: "Falhou",
  processing: "Processando",
  unknown: "Desconhecido",
};

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-50 text-green-700 border-green-200",
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  returned: "bg-orange-50 text-orange-700 border-orange-200",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  processing: "bg-purple-50 text-purple-700 border-purple-200",
  unknown: "bg-gray-50 text-gray-600 border-gray-200",
};

interface GlobalOrderStatusCardsProps {
  summary: Record<string, number>;
  total: number;
  isLoading?: boolean;
  selectedStatus?: string;
  onSelect?: (status: string | undefined) => void;
}

export function GlobalOrderStatusCards({
  summary,
  total,
  isLoading,
  selectedStatus,
  onSelect,
}: GlobalOrderStatusCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  const entries = Object.entries(summary).sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
      <button
        className={`rounded-lg border p-3 text-left transition-all ${
          selectedStatus === undefined
            ? "ring-2 ring-novura-primary border-novura-primary/30"
            : "bg-gray-50 border-gray-200 hover:bg-gray-100"
        }`}
        onClick={() => onSelect?.(undefined)}
      >
        <p className="text-xs font-medium text-muted-foreground">Total</p>
        <p className="text-2xl font-bold text-gray-900">{total}</p>
      </button>

      {entries.map(([status, count]) => {
        const colorClass = STATUS_COLORS[status] ?? STATUS_COLORS.unknown;
        const label = STATUS_LABELS[status] ?? status;
        const isSelected = selectedStatus === status;
        return (
          <button
            key={status}
            className={`rounded-lg border p-3 text-left transition-all ${colorClass} ${
              isSelected ? "ring-2 ring-novura-primary" : "hover:opacity-80"
            }`}
            onClick={() => onSelect?.(isSelected ? undefined : status)}
          >
            <p className="text-xs font-medium opacity-70">{label}</p>
            <p className="text-2xl font-bold">{count}</p>
          </button>
        );
      })}
    </div>
  );
}
