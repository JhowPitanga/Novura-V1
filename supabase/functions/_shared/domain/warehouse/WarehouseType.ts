/** Warehouse types: physical warehouses are operated by the seller;
 *  fulfillment warehouses are managed by the marketplace. */
export type WarehouseType = "physical" | "fulfillment";

export const WarehouseType = {
  PHYSICAL: "physical" as const,
  FULFILLMENT: "fulfillment" as const,
} satisfies Record<string, WarehouseType>;
