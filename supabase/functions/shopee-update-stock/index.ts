/**
 * shopee-update-stock — thin HTTP wrapper for ShopeeStockProvider.
 *
 * All stock push logic lives in _shared/adapters/stock/providers/shopee.ts.
 * This function delegates immediately and returns the StockPushResult.
 *
 * Accepts two payload formats:
 *   1. Motor de Integracao (stock-sync-worker): full StockPushContext JSON
 *   2. Legacy frontend (direct call, maintained for Fase 1/2 compatibility):
 *      { organizationId, item_id, stock_list: [{ model_id, seller_stock | qty | quantity }] }
 *      In this case, a minimal StockPushContext is constructed from the legacy payload.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { getStockAdapter } from "../_shared/adapters/stock/registry.ts";
import type { StockPushContext } from "../_shared/domain/stock/ports/IStockChannelAdapter.ts";
import { getStr, getField } from "../_shared/adapters/infra/object-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await parseBody(req);
    const ctx  = buildContext(body);
    if ("error" in ctx) return jsonResponse({ ok: false, error: ctx.error }, 400);

    const provider = getStockAdapter("Shopee");
    const result   = await provider.pushStock(ctx);

    return jsonResponse(result, result.ok ? 200 : 422);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[shopee-update-stock] handler error", msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown>; } catch { return {}; }
}

function buildContext(body: Record<string, unknown>): StockPushContext | { error: string } {
  // Format 1: StockPushContext (from stock-sync-worker).
  if (body.eventId && body.integrationId && body.availableQty != null) {
    return body as unknown as StockPushContext;
  }

  // Format 2: Legacy frontend payload — build a minimal context.
  const itemId = getStr(body, ["item_id"]) || getStr(body, ["itemId"]) || "";
  if (!itemId || !/^\d+$/.test(itemId)) return { error: "Missing or invalid item_id" };

  const stockListRaw = (getField(body, "stock_list") as unknown[]) ??
                       (getField(body, "updates")    as unknown[]) ?? [];
  if (!Array.isArray(stockListRaw) || !stockListRaw.length) return { error: "Missing stock_list" };

  const first       = stockListRaw[0] as Record<string, unknown>;
  const variationId = String(getField(first, "model_id") ?? getField(first, "modelId") ?? "");
  const qty         = Number(
    getField(first, "seller_stock") ??
    getField(first, "qty") ??
    getField(first, "quantity") ?? 0
  );

  // Integration is resolved by ShopeeStockProvider from organizationId when no integrationId given.
  const integrationId = getStr(body, ["integrationId"]) || getStr(body, ["integration_id"]) || "legacy";
  const organizationId = getStr(body, ["organizationId"]) || "";

  return {
    eventId:          crypto.randomUUID(),
    organizationId,
    productId:        "",          // unknown in legacy format
    availableQty:     Math.max(0, Math.floor(qty)),
    version:          0,           // no version tracking in legacy format
    marketplaceItemId: itemId,
    variationId,
    integrationId,
  };
}
