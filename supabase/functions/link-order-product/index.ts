import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  jsonResponse,
  handleOptions,
} from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseOrderRepository } from "../_shared/adapters/orders/SupabaseOrderRepository.ts";
import { SupabaseProductLinkRepository } from "../_shared/adapters/orders/SupabaseProductLinkRepository.ts";
import { SupabaseInventoryAdapter } from "../_shared/adapters/orders/SupabaseInventoryAdapter.ts";
import { OrderStatusEngine } from "../_shared/application/orders/OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../_shared/application/orders/HandleStockSideEffectsUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../_shared/application/orders/RecalculateOrderStatusUseCase.ts";
import {
  LinkProductToOrderItemUseCase,
  type LinkProductInput,
} from "../_shared/application/orders/LinkProductToOrderItemUseCase.ts";

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

  const { orderId, orderItemId, productId, organizationId, isPermanent } = body;

  if (!orderId || !orderItemId || !productId || !organizationId) {
    return jsonResponse(
      { error: "Missing required fields: orderId, orderItemId, productId, organizationId" },
      400,
    );
  }

  const admin = createAdminClient();
  const orderRepo = new SupabaseOrderRepository(admin);
  const productLinkRepo = new SupabaseProductLinkRepository(admin);
  const inventory = new SupabaseInventoryAdapter(admin);
  const stockEffects = new HandleStockSideEffectsUseCase(inventory);
  const recalculate = new RecalculateOrderStatusUseCase(orderRepo, new OrderStatusEngine(), stockEffects);
  const useCase = new LinkProductToOrderItemUseCase(orderRepo, productLinkRepo, recalculate);

  const input: LinkProductInput = {
    orderId: String(orderId),
    orderItemId: String(orderItemId),
    productId: String(productId),
    organizationId: String(organizationId),
    isPermanent: Boolean(isPermanent),
  };

  try {
    const result = await useCase.execute(input);
    return jsonResponse(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[link-order-product] execution failed:", message);
    return jsonResponse({ error: message }, 500);
  }
});
