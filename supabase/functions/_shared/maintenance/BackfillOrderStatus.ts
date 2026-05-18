import { createAdminClient } from "../adapters/infra/supabase-client.ts";
import { SupabaseOrderRepository } from "../adapters/orders/SupabaseOrderRepository.ts";
import { SupabaseInventoryAdapter } from "../adapters/orders/SupabaseInventoryAdapter.ts";
import { HandleStockSideEffectsUseCase } from "../application/orders/HandleStockSideEffectsUseCase.ts";
import { OrderStatusEngine } from "../application/orders/OrderStatusEngine.ts";
import { RecalculateOrderStatusUseCase } from "../application/orders/RecalculateOrderStatusUseCase.ts";

const BATCH_SIZE = 50;

/**
 * Backfills orders.status for rows still null, in resilient batches.
 * Uses Promise.allSettled so one failed order does not stop a batch.
 */
export async function backfillOrderStatus(): Promise<{
  scanned: number;
  processed: number;
  failed: number;
}> {
  const admin = createAdminClient();
  const orderRepo = new SupabaseOrderRepository(admin);
  const inventory = new SupabaseInventoryAdapter(admin);
  const stockEffects = new HandleStockSideEffectsUseCase(inventory);
  const recalculate = new RecalculateOrderStatusUseCase(orderRepo, new OrderStatusEngine(), stockEffects);

  let scanned = 0;
  let processed = 0;
  let failed = 0;
  let offset = 0;

  while (true) {
    const { data, error } = await admin
      .from("orders")
      .select("id")
      .is("status", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error) throw new Error(`BackfillOrderStatus read failed: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;
    const settled = await Promise.allSettled(
      data.map((row) => recalculate.execute(String((row as { id: string }).id))),
    );
    for (const item of settled) {
      if (item.status === "fulfilled") processed += 1;
      else failed += 1;
    }
    offset += BATCH_SIZE;
  }
  return { scanned, processed, failed };
}
