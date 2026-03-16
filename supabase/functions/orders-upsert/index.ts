/**
 * orders-upsert: HTTP entrypoint. Receives UpsertOrderInput, writes to orders + order_items + order_shipping + order_status_history.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import type { UpsertOrderInput } from "../_shared/domain/orders/orders-types.ts";
import { upsertOrder } from "./upsert-order.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as UpsertOrderInput;
    const organization_id = body?.organization_id;
    const order = body?.order;
    const source = body?.source ?? "sync";

    if (!organization_id || !order?.marketplace_order_id || !order?.marketplace) {
      return jsonResponse(
        { error: "Missing organization_id, order.marketplace, or order.marketplace_order_id" },
        400,
      );
    }
    if (source !== "webhook" && source !== "sync") {
      return jsonResponse({ error: "source must be 'webhook' or 'sync'" }, 400);
    }

    const admin = createAdminClient();
    const result = await upsertOrder(admin, { organization_id, order, source });

    if (!result.success) {
      return jsonResponse(
        { success: false, order_id: result.order_id, created: false, error: result.error },
        422,
      );
    }

    return jsonResponse(
      { success: true, order_id: result.order_id, created: result.created },
      200,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[orders-upsert] unexpected_error", message);
    return jsonResponse({ success: false, order_id: null, created: false, error: message }, 500);
  }
});
