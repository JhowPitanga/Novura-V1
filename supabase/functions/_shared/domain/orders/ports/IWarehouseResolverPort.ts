/** Port for resolving the correct warehouse (storage_id) for an order,
 *  based on the originating integration and whether it is a fulfillment order. */
export interface IWarehouseResolverPort {
  /**
   * Returns the storage_id that should be assigned to an order.
   * Returns null when no config exists and the fallback also fails,
   * so callers must handle null gracefully (e.g. skip stock ops).
   */
  resolveForOrder(params: {
    readonly integrationId: string;
    readonly isFulfillment: boolean;
  }): Promise<string | null>;
}
