import type { InventoryMovement } from "@/services/inventory/movements-types";

export function resolveMovementLabel(row: InventoryMovement): string {
  if (row.movement_type === "SAIDA") {
    if (row.entity_type === "order" || row.reason_code === "sale") return "Venda";
    return "Saída manual";
  }
  if (row.movement_type === "CANCELAMENTO_RESERVA") return "Estorno de reserva";
  if (row.movement_type === "DEVOLUCAO") return "Devolução física";
  if (row.movement_type === "TRANSFERENCIA") {
    return row.entity_type === "transfer_in" ? "Transferência (entrada)" : "Transferência";
  }
  if (row.movement_type === "RESERVA") return "Reserva";
  if (row.movement_type === "ENTRADA") return "Entrada física";
  if (!row.entity_type && !row.reason_code && row.source_ref?.startsWith("PEDIDO[")) {
    if (row.movement_type === "SAIDA") return "Venda";
  }
  return row.movement_type;
}

export function resolveMovementColor(row: InventoryMovement): string {
  switch (row.movement_type) {
    case "ENTRADA":
      return "green";
    case "SAIDA":
      return row.entity_type === "order" || row.reason_code === "sale" ? "blue" : "slate";
    case "RESERVA":
      return "amber";
    case "CANCELAMENTO_RESERVA":
      return "purple";
    case "DEVOLUCAO":
      return "fuchsia";
    case "TRANSFERENCIA":
      return "cyan";
    default:
      return "gray";
  }
}
