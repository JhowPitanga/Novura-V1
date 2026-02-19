import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-request-id, x-correlation-id, x-origin, x-internal-call",
    },
  });
}

function get(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object" || !(k in (cur as Record<string, unknown>))) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function getStr(obj: unknown, path: string[]): string | null {
  const v = get(obj, path);
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function getNum(obj: unknown, path: string[]): number | null {
  const v = get(obj, path);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const cleaned = s.replace(/[^0-9.,-]+/g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function arr(obj: unknown): any[] {
  return Array.isArray(obj) ? obj as any[] : [];
}

function sanitizeUrl(u: string | null): string | null {
  if (!u) return null;
  const s = u.replace(/[\s`]+/g, "");
  return s || null;
}

function slugify(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
}

function mlPermalink(itemId: string | null, title: string | null): string | null {
  const id = (itemId || "").trim();
  const tit = (title || "").trim();
  if (!id || !tit) return null;
  const m = id.match(/^([A-Z]+)-?(\d+)$/);
  const normalizedId = m ? `${m[1]}-${m[2]}` : id.toUpperCase();
  const slug = slugify(tit);
  return `https://produto.mercadolivre.com.br/${normalizedId}-${slug}_JM`;
}

function firstImageUrlFromOrderItem(oi: any): string | null {
  const u =
    getStr(oi, ["item","pictures","0","secure_url"]) ||
    getStr(oi, ["item","pictures","0","url"]) ||
    getStr(oi, ["item","picture_url"]) ||
    getStr(oi, ["item","thumbnail"]) ||
    getStr(oi, ["thumbnail"]) ||
    null;
  return sanitizeUrl(u);
}

serve(async (req) => {
  try {
    const preCorrId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const hdrLog = {
      host: req.headers.get("host") || null,
      "content-type": req.headers.get("content-type") || null,
      "user-agent": req.headers.get("user-agent") || null,
      "x-forwarded-for": req.headers.get("x-forwarded-for") || null,
      authorization_present: !!req.headers.get("authorization"),
      apikey_present: !!req.headers.get("apikey"),
      "x-request-id": req.headers.get("x-request-id") || null,
      "x-correlation-id": req.headers.get("x-correlation-id") || null,
      "x-internal-call": req.headers.get("x-internal-call") || null,
    };
    try { console.log("mercado-livre-process-presented inbound", { correlationId: preCorrId, method: req.method, url: req.url, headers: hdrLog }); } catch (_) {}
  } catch (_) {}
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST" && req.method !== "GET") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    try { console.error("mercado-livre-process-presented config_missing", { SUPABASE_URL_present: !!SUPABASE_URL, SERVICE_ROLE_KEY_present: !!SERVICE_ROLE_KEY }); } catch (_) {}
    return jsonResponse({ ok: false, error: "Missing service configuration" }, 200);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;

  try {
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const bodyText = await req.text();
    try { console.log("mercado-livre-process-presented body_preview", { correlationId, preview: bodyText.slice(0, 1000) }); } catch (_) {}
    const body = tryParseJson(bodyText) ?? {};
    const rawId = getStr(body, ["raw_id"]) || null;
    const orderIdOverride = getStr(body, ["order_id"]) || getStr(body, ["marketplace_order_id"]) || null;
    const debugEvents: any[] = [];
    const logEvent = (event: string, data: any = {}) => {
      const entry = { event, at: new Date().toISOString(), correlationId, ...data };
      try { console.log("mercado-livre-process-presented", entry); } catch (_) {}
      debugEvents.push(entry);
    };
    logEvent("input_received", { rawId, orderIdOverride });
    if (!rawId && !orderIdOverride) {
      logEvent("input_missing_params", { error: "Missing raw_id", correlationId });
      return jsonResponse({ ok: false, error: "Missing raw_id", correlationId }, 200);
    }

    let rec: any = null;
    if (rawId) {
      logEvent("raw_lookup_by_id_attempt", { id: rawId });
      const { data, error } = await admin
        .from("marketplace_orders_raw")
        .select("*")
        .eq("id", rawId)
        .limit(1)
        .single();
      if (error) {
        logEvent("raw_lookup_by_id_error", { id: rawId, error: { message: error.message, details: error.details, hint: error.hint, code: error.code } });
        return jsonResponse({ ok: false, error: error.message, correlationId }, 200);
      }
      rec = data;
    } else {
      logEvent("raw_lookup_by_order_id_attempt", { marketplace_order_id: orderIdOverride });
      const { data, error } = await admin
        .from("marketplace_orders_raw")
        .select("*")
        .eq("marketplace_name", "Mercado Livre")
        .eq("marketplace_order_id", orderIdOverride)
        .limit(1)
        .single();
      if (error) {
        logEvent("raw_lookup_by_order_id_error", { marketplace_order_id: orderIdOverride, error: { message: error.message, details: error.details, hint: error.hint, code: error.code } });
        return jsonResponse({ ok: false, error: error.message, correlationId }, 200);
      }
      rec = data;
    }
    if (!rec) {
      logEvent("raw_not_found", { rawId, marketplace_order_id: orderIdOverride });
      return jsonResponse({ ok: false, error: "Raw not found", correlationId }, 200);
    }
    if (String(rec.marketplace_name) !== "Mercado Livre") {
      logEvent("unsupported_marketplace", { marketplace_name: rec.marketplace_name });
      return jsonResponse({ ok: false, error: "Only Mercado Livre supported", correlationId }, 200);
    }
    logEvent("raw_loaded", { id: rec.id, marketplace: rec.marketplace_name, organizations_id: rec.organizations_id, company_id: rec.company_id });

    const data = rec.data as Record<string, unknown> | null;
    const itemsArr = Array.isArray(rec.order_items) ? rec.order_items as any[] : [];
    const itemsCount = itemsArr.length;
    const itemsCurrency = getStr(rec.order_items?.[0], ["currency_id"]) || null;

    let itemsTotalQty = 0;
    let itemsTotalAmount = 0;
    let itemsTotalFullAmount = 0;
    let itemsTotalSaleFee = 0;
    let hasVariations = false;
    let hasBundle = false;
    let hasKit = false;
    const categoryIdsSet = new Set<string>();
    const listingTypeIdsSet = new Set<string>();
    const stockNodeIdsSet = new Set<string>();
    const variationColorNamesSet = new Set<string>();
    for (const oi of itemsArr) {
      const qty = getNum(oi, ["quantity"]) ?? getNum(oi, ["requested_quantity","value"]) ?? 1;
      const unit = getNum(oi, ["unit_price"]) ?? getNum(oi, ["price"]) ?? 0;
      const fullUnit = getNum(oi, ["full_unit_price"]) ?? getNum(oi, ["unit_price"]) ?? 0;
      const saleFee = getNum(oi, ["sale_fee"]) ?? 0;
      itemsTotalQty += Number(qty || 0);
      itemsTotalAmount += Number(unit || 0) * Number(qty || 0);
      itemsTotalFullAmount += Number(fullUnit || 0) * Number(qty || 0);
      itemsTotalSaleFee += Number(saleFee || 0);
      const cat = getStr(oi, ["item","category_id"]) || getStr(oi, ["category_id"]) || null;
      if (cat) categoryIdsSet.add(cat);
      const listingType = getStr(oi, ["listing_type_id"]) || null;
      if (listingType) listingTypeIdsSet.add(listingType);
      const stockNode = getStr(oi, ["stock","node_id"]) || null;
      if (stockNode) stockNodeIdsSet.add(stockNode);
      const varId = getStr(oi, ["item","variation_id"]) || getStr(oi, ["variation_id"]) || null;
      if (varId) hasVariations = true;
      if (getStr(oi, ["bundle"])) hasBundle = true;
      if (getStr(oi, ["kit_instance_id"])) hasKit = true;
      const vAttrs = arr(get(oi, ["item","variation_attributes"]));
      for (const va of vAttrs) {
        const name = getStr(va, ["name"]) || "";
        const val = getStr(va, ["value_name"]) || "";
        if (name && val && name.toLowerCase() === "cor") variationColorNamesSet.add(val);
      }
    }

    const firstItem = itemsArr[0] || null;
    const firstItemId = firstItem ? (getStr(firstItem, ["id"]) || null) : null;
    const firstItemTitle = firstItem ? (getStr(firstItem, ["item","title"]) || getStr(firstItem, ["title"]) || null) : null;
    const firstItemSku = firstItem ? (getStr(firstItem, ["item","seller_sku"]) || getStr(firstItem, ["seller_sku"]) || null) : null;
    const firstVarIdStr = firstItem ? (getStr(firstItem, ["item","variation_id"]) || getStr(firstItem, ["variation_id"]) || null) : null;
    const firstItemVariationId = firstVarIdStr && /^\d+$/.test(firstVarIdStr) ? Number(firstVarIdStr) : null;
    const firstItemPermalink =
      mlPermalink(
        getStr(firstItem, ["item","id"]) || getStr(firstItem, ["item_id"]) || getStr(firstItem, ["id"]) || null,
        getStr(firstItem, ["item","title"]) || getStr(firstItem, ["title"]) || null
      ) || (getStr(firstItem, ["item","permalink"]) || getStr(firstItem, ["permalink"]) || null);

    const buyerIdStr = getStr(rec.buyer, ["id"]) || null;
    const idBuyer = buyerIdStr && /^\d+$/.test(buyerIdStr) ? Number(buyerIdStr) : null;
    const firstNameBuyer = getStr(rec.buyer, ["first_name"]) || null;
    const lastNameBuyer = getStr(rec.buyer, ["last_name"]) || null;
    const customerName =
      (getStr(rec.buyer, ["nickname"]) || null) ||
      (((firstNameBuyer || "") + " " + (lastNameBuyer || "")).trim() || null);

    const shipCity = getStr(data, ["shipping","receiver_address","city"]) || null;
    const shipStateName = getStr(data, ["shipping","receiver_address","state","name"]) || null;
    const shipStateUf = getStr(data, ["shipping","receiver_address","state","id"]) || null;
    const streetName =
      getStr(rec.shipments?.[0], ["destination","shipping_address","street_name"]) ||
      getStr(rec.shipments?.[0], ["receiver_address","street_name"]) ||
      getStr(data, ["shipping","receiver_address","street_name"]) ||
      getStr(data, ["shipping","shipping_address","street_name"]) || null;
    const streetNumber =
      getStr(rec.shipments?.[0], ["destination","shipping_address","street_number"]) ||
      getStr(rec.shipments?.[0], ["receiver_address","street_number"]) ||
      getStr(data, ["shipping","receiver_address","street_number"]) ||
      getStr(data, ["shipping","shipping_address","street_number"]) || null;
    const neighborhoodName =
      getStr(rec.shipments?.[0], ["destination","shipping_address","neighborhood","name"]) ||
      getStr(rec.shipments?.[0], ["receiver_address","neighborhood","name"]) ||
      getStr(data, ["shipping","receiver_address","neighborhood","name"]) ||
      getStr(data, ["shipping","shipping_address","neighborhood","name"]) ||
      getStr(rec.shipments?.[0], ["destination","shipping_address","neighborhood","id"]) ||
      getStr(rec.shipments?.[0], ["receiver_address","neighborhood","id"]) || null;
    const zipCode =
      getStr(rec.shipments?.[0], ["destination","shipping_address","zip_code"]) ||
      getStr(rec.shipments?.[0], ["receiver_address","zip_code"]) ||
      getStr(data, ["shipping","receiver_address","zip_code"]) ||
      getStr(data, ["shipping","shipping_address","zip_code"]) || null;
    const comment =
      getStr(rec.shipments?.[0], ["destination","shipping_address","comment"]) ||
      getStr(rec.shipments?.[0], ["receiver_address","comment"]) ||
      getStr(data, ["shipping","receiver_address","comment"]) ||
      getStr(data, ["shipping","shipping_address","comment"]) || null;
    const addressLine =
      getStr(rec.shipments?.[0], ["destination","shipping_address","address_line"]) ||
      getStr(rec.shipments?.[0], ["receiver_address","address_line"]) ||
      getStr(data, ["shipping","receiver_address","address_line"]) ||
      getStr(data, ["shipping","shipping_address","address_line"]) || null;

    const shippingType = getStr(data, ["shipping","logistic_type"]) || getStr(rec.shipments?.[0], ["logistic","type"]) || null;
    const shipmentStatus =
      (getStr(rec.shipments?.[0], ["status"]) || "").toLowerCase() ||
      (getStr(data, ["shipping","status"]) || "").toLowerCase();
    const shipmentSubstatus =
      (getStr(rec.shipments?.[0], ["substatus"]) || "").toLowerCase() ||
      (getStr(data, ["shipping","substatus"]) || "").toLowerCase();
    const shippingMethodName = getStr(rec.shipments?.[0], ["shipping_option","name"]) || null;
    const estimatedDeliveryLimitAt = getStr(rec.shipments?.[0], ["shipping_option","estimated_delivery_limit","date"]) || null;
    const shipmentSlaStatus = getStr(rec.shipments?.[0], ["sla","status"]) || getStr(rec.shipments?.[0], ["sla_status"]) || null;
    const shipmentSlaService = getStr(rec.shipments?.[0], ["sla","service"]) || getStr(rec.shipments?.[0], ["sla_service"]) || null;
    const shipmentSlaExpectedDate = getStr(rec.shipments?.[0], ["sla","expected_date"]) || null;
    const shipmentSlaLastUpdated = getStr(rec.shipments?.[0], ["sla","last_updated"]) || null;
    const shipmentDelays = Array.isArray(rec.shipments?.[0]?.delays) ? rec.shipments[0].delays : [];

    const paymentsArr = Array.isArray(rec.payments) ? rec.payments as any[] : [];
    let paymentStatus: string | null = null;
    let paymentTotalPaidAmount: number | null = null;
    let paymentMarketplaceFee: number | null = null;
    let paymentShippingCost: number | null = null;
    let paymentDateCreated: string | null = null;
    let paymentDateApproved: string | null = null;
    let isCancelled = (String(rec.status || "").toLowerCase() === "cancelled");
    let isRefunded = false;
    for (const p of paymentsArr) {
      const st = (getStr(p, ["status"]) || "").toLowerCase();
      if (st) paymentStatus = st;
      const tpaid = getNum(p, ["total_paid_amount"]) ?? getNum(p, ["transaction_amount"]) ?? null;
      if (tpaid !== null) paymentTotalPaidAmount = tpaid;
      const mfee = getNum(p, ["marketplace_fee"]) ?? null;
      if (mfee !== null) paymentMarketplaceFee = mfee;
      const scost = getNum(p, ["shipping_cost"]) ?? null;
      if (scost !== null) paymentShippingCost = scost;
      const dcr = getStr(p, ["date_created"]) || null;
      if (dcr) paymentDateCreated = dcr;
      const dap = getStr(p, ["date_approved"]) || getStr(p, ["date_last_modified"]) || null;
      if (dap) paymentDateApproved = dap;
      if (st === "cancelled") isCancelled = true;
      if (st === "refunded") isRefunded = true;
    }
    const refundedAmount = getNum(get(data, ["refunds"]) as any, ["0","amount"]) ?? null;

    const printedLabel = shipmentSubstatus === "printed";
    const printedSchedule = null;

    const packIdRaw = getStr(data, ["pack_id","id"]) || getStr(data, ["pack_id"]) || null;
    const packId = (() => {
      if (packIdRaw && /^\d+$/.test(packIdRaw)) return packIdRaw;
      const oid = getStr(rec, ["marketplace_order_id"]) || null;
      return oid;
    })();

    let unlinkedItemsCount = 0;
    let linkedProducts: any[] = [];
    try {
      const parsedItems = itemsArr.map((oi) => ({
        item_id_text: getStr(oi, ["item","id"]) || getStr(oi, ["item_id"]) || getStr(oi, ["id"]) || "",
        variation_id_text: (getStr(oi, ["item","variation_id"]) || getStr(oi, ["variation_id"]) || "").trim(),
        seller_sku_text: (getStr(oi, ["item","seller_sku"]) || getStr(oi, ["seller_sku"]) || "").trim(),
      }));
      const ephLinksRaw = Array.isArray(rec.linked_products) ? rec.linked_products as any[] : [];
      const presentedRowPrev = await admin.from("marketplace_orders_presented_new").select("linked_products").eq("id", rec.id).limit(1).single();
      const ephLinksPrev = Array.isArray(presentedRowPrev.data?.linked_products) ? presentedRowPrev.data.linked_products as any[] : [];
      const ephLinksAll = [...ephLinksRaw, ...ephLinksPrev];
      const ephLinks = ephLinksAll.map((e: any) => ({
        marketplace_item_id: getStr(e, ["marketplace_item_id"]) || "",
        variation_id: getStr(e, ["variation_id"]) || "",
        product_id: (getStr(e, ["product_id"]) || "").trim(),
      }));
      for (const it of parsedItems) {
        const { data: miplRows } = await admin
          .from("marketplace_item_product_links")
          .select("product_id")
          .eq("organizations_id", rec.organizations_id)
          .eq("marketplace_name", rec.marketplace_name)
          .eq("marketplace_item_id", it.item_id_text)
          .eq("variation_id", it.variation_id_text)
          .limit(1);
        const permProductId = Array.isArray(miplRows) && miplRows[0]?.product_id ? String(miplRows[0].product_id) : null;
        const ephProductId = ephLinks.find((e) => e.marketplace_item_id === it.item_id_text && e.variation_id === it.variation_id_text)?.product_id || null;
        const productId = permProductId || ephProductId || null;
        if (!productId && !it.seller_sku_text && it.item_id_text) {
          unlinkedItemsCount += 1;
        }
        let productSku: string | null = null;
        if (productId) {
          const { data: prod } = await admin.from("products").select("sku").eq("id", productId).limit(1).single();
          productSku = prod?.sku || null;
        }
        const source = permProductId ? "permanent" : (ephProductId ? "ephemeral" : null);
        linkedProducts.push({
          marketplace_item_id: it.item_id_text,
          variation_id: it.variation_id_text,
          product_id: productId,
          sku: productSku,
          source,
        });
      }
    } catch (_) {}
    const hasUnlinkedItems = unlinkedItemsCount > 0;

    const isFull = (String(shippingType || "").toLowerCase() === "fulfillment");
    const isReturned = (shipmentStatus === "not_delivered" && shipmentSubstatus === "returned_to_warehouse");
    let statusInterno: string;
    if (isCancelled || isRefunded) statusInterno = "Cancelado";
    else if (isReturned) statusInterno = "Devolução";
    else if (isFull) statusInterno = "Enviado";
    else if (shipmentStatus === "ready_to_ship" && shipmentSubstatus === "invoice_pending") statusInterno = "Emissao NF";
    else if (shipmentStatus === "ready_to_ship" && shipmentSubstatus === "ready_to_print") statusInterno = "Impressao";
    else if (shipmentStatus === "ready_to_ship" && printedLabel) statusInterno = "Aguardando Coleta";
    else if (shipmentStatus === "ready_to_ship" && shipmentSubstatus === "dropped_off" && (String(rec.status || "").toLowerCase() === "paid" || String(paymentStatus || "") === "paid")) statusInterno = "Enviado";
    else if (["shipped","dropped_off","in_transit","handed_to_carrier","on_route","out_for_delivery","delivery_in_progress","collected","delivered"].includes(shipmentStatus)) statusInterno = "Enviado";
    else if (shipmentStatus === "pending" && shipmentSubstatus === "buffered" && hasUnlinkedItems) statusInterno = "A vincular";
    else if (hasUnlinkedItems) statusInterno = "A vincular";
    else statusInterno = "Pendente";

    const createdAtIso = rec.date_created || null;
    const lastUpdatedIso = rec.last_updated || null;
    const orderTotal = getNum(data, ["total_amount"]) ?? null;

    const receiverObj = (get(rec.billing_info, ["receiver"]) as any) || null;
    const shipmentsBil = arr(get(rec.billing_info, ["shipments"]));
    const receiverFallback = (() => {
      for (const bi of shipmentsBil) {
        const r1 = get(bi, ["receiver"]);
        if (r1 && typeof r1 === "object") return r1;
        const r2 = get(bi, ["receiver_tax"]);
        if (r2 && typeof r2 === "object") return r2;
      }
      return null;
    })();
    const receiver = receiverObj || receiverFallback;
    const billingDocumentObj = (() => {
      const d = get(receiver, ["document"]);
      return d && typeof d === "object" ? (d as any) : null;
    })();
    const billingDocNumber =
      getStr(billingDocumentObj, ["value"]) ||
      getStr(receiver, ["document","value"]) ||
      getStr(receiver, ["doc_number"]) ||
      getStr(receiver, ["document_number"]) ||
      getStr(receiver, ["tax_id"]) ||
      getStr(receiver, ["number"]) ||
      null;
    const billingDocTypeRaw =
      getStr(billingDocumentObj, ["id"]) ||
      getStr(receiver, ["document","id"]) ||
      getStr(receiver, ["doc_type"]) ||
      getStr(receiver, ["document_type"]) ||
      getStr(receiver, ["type"]) ||
      null;
    const billingDocTypeBuyerRaw =
      getStr(rec.buyer, ["billing_info","doc_type"]) ||
      getStr(data, ["buyer","billing_info","doc_type"]) ||
      null;
    const billingDocType = (() => {
      const tRaw = billingDocTypeRaw || billingDocTypeBuyerRaw || null;
      const t = tRaw ? String(tRaw).toUpperCase() : null;
      if (t) return t;
      const dn = billingDocNumber || "";
      const digits = dn.replace(/[^0-9]+/g, "");
      if (digits.length === 11) return "CPF";
      if (digits.length === 14) return "CNPJ";
      return null;
    })();
    const billingName =
      getStr(receiver, ["name"]) ||
      getStr(receiver, ["full_name"]) ||
      customerName ||
      null;
    const billingAddressObj = (() => {
      const a = get(receiver, ["address"]);
      return a && typeof a === "object" ? a as any : null;
    })();

    const presentedRow = {
      id: rec.id,
      organizations_id: rec.organizations_id,
      company_id: rec.company_id,
      marketplace: rec.marketplace_name,
      marketplace_order_id: rec.marketplace_order_id,
      status: rec.status || null,
      status_detail: String(rec.status_detail || ""),
      order_total: orderTotal,
      shipping_type: shippingType,
      customer_name: customerName || null,
      billing_doc_number: billingDocNumber,
      billing_doc_type: billingDocType,
      billing_name: billingName,
      billing_address: billingAddressObj,
      id_buyer: idBuyer,
      first_name_buyer: firstNameBuyer,
      last_name_buyer: lastNameBuyer,
      shipping_city_name: shipCity,
      shipping_state_name: shipStateName,
      shipping_state_uf: shipStateUf,
      shipping_street_name: streetName,
      shipping_street_number: streetNumber,
      shipping_neighborhood_name: neighborhoodName,
      shipping_zip_code: zipCode,
      shipping_comment: comment,
      shipping_address_line: addressLine,
      shipment_status: shipmentStatus,
      shipment_substatus: shipmentSubstatus,
      shipping_method_name: shippingMethodName,
      estimated_delivery_limit_at: estimatedDeliveryLimitAt,
      shipment_sla_status: shipmentSlaStatus,
      shipment_sla_service: shipmentSlaService,
      shipment_sla_expected_date: shipmentSlaExpectedDate,
      shipment_sla_last_updated: shipmentSlaLastUpdated,
      shipment_delays: shipmentDelays,
      printed_label: printedLabel,
      printed_schedule: printedSchedule,
      payment_status: paymentStatus,
      payment_total_paid_amount: paymentTotalPaidAmount,
      payment_marketplace_fee: paymentMarketplaceFee,
      payment_shipping_cost: paymentShippingCost,
      payment_date_created: paymentDateCreated,
      payment_date_approved: paymentDateApproved,
      payment_refunded_amount: refundedAmount,
      items_count: itemsCount,
      items_total_quantity: itemsTotalQty,
      items_total_amount: itemsTotalAmount,
      items_total_full_amount: itemsTotalFullAmount,
      items_total_sale_fee: itemsTotalSaleFee,
      items_currency_id: itemsCurrency,
      first_item_id: firstItemId,
      first_item_title: firstItemTitle,
      first_item_sku: firstItemSku,
      first_item_variation_id: firstItemVariationId,
      first_item_permalink: firstItemPermalink,
      variation_color_names: Array.from(variationColorNamesSet),
      category_ids: Array.from(categoryIdsSet),
      listing_type_ids: Array.from(listingTypeIdsSet),
      stock_node_ids: Array.from(stockNodeIdsSet),
      has_variations: hasVariations,
      has_bundle: hasBundle,
      has_kit: hasKit,
      pack_id: packId,
      label_cached: false,
      label_response_type: null,
      label_fetched_at: null,
      label_size_bytes: null,
      label_content_base64: null,
      label_content_type: null,
      label_pdf_base64: null,
      label_zpl2_base64: null,
      unlinked_items_count: unlinkedItemsCount,
      has_unlinked_items: hasUnlinkedItems,
      linked_products: linkedProducts,
      created_at: createdAtIso,
      last_updated: lastUpdatedIso,
      last_synced_at: rec.last_synced_at,
      status_interno: statusInterno,
    };

    if ((body && (body.status_only === true || String(body.status_only || '') === 'true'))) {
      const upOnly = await admin
        .from("marketplace_orders_presented_new")
        .update({ status_interno: statusInterno })
        .eq("id", rec.id);
      if (upOnly.error) {
        logEvent("presented_status_update_error", { error: { message: upOnly.error.message, details: upOnly.error.details, hint: upOnly.error.hint, code: upOnly.error.code } });
        return jsonResponse({ ok: false, error: upOnly.error.message });
      }
      logEvent("presented_status_update_ok", { id: rec.id, status_interno: statusInterno });
      return jsonResponse({ ok: true, id: rec.id, status_interno: statusInterno });
    }

    const upsertPresented = await admin
      .from("marketplace_orders_presented_new")
      .upsert(presentedRow, { onConflict: "id" });
    if (upsertPresented.error) {
      logEvent("presented_upsert_error", { error: { message: upsertPresented.error.message, details: upsertPresented.error.details, hint: upsertPresented.error.hint, code: upsertPresented.error.code } });
    } else {
      logEvent("presented_upsert_ok", { id: rec.id });
    }

    let itemsJson: any[] = itemsArr;
    let itemsSource: string | null = "order_items";
    const packIdLog = packId || null;
    if (packIdLog) {
      logEvent("items_delete_attempt_by_pack_id", { packId: packIdLog });
      const del1 = await admin.from("marketplace_order_items").delete().eq("pack_id", packIdLog);
      if (del1.error) {
        logEvent("items_delete_error_by_pack_id", { packId: packIdLog, error: { message: del1.error.message, details: del1.error.details, hint: del1.error.hint, code: del1.error.code } });
      } else {
        logEvent("items_delete_ok_by_pack_id", { packId: packIdLog });
      }
    }
    logEvent("items_delete_attempt_by_order_id", { id: rec.id });
    const del2 = await admin.from("marketplace_order_items").delete().eq("id", rec.id);
    if (del2.error) {
      logEvent("items_delete_error_by_order_id", { id: rec.id, error: { message: del2.error.message, details: del2.error.details, hint: del2.error.hint, code: del2.error.code } });
    } else {
      logEvent("items_delete_ok_by_order_id", { id: rec.id });
    }
    if (itemsJson.length > 0) {
      const preview = itemsJson.map((oi, idx) => {
        const qty = getNum(oi, ["quantity"]) ?? getNum(oi, ["requested_quantity","value"]) ?? 1;
        const unit = getNum(oi, ["unit_price"]) ?? getNum(oi, ["price"]) ?? 0;
        return {
          id: rec.id,
          idx,
          model_sku_externo: (getStr(oi, ["item","seller_sku"]) || getStr(oi, ["seller_sku"]) || "").trim() || null,
          model_id_externo: (getStr(oi, ["item","variation_id"]) || getStr(oi, ["item","id"]) || getStr(oi, ["item_id"]) || getStr(oi, ["id"]) || "").trim() || null,
          variation_name: (() => {
            const vAttrs = arr(get(oi, ["item","variation_attributes"]));
            const cor = vAttrs.find((v: any) => (getStr(v, ["name"]) || "").toLowerCase() === "cor");
            return cor ? (getStr(cor, ["value_name"]) || null) : null;
          })(),
          pack_id: packId,
          item_name: (getStr(oi, ["item","title"]) || getStr(oi, ["title"]) || "").trim() || null,
          quantity: Number(qty || 1),
          unit_price: Number(unit || 0),
          image_url: firstImageUrlFromOrderItem(oi),
        };
      });
      logEvent("items_mapped_preview", { packId: packId, itemsSource, count: preview.length, preview });
      const rows = itemsJson.map((oi) => {
        const qty = getNum(oi, ["quantity"]) ?? getNum(oi, ["requested_quantity","value"]) ?? 1;
        const unit = getNum(oi, ["unit_price"]) ?? getNum(oi, ["price"]) ?? 0;
        return {
          id: rec.id,
          model_sku_externo: (getStr(oi, ["item","seller_sku"]) || getStr(oi, ["seller_sku"]) || "").trim() || null,
          model_id_externo: (getStr(oi, ["item","variation_id"]) || getStr(oi, ["item","id"]) || getStr(oi, ["item_id"]) || getStr(oi, ["id"]) || "").trim() || null,
          variation_name: (() => {
            const vAttrs = arr(get(oi, ["item","variation_attributes"]));
            const cor = vAttrs.find((v: any) => (getStr(v, ["name"]) || "").toLowerCase() === "cor");
            return cor ? (getStr(cor, ["value_name"]) || null) : null;
          })(),
          pack_id: packId,
          item_name: (getStr(oi, ["item","title"]) || getStr(oi, ["title"]) || "").trim() || null,
          quantity: Number(qty || 1),
          unit_price: Number(unit || 0),
          image_url: firstImageUrlFromOrderItem(oi),
        };
      });
      const insBulk = await admin.from("marketplace_order_items").insert(rows);
      if (insBulk.error) {
        logEvent("items_insert_bulk_error", { error: { message: insBulk.error.message, details: insBulk.error.details, hint: insBulk.error.hint, code: insBulk.error.code } });
        const successes: number[] = [];
        const failures: Array<{ index: number; error: any; row: any }> = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const insOne = await admin.from("marketplace_order_items").insert([r]);
          if (insOne.error) {
            failures.push({ index: i, error: { message: insOne.error.message, details: insOne.error.details, hint: insOne.error.hint, code: insOne.error.code }, row: r });
          } else {
            successes.push(i);
          }
        }
        logEvent("items_insert_fallback_result", { successesCount: successes.length, failuresCount: failures.length, failuresIndices: failures.map((f) => f.index), failures });
        return jsonResponse({
          ok: successes.length === rows.length,
          raw_id: rec.id,
          pack_id: packId,
          items_inserted: successes.length,
          correlationId,
          items_source: itemsSource,
          presented_upsert_error: upsertPresented.error ? { message: upsertPresented.error.message, code: upsertPresented.error.code } : null,
          debug: debugEvents
        }, 200);
      } else {
        logEvent("items_insert_bulk_ok", { count: rows.length });
      }
    }

    try {
      const { data: aggRows, error: aggErr } = await admin
        .from("marketplace_order_items")
        .select("linked_products, has_unlinked_items")
        .eq("id", rec.id);
      if (!aggErr && Array.isArray(aggRows)) {
        const orderHasUnlinked = aggRows.some((r: any) => (r?.has_unlinked_items === true) || !String(r?.linked_products || "").trim());
        const { data: presRow } = await admin
          .from("marketplace_orders_presented_new")
          .select("status_interno")
          .eq("id", rec.id)
          .limit(1)
          .single();
        const currentStatus = String(presRow?.status_interno || "");
        const isFull = (String(shippingType || "").toLowerCase() === "fulfillment");
        const isReturned = (shipmentStatus === "not_delivered" && shipmentSubstatus === "returned_to_warehouse");
        const nextStatusInterno =
          isCancelled || isRefunded ? "Cancelado" :
          isReturned ? "Devolução" :
          isFull ? "Enviado" :
          (shipmentStatus === "ready_to_ship" && shipmentSubstatus === "invoice_pending") ? "Emissao NF" :
          (shipmentStatus === "ready_to_ship" && shipmentSubstatus === "ready_to_print") ? "Impressao" :
          (shipmentStatus === "ready_to_ship" && printedLabel) ? "Aguardando Coleta" :
          (shipmentStatus === "ready_to_ship" && shipmentSubstatus === "dropped_off" && (String(rec.status || "").toLowerCase() === "paid" || String(paymentStatus || "") === "paid")) ? "Enviado" :
          (["shipped","dropped_off","in_transit","handed_to_carrier","on_route","out_for_delivery","delivery_in_progress","collected","delivered"].includes(shipmentStatus)) ? "Enviado" :
          (shipmentStatus === "pending" && shipmentSubstatus === "buffered" && orderHasUnlinked) ? "A vincular" :
          orderHasUnlinked ? "A vincular" :
          "Pendente";
        if (currentStatus !== nextStatusInterno || typeof presRow?.status_interno === "undefined") {
          await admin
            .from("marketplace_orders_presented_new")
            .update({ status_interno: nextStatusInterno, has_unlinked_items: orderHasUnlinked })
            .eq("id", rec.id);
          logEvent("status_interno_refreshed_from_items", { id: rec.id, prev: currentStatus, next: nextStatusInterno, has_unlinked_items: orderHasUnlinked });
        } else {
          await admin
            .from("marketplace_orders_presented_new")
            .update({ has_unlinked_items: orderHasUnlinked })
            .eq("id", rec.id);
          logEvent("has_unlinked_items_refreshed_from_items", { id: rec.id, has_unlinked_items: orderHasUnlinked });
        }
      } else {
        logEvent("items_agg_error", { error: { message: aggErr?.message, code: aggErr?.code } });
      }
    } catch (_) {}

    try {
      const permanentLinks = Array.isArray(linkedProducts) ? linkedProducts.filter((lp: any) => lp && lp.source === "permanent" && lp.product_id) : [];
      const itemsForRpc = permanentLinks.map((lp: any) => {
        let qtyTotal = 0;
        for (const oi of itemsArr) {
          const itemId = getStr(oi, ["item","id"]) || getStr(oi, ["item_id"]) || getStr(oi, ["id"]) || null;
          const varId = (getStr(oi, ["item","variation_id"]) || getStr(oi, ["variation_id"]) || "").trim();
          if (itemId === lp.marketplace_item_id && varId === lp.variation_id) {
            const q = getNum(oi, ["quantity"]) ?? getNum(oi, ["requested_quantity","value"]) ?? 1;
            qtyTotal += Number(q || 1);
          }
        }
        return {
          product_id: lp.product_id,
          quantity: Math.max(1, qtyTotal || 1),
          marketplace_item_id: lp.marketplace_item_id,
          variation_id: lp.variation_id || "",
          permanent: true,
        };
      });
      if (itemsForRpc.length > 0) {
        let storageId: string | null = null;
        try {
          const { data: stgId } = await admin.rpc("fn_get_default_storage", { p_org_id: rec.organizations_id });
          storageId = stgId || null;
        } catch (_) {}
        const { data: reservaResult, error: reservaErr } = await admin.rpc("fn_order_reserva_stock_linked", { p_order_id: rec.id, p_items: itemsForRpc, p_storage_id: storageId });
        if (reservaErr || (reservaResult && (reservaResult as any)?.ok === false)) {
          const rawMsg = reservaErr?.message || ((reservaResult as any)?.error) || null;
          logEvent("fn_order_reserva_stock_linked_error", { order_id: rec.id, error: rawMsg });
        } else {
          logEvent("fn_order_reserva_stock_linked_ok", { order_id: rec.id, reserved_items: itemsForRpc.length });
        }
      } else {
        logEvent("fn_order_reserva_stock_linked_skipped", { order_id: rec.id, reason: "no_permanent_links" });
      }
    } catch (_) {
      logEvent("fn_order_reserva_stock_linked_exception", { order_id: rec.id });
    }

    return jsonResponse({
      ok: true,
      raw_id: rec.id,
      pack_id: packId,
      items_inserted: itemsJson.length,
      correlationId,
      items_source: itemsSource,
      presented_upsert_error: upsertPresented.error ? { message: upsertPresented.error.message, code: upsertPresented.error.code } : null,
      debug: debugEvents
    }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try { console.error("mercado-livre-process-presented unexpected_error", { error: msg }); } catch (_) {}
    return jsonResponse({ ok: false, error: msg }, 200);
  }
});
