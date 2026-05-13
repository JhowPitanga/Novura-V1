import { Badge } from "@/components/ui/badge";
import type { PromotionStatus } from "@/types/promotions";

const STATUS_CONFIG: Record<PromotionStatus, { label: string; listLabel: string; className: string }> = {
  active: {
    label: "Ativa",
    listLabel: "Promoção ativa",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  scheduled: {
    label: "Agendada",
    listLabel: "Promoção agendada",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  draft: {
    label: "Rascunho",
    listLabel: "Rascunho",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
  pending: {
    label: "Pendente",
    listLabel: "Pendente",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  ended: {
    label: "Encerrada",
    listLabel: "Encerrada",
    className: "bg-gray-100 text-gray-500 border-gray-200",
  },
  cancelled: {
    label: "Cancelada",
    listLabel: "Cancelada",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  candidate: {
    label: "Convite",
    listLabel: "Convite disponível",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
};

interface PromotionStatusBadgeProps {
  status: PromotionStatus;
  /** Larger copy for list rows (reference UI). */
  variant?: "default" | "list";
}

export function PromotionStatusBadge({ status, variant = "default" }: PromotionStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const text = variant === "list" ? config.listLabel : config.label;
  return (
    <Badge
      variant="outline"
      className={`font-medium ${variant === "list" ? "text-xs px-2.5 py-0.5 rounded-full" : "text-xs"} ${config.className}`}
    >
      {text}
    </Badge>
  );
}
