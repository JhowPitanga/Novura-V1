import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { IInventoryPort, InventoryItem } from "../../domain/orders/ports/IInventoryPort.ts";

export class SupabaseInventoryAdapter implements IInventoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async reserveStockNow(orderId: string, _items: ReadonlyArray<InventoryItem>): Promise<void> {
    const { error } = await this.supabase.rpc("reserve_stock_for_order", { p_order_id: orderId });
    if (error) throw new Error(`SupabaseInventoryAdapter.reserveStockNow failed: ${error.message}`);
  }

  async enqueueConsumeStock(orderId: string): Promise<void> {
    await this.enqueueInventoryJob(orderId, "consume");
  }

  async enqueueRefundStock(orderId: string): Promise<void> {
    await this.enqueueInventoryJob(orderId, "refund");
  }

  private async enqueueInventoryJob(orderId: string, jobType: "consume" | "refund"): Promise<void> {
    const { error } = await this.supabase.from("inventory_jobs").upsert(
      { order_id: orderId, job_type: jobType, status: "pending" },
      { onConflict: "order_id,job_type" },
    );
    if (error) throw new Error(`SupabaseInventoryAdapter.enqueueInventoryJob failed: ${error.message}`);
  }
}
