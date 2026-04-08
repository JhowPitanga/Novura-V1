import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { IInventoryPort, InventoryItem } from "../../domain/orders/ports/IInventoryPort.ts";

export class SupabaseInventoryAdapter implements IInventoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async reserveStockNow(params: {
    readonly orderId: string;
    readonly organizationId: string;
    readonly items: ReadonlyArray<InventoryItem>;
  }): Promise<void> {
    const { error } = await this.supabase.rpc("reserve_stock_for_order", { p_order_id: params.orderId });
    if (error) throw new Error(`SupabaseInventoryAdapter.reserveStockNow failed: ${error.message}`);
  }

  async enqueueConsumeStock(params: { readonly orderId: string; readonly organizationId: string }): Promise<void> {
    await this.enqueueInventoryJob(params.orderId, "consume");
  }

  async enqueueRefundStock(params: { readonly orderId: string; readonly organizationId: string }): Promise<void> {
    await this.enqueueInventoryJob(params.orderId, "refund");
  }

  private async enqueueInventoryJob(orderId: string, jobType: "consume" | "refund"): Promise<void> {
    const { error } = await this.supabase.from("inventory_jobs").upsert(
      { order_id: orderId, job_type: jobType, status: "pending" },
      { onConflict: "order_id,job_type", ignoreDuplicates: true },
    );
    if (error) throw new Error(`SupabaseInventoryAdapter.enqueueInventoryJob failed: ${error.message}`);
  }
}
