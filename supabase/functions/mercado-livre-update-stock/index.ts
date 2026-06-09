/**
 * mercado-livre-update-stock — thin HTTP wrapper for MercadoLivreStockProvider.
 *
 * All stock push logic lives in _shared/adapters/stock/providers/mercado-livre.ts.
 * This function delegates immediately and returns the StockPushResult.
 *
 * Called by:
 *   - stock-sync-worker (primary path): receives a full StockPushContext
 *   - Admin panel / manual reconciliation: same payload format
 *
 * NOT responsible for updating title, price, images, description, or other
 * listing fields — that remains the responsibility of mercado-livre-update-item-fields.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { getStockAdapter } from "../_shared/adapters/stock/registry.ts";
import type { StockPushContext } from "../_shared/domain/stock/ports/IStockChannelAdapter.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await parseBody(req);
    const ctx  = validateContext(body);
    if ("error" in ctx) return jsonResponse({ ok: false, error: ctx.error }, 400);

    const provider = getStockAdapter("Mercado Livre");
    const result   = await provider.pushStock(ctx);

    return jsonResponse(result, result.ok ? 200 : 422);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[mercado-livre-update-stock] handler error", msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown>; } catch { return {}; }
}

function validateContext(body: Record<string, unknown>): StockPushContext | { error: string } {
  if (!body.eventId)          return { error: "Missing eventId" };
  if (!body.integrationId)    return { error: "Missing integrationId" };
  if (!body.marketplaceItemId) return { error: "Missing marketplaceItemId" };
  if (body.availableQty == null) return { error: "Missing availableQty" };
  if (body.version == null)   return { error: "Missing version" };
  return body as unknown as StockPushContext;
}
