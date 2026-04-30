/**
 * Cycle 0: Unified ML/Shopee webhook receiver (thin).
 * Responsibility: validate → route payload → enqueue minimal OrderSyncQueueMessage → return 200.
 * No marketplace API calls, token lookup, normalization or DB writes besides the queue.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  jsonResponse,
  handleOptions,
} from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { getField, getStr } from "../_shared/adapters/infra/object-utils.ts";
import { hmacSha256Hex } from "../_shared/adapters/infra/token-utils.ts";
import {
  isMlOrderNotificationPayload,
  extractOrderIdFromMlResource,
} from "../_shared/domain/ml/ml-order-notification.types.ts";
import {
  isShopeeOrderPushPayload,
  getShopeePushOrderSn,
  getShopeePushShopId,
} from "../_shared/domain/shopee/shopee-order-push.types.ts";
import { SupabaseOrdersQueueAdapter } from "../_shared/adapters/orders-queue/orders-queue-adapter.ts";
import type { OrderSyncQueueMessage } from "../_shared/domain/orders/order-queue-message.types.ts";

const ML_TOPICS = new Set(["orders_v2", "orders"]);

async function validateShopeeSignature(
  bodyText: string,
  key: string | undefined,
  sig: string | null,
): Promise<boolean> {
  if (!key) {
    console.warn(
      "[orders-webhook] SHOPEE_LIVE_PUSH_PARTNER_KEY not set — skipping signature validation (dev mode)",
    );
    return true;
  }
  if (!sig) return true; // no signature header = accept (partner key present but no sig means non-push call)
  const computed = await hmacSha256Hex(key, bodyText);
  return sig === computed || sig.toLowerCase() === computed.toLowerCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const encKeyB64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!encKeyB64) {
    return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);
  }

  const bodyText = await req.text();
  let body: Record<string, unknown>;
  try {
    body = (JSON.parse(bodyText || "{}") ?? {}) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const admin = createAdminClient();
  const queue = new SupabaseOrdersQueueAdapter(admin);

  // --- Route: Mercado Livre ---
  const topic = getStr(body, ["topic"]);
  const isML =
    req.headers.get("x-source") === "mercado_livre" ||
    (topic != null &&
      ML_TOPICS.has(topic) &&
      getStr(body, ["resource"]) != null &&
      getField(body, "user_id") != null);

  if (isML) {
    if (!isMlOrderNotificationPayload(body)) {
      return jsonResponse(
        { ok: false, error: "Invalid ML payload structure" },
        400,
      );
    }
    const orderId = extractOrderIdFromMlResource(body.resource);
    if (!orderId) {
      return jsonResponse(
        { ok: false, error: "Cannot extract order_id from resource" },
        400,
      );
    }

    const event: OrderSyncQueueMessage = {
      marketplace: "mercado_livre",
      marketplace_order_id: orderId,
      meli_user_id: String((body as { user_id: unknown }).user_id),
    };
    await queue.enqueue(event);
    return jsonResponse({ ok: true, queued: true }, 200);
  }

  // --- Route: Shopee ---
  const hasShopId =
    getField(body, "shop_id") != null ||
    getStr(body, ["data", "shop_id"]) != null;
  const hasOrderSn =
    getStr(body, ["order_sn"]) != null ||
    getStr(body, ["ordersn"]) != null ||
    getField(body, "code") != null;

  if (hasShopId && hasOrderSn) {
    const liveKey = Deno.env.get("SHOPEE_LIVE_PUSH_PARTNER_KEY");
    const providedSig =
      req.headers.get("x-shopee-signature") ??
      req.headers.get("x-shopee-sign") ??
      null;
    if (
      liveKey &&
      providedSig &&
      !(await validateShopeeSignature(bodyText, liveKey, providedSig))
    ) {
      return jsonResponse({ error: "Invalid Shopee signature" }, 401);
    }
    if (!isShopeeOrderPushPayload(body)) {
      return jsonResponse(
        { ok: false, error: "Invalid Shopee payload structure" },
        400,
      );
    }
    const orderSn = getShopeePushOrderSn(body);
    const shopId = getShopeePushShopId(body);
    if (!orderSn || shopId == null) {
      return jsonResponse(
        { ok: false, error: "Missing order_sn or shop_id" },
        400,
      );
    }

    const event: OrderSyncQueueMessage = {
      marketplace: "shopee",
      order_sn: orderSn,
      shop_id: shopId,
    };
    await queue.enqueue(event);
    return jsonResponse({ ok: true, queued: true }, 200);
  }

  return jsonResponse({ error: "Unknown webhook payload" }, 400);
});

