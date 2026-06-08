import type { MovementsFilters } from "@/services/inventory/movements-types";

/** Applies MovementsFilters to a Supabase query chain (duplicated blocks from movements.service). */
export function applyMovementsFilters<T extends {
  gte: (col: string, val: string) => T;
  lte: (col: string, val: string) => T;
  eq: (col: string, val: string) => T;
  in: (col: string, vals: string[]) => T;
  or: (expr: string) => T;
}>(query: T, filters: MovementsFilters): T {
  if (filters.dateFrom) {
    query = query.gte("timestamp", filters.dateFrom);
  }
  if (filters.dateTo) {
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
  return query;
}
