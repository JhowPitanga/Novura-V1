import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { getStr } from "../_shared/adapters/object-utils.ts";

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch (_) { return null; }
}


async function blockAndReserveOnFailure(admin: any, orderId: string, orgId: string | null, correlationId: string, msg?: string) {
  try { console.error("linked-products-item failure_handling_start", { correlationId, orderId, error: msg || null }); } catch (_) {}
  try {
    await admin
      .from("marketplace_orders_presented_new")
      .update({ has_unlinked_items: true })
      .eq("id", orderId);
  } catch (_) {}
  try {
    await admin
      .from("inventory_jobs")
      .insert({
        order_id: orderId,
        job_type: "reserve",
        status: msg ? "failed" : "pending",
        error_log: msg || null,
        correlation_id: correlationId,
        last_attempt_at: msg ? new Date().toISOString() : null,
      })
      .select("*")
      .limit(1);
  } catch (_) {}
  try {
    if (orgId) {
      const { data: storageId } = await admin.rpc("fn_get_default_storage", { p_org_id: orgId });
      if (storageId) {
        await admin.rpc("reserve_stock_for_order", { p_order_id: orderId, p_storage_id: storageId });
      }
    }
  } catch (_) {}
  try { console.error("linked-products-item failure_handling_done", { correlationId, orderId }); } catch (_) {}
}

