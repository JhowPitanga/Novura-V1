// deno-lint-ignore-file no-explicit-any
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmEncryptToString, aesGcmDecryptFromString } from "../_shared/adapters/token-utils.ts";

function b64UrlToUint8(b64url: string): Uint8Array { let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/"); const pad = b64.length % 4; if (pad) b64 += "=".repeat(4 - pad); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
function decodeJwtSub(jwt: string): string | null { try { const parts = jwt.split("."); if (parts.length < 2) return null; const payloadBytes = b64UrlToUint8(parts[1]); const payload = JSON.parse(new TextDecoder().decode(payloadBytes)); return payload?.sub || payload?.user_id || null; } catch { return null; } }
function createLimiter(maxConcurrent: number) { let active = 0; const queue: (() => void)[] = []; const next = () => { if (active >= maxConcurrent || queue.length === 0) return; active++; const fn = queue.shift()!; fn(); }; const run = async <T>(task: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => { const start = () => { task().then((v) => { active--; next(); resolve(v); }).catch((e) => { active--; next(); reject(e); }); }; queue.push(start); next(); }); return { run }; }

console.info('server started');
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return handleOptions();
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
    const admin = createAdminClient();
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
    // Flags globais de capacidades de envio do seller (derivadas de shipping_preferences)
    let caps = {
      flex_enabled: null as boolean | null,
      envios_enabled: null as boolean | null,
      correios_enabled: null as boolean | null,
      full_enabled: null as boolean | null,
    };
    try {
      const storesUrl = `https://api.mercadolibre.com/users/${sellerId}/stores/search?tags=stock_location`;
      const sResp = await fetch(storesUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
      if (sResp.ok) {
        const sj = await sResp.json();
        const results = Array.isArray(sj?.results) ? sj.results : [];
        for (const st of results){ const sid = String(st?.id ?? ""); const name = String(st?.description ?? st?.location?.address_line ?? sid); const nnid = st?.network_node_id ? String(st.network_node_id) : ""; if (sid) storesMap.set(sid, name); if (nnid) nodeMap.set(nnid, name); }
      }
    } catch (_) {}
    // Buscar shipping_preferences do seller e persistir flags agregadas
    try {
      const prefsUrl = `https://api.mercadolibre.com/users/${sellerId}/shipping_preferences`;
      const pResp = await fetch(prefsUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
      const pJson = await pResp.json();
      if (pResp.ok && pJson) {
        // Funções auxiliares para derivar flags a partir de diferentes formatos
        const norm = (v: any) => (typeof v === 'string' ? v.toLowerCase() : v);
        const isEnabledVal = (v: any) => {
          const x = norm(v);
          if (typeof x === 'boolean') return x;
          if (typeof x === 'string') return x === 'enabled' || x === 'active' || x === 'true' || x === 'on';
          return null;
        };
        const traverse = (obj: any, cb: (k: string, v: any)=>void) => {
          if (!obj) return;
          if (Array.isArray(obj)) { for (const it of obj) traverse(it, cb); return; }
          if (typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj)) { cb(k.toLowerCase(), v); traverse(v, cb); }
          }
        };
        const setIfKnown = (names: string[], v: any, setter: (b: boolean)=>void) => {
          const val = isEnabledVal(v);
          if (val === null) return;
          const key = (Array.isArray(v) ? '' : (typeof v === 'object' ? '' : String(v))).toLowerCase();
          // Apenas usa quando a chave tem correspondência clara
          setter(val);
        };
        let flex: boolean | null = null;
        let envios: boolean | null = null;
        let correios: boolean | null = null;
        let full: boolean | null = null;
        // Varredura genérica por chaves e arrays conhecidas
        traverse(pJson, (k, v)=>{
          if (k.includes('shipping_modes') || k.includes('modes')) {
            const arr = Array.isArray(v) ? v.map((x:any)=>String(x).toLowerCase()) : [];
            if (arr.length) {
              if (arr.includes('self_service')) flex = true;
              if (arr.includes('me2') || arr.includes('xd_drop_off') || arr.includes('cross_docking') || arr.includes('custom')) envios = true;
              if (arr.includes('drop_off')) correios = true;
              if (arr.includes('fulfillment') || arr.includes('fbm')) full = true;
            }
          }
          if (k.includes('self_service') || k.includes('me_flex') || k.includes('flex')) {
            const val = isEnabledVal(v);
            if (val !== null) flex = val;
          }
          if (k.includes('me2') || k.includes('xd_drop_off') || k.includes('cross_docking') || k.includes('envios') || k.includes('custom')) {
            const val = isEnabledVal(v);
            if (val !== null) envios = val;
          }
          if (k.includes('drop_off') || k.includes('correios')) {
            const val = isEnabledVal(v);
            if (val !== null) correios = val;
          }
          if (k.includes('fulfillment') || k.includes('fbm')) {
            const val = isEnabledVal(v);
            if (val !== null) full = val;
          }
        });
        caps.flex_enabled = flex;
        caps.envios_enabled = envios;
        caps.correios_enabled = correios;
        caps.full_enabled = full;
        const nowIso = new Date().toISOString();
        await admin.from('marketplace_integrations').update({
          shipping_preferences: pJson,
          preferences_fetched_at: nowIso,
          self_service: caps.flex_enabled === true,
          xd_drop_off: caps.envios_enabled === true,
          drop_off: caps.correios_enabled === true,
        }).eq('id', integration.id);
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
          // Por padrão, seller_warehouse tende a ser envio padrão do Mercado Envios
          shipping_type = "envios";
        } else if (type === "selling_address") {
          warehouse_id = "selling_address";
          warehouse_name = "Origem do Vendedor";
          // Atenção: "selling_address" não implica necessariamente Flex.
          // Sem evidência explícita (logistic_type=self_service), tratamos como Envios por padrão.
          // Se houver shippingInfo com logistic_type=self_service abaixo, será sobrescrito para "flex".
          shipping_type = "envios";
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
          // - xd_drop_off, cross_docking => envios (ME padrão)
          // - drop_off => correios
          if (logisticType === "fulfillment" || logisticType === "fbm") {
            shipping_type = "full";
          } else if (logisticType === "self_service") {
            shipping_type = "flex";
          } else if (logisticType === "xd_drop_off" || logisticType === "cross_docking") {
            shipping_type = "envios";
          } else if (logisticType === "drop_off") {
            shipping_type = "correios";
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
        else if (logisticType === "xd_drop_off" || logisticType === "cross_docking") shippingTypesSet.add("envios");
        else if (logisticType === "drop_off") shippingTypesSet.add("correios");
        // FLEX habilitado: tags incluem self_service_in (usuario ativou Flex)
        const tags = Array.isArray((shippingInfo as any)?.tags)
          ? ((shippingInfo as any).tags as any[]).map((t) => String(t || "").toLowerCase())
          : [];
        if (tags.includes("self_service_in")) shippingTypesSet.add("flex");
        // FLEX desabilitado: se houver self_service_out e logistic_type não for self_service, não adicionar flex
        if (tags.includes("self_service_out") && logisticType !== "self_service") {
          if (shippingTypesSet.has("flex")) shippingTypesSet.delete("flex");
        }
      }
      for (const loc of normalizedLocations) {
        if (loc?.shipping_type) shippingTypesSet.add(String(loc.shipping_type));
      }
      // Se nada foi inferido, usa inferredLogistic como fallback
      if (shippingTypesSet.size === 0 && typeof inferredLogistic === "string" && inferredLogistic) {
        const lg = inferredLogistic.toLowerCase();
        if (lg === "fulfillment" || lg === "fbm") shippingTypesSet.add("full");
        else if (lg === "self_service") shippingTypesSet.add("flex");
        else if (lg === "xd_drop_off" || lg === "cross_docking") shippingTypesSet.add("envios");
        else if (lg === "drop_off") shippingTypesSet.add("correios");
      }
      // Filtra por capacidades globais do seller quando conhecido: remove métodos desativados
      if (caps) {
        const toDelete: string[] = [];
        if (caps.flex_enabled === false && shippingTypesSet.has('flex')) toDelete.push('flex');
        if (caps.envios_enabled === false && shippingTypesSet.has('envios')) toDelete.push('envios');
        if (caps.correios_enabled === false && shippingTypesSet.has('correios')) toDelete.push('correios');
        if (caps.full_enabled === false && shippingTypesSet.has('full')) toDelete.push('full');
        for (const k of toDelete) shippingTypesSet.delete(k);
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
