import type { IWarehouseResolverPort } from "../../domain/orders/ports/IWarehouseResolverPort.ts";

export interface ResolveWarehouseInput {
  readonly integrationId: string;
  readonly isFulfillment: boolean;
}

/**
 * Determines which warehouse (storage_id) should be used for a given order,
 * based on the originating integration and the order's fulfillment type.
 *
 * Resolution priority:
 *  1. integration_warehouse_config.fulfillment_storage_id  (fulfillment orders)
 *  2. integration_warehouse_config.physical_storage_id     (normal orders)
 *  3. First active physical storage in the organization    (fallback)
 *  4. null                                                  (no warehouse found)
 */
export class ResolveOrderWarehouseUseCase {
  constructor(private readonly warehouseResolver: IWarehouseResolverPort) {}

  async execute(input: ResolveWarehouseInput): Promise<string | null> {
    const storageId = await this.warehouseResolver.resolveForOrder({
      integrationId: input.integrationId,
      isFulfillment: input.isFulfillment,
    });

    if (!storageId) {
      console.warn(
        `[ResolveOrderWarehouseUseCase] no warehouse resolved for integration=${input.integrationId} fulfillment=${input.isFulfillment}`,
      );
    }

    return storageId;
  }
}
