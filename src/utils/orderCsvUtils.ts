/**
 * Pure utilities for CSV export of orders.
 * Extracted from useOrdersActions (handleExportCSV, lines 322-346).
 */
import { formatDateTimeSP } from "@/lib/datetime";
import { mapTipoEnvioLabel } from "@/utils/orderUtils";
import type { Order } from "@/types/orders";

export const CSV_HEADERS = ["ID", "Marketplace", "Produto", "SKU", "Cliente", "Valor", "Data", "Status", "Tipo de Envio"];

/**
 * Build a CSV row array for a single order.
 * Verbatim from actions lines 322-346 — do not change field order without updating CSV_HEADERS.
 */
export function buildCsvRow(p: Order): (string | number | null | undefined)[] {
  return [
    p.id,
    p.marketplace,
    p.productTitle,
    p.sku || "N/A",
    p.customerName,
    `R$ ${p.totalAmount.toFixed(2)}`,
    (() => {
      const base = (p as any).paidAt || (p as any).createdAt;
      if (!base) return "";
      try { return formatDateTimeSP(base); } catch { return String(base); }
    })(),
    p.status,
    mapTipoEnvioLabel((p as any).shippingType),
  ];
}

/**
 * Export an array of orders as a semicolon-delimited CSV file download.
 * Verbatim from actions lines 322-346.
 */
export function exportOrdersCsv(orders: Order[]): void {
  const data = orders.map(p => buildCsvRow(p));
  const csvContent = [CSV_HEADERS.join(";"), ...data.map(row => row.join(";"))].join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `pedidos_${new Date().toISOString().slice(0, 10)}.csv`);
  link.click();
}
