// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
console.info('server started');
Deno.serve(async (req)=>{
  function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type"
      }
    });
  }
  // AES-GCM helpers (same format as other ML functions)
  function strToUint8(str) { return new TextEncoder().encode(str); }
  function uint8ToB64(bytes) { const bin = Array.from(bytes).map((b)=>String.fromCharCode(b)).join(""); return btoa(bin); }
  function b64ToUint8(b64) { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++)bytes[i] = bin.charCodeAt(i); return bytes; }
  async function importAesGcmKey(base64Key) { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [ "encrypt", "decrypt" ]); }
  async function aesGcmEncryptToString(key, plaintext) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, strToUint8(plaintext)); const ctBytes = new Uint8Array(ct); return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(ctBytes)}`; }
  async function aesGcmDecryptFromString(key, encStr) { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }
  function b64UrlToUint8(b64url) { let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/"); const pad = b64.length % 4; if (pad) b64 += "=".repeat(4 - pad); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++)bytes[i] = bin.charCodeAt(i); return bytes; }
  function decodeJwtSub(jwt) { try { const parts = jwt.split("."); if (parts.length < 2) return null; const payloadBytes = b64UrlToUint8(parts[1]); const payload = JSON.parse(new TextDecoder().decode(payloadBytes)); return payload?.sub || payload?.user_id || null; } catch  { return null; } }
  function createLimiter(maxConcurrent) { let active = 0; const queue = []; const next = ()=>{ if (active >= maxConcurrent || queue.length === 0) return; active++; const fn = queue.shift(); fn(); }; const run = async (task)=>{ return await new Promise((resolve, reject)=>{ const start = ()=>{ task().then((v)=>{ active--; next(); resolve(v); }).catch((e)=>{ active--; next(); reject(e); }); }; queue.push(start); next(); }); }; return { run }; }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" } });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) return jsonResponse({ error: "Missing service configuration" }, 500);
    const aesKey = await importAesGcmKey(ENC_KEY_B64);
    const authHeader = req.headers.get("Authorization");
    const apiKeyHeader = req.headers.get("apikey") || "";
    const isInternalCall = req.headers.get("x-internal-call") === "1" && !!apiKeyHeader && apiKeyHeader === SERVICE_ROLE_KEY;
    if (!authHeader && !isInternalCall) return jsonResponse({ error: "Missing Authorization header" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    let body = null;
    if (req.method === "POST") {
      try { body = await req.json(); } catch  { body = null; }
    }
    const organizationId = body?.organizationId || url.searchParams.get("organizationId") || undefined;
    const debug = body?.debug === true || url.searchParams.get("debug") === "1";
    const itemIds = Array.isArray(body?.itemIds) ? body.itemIds.map((x)=>String(x)) : [];
    const force = body?.force === true;
    if (!organizationId) return jsonResponse({ error: "Missing organizationId" }, 400);
    if (!isInternalCall) {
      const tokenValue = authHeader.replace(/^Bearer\s+/i, "").trim();
      const userIdFromJwt = decodeJwtSub(tokenValue);
      if (!userIdFromJwt) return jsonResponse({ error: "Invalid Authorization token" }, 401);
      const { data: permData, error: permErr } = await admin.rpc("rpc_get_member_permissions", { p_user_id: userIdFromJwt, p_organization_id: organizationId });
      if (permErr) return jsonResponse({ error: permErr.message }, 500);
      const permRow = Array.isArray(permData) ? permData[0] : permData;
      if (!permRow?.role) return jsonResponse({ error: "Forbidden: You don't belong to this organization" }, 403);
    }
    const { data: integration, error: integErr } = await admin.from("marketplace_integrations").select("id, access_token, refresh_token, expires_in, meli_user_id, company_id").eq("organizations_id", organizationId).eq("marketplace_name", "Mercado Livre").single();
    if (integErr || !integration) return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);
    let accessToken;
    try { accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token); } catch (e) { return jsonResponse({ error: `Failed to decrypt access token: ${e instanceof Error ? e.message : String(e)}` }, 500); }
    const now = new Date();
    const expiresAt = new Date(integration.expires_in);
    if (now >= expiresAt) {
      const { data: appRow, error: appErr } = await admin.from("apps").select("client_id, client_secret").eq("name", "Mercado Livre").single();
      if (appErr || !appRow) return jsonResponse({ error: "App credentials not found for token refresh" }, 404);
      let refreshTokenPlain;
      try { refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token); } catch (e) { return jsonResponse({ error: `Failed to decrypt refresh token: ${e instanceof Error ? e.message : String(e)}` }, 500); }
      const form = new URLSearchParams();
      form.append("grant_type", "refresh_token");
      form.append("client_id", appRow.client_id);
      form.append("client_secret", appRow.client_secret);
      form.append("refresh_token", refreshTokenPlain);
      const refreshResp = await fetch("https://api.mercadolibre.com/oauth/token", { method: "POST", headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
      const refreshJson = await refreshResp.json();
      if (!refreshResp.ok) return jsonResponse({ error: "Token refresh failed", details: { meli: refreshJson } }, refreshResp.status);
      accessToken = String(refreshJson.access_token);
      const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, String(refreshJson.refresh_token));
      const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, accessToken);
      const newExpiresAtIso = new Date(Date.now() + (Number(refreshJson.expires_in) || 0) * 1000).toISOString();
      await admin.from("marketplace_integrations").update({ access_token: newAccessTokenEnc, refresh_token: newRefreshTokenEnc, expires_in: newExpiresAtIso }).eq("id", integration.id);
    }
    const sellerId = integration.meli_user_id;
    if (!sellerId) return jsonResponse({ error: "Missing meli_user_id" }, 400);
    const storesMap = new Map();
    const nodeMap = new Map();
    try {
      const storesUrl = `https://api.mercadolibre.com/users/${sellerId}/stores/search?tags=stock_location`;
      const sResp = await fetch(storesUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
      if (sResp.ok) {
        const sj = await sResp.json();
        const results = Array.isArray(sj?.results) ? sj.results : [];
        for (const st of results){ const sid = String(st?.id ?? ""); const name = String(st?.description ?? st?.location?.address_line ?? sid); const nnid = st?.network_node_id ? String(st.network_node_id) : ""; if (sid) storesMap.set(sid, name); if (nnid) nodeMap.set(nnid, name); }
      }
    } catch (_) {}
    const TTL_MS = 6 * 60 * 60 * 1000;
    const cutoffIso = new Date(Date.now() - TTL_MS).toISOString();
    let targetItems = [];
    if (itemIds.length > 0) {
      const { data: rows } = await admin.from("marketplace_items").select("marketplace_item_id, available_quantity").eq("organizations_id", organizationId).eq("marketplace_name", "Mercado Livre").in("marketplace_item_id", itemIds);
      targetItems = (rows || []).map((r)=>({ marketplace_item_id: String(r.marketplace_item_id), available_quantity: typeof r.available_quantity === "number" ? r.available_quantity : null }));
    } else {
      const { data: rows } = await admin.from("marketplace_items").select("marketplace_item_id, available_quantity, last_stock_update").eq("organizations_id", organizationId).eq("marketplace_name", "Mercado Livre").or(`last_stock_update.is.null,last_stock_update.lt.${cutoffIso}`).order("updated_at", { ascending: false }).limit(200);
      targetItems = (rows || []).map((r)=>({ marketplace_item_id: String(r.marketplace_item_id), available_quantity: typeof r.available_quantity === "number" ? r.available_quantity : null }));
    }
    const limiter = createLimiter(3);
    const results = {};
    const processOne = async (itemId, availableQty)=>{
      const classifyType = (loc)=>{
        const rawType = String(loc?.type || "").toLowerCase();
        if (rawType === "meli_facility" || rawType === "seller_warehouse" || rawType === "selling_address") return rawType;
        if (loc?.network_node_id || loc?.is_fulfillment === true) return "meli_facility";
        if (loc?.store_id || typeof loc?.id !== "undefined" && storesMap.has(String(loc.id))) return "seller_warehouse";
        if (loc?.address_id || loc?.origin_type === "address") return "selling_address";
        return "seller_warehouse";
      };
      const extractQuantity = (loc)=>{
        const candidates = [ loc?.quantity, loc?.available, loc?.available_quantity, loc?.total_available, loc?.quantity_available, loc?.channels?.mercadolibre?.available, loc?.channels?.marketplace?.available ].filter((v)=>typeof v === "number");
        const n = candidates.length > 0 ? Number(candidates[0]) : 0;
        return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
      };
      const buildRowForLoc = (loc, shippingInfo = null)=>{
        const type = classifyType(loc);
        let warehouse_id = type.toUpperCase();
        let warehouse_name = type;
        let shipping_type = null;
        
        if (type === "seller_warehouse") {
          const storeId = loc?.store_id ? String(loc.store_id) : typeof loc?.id !== "undefined" ? String(loc.id) : null;
          const nodeId = loc?.network_node_id ? String(loc.network_node_id) : null;
          warehouse_id = storeId || nodeId || "seller_warehouse";
          warehouse_name = storeId && (storesMap.get(storeId) || `Loja ${storeId}`) || nodeId && (nodeMap.get(nodeId) || nodeId) || "Armazém do Vendedor";
          // Por padrão, seller_warehouse tende a ser envio padrão (agência)
          shipping_type = "agencia";
        } else if (type === "selling_address") {
          warehouse_id = "selling_address";
          warehouse_name = "Origem do Vendedor";
          shipping_type = "flex";
        } else if (type === "meli_facility") {
          const nodeId = loc?.network_node_id ? String(loc.network_node_id) : null;
          warehouse_id = nodeId || "meli_facility";
          warehouse_name = nodeId && (nodeMap.get(nodeId) || "Fulfillment") || "Fulfillment";
          shipping_type = "full";
        }
        
        // Se temos informações de envio, usamos para determinar o tipo de envio com mais precisão
        if (shippingInfo) {
          const logisticType = String(shippingInfo?.logistic_type || "").toLowerCase();
          // Mapeamento conforme docs ML:
          // - fulfillment/fbm => full
          // - self_service => flex (ME Flex)
          // - drop_off, xd_drop_off, cross_docking => agencia (ME padrão)
          if (logisticType === "fulfillment" || logisticType === "fbm") {
            shipping_type = "full";
          } else if (logisticType === "self_service") {
            shipping_type = "flex";
          } else if (logisticType === "drop_off" || logisticType === "xd_drop_off" || logisticType === "cross_docking") {
            shipping_type = "agencia";
          }
        }
        
        const quantity = extractQuantity(loc);
        return { warehouse_id, warehouse_name, quantity, type, shipping_type };
      };
      const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
      let userProductIds = [];
      try {
        const iResp = await fetch(`https://api.mercadolibre.com/items/${itemId}`, { headers });
        const ij = await iResp.json();
        if (iResp.ok) {
          const single = ij?.user_product_id && String(ij.user_product_id) || ij?.seller_product_id && String(ij.seller_product_id) || null;
          if (single) userProductIds.push(single);
          if (Array.isArray(ij?.variations)) {
            for (const v of ij.variations){ const vUp = v?.user_product_id && String(v.user_product_id) || v?.seller_product_id && String(v.seller_product_id) || null; if (vUp) userProductIds.push(vUp); }
          }
          userProductIds = Array.from(new Set(userProductIds));
        }
      } catch (_) {}
      let locations = [];
      let summary = { locations: [], seller_id: sellerId };
      if (userProductIds.length > 0) {
        const aggregateMap = new Map();
        const summaries = [];
        for (const upId of userProductIds){
          try {
            const upUrl = `https://api.mercadolibre.com/user-products/${upId}/stock`;
            const upResp = await fetch(upUrl, { headers });
            const upJson = await upResp.json();
            const xVersion = upResp.headers.get('x-version') || null;
            if (upResp.ok) {
              summaries.push(upJson);
              let locs = [];
              if (Array.isArray(upJson?.locations)) locs = upJson.locations;
              else if (Array.isArray(upJson?.warehouses)) locs = upJson.warehouses;
              else if (Array.isArray(upJson?.stocks)) locs = upJson.stocks;
              else if (Array.isArray(upJson?.stock_by_warehouse)) locs = upJson.stock_by_warehouse;
              else if (upJson?.stock?.locations && Array.isArray(upJson.stock.locations)) locs = upJson.stock.locations;
              for (const loc of locs || []){
                const type = classifyType(loc);
                const keyParts = [ type ];
                if (loc?.store_id) keyParts.push(`store:${String(loc.store_id)}`);
                if (loc?.network_node_id) keyParts.push(`node:${String(loc.network_node_id)}`);
                if (loc?.address_id) keyParts.push(`addr:${String(loc.address_id)}`);
                const key = keyParts.join('|');
                const prev = aggregateMap.get(key) || { ...loc };
                const prevQty = extractQuantity(prev);
                const addQty = extractQuantity(loc);
                const merged = { ...prev, quantity: prevQty + addQty, available: undefined, available_quantity: undefined };
                aggregateMap.set(key, merged);
              }
            }
          } catch (_) {}
        }
        locations = Array.from(aggregateMap.values());
        summary = { locations, seller_id: sellerId, user_product_ids: userProductIds };
      }
      let inferredLogistic = null;
      let shippingInfo = null;
      try {
        const lgResp = await fetch(`https://api.mercadolibre.com/items/${itemId}/shipping`, { headers });
        const lgJson = await lgResp.json();
        if (lgResp.ok) {
          inferredLogistic = String(lgJson?.logistic_type || lgJson?.mode || "");
          shippingInfo = lgJson;
        }
      } catch (_) {}
      if (!Array.isArray(locations) || locations.length === 0) {
        const qty = typeof availableQty === "number" ? Math.max(0, Math.floor(availableQty)) : 0;
        if (inferredLogistic === "fulfillment" || inferredLogistic === "fbm" || inferredLogistic === "cross_docking" || inferredLogistic === "drop_off" || inferredLogistic === "xd_drop_off" || inferredLogistic === "self_service") {
          const type = inferredLogistic === "fulfillment" || inferredLogistic === "fbm" ? "meli_facility" : "seller_warehouse";
          locations = [ { type, quantity: qty } ];
        } else {
          // Fallback: sempre registra uma origem genérica para garantir persistência
          summary = { ...summary || {}, aggregated_quantity: qty };
          locations = [ { type: "seller_warehouse", quantity: qty } ];
        }
      }
      const nowIso = new Date().toISOString();
      const rows = locations.map((loc)=>{
        const built = buildRowForLoc(loc, shippingInfo);
        return { 
          organizations_id: organizationId, 
          marketplace_name: "Mercado Livre", 
          marketplace_item_id: itemId, 
          warehouse_id: built.warehouse_id, 
          warehouse_name: built.warehouse_name, 
          location_type: built.type, 
          quantity: built.quantity, 
          shipping_type: built.shipping_type,
          updated_at: nowIso 
        };
      });
      // Armazena os dados de debug para retornar no final se necessário
      const debugData = debug ? { ok: true, debug: true, itemId, userProductIds, inferredLogistic, computed: rows, raw: { locations, summary } } : null;
      
      // Executa as operações de banco de dados independentemente do modo de debug
      const { error: delErr } = await admin.from("marketplace_stock_distribution").delete().eq("organizations_id", organizationId).eq("marketplace_name", "Mercado Livre").eq("marketplace_item_id", itemId);
      if (delErr) console.error("Erro ao deletar registros:", delErr.message);
      
      await admin.from("marketplace_stock_distribution").delete().eq("organizations_id", organizationId).eq("marketplace_name", "Mercado Livre").eq("marketplace_item_id", itemId).in("warehouse_id", ["DEFAULT", "default"]);
      await admin.from("marketplace_stock_distribution").delete().eq("organizations_id", organizationId).eq("marketplace_name", "Mercado Livre").eq("marketplace_item_id", itemId).in("warehouse_name", ["DEFAULT", "default"]);
      
      const { error: insErr } = await admin.from("marketplace_stock_distribution").upsert(rows, { onConflict: "organizations_id,marketplace_name,marketplace_item_id,warehouse_id" });
      if (insErr) return { ok: false, error: insErr.message };
      
      // Retorna os dados de debug se estiver no modo debug
      if (debug) return debugData;
      const normalizedLocations = locations.map((loc)=>{ 
        const built = buildRowForLoc(loc, shippingInfo); 
        return { 
          ...loc, 
          type: built.type, 
          warehouse_id: built.warehouse_id, 
          warehouse_name: built.warehouse_name, 
          quantity: built.quantity,
          shipping_type: built.shipping_type
        }; 
      });
      // Agrega os tipos de envio a partir de shippingInfo e das locations normalizadas
      const shippingTypesSet = new Set<string>();
      if (shippingInfo) {
        const logisticType = String(shippingInfo?.logistic_type || "").toLowerCase();
        if (logisticType === "fulfillment" || logisticType === "fbm") shippingTypesSet.add("full");
        else if (logisticType === "self_service") shippingTypesSet.add("flex");
        else if (logisticType === "drop_off" || logisticType === "xd_drop_off" || logisticType === "cross_docking") shippingTypesSet.add("agencia");
      }
      for (const loc of normalizedLocations) {
        if (loc?.shipping_type) shippingTypesSet.add(String(loc.shipping_type));
      }
      // Se nada foi inferido, usa inferredLogistic como fallback
      if (shippingTypesSet.size === 0 && typeof inferredLogistic === "string" && inferredLogistic) {
        const lg = inferredLogistic.toLowerCase();
        if (lg === "fulfillment" || lg === "fbm") shippingTypesSet.add("full");
        else if (lg === "self_service") shippingTypesSet.add("flex");
        else if (lg === "drop_off" || lg === "xd_drop_off" || lg === "cross_docking") shippingTypesSet.add("agencia");
      }
      const shipping_types = Array.from(shippingTypesSet);
      const normalizedSummary = { ...summary || {}, locations: normalizedLocations, shipping_types };
      const { error: updErr } = await admin.from("marketplace_items").update({ stock_distribution: normalizedSummary || { locations: normalizedLocations }, shipping_types, last_stock_update: nowIso }).eq("organizations_id", organizationId).eq("marketplace_name", "Mercado Livre").eq("marketplace_item_id", itemId);
      if (updErr) return { ok: false, error: updErr.message };
      return { ok: true, count: rows.length };
    };
    for (const it of targetItems){ results[it.marketplace_item_id] = await limiter.run(()=>processOne(it.marketplace_item_id, it.available_quantity)); }
    return jsonResponse({ ok: true, processed: Object.keys(results).length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});