import { supabase } from "@/integrations/supabase/client";

// Movement type values as defined in inventory_transactions
export type MovementType =
  | "ENTRADA"
  | "SAIDA"
  | "RESERVA"
  | "CANCELAMENTO_RESERVA"
  | "TRANSFERENCIA"
  | "DEVOLUCAO";

export type EntityType =
  | "order"
  | "manual"
  | "transfer_in"
  | "transfer_out"
  | "return"
  | "system";

export type ReasonCode =
  | "sale"
  | "manual_adjustment"
  | "reservation_cancelled"
  | "customer_return"
  | "warehouse_transfer";

export interface InventoryMovement {
  id: string;
  timestamp: string;
  organizations_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_image_urls: string[] | null;
  storage_id: string;
  storage_name: string;
  storage_type: "physical" | "fulfillment";
  order_id: string | null;
  marketplace_order_id: string | null;
  integration_id: string | null;
  integration_marketplace: string | null;
  marketplace_name: string | null;
  movement_type: MovementType;
  quantity_change: number;
  source_ref: string | null;
  entity_type: EntityType | null;
  reason_code: ReasonCode | null;
  counterpart_storage_id: string | null;
  counterpart_storage_name: string | null;
  created_by_user_id: string | null;
  actor_name: string | null;
}

export interface MovementsFilters {
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
  storageId?: string;
  integrationId?: string;
  movementTypes?: MovementType[];
  searchTerm?: string;
}

export interface MovementsSummary {
  totalEntradas: number;
  totalSaidas: number;
  totalReservas: number;
  totalTransferencias: number;
  totalDevolucoes: number;
  countEntradas: number;
  countSaidas: number;
  countReservas: number;
  countTransferencias: number;
  countDevolucoes: number;
}

export interface MovementsPage {
  data: InventoryMovement[];
  total: number;
  summary: MovementsSummary;
}

const PAGE_SIZE = 50;

/** Determines the display label from structured fields. Falls back to movement_type label. */
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
  // Fallback for legacy rows without entity_type/reason_code
  if (!row.entity_type && !row.reason_code && row.source_ref?.startsWith("PEDIDO[")) {
    if (row.movement_type === "SAIDA") return "Venda";
  }
  return row.movement_type;
}

export function resolveMovementColor(row: InventoryMovement): string {
  switch (row.movement_type) {
    case "ENTRADA": return "green";
    case "SAIDA": return row.entity_type === "order" || row.reason_code === "sale" ? "blue" : "slate";
    case "RESERVA": return "amber";
    case "CANCELAMENTO_RESERVA": return "purple";
    case "DEVOLUCAO": return "fuchsia";
    case "TRANSFERENCIA": return "cyan";
    default: return "gray";
  }
}