serve(async (req) => {
  try {
    const preCorrId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const hdrLog = {
      host: req.headers.get("host") || null,
      "content-type": req.headers.get("content-type") || null,
      "user-agent": req.headers.get("user-agent") || null,
      authorization_present: !!req.headers.get("authorization"),
      apikey_present: !!req.headers.get("apikey"),
      "x-request-id": req.headers.get("x-request-id") || null,
      "x-correlation-id": req.headers.get("x-correlation-id") || null,
      "x-internal-call": req.headers.get("x-internal-call") || null,
    };
    try { console.log("linked-products-item inbound", { correlationId: preCorrId, method: req.method, url: req.url, headers: hdrLog }); } catch (_) {}
  } catch (_) {}
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  const admin = createAdminClient() as any;

  let lastOrderId: string | null = null;
  let lastOrgId: string | null = null;
  try {
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const bodyText = await req.text();
    try { console.log("linked-products-item body_preview", { correlationId, preview: bodyText.slice(0, 1000) }); } catch (_) {}
    const body = tryParseJson(bodyText) ?? {};
    const orderId = getStr(body, ["order_id"]);
    const itemRowId = getStr(body, ["item_row_id"]);
    const externalItemId = getStr(body, ["external_item_id"]);
    const productId = getStr(body, ["product_id"]);
    const sourceCard = getStr(body, ["source_card"]);
    try { console.log("linked-products-item parsed", { correlationId, orderId, itemRowId, externalItemId, productId, sourceCard }); } catch (_) {}
    lastOrderId = orderId;
    if (!orderId || !productId || (!itemRowId && !externalItemId)) {
      try { console.error("linked-products-item missing_fields", { correlationId, orderId, itemRowId, externalItemId, productId }); } catch (_) {}
      return jsonResponse({ ok: false, error: "Missing order_id, product_id or item identifier" }, 400);
    }

    const { data: presented, error: pErr } = await admin
      .from("marketplace_orders_presented_new")
      .select("id, organizations_id, company_id, has_unlinked_items, marketplace")
      .eq("id", orderId)
      .maybeSingle();
    if (pErr) {
      try { console.error("linked-products-item fetch_presented_error", { correlationId, error: { message: pErr.message, code: pErr.code } }); } catch (_) {}
      await blockAndReserveOnFailure(admin, orderId, null, correlationId, pErr.message);
      return jsonResponse({ ok: false, error: pErr.message }, 400);
    }
    if (!presented) {
      try { console.error("linked-products-item presented_not_found", { correlationId, orderId }); } catch (_) {}
      await blockAndReserveOnFailure(admin, orderId, null, correlationId, "Order not found");
      return jsonResponse({ ok: false, error: "Order not found" }, 404);
    }
    const orgId = presented.organizations_id as string | null;
    lastOrgId = orgId;
    const companyId = presented.company_id as string | null;

    if ((sourceCard || "").toUpperCase() === "A_VINCULAR") {
      const { data: stockRows, error: sErr } = await admin
        .from("products_stock")
        .select("available, company_id")
        .eq("product_id", productId)
        .or(`company_id.is.null,company_id.eq.${companyId || ""}`);
      if (sErr) {
        try { console.error("linked-products-item stock_fetch_error", { correlationId, error: { message: sErr.message, code: sErr.code }, productId, companyId }); } catch (_) {}
        await blockAndReserveOnFailure(admin, orderId, orgId, correlationId, sErr.message);
        return jsonResponse({ ok: false, error: sErr.message }, 400);
      }
      const totalAvailable = Array.isArray(stockRows)
        ? stockRows.reduce((acc: number, r: any) => acc + (Number(r?.available) || 0), 0)
        : 0;
      try { console.log("linked-products-item stock_total_available", { correlationId, totalAvailable, productId }); } catch (_) {}
      if (totalAvailable <= 0) {
        try { console.error("linked-products-item no_stock_for_avincular", { correlationId, productId, orderId }); } catch (_) {}
        await blockAndReserveOnFailure(admin, orderId, orgId, correlationId, "Produto sem estoque para vinculação via A VINCULAR");
        return jsonResponse({ ok: false, error: "Produto sem estoque para vinculação via A VINCULAR" }, 400);
      }
    }

    let updRes: any;
    let updatedItem: any = null;
    if (itemRowId) {
      const { data: byRow } = await admin
        .from("marketplace_order_items")
        .select("row_id, id, model_id_externo")
        .eq("row_id", itemRowId)
        .maybeSingle();
      if (byRow) {
        updRes = await admin
          .from("marketplace_order_items")
          .update({ linked_products: productId, has_unlinked_items: false })
          .eq("row_id", itemRowId)
          .select("row_id, id, linked_products, has_unlinked_items")
          .maybeSingle();
        updatedItem = updRes?.data || null;
      }
    }
    if (!updatedItem && externalItemId) {
      updRes = await admin
        .from("marketplace_order_items")
        .update({ linked_products: productId, has_unlinked_items: false })
        .eq("id", orderId)
        .eq("model_id_externo", externalItemId)
        .select("row_id, id, linked_products, has_unlinked_items")
        .maybeSingle();
      updatedItem = updRes?.data || null;
    }
    if (!updatedItem) {
      const { data: anyUnlinked } = await admin
        .from("marketplace_order_items")
        .select("row_id")
        .eq("id", orderId)
        .or("linked_products.is.null,linked_products.eq.")
        .limit(1)
        .maybeSingle();
      if (anyUnlinked?.row_id) {
        updRes = await admin
          .from("marketplace_order_items")
          .update({ linked_products: productId, has_unlinked_items: false })
          .eq("row_id", anyUnlinked.row_id)
          .select("row_id, id, linked_products, has_unlinked_items")
          .maybeSingle();
        updatedItem = updRes?.data || null;
      }
    }
    if (updRes.error) {
      try { console.error("linked-products-item update_item_error", { correlationId, orderId, itemRowId, externalItemId, productId, error: { message: updRes.error.message, code: updRes.error.code } }); } catch (_) {}
      await blockAndReserveOnFailure(admin, orderId, orgId, correlationId, updRes.error.message);
      return jsonResponse({ ok: false, error: updRes.error.message }, 400);
    }
    if (!updRes.data) {
      try { console.error("linked-products-item item_not_found_for_linking", { correlationId, orderId, itemRowId, externalItemId }); } catch (_) {}
      await blockAndReserveOnFailure(admin, orderId, orgId, correlationId, "Item not found for linking");
      return jsonResponse({ ok: false, error: "Item not found for linking" }, 404);
    }

    try {
      await admin
        .from("marketplace_order_items")
        .update({ has_unlinked_items: false })
        .eq("id", orderId)
        .not("linked_products", "is", null)
        .neq("linked_products", "");
      await admin
        .from("marketplace_order_items")
        .update({ has_unlinked_items: true })
        .eq("id", orderId)
        .or("linked_products.is.null,linked_products.eq.");
    } catch (_) {}

    const { data: aggRows, error: aggErr } = await admin
      .from("marketplace_order_items")
      .select("linked_products, has_unlinked_items")
      .eq("id", orderId);
    if (aggErr) {
      try { console.error("linked-products-item agg_items_error", { correlationId, orderId, error: { message: aggErr.message, code: aggErr.code } }); } catch (_) {}
      await blockAndReserveOnFailure(admin, orderId, orgId, correlationId, aggErr.message);
      return jsonResponse({ ok: false, error: aggErr.message }, 400);
    }
    const orderHasUnlinked = Array.isArray(aggRows)
      ? aggRows.some((r: any) => (r?.has_unlinked_items === true) || !String(r?.linked_products || "").trim())
      : false;
    const { error: upPErr } = await admin
      .from("marketplace_orders_presented_new")
      .update({ has_unlinked_items: orderHasUnlinked })
      .eq("id", orderId);
    if (upPErr) {
      try { console.error("linked-products-item update_presented_error", { correlationId, orderId, has_unlinked_items: orderHasUnlinked, error: { message: upPErr.message, code: upPErr.code } }); } catch (_) {}
      await blockAndReserveOnFailure(admin, orderId, orgId, correlationId, upPErr.message);
      return jsonResponse({ ok: false, error: upPErr.message }, 400);
    }
    try {
      let storageId: string | null = null;
      if (orgId) {
        const { data: stgId } = await admin.rpc("fn_get_default_storage", { p_org_id: orgId });
        storageId = stgId || null;
      }
      if (storageId) {
        await admin.rpc("reserve_stock_for_order", { p_order_id: orderId, p_storage_id: storageId });
        await admin
          .from("inventory_jobs")
          .update({
            status: "done",
            error_log: null,
            last_attempt_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("order_id", orderId)
          .eq("job_type", "reserve");
      }
    } catch (_) {}
    try {
      const marketplaceName = String((presented as any)?.marketplace || "");
      const fn =
        marketplaceName.toLowerCase().includes("mercado")
          ? "mercado-livre-process-presented"
          : marketplaceName.toLowerCase().includes("shopee")
          ? "shopee-process-presented"
          : null;
      if (fn) {
        try {
          await (admin as any).functions.invoke(fn, {
            body: { raw_id: orderId },
            headers: { "x-request-id": correlationId, "x-correlation-id": correlationId, "x-internal-call": "true" },
          });
        } catch (_) {}
      }
    } catch (_) {}
    try { console.log("linked-products-item success", { correlationId, orderId, item: updRes.data, has_unlinked_items: orderHasUnlinked }); } catch (_) {}

    return jsonResponse({ ok: true, order_id: orderId, item: updRes.data, has_unlinked_items: orderHasUnlinked }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try { console.error("linked-products-item unexpected_error", { error: msg }); } catch (_) {}
    try {
      const correlationId = crypto.randomUUID();
      if (lastOrderId) await blockAndReserveOnFailure(admin, lastOrderId, lastOrgId, correlationId, msg);
    } catch (_) {}
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
