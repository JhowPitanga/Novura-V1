import { supabase } from "@/integrations/supabase/client";
import type { MovementsFilters, MovementsSummary } from "@/services/inventory/movements-types";
import { applyMovementsFilters } from "@/services/inventory/movements-filter";
import {
  aggregateSummary,
  type SummaryRow,
} from "@/services/inventory/movements-summary";

export { aggregateSummary };

export async function fetchMovementsSummary(
  organizationId: string,
  filters: MovementsFilters
): Promise<MovementsSummary> {
  let query = supabase
    .from("v_inventory_audit")
    .select("movement_type, quantity_change, source_ref")
    .eq("organizations_id", organizationId);

  query = applyMovementsFilters(query, filters);

  const { data } = await query;
  const rows = (data || []) as SummaryRow[];
  return aggregateSummary(rows);
}
