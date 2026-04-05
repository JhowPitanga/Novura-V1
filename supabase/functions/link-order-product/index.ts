import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { handleOptions, jsonResponse } from "../_shared/adapters/infra/http-utils.ts";
import { SupabaseOrderRepository } from "../_shared/adapters/orders/SupabaseOrderRepository.ts";
import { SupabaseProductLinkRepository } from "../_shared/adapters/orders/SupabaseProductLinkRepository.ts";
import { SupabaseInventoryAdapter } from "../_shared/adapters/orders/SupabaseInventoryAdapter.ts";
import { OrderStatusEngine } from "../_shared/application/orders/OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../_shared/application/orders/HandleStockSideEffectsUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../_shared/application/orders/RecalculateOrderStatusUseCase.ts";
import { LinkProductToOrderItemUseCase } from "../_shared/application/orders/LinkProductToOrderItemUseCase.ts";

/**
 * POST /link-order-product
 * Replaces legacy linked_products_item edge function.
 * Receives a batch of product-to-order-item links, persists them,
 * and triggers status recalculation when all items are linked.
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleOptions();

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const { orderId, organizationId, marketplace, links } = body;

    if (!orderId || !organizationId || !marketplace || !Array.isArray(links) || links.length === 0) {
      return jsonResponse(
        { error: "Missing required fields: orderId, organizationId, marketplace, links" },
        400,
      );
    }

    const supabase = createAdminClient();
    const useCase = buildLinkUseCase(supabase);

    const result = await useCase.execute({ orderId, organizationId, marketplace, links });
    return jsonResponse(result);
  } catch (error) {
    console.error("[link-order-product] Error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});

function buildLinkUseCase(supabase: ReturnType<typeof createAdminClient>): LinkProductToOrderItemUseCase {
  const orderRepo = new SupabaseOrderRepository(supabase);
  const linkRepo = new SupabaseProductLinkRepository(supabase);
  const inventory = new SupabaseInventoryAdapter(supabase);
  const engine = new OrderStatusEngine();
  const stockUseCase = new HandleStockSideEffectsUseCase(inventory);
  const recalculate = new RecalculateOrderStatusUseCase(orderRepo, engine, stockUseCase);
  return new LinkProductToOrderItemUseCase(orderRepo, linkRepo, recalculate);
}
