/** Value object representing the warehouse configuration for a marketplace integration.
 *  Maps an integration to its physical and optional fulfillment warehouse IDs. */
export interface WarehouseConfig {
  readonly integrationId: string;
  readonly organizationId: string;
  /** Storage ID for normal (non-fulfillment) orders. */
  readonly physicalStorageId: string;
  /** Storage ID for fulfillment orders. Null if the integration has no fulfillment service. */
  readonly fulfillmentStorageId: string | null;
}
