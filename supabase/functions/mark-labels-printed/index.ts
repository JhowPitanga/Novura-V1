import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  jsonResponse,
  handleOptions,
} from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseOrderRepository } from "../_shared/adapters/orders/SupabaseOrderRepository.ts";
import { SupabaseInventoryAdapter } from "../_shared/adapters/orders/SupabaseInventoryAdapter.ts";
import { OrderStatusEngine } from "../_shared/application/orders/OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../_shared/application/orders/HandleStockSideEffectsUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../_shared/application/orders/RecalculateOrderStatusUseCase.ts";
import { MarkOrderLabelPrintedUseCase } from "../_shared/application/orders/MarkOrderLabelPrintedUseCase.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { orderIds, organizationId } = body;

  if (!Array.isArray(orderIds) || orderIds.length === 0 || !organizationId) {
    return jsonResponse(
      { error: "Missing required fields: orderIds (non-empty array), organizationId" },
      400,
    );
  }

  const admin = createAdminClient();
  const orderRepo = new SupabaseOrderRepository(admin);
  const inventory = new SupabaseInventoryAdapter(admin);
  const engine = new OrderStatusEngine();
  const stockEffects = new HandleStockSideEffectsUseCase(inventory);
  const recalculate = new RecalculateOrderStatusUseCase(orderRepo, engine, stockEffects);
  const useCase = new MarkOrderLabelPrintedUseCase(orderRepo, recalculate);

  try {
    const result = await useCase.execute({
      orderIds: orderIds.map((id) => String(id)),
      organizationId: String(organizationId),
    });
    return jsonResponse(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mark-labels-printed] execution failed:", message);
    return jsonResponse({ error: message }, 500);
  }
});
