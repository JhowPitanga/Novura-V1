import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { IInventoryPort, InventoryItem } from "../../domain/orders/ports/IInventoryPort.ts";

type InventorySupabase = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
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
    readonly storageId?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc("reserve_stock_for_order_v2", {
      p_order_id: params.orderId,
      p_storage_id: params.storageId ?? null,
    });
    if (error) throw new Error(`SupabaseInventoryAdapter.reserveStockNow failed: ${error.message}`);
  }

  async consumeStock(params: {
    readonly orderId: string;
    readonly organizationId: string;
    readonly storageId?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc("consume_stock_for_order_v2", {
      p_order_id: params.orderId,
      p_storage_id: params.storageId ?? null,
    });
    if (error) throw new Error(`SupabaseInventoryAdapter.consumeStock failed: ${error.message}`);
  }

  async refundStock(params: {
    readonly orderId: string;
    readonly organizationId: string;
    readonly storageId?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc("refund_stock_for_order_v2", {
      p_order_id: params.orderId,
      p_storage_id: params.storageId ?? null,
    });
    if (error) throw new Error(`SupabaseInventoryAdapter.refundStock failed: ${error.message}`);
  }
}
