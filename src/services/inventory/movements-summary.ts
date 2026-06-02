import type { MovementsSummary } from "@/services/inventory/movements-types";

export interface SummaryRow {
  movement_type: string;
  quantity_change: number;
  source_ref?: string | null;
}

/** Pure reducer extracted from movements.service fetchMovementsSummary (lines 296-326). */
export function aggregateSummary(rows: SummaryRow[]): MovementsSummary {
  const summary: MovementsSummary = {
    totalEntradas: 0,
    countEntradas: 0,
    totalSaidas: 0,
    countSaidas: 0,
    totalReservas: 0,
    countReservas: 0,
    totalTransferencias: 0,
    countTransferencias: 0,
    totalDevolucoes: 0,
    countDevolucoes: 0,
  };

  for (const r of rows) {
    const qty = Math.abs(Number(r.quantity_change) || 0);
    switch (r.movement_type) {
      case "ENTRADA":
        summary.totalEntradas += qty;
        summary.countEntradas++;
        break;
      case "SAIDA":
        summary.totalSaidas += qty;
        summary.countSaidas++;
        break;
      case "RESERVA":
      case "CANCELAMENTO_RESERVA":
        summary.totalReservas += qty;
        summary.countReservas++;
        break;
      case "TRANSFERENCIA":
        if (Number(r.quantity_change) < 0) {
          summary.totalTransferencias += qty;
          summary.countTransferencias++;
        }
        break;
      case "DEVOLUCAO":
        summary.totalDevolucoes += qty;
        summary.countDevolucoes++;
        break;
    }
  }

  return summary;
}
