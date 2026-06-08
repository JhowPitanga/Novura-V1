import { supabase } from "@/integrations/supabase/client";
import type {
  InventoryMovement,
  MovementsFilters,
  MovementsPage,
} from "@/services/inventory/movements-types";
import { applyMovementsFilters } from "@/services/inventory/movements-filter";
import { fetchMovementsSummary } from "@/services/inventory/movements-summary.service";

const PAGE_SIZE = 50;

export async function fetchInventoryMovements(
  organizationId: string,
  filters: MovementsFilters = {},
  page = 0
): Promise<MovementsPage> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("v_inventory_audit")
    .select("*", { count: "exact" })
    .eq("organizations_id", organizationId)
    .order("timestamp", { ascending: false })
    .range(from, to);

  query = applyMovementsFilters(query, filters);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const rowsRaw: InventoryMovement[] = (data || []) as InventoryMovement[];
  const rowsWithSku = await enrichProductSku(rowsRaw);
  const rows = await enrichActorNames(organizationId, rowsWithSku);
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
    const { data: productsData, error } = await supabase
      .from("products")
      .select("id, sku")
      .in("id", missingProductIds);
    if (error || !productsData) return rows;

    const skuMap = new Map<string, string>();
    for (const p of productsData) {
      if (p?.id && p?.sku) skuMap.set(String(p.id), String(p.sku));
    }

    return rows.map((r) => ({
      ...r,
      product_sku:
        r.product_sku && r.product_sku !== "-"
          ? r.product_sku
          : skuMap.get(String(r.product_id)) || r.product_sku || "-",
    }));
  } catch {
    return rows;
  }
}

async function enrichActorNames(
  organizationId: string,
  rows: InventoryMovement[]
): Promise<InventoryMovement[]> {
  const userIds = Array.from(
    new Set(rows.map((r) => r.created_by_user_id).filter((v): v is string => !!v))
  );

  if (userIds.length === 0) return rows;

  try {
    const { data: usersData, error } = await supabase
      .from("users")
      .select("id, name, organization_id")
      .eq("organization_id", organizationId)
      .in("id", userIds);

    if (error || !usersData) return rows;

    const userMap = new Map<string, string>();
    for (const u of usersData) {
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
