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
