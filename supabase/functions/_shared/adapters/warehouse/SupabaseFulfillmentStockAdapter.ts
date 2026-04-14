import type { SupabaseClient } from "../infra/supabase-client.ts";

export interface FulfillmentStockUpsertRow {
  readonly organizationId: string;
  readonly storageId: string;
  readonly productId: string;
  readonly marketplaceItemId: string;
  readonly variationId?: string;
  readonly quantity: number;
}

export interface FulfillmentStockRow {
  readonly id: string;
  readonly organizationId: string;
  readonly storageId: string;
  readonly productId: string;
  readonly marketplaceItemId: string;
  readonly variationId: string;
  readonly quantity: number;
  readonly lastSyncedAt: string;
}

type LooseSupabase = {
  from: (table: string) => {
    upsert: (
      rows: unknown,
      opts: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

/** CRUD adapter for the fulfillment_stock table. */
export class SupabaseFulfillmentStockAdapter {
  constructor(private readonly supabase: SupabaseClient) {}

  private get db(): LooseSupabase {
    return this.supabase as unknown as LooseSupabase;
  }

  /** Upserts multiple fulfillment stock rows in a single operation. */
  async upsertMany(rows: ReadonlyArray<FulfillmentStockUpsertRow>): Promise<void> {
    if (rows.length === 0) return;

    const dbRows = rows.map((r) => ({
      organization_id: r.organizationId,
      storage_id: r.storageId,
      product_id: r.productId,
      marketplace_item_id: r.marketplaceItemId,
      variation_id: r.variationId ?? "",
      quantity: r.quantity,
      last_synced_at: new Date().toISOString(),
    }));

    const { error } = await this.db.from("fulfillment_stock").upsert(dbRows, {
      onConflict: "storage_id,product_id,marketplace_item_id,variation_id",
    });

    if (error) {
      throw new Error(`SupabaseFulfillmentStockAdapter.upsertMany failed: ${error.message}`);
    }
  }

  /** Fetches all fulfillment stock rows for a given storage. */
  async findByStorage(storageId: string): Promise<ReadonlyArray<FulfillmentStockRow>> {
    const { data, error } = await this.db
      .from("fulfillment_stock")
      .select("*")
      .eq("storage_id", storageId);

    if (error) {
      throw new Error(`SupabaseFulfillmentStockAdapter.findByStorage failed: ${error.message}`);
    }

    return ((data as unknown[]) ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        organizationId: r.organization_id as string,
        storageId: r.storage_id as string,
        productId: r.product_id as string,
        marketplaceItemId: r.marketplace_item_id as string,
        variationId: r.variation_id as string,
        quantity: r.quantity as number,
        lastSyncedAt: r.last_synced_at as string,
      };
    });
  }
}
