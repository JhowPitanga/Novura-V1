import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-request-id, x-correlation-id, x-origin",
    },
  });
}

function getField(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
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

function parseBrAddress(addr: string | null): { street_name: string | null; street_number: string | null; neighborhood_name: string | null } {
  if (!addr) return { street_name: null, street_number: null, neighborhood_name: null };
  const s = addr.trim();
  let street_name: string | null = null;
  let street_number: string | null = null;
  let neighborhood_name: string | null = null;
  const cepMatch = s.match(/\b\d{5}-?\d{3}\b/);
  const cleaned = (cepMatch ? s.replace(cepMatch[0], "") : s).trim();
  const parts = cleaned.split(/\s*-\s*/);
  const firstSeg = (parts[0] || cleaned).trim();
  const m = firstSeg.match(/^(.+?)[, ]+(\d+\w*)/);
  if (m) {
    street_name = m[1].trim();
    street_number = m[2].trim();
  } else {
    const m2 = firstSeg.match(/^(.+?)(?:,|$)/);
    if (m2) street_name = m2[1].trim();
    const m3 = firstSeg.match(/(\d+\w*)/);
    if (m3) street_number = m3[1].trim();
  }
  const neighSeg = parts.length > 1 ? parts[1] : null;
  if (neighSeg) neighborhood_name = String(neighSeg).trim();
  if (neighborhood_name && /\b(cidade|estado|uf)\b/i.test(neighborhood_name)) neighborhood_name = null;
  return { street_name: street_name || null, street_number: street_number || null, neighborhood_name: neighborhood_name || null };
}

function toIsoFromEpochSec(s: string | null): string | null {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
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

function brUfFromState(s: string | null): string | null {
  if (!s) return null;
  const k = s.trim().toLowerCase();
  const map: Record<string, string> = {
    "acre": "AC",
    "alagoas": "AL",
    "amapa": "AP",
    "amapá": "AP",
    "amazonas": "AM",
    "bahia": "BA",
    "ceara": "CE",
    "ceará": "CE",
    "distrito federal": "DF",
    "espirito santo": "ES",
    "espírito santo": "ES",
    "goias": "GO",
    "goiás": "GO",
    "maranhao": "MA",
    "maranhão": "MA",
    "mato grosso": "MT",
    "mato grosso do sul": "MS",
    "minas gerais": "MG",
    "para": "PA",
    "pará": "PA",
    "paraiba": "PB",
    "paraíba": "PB",
    "parana": "PR",
    "paraná": "PR",
    "pernambuco": "PE",
    "piaui": "PI",
    "piauí": "PI",
    "rio de janeiro": "RJ",
    "rio grande do norte": "RN",
    "rio grande do sul": "RS",
    "rondonia": "RO",
    "rondônia": "RO",
    "roraima": "RR",
    "santa catarina": "SC",
    "sao paulo": "SP",
    "são paulo": "SP",
    "sergipe": "SE",
    "tocantins": "TO",
  };
  return map[k] || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ ok: false, error: "Missing service configuration" }, 200);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;

  try {
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const bodyText = await req.text();
    const body = tryParseJson(bodyText) ?? {};
    const rawId = getStr(body, ["raw_id"]) || getStr(body, ["p_order_id"]) || getStr(body, ["order_id"]) || null;
    const orderSnOverride = getStr(body, ["order_sn"]) || null;
    const debugEvents: any[] = [];
    const logEvent = (event: string, data: any = {}) => {
      const entry = { event, at: new Date().toISOString(), correlationId, ...data };
      try { console.log("shopee-process-presented", entry); } catch (_) {}
      debugEvents.push(entry);
    };
    logEvent("input_received", { rawId, orderSnOverride });
    if (!rawId && !orderSnOverride) return jsonResponse({ ok: false, error: "Missing raw_id", correlationId }, 200);

    let rec: any = null;
    if (rawId) {
      const { data, error } = await admin
        .from("marketplace_orders_raw")
        .select("*")
        .eq("id", rawId)
        .limit(1)
        .single();
      if (error) return jsonResponse({ ok: false, error: error.message, correlationId }, 200);
      rec = data;
    } else {
      const { data, error } = await admin
        .from("marketplace_orders_raw")
        .select("*")
        .eq("marketplace_name", "Shopee")
        .eq("marketplace_order_id", orderSnOverride)
        .limit(1)
        .single();
      if (error) return jsonResponse({ ok: false, error: error.message, correlationId }, 200);
      rec = data;
    }
    if (!rec) return jsonResponse({ ok: false, error: "Raw not found", correlationId }, 200);
    if (String(rec.marketplace_name) !== "Shopee") return jsonResponse({ ok: false, error: "Only Shopee supported", correlationId }, 200);
    logEvent("raw_loaded", { id: rec.id, marketplace: rec.marketplace_name, organizations_id: rec.organizations_id, company_id: rec.company_id });

    const data = rec.data as Record<string, unknown> | null;
    const shpOrderStatusRaw = getStr(data, ["order_detail","order_status"]) || getStr(data, ["order_list_item","order_status"]) || getStr(data, ["notification","order_status"]) || getStr(data, ["notification","status"]) || "";
    const shpOrderStatus = (shpOrderStatusRaw || "").toLowerCase();
    logEvent("status_detected", { shpOrderStatusRaw, shpOrderStatus });
    if (shpOrderStatus === "unpaid") return jsonResponse({ ok: true, skipped: true, reason: "unpaid", correlationId }, 200);

    const packId = (getStr(data, ["order_detail","order_sn"]) || getStr(data, ["order_list_item","order_sn"]) || getStr(data, ["notification","order_sn"]) || String(rec.marketplace_order_id) || "").trim() || null;
    logEvent("pack_id_detected", { packId });

    const orderTotal =
      getNum(data, ["order_detail","order_selling_price"]) ??
      getNum(data, ["escrow_detail","response","order_income","order_selling_price"]) ??
      getNum(data, ["order_list_item","order_selling_price"]) ??
      getNum(data, ["notification","order_selling_price"]) ?? null;
    const paymentTotal = orderTotal ?? null;

    const customerName = getStr(data, ["order_detail","buyer_username"]) || getStr(data, ["order_list_item","buyer_username"]) || getStr(data, ["notification","buyer_username"]) || "";
    const buyerIdStr = getStr(data, ["order_detail","buyer_user_id"]) || getStr(data, ["order_list_item","buyer_user_id"]) || null;
    const buyerId = buyerIdStr && /^\d+$/.test(buyerIdStr) ? Number(buyerIdStr) : null;
    const buyerCpfId = getStr(data, ["order_detail","buyer_cpf_id"]) || null;

    const city = getStr(data, ["order_detail","recipient_address","city"]) || getStr(data, ["order_list_item","recipient_address","city"]) || null;
    const town = getStr(data, ["order_detail","recipient_address","town"]) || getStr(data, ["order_list_item","recipient_address","town"]) || null;
    const region = getStr(data, ["order_detail","recipient_address","region"]) || getStr(data, ["order_list_item","recipient_address","region"]) || null;
    const stateName = region || null;
    const stateUf = null;
    const zip = getStr(data, ["order_detail","recipient_address","zipcode"]) || getStr(data, ["order_list_item","recipient_address","zipcode"]) || null;
    const addressLine = getStr(data, ["order_detail","recipient_address","full_address"]) || getStr(data, ["order_list_item","recipient_address","full_address"]) || null;
    const invRoot0 = get(data, ["buyer_invoice_info"]);
    const invRoot = (typeof invRoot0 === "object" && invRoot0 !== null)
      ? (get(invRoot0, ["response"]) ?? get(invRoot0, ["data"]) ?? invRoot0)
      : null;
    const invAddr = (typeof invRoot === "object" && invRoot !== null)
      ? (get(invRoot, ["invoice_address"]) ?? get(invRoot, ["address"]) ?? get(invRoot, ["shipping_address"]) ?? invRoot)
      : null;
    const invStreetName = getStr(invAddr as any, ["street_name"]) || getStr(invAddr as any, ["street"]) || null;
    const invStreetNumber = getStr(invAddr as any, ["street_number"]) || getStr(invAddr as any, ["number"]) || null;
    const invNeighborhood =
      getStr(invAddr as any, ["neighborhood","name"]) ||
      getStr(invAddr as any, ["neighborhood_name"]) ||
      getStr(invAddr as any, ["neighborhood"]) ||
      getStr(invAddr as any, ["district"]) || null;
    const invZip =
      getStr(invAddr as any, ["zip_code"]) ||
      getStr(invAddr as any, ["zipcode"]) ||
      getStr(invAddr as any, ["postal_code"]) || null;
    const invAddressLine =
      getStr(invAddr as any, ["address_line"]) ||
      getStr(invAddr as any, ["address1"]) ||
      getStr(invAddr as any, ["address"]) || null;
    const invComment = getStr(invAddr as any, ["comment"]) || getStr(invRoot as any, ["comment"]) || null;
    const pdl = Array.isArray(get(data, ["package_detail_list"])) ? (get(data, ["package_detail_list"]) as any[]) : [];
    const pkg = pdl.length ? pdl[0] : null;
    const pkgAddr = pkg ? (get(pkg, ["recipient_address"]) as any) : null;
    const pkgFullAddress = getStr(pkgAddr, ["full_address"]) || null;
    const pkgCity = getStr(pkgAddr, ["city"]) || null;
    const pkgState = getStr(pkgAddr, ["state"]) || null;
    const pkgZip = getStr(pkgAddr, ["zipcode"]) || null;
    const pkgDistrict = getStr(pkgAddr, ["district"]) || null;
    const pkgTown = getStr(pkgAddr, ["town"]) || null;
    const pkgName = getStr(pkgAddr, ["name"]) || null;
    const pkgPhone = getStr(pkgAddr, ["phone"]) || null;
    const addressLineFinal = pkgFullAddress || invAddressLine || addressLine;
    const parsed = parseBrAddress(addressLineFinal);
    const streetNameFinal = invStreetName || parsed.street_name || null;
    const streetNumberFinal = invStreetNumber || parsed.street_number || null;
    const neighborhoodFinal = pkgDistrict || pkgTown || invNeighborhood || parsed.neighborhood_name || null;
    const cityFinal = pkgCity || city;
    const stateNameFinal = pkgState || stateName;
    const stateUfFinal = brUfFromState(stateNameFinal);
    const zipFinal = pkgZip || invZip || zip;

    const logisticsStatusLower = (getStr(data, ["order_detail","logistics_status"]) || getStr(data, ["order_list_item","logistics_status"]) || "").toLowerCase();
    const logisticsStatusRaw =
      getStr(data, ["order_detail","package_list","0","logistics_status"]) ||
      (typeof get(data, ["order_detail","package_list"]) === "object" ? getStr(data, ["order_detail","package_list","logistics_status"]) : null) ||
      getStr(data, ["order_list_item","package_list","0","logistics_status"]) ||
      (typeof get(data, ["order_list_item","package_list"]) === "object" ? getStr(data, ["order_list_item","package_list","logistics_status"]) : null) ||
      null;

    const createdAtIso = toIsoFromEpochSec(getStr(data, ["order_detail","create_time"]) || getStr(data, ["order_list_item","create_time"]) || null) || rec.date_created || null;
    const lastUpdatedIso = toIsoFromEpochSec(getStr(data, ["order_detail","update_time"]) || getStr(data, ["order_list_item","update_time"]) || null) || rec.last_updated || null;

    const itemListDetail = get(data, ["order_detail","item_list"]);
    const itemsArr = Array.isArray(itemListDetail) ? itemListDetail as any[] : [];
    const itemsCount = itemsArr.length;

    let itemsTotalQty = 0;
    let itemsTotalAmount = 0;
    let itemsTotalFullAmount = 0;
    let hasVariations = false;
    for (const oi of itemsArr) {
      const qty =
        getNum(oi, ["model_quantity_purchased"]) ??
        getNum(oi, ["quantity"]) ?? 1;
      const pricePref =
        getNum(oi, ["item_price"]) ??
        getNum(oi, ["original_price"]) ?? 0;
      const fullPref =
        getNum(oi, ["original_price"]) ??
        getNum(oi, ["item_price"]) ?? 0;
      itemsTotalQty += Number(qty || 0);
      itemsTotalAmount += Number(pricePref || 0) * Number(qty || 0);
      itemsTotalFullAmount += Number(fullPref || 0) * Number(qty || 0);
      if ((getStr(oi, ["model_id"]) || "").trim()) hasVariations = true;
    }
    const itemsCurrency = getStr(data, ["order_detail","currency"]) || getStr(data, ["escrow_detail","currency"]) || getStr(data, ["order_list_item","currency"]) || null;

    const firstItem = itemsArr[0] || null;
    const firstItemId = firstItem ? (getStr(firstItem, ["item_id"]) || null) : null;
    const firstItemTitle = firstItem ? (getStr(firstItem, ["item_name"]) || null) : null;
    const firstItemSku = firstItem ? ((getStr(firstItem, ["model_sku"]) || getStr(firstItem, ["sku"]) || null)) : null;
    const firstVarIdStr = firstItem ? (getStr(firstItem, ["model_id"]) || null) : null;
    const firstItemVariationId = firstVarIdStr && /^\d+$/.test(firstVarIdStr) ? Number(firstVarIdStr) : null;
    const variationColorNames = itemsArr.map((x) => (getStr(x, ["model_name"]) || "").trim()).filter((s) => !!s).filter((v, i, a) => a.indexOf(v) === i);

    let unlinkedItemsCount = 0;
    const linkedProducts: any[] = [];
    let ephVarToProdPersist = new Map<string, string>();
    try {
      const { data: moiRows } = await admin
        .from("marketplace_order_items")
        .select("model_id_externo, linked_products")
        .eq("id", rec.id);
      const ephVarToProd = new Map<string, string>();
      for (const r of Array.isArray(moiRows) ? moiRows : []) {
        const vid = (getStr(r, ["model_id_externo"]) || "").trim();
        const pid = (getStr(r, ["linked_products"]) || "").trim();
        if (vid && pid) ephVarToProd.set(vid, pid);
      }
      ephVarToProdPersist = ephVarToProd;
      const parsedItems = itemsArr.map((oi) => ({
        item_id_text: getStr(oi, ["item_id"]) || "",
        variation_id_text: (getStr(oi, ["model_id"]) || "").trim(),
        seller_sku_text: (getStr(oi, ["model_sku"]) || getStr(oi, ["sku"]) || "").trim(),
      }));
      const ephLinksRaw = Array.isArray(rec.linked_products) ? rec.linked_products as any[] : [];
      const ephLinks = ephLinksRaw.map((e: any) => ({
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
        const ephProductIdMoi = ephVarToProd.get(it.variation_id_text) || null;
        const ephProductIdRaw = ephLinks.find((e) => e.marketplace_item_id === it.item_id_text && e.variation_id === it.variation_id_text)?.product_id || null;
        const productId = permProductId || ephProductIdMoi || ephProductIdRaw || null;
        if (!productId && !it.seller_sku_text && it.item_id_text) {
          unlinkedItemsCount += 1;
        }
        let productSku: string | null = null;
        if (productId) {
          const { data: prod } = await admin.from("products").select("sku").eq("id", productId).limit(1).single();
          productSku = prod?.sku || null;
        }
        const source = permProductId ? "permanent" : ((ephProductIdMoi || ephProductIdRaw) ? "ephemeral" : null);
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

    const statusInterno =
      shpOrderStatus === "cancelled" || shpOrderStatus === "in_cancel" ? "Cancelado" :
      shpOrderStatus === "to_return" ? "Devolução" :
      ((shpOrderStatus === "ready_to_ship" || ["logistics_ready","logistics_request_created"].includes(logisticsStatusLower)) && hasUnlinkedItems) ? "A vincular" :
      (shpOrderStatus === "ready_to_ship" && ((getStr(data, ["order_detail","invoice_data","invoice_status"]) || "").toLowerCase() === "pending" || (getStr(data, ["order_detail","invoice_data","invoice_status"]) || "").toLowerCase() === "invoice_pending" || !getStr(data, ["order_detail","invoice_data","invoice_number"]))) ? "Emissao NF" :
      (["ready_to_ship","processed"].includes(shpOrderStatus) || ["logistics_ready","logistics_request_created"].includes(logisticsStatusLower)) ? "Impressao" :
      shpOrderStatus === "retry_ship" ? "Aguardando Coleta" :
      (["shipped","to_confirm_receive","completed"].includes(shpOrderStatus) || Boolean(getStr(data, ["order_detail","pickup_done_time"]))) ? "Enviado" :
      "Pendente";

    if ((body && (body.status_only === true || String(body.status_only || '') === 'true'))) {
      const upOnly = await admin
        .from("marketplace_orders_presented_new")
        .update({ status_interno: statusInterno })
        .eq("id", rec.id);
      if (upOnly.error) {
        try { console.error("shopee-process-presented presented_status_update_error", { error: { message: upOnly.error.message, code: upOnly.error.code } }); } catch (_) {}
        return jsonResponse({ ok: false, error: upOnly.error.message });
      }
      try { console.log("shopee-process-presented presented_status_update_ok", { id: rec.id, status_interno: statusInterno }); } catch (_) {}
      return jsonResponse({ ok: true, id: rec.id, status_interno: statusInterno });
    }

    const presentedRow = {
      id: rec.id,
      organizations_id: rec.organizations_id,
      company_id: rec.company_id,
      marketplace: rec.marketplace_name,
      marketplace_order_id: rec.marketplace_order_id,
      status: rec.status || shpOrderStatus,
      status_detail: String(rec.status_detail || ""),
      order_total: orderTotal,
      shipping_type: getStr(data, ["order_detail","shipping_carrier"]) || getStr(data, ["order_list_item","shipping_carrier"]) || getStr(data, ["notification","shipping_carrier"]) || null,
      customer_name: customerName || null,
      id_buyer: buyerId,
      first_name_buyer: null,
      last_name_buyer: null,
      shipping_city_name: cityFinal,
      shipping_state_name: stateNameFinal,
      shipping_state_uf: stateUfFinal,
      shipping_street_name: streetNameFinal,
      shipping_street_number: streetNumberFinal,
      shipping_neighborhood_name: neighborhoodFinal,
      shipping_zip_code: zipFinal,
      shipping_comment: invComment,
      shipping_address_line: addressLineFinal,
      shipment_status: logisticsStatusRaw,
      shipment_substatus: null,
      shipping_method_name: getStr(data, ["order_detail","shipping_carrier"]) || getStr(data, ["order_list_item","shipping_carrier"]) || null,
      estimated_delivery_limit_at: null,
      shipment_sla_status: null,
      shipment_sla_service: null,
      shipment_sla_expected_date: null,
      shipment_sla_last_updated: lastUpdatedIso,
      shipment_delays: [],
      printed_label: false,
      printed_schedule: null,
      payment_status: null,
      payment_total_paid_amount: paymentTotal,
      payment_marketplace_fee: null,
      payment_shipping_cost: null,
      payment_date_created: null,
      payment_date_approved: null,
      payment_refunded_amount: null,
      items_count: itemsCount,
      items_total_quantity: itemsTotalQty,
      items_total_amount: itemsTotalAmount,
      items_total_full_amount: itemsTotalFullAmount,
      items_total_sale_fee: (getNum(data, ["escrow_detail","response","order_income","commission_fee"]) ?? 0) + (getNum(data, ["escrow_detail","response","order_income","service_fee"]) ?? 0),
      items_currency_id: itemsCurrency,
      first_item_id: firstItemId,
      first_item_title: firstItemTitle,
      first_item_sku: firstItemSku,
      first_item_variation_id: firstItemVariationId,
      first_item_permalink: null,
      variation_color_names: variationColorNames,
      category_ids: [],
      listing_type_ids: [],
      stock_node_ids: [],
      has_variations: hasVariations,
      has_bundle: false,
      has_kit: false,
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
      billing_doc_number: buyerCpfId,
      billing_doc_type: buyerCpfId ? "cpf" : null,
      billing_name: pkgName || (customerName || null),
      billing_phone: pkgPhone,
      tracking_number:
        getStr(data, ["order_detail","tracking_number"]) ||
        getStr(data, ["order_detail","package_list","0","tracking_number"]) ||
        getStr(data, ["notification","tracking_number"]) ||
        getStr(data, ["notification","tracking_no"]) ||
        null,
      shipping_info: (get(data, ["shipping_parameter","response"]) ?? get(data, ["shipping_parameter"]) ?? null) as any,
    };

    const upsertPresented = await admin
      .from("marketplace_orders_presented_new")
      .upsert(presentedRow, { onConflict: "id" });
    if (upsertPresented.error) {
      logEvent("presented_upsert_error", { error: { message: upsertPresented.error.message, details: upsertPresented.error.details, hint: upsertPresented.error.hint, code: upsertPresented.error.code } });
    } else {
      logEvent("presented_upsert_ok", { id: rec.id });
    }

    let itemsJson: any[] = [];
    let itemsSource: string | null = null;
    const c1 = get(data, ["order_detail","item_list"]);
    const c2 = get(data, ["order_list_item","item_list"]);
    const c3 = get(data, ["notification","item_list"]);
    const c4 = get(data, ["escrow_detail","response","order_income","items"]);
    if (Array.isArray(c1) && c1.length > 0) { itemsJson = c1 as any[]; itemsSource = "order_detail.item_list"; }
    else if (Array.isArray(c2) && c2.length > 0) { itemsJson = c2 as any[]; itemsSource = "order_list_item.item_list"; }
    else if (Array.isArray(c3) && c3.length > 0) { itemsJson = c3 as any[]; itemsSource = "notification.item_list"; }
    else if (Array.isArray(c4) && c4.length > 0) { itemsJson = c4 as any[]; itemsSource = "escrow_detail.response.order_income.items"; }
    logEvent("items_source_detected", { itemsSource, count: itemsJson.length });
    if (packId && itemsJson.length > 0) {
      logEvent("items_delete_attempt", { packId });
      const del = await admin.from("marketplace_order_items").delete().eq("pack_id", packId);
      if (del.error) {
        logEvent("items_delete_error", { packId, error: { message: del.error.message, details: del.error.details, hint: del.error.hint, code: del.error.code } });
      } else {
        logEvent("items_delete_ok", { packId });
      }
      const preview = itemsJson.map((oi, idx) => {
        const qty =
          getNum(oi, ["model_quantity_purchased"]) ??
          getNum(oi, ["quantity"]) ?? 1;
        const unit =
          getNum(oi, ["model_discounted_price"]) ??
          getNum(oi, ["discounted_price"]) ??
          getNum(oi, ["item_price"]) ??
          getNum(oi, ["selling_price"]) ?? 0;
        return {
          id: rec.id,
          idx,
          model_sku_externo: (getStr(oi, ["model_sku"]) || "").trim() || null,
          model_id_externo: (getStr(oi, ["model_id"]) || getStr(oi, ["item_id"]) || getStr(oi, ["order_item_id"]) || "").trim() || null,
          variation_name: (getStr(oi, ["model_name"]) || "").trim() || null,
          pack_id: packId,
          item_name: (getStr(oi, ["item_name"]) || "").trim() || null,
          quantity: Number(qty || 1),
          unit_price: Number(unit || 0),
          image_url: sanitizeUrl(getStr(oi, ["image_info","image_url"]) || null),
        };
      });
      logEvent("items_mapped_preview", { packId, itemsSource, count: preview.length, preview });
      const rows = itemsJson.map((oi) => {
        const qty =
          getNum(oi, ["model_quantity_purchased"]) ??
          getNum(oi, ["quantity"]) ?? 1;
        const unit =
          getNum(oi, ["model_discounted_price"]) ??
          getNum(oi, ["discounted_price"]) ??
          getNum(oi, ["item_price"]) ??
          getNum(oi, ["selling_price"]) ?? 0;
        return {
          id: rec.id,
          model_sku_externo: (getStr(oi, ["model_sku"]) || "").trim() || null,
          model_id_externo: (getStr(oi, ["model_id"]) || getStr(oi, ["item_id"]) || getStr(oi, ["order_item_id"]) || "").trim() || null,
          variation_name: (getStr(oi, ["model_name"]) || "").trim() || null,
          pack_id: packId,
          item_name: (getStr(oi, ["item_name"]) || "").trim() || null,
          quantity: Number(qty || 1),
          unit_price: Number(unit || 0),
          image_url: sanitizeUrl(getStr(oi, ["image_info","image_url"]) || null),
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
        try {
          for (const [vid, pid] of ephVarToProdPersist.entries()) {
            const { error: updErr } = await admin
              .from("marketplace_order_items")
              .update({ linked_products: pid, has_unlinked_items: false })
              .eq("id", rec.id)
              .eq("model_id_externo", vid);
            if (updErr) logEvent("items_reapply_link_error", { variation_id: vid, error: { message: updErr.message, code: updErr.code } });
          }
          logEvent("items_reapply_link_ok", { reapplied: ephVarToProdPersist.size });
        } catch (_) {}
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
        let nfSubmissionStatus: string | null = null;
        try {
          const { data: nfRow } = await admin
            .from("notas_fiscais")
            .select("marketplace_submission_status")
            .eq("company_id", rec.company_id)
            .eq("marketplace_order_id", rec.marketplace_order_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          nfSubmissionStatus = nfRow ? String((nfRow as any)?.marketplace_submission_status || "") : null;
        } catch (_) {}
        const invoiceStatus = (getStr(data, ["order_detail","invoice_data","invoice_status"]) || "").toLowerCase();
        const hasInvoiceNumber = !!getStr(data, ["order_detail","invoice_data","invoice_number"]);
        const nextStatusInterno =
          shpOrderStatus === "cancelled" || shpOrderStatus === "in_cancel" ? "Cancelado" :
          shpOrderStatus === "to_return" ? "Devolução" :
          ((shpOrderStatus === "ready_to_ship" || ["logistics_ready","logistics_request_created"].includes(logisticsStatusLower)) && orderHasUnlinked) ? "A vincular" :
          (shpOrderStatus === "ready_to_ship" && (invoiceStatus === "pending" || invoiceStatus === "invoice_pending" || !hasInvoiceNumber)) ? "Emissao NF" :
          (["ready_to_ship","processed"].includes(shpOrderStatus) || ["logistics_ready","logistics_request_created"].includes(logisticsStatusLower)) ? "Impressao" :
          shpOrderStatus === "retry_ship" ? "Aguardando Coleta" :
          (["shipped","to_confirm_receive","completed"].includes(shpOrderStatus) || Boolean(getStr(data, ["order_detail","pickup_done_time"]))) ? "Enviado" :
          "Pendente";
        const nfSubLower = String(nfSubmissionStatus || "").toLowerCase();
        const isSubmitLocked = /subir\s+xml/i.test(currentStatus) && (nfSubLower === "pending" || nfSubLower === "sent");
        const finalStatusInterno = isSubmitLocked ? currentStatus : nextStatusInterno;
        if (currentStatus !== finalStatusInterno || typeof presRow?.status_interno === "undefined") {
          await admin
            .from("marketplace_orders_presented_new")
            .update({ status_interno: finalStatusInterno, has_unlinked_items: orderHasUnlinked })
            .eq("id", rec.id);
          logEvent("status_interno_refreshed_from_items", { id: rec.id, prev: currentStatus, next: finalStatusInterno, has_unlinked_items: orderHasUnlinked });
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
      await (admin as any).functions.invoke("inventory-jobs-worker", {
        body: { order_id: rec.id },
        headers: { "x-request-id": correlationId, "x-correlation-id": correlationId, "x-internal-call": "true" },
      });
      logEvent("inventory_jobs_worker_invoked", { order_id: rec.id });
    } catch (_) {
      logEvent("inventory_jobs_worker_invoke_failed", { order_id: rec.id });
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
    return jsonResponse({ ok: false, error: msg }, 200);
  }
});
