import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { handleOptions, jsonResponse } from "../_shared/adapters/infra/http-utils.ts";
import { SupabaseOrderRepository } from "../_shared/adapters/orders/SupabaseOrderRepository.ts";
import { SupabaseInventoryAdapter } from "../_shared/adapters/orders/SupabaseInventoryAdapter.ts";
import { OrderStatusEngine } from "../_shared/application/orders/OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../_shared/application/orders/HandleStockSideEffectsUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../_shared/application/orders/RecalculateOrderStatusUseCase.ts";
import { MarkOrderLabelPrintedUseCase } from "../_shared/application/orders/MarkOrderLabelPrintedUseCase.ts";

/**
 * POST /mark-labels-printed
 * Replaces the rpc_marketplace_order_print_label RPC call.
 * Marks one or more orders as label-printed and recalculates their status.
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleOptions();

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const { orderIds, organizationId } = body;

    if (!Array.isArray(orderIds) || orderIds.length === 0 || !organizationId) {
      return jsonResponse(
        { error: "Missing required fields: orderIds (non-empty array), organizationId" },
        400,
      );
    }

    const supabase = createAdminClient();
    const orderRepo = new SupabaseOrderRepository(supabase);
    const inventory = new SupabaseInventoryAdapter(supabase);
    const engine = new OrderStatusEngine();
    const stockUseCase = new HandleStockSideEffectsUseCase(inventory);
    const recalculate = new RecalculateOrderStatusUseCase(orderRepo, engine, stockUseCase);
    const markPrinted = new MarkOrderLabelPrintedUseCase(orderRepo, recalculate);

    const results = await Promise.allSettled(
      (orderIds as string[]).map((orderId) =>
        markPrinted.execute({ orderId, organizationId })
      ),
    );

    const statusChanges = results
      .map((r, i) => ({ orderId: (orderIds as string[])[i], result: r }))
      .filter(({ result }) => result.status === "fulfilled" && result.value !== null)
      .map(({ orderId, result }) => ({
        orderId,
        newStatus: (result as PromiseFulfilledResult<{ newStatus: string } | null>).value?.newStatus,
      }));

    const errors = results
      .map((r, i) => ({ orderId: (orderIds as string[])[i], result: r }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ orderId, result }) => ({
        orderId,
        error: (result as PromiseRejectedResult).reason?.message ?? "unknown error",
      }));

    if (errors.length > 0) {
      console.error("[mark-labels-printed] Partial failures:", errors);
    }

    return jsonResponse({ statusChanges, processed: orderIds.length, errors });
  } catch (error) {
    console.error("[mark-labels-printed] Error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
