import type { InventoryMovement } from "@/services/inventory/movements-types";
import { resolveMovementLabel } from "@/services/inventory/movements-labels";
import {
  parseSourceRefActor,
  parseSourceRefObservation,
} from "@/services/inventory/source-ref";

export function exportMovementsToCSV(rows: InventoryMovement[]): string {
  const headers = [
    "Data/Hora",
    "Produto",
    "SKU",
    "Tipo",
    "Quantidade",
    "Armazém",
    "Usuário",
    "Observação",
    "Pedido",
    "Integração",
    "Referência",
  ];

  const escape = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  };

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) =>
      [
        escape(new Date(r.timestamp).toLocaleString("pt-BR")),
        escape(r.product_name),
        escape(r.product_sku),
        escape(resolveMovementLabel(r)),
        escape(r.quantity_change),
        escape(resolveStorageDisplay(r)),
        escape(resolveActorNameForExport(r)),
        escape(resolveObservationForExport(r)),
        escape(r.marketplace_order_id ?? ""),
        escape(r.integration_marketplace ?? r.marketplace_name ?? ""),
        escape(r.source_ref ?? ""),
      ].join(",")
    ),
  ];

  return lines.join("\n");
}

function resolveStorageDisplay(row: InventoryMovement): string {
  if (row.movement_type !== "TRANSFERENCIA") {
    return row.storage_name || "";
  }
  const isOutbound = Number(row.quantity_change || 0) < 0;
  const fromName = isOutbound ? row.storage_name : row.counterpart_storage_name;
  const toName = isOutbound ? row.counterpart_storage_name : row.storage_name;
  if (fromName && toName) return `${fromName} > ${toName}`;
  return fromName || toName || "";
}

function resolveActorNameForExport(row: InventoryMovement): string {
  if (row.actor_name && row.actor_name !== "Novura") return row.actor_name;
  const parsed = parseSourceRefActor(row.source_ref);
  return parsed || row.actor_name || "";
}

function resolveObservationForExport(row: InventoryMovement): string {
  return parseSourceRefObservation(row.source_ref);
}
