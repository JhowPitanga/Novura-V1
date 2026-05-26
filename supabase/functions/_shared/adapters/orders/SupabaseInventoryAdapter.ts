import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { IInventoryPort, InventoryItem } from "../../domain/orders/ports/IInventoryPort.ts";

/** Escape hatch until `database.types` includes `reserve_stock_for_order` RPC and `inventory_jobs`. */
type InventorySupabase = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  from: (table: string) => {
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string; ignoreDuplicates?: boolean },
    ) => Promise<{ error: { message: string } | null }>;
  };
};

export class SupabaseInventoryAdapter implements IInventoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  private get db(): InventorySupabase {
    return this.supabase as unknown as InventorySupabase;
  }

  async reserveStockNow(params: {
    readonly orderId: string;
    readonly organizationId: string;
    readonly items: ReadonlyArray<InventoryItem>;
  }): Promise<void> {
    const { error } = await this.db.rpc("reserve_stock_for_order", { p_order_id: params.orderId });
    if (error) throw new Error(`SupabaseInventoryAdapter.reserveStockNow failed: ${error.message}`);
  }

  async enqueueConsumeStock(params: { readonly orderId: string; readonly organizationId: string }): Promise<void> {
    await this.enqueueInventoryJob(params.orderId, "consume");
  }

  async enqueueRefundStock(params: { readonly orderId: string; readonly organizationId: string }): Promise<void> {
    await this.enqueueInventoryJob(params.orderId, "refund");
  }

  private async enqueueInventoryJob(orderId: string, jobType: "consume" | "refund"): Promise<void> {
    const { error } = await this.db.from("inventory_jobs").upsert(
      { order_id: orderId, job_type: jobType, status: "pending" },
      { onConflict: "order_id,job_type", ignoreDuplicates: true },
    );
    if (error) throw new Error(`SupabaseInventoryAdapter.enqueueInventoryJob failed: ${error.message}`);
  }
}
