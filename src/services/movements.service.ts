/** Public facade — re-exports unchanged for MovementsTab / useInventoryMovements consumers. */
export type {
  MovementType,
  EntityType,
  ReasonCode,
  InventoryMovement,
  MovementsFilters,
  MovementsSummary,
  MovementsPage,
} from "@/services/inventory/movements-types";

export {
  resolveMovementLabel,
  resolveMovementColor,
} from "@/services/inventory/movements-labels";

export { fetchInventoryMovements } from "@/services/inventory/movements-query.service";

export { exportMovementsToCSV } from "@/services/inventory/movements-export";
