import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { IWarehouseResolverPort } from "../../domain/orders/ports/IWarehouseResolverPort.ts";

/** Loose DB row shape returned from integration_warehouse_config. */
type ConfigRow = {
  physical_storage_id: string;
  fulfillment_storage_id: string | null;
} | null;

/** Loose DB row shape for fetching the organization's default storage. */
type StorageRow = { id: string } | null;

type LooseSupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
};

/**
 * Resolves the correct warehouse storage_id for an order using integration_warehouse_config.
 * Falls back to the organization's first active physical storage when no config exists.
 */
export class SupabaseWarehouseResolver implements IWarehouseResolverPort {
  constructor(private readonly supabase: SupabaseClient) {}

  private get db(): LooseSupabase {
    return this.supabase as unknown as LooseSupabase;
  }

  async resolveForOrder(params: {
    readonly integrationId: string;
    readonly isFulfillment: boolean;
  }): Promise<string | null> {
    const { data, error } = await this.db
      .from("integration_warehouse_config")
      .select("physical_storage_id, fulfillment_storage_id")
      .eq("integration_id", params.integrationId)
      .maybeSingle();

    if (error) {
      console.warn(
        `[SupabaseWarehouseResolver] config lookup failed for integration ${params.integrationId}: ${error.message}`,
      );
    }

    const config = data as ConfigRow;

    if (config) {
      if (params.isFulfillment) {
        return config.fulfillment_storage_id ?? config.physical_storage_id;
      }
      return config.physical_storage_id;
    }

    // Fallback: resolve integration → organization → first active physical storage
    return this.resolveDefaultStorage(params.integrationId);
  }

  private async resolveDefaultStorage(integrationId: string): Promise<string | null> {
    try {
      const intRow = await (this.supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => {
              maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
            };
          };
        };
      })
        .from("marketplace_integrations")
        .select("organizations_id")
        .eq("id", integrationId)
        .maybeSingle();

      const orgId = (intRow.data as { organizations_id: string } | null)?.organizations_id;
      if (!orgId) return null;

      const storageRow = await (this.supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => {
              eq: (k2: string, v2: string) => {
                eq: (k3: string, v3: boolean) => {
                  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          };
        };
      })
        .from("storage")
        .select("id")
        .eq("organizations_id", orgId)
        .eq("active", true)
        .eq("type", "physical")
        .maybeSingle();

      return (storageRow.data as StorageRow)?.id ?? null;
    } catch (e) {
      console.warn(
        `[SupabaseWarehouseResolver] default storage fallback failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }
}