export async function fetchInventoryMovements(
  organizationId: string,
  filters: MovementsFilters = {},
  page = 0
): Promise<MovementsPage> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = (supabase as any)
    .from("v_inventory_audit")
    .select("*", { count: "exact" })
    .eq("organizations_id", organizationId)
    .order("timestamp", { ascending: false })
    .range(from, to);

  if (filters.dateFrom) {
    query = query.gte("timestamp", filters.dateFrom);
  }
  if (filters.dateTo) {
    // Include the full last day
    const endOfDay = new Date(filters.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    query = query.lte("timestamp", endOfDay.toISOString());
  }
  if (filters.productId) {
    query = query.eq("product_id", filters.productId);
  }
  if (filters.storageId) {
    query = query.eq("storage_id", filters.storageId);
  }
  if (filters.integrationId) {
    query = query.eq("integration_id", filters.integrationId);
  }
  if (filters.movementTypes && filters.movementTypes.length > 0) {
    query = query.in("movement_type", filters.movementTypes);
  }
  if (filters.searchTerm) {
    const term = `%${filters.searchTerm}%`;
    query = query.or(
      `product_name.ilike.${term},product_sku.ilike.${term},source_ref.ilike.${term},marketplace_order_id.ilike.${term},storage_name.ilike.${term},counterpart_storage_name.ilike.${term}`
    );
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const rowsRaw: InventoryMovement[] = (data || []) as InventoryMovement[];
  const rowsWithSku = await enrichProductSku(rowsRaw);
  const rows = await enrichActorNames(organizationId, rowsWithSku);

  // Compute summary from full result (best-effort with current page; for accurate totals a separate aggregate query is needed)
  const summary = await fetchMovementsSummary(organizationId, filters);

  return { data: rows, total: count ?? 0, summary };
}

async function enrichProductSku(rows: InventoryMovement[]): Promise<InventoryMovement[]> {
  const missingProductIds = Array.from(
    new Set(
      rows
        .filter((r) => (!r.product_sku || r.product_sku === "-") && !!r.product_id)
        .map((r) => r.product_id)
    )
  );
  if (missingProductIds.length === 0) return rows;

  try {
    const { data: productsData, error } = await (supabase as any)
      .from("products")
      .select("id, sku")
      .in("id", missingProductIds);
    if (error || !productsData) return rows;

    const skuMap = new Map<string, string>();
    for (const p of productsData as any[]) {
      if (p?.id && p?.sku) skuMap.set(String(p.id), String(p.sku));
    }

    return rows.map((r) => ({
      ...r,
      product_sku: r.product_sku && r.product_sku !== "-"
        ? r.product_sku
        : skuMap.get(String(r.product_id)) || r.product_sku || "-",
    }));
  } catch {
    return rows;
  }
}

/**
 * Enrich movement rows with actor_name from public.users.name when possible.
 * Compatibility:
 * - If table/columns are missing, silently keep original rows.
 * - If created_by_user_id is unavailable, falls back to source_ref parsing in UI layer.
 */
async function enrichActorNames(
  organizationId: string,
  rows: InventoryMovement[]
): Promise<InventoryMovement[]> {
  const userIds = Array.from(
    new Set(
      rows
        .map((r) => r.created_by_user_id)
        .filter((v): v is string => !!v)
    )
  );

  if (userIds.length === 0) return rows;

  try {
    const { data: usersData, error } = await (supabase as any)
      .from("users")
      .select("id, name, organization_id")
      .eq("organization_id", organizationId)
      .in("id", userIds);

    if (error || !usersData) return rows;

    const userMap = new Map<string, string>();
    for (const u of usersData as any[]) {
      if (u?.id && u?.name) userMap.set(String(u.id), String(u.name));
    }

    return rows.map((r) => ({
      ...r,
      actor_name: r.created_by_user_id
        ? userMap.get(String(r.created_by_user_id)) || r.actor_name || null
        : r.actor_name || null,
    }));
  } catch {
    return rows;
  }
}

/** Aggregated summary query (separate so we always get totals for the whole filter range) */
async function fetchMovementsSummary(
  organizationId: string,
  filters: MovementsFilters
): Promise<MovementsSummary> {
  let query = (supabase as any)
    .from("v_inventory_audit")
    // Compatibility: some environments don't yet have entity_type/reason_code in the view.
    .select("movement_type, quantity_change, source_ref")
    .eq("organizations_id", organizationId);

  if (filters.dateFrom) query = query.gte("timestamp", filters.dateFrom);
  if (filters.dateTo) {
    const endOfDay = new Date(filters.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    query = query.lte("timestamp", endOfDay.toISOString());
  }
  if (filters.productId) query = query.eq("product_id", filters.productId);
  if (filters.storageId) query = query.eq("storage_id", filters.storageId);
  if (filters.integrationId) query = query.eq("integration_id", filters.integrationId);
  if (filters.movementTypes && filters.movementTypes.length > 0) {
    query = query.in("movement_type", filters.movementTypes);
  }
  if (filters.searchTerm) {
    const term = `%${filters.searchTerm}%`;
    query = query.or(
      `product_name.ilike.${term},product_sku.ilike.${term},source_ref.ilike.${term},marketplace_order_id.ilike.${term},storage_name.ilike.${term},counterpart_storage_name.ilike.${term}`
    );
  }

  const { data } = await query;
  const rows = (data || []) as {
    movement_type: string;
    quantity_change: number;
    source_ref?: string | null;
  }[];

  const summary: MovementsSummary = {
    totalEntradas: 0, countEntradas: 0,
    totalSaidas: 0, countSaidas: 0,
    totalReservas: 0, countReservas: 0,
    totalTransferencias: 0, countTransferencias: 0,
    totalDevolucoes: 0, countDevolucoes: 0,
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
        // Count only outbound transfer row to avoid double-counting.
        // In legacy schemas (without entity_type), use negative quantity fallback.
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

/** Export movements as CSV string */
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
    ...rows.map((r) => [
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
    ].join(",")),
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
  const src = String(row.source_ref || "");
  const match = src.match(/^([^\[]+)\[/);
  if (match?.[1]?.trim()) {
    const extracted = match[1].trim();
    return extracted.split(" - ")[0].trim();
  }
  return row.actor_name || "";
}

function resolveObservationForExport(row: InventoryMovement): string {
  const src = String(row.source_ref || "");
  const match = src.match(/^([^\[]+)\[/);
  if (!match?.[1]?.trim()) return "";
  const extracted = match[1].trim();
  const parts = extracted.split(" - ");
  if (parts.length <= 1) return "";
  return parts.slice(1).join(" - ").trim();
}
