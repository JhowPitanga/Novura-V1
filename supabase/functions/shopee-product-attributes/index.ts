import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-request-id, x-correlation-id, x-supabase-api-version",
    },
  });
}
function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> {
  const keyBytes = b64ToUint8(base64Key);
  const keyBuf = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength);
  return crypto.subtle.importKey("raw", keyBuf as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt","decrypt"]);
}
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> {
  const parts = encStr.split(":");
  if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format");
  const iv = b64ToUint8(parts[2]);
  const ct = b64ToUint8(parts[3]);
  const ivBuf = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const ctBuf = ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer;
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuf }, key, ctBuf);
  return new TextDecoder().decode(pt);
}
async function tryDecryptToken(key: CryptoKey, encStr: string): Promise<string> {
  const s = String(encStr || "");
  if (!s) return "";
  try {
    if (s.startsWith("enc:gcm:")) return await aesGcmDecryptFromString(key, s);
  } catch (_) {}
  return s;
}
async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(key);
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex.toUpperCase();
}
function getField(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}
function getStr(obj: unknown, path: string[]): string | null {
  let cur: unknown = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object" || !(k in (cur as Record<string, unknown>))) return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  const v = cur as unknown;
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}
function normalizeLanguage(input: string | null): string | null {
  if (!input) return "pt-BR";
  const s = String(input).trim().toLowerCase().replace(/_/g, "-");
  if (s === "pt" || s === "pt-br" || s === "ptbr" || s === "pt-b" || s === "br") return "pt-BR";
  if (s === "en") return "en";
  return s === "pt-br" ? "pt-BR" : s;
}
serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) return jsonResponse({ ok: false, error: "Missing service configuration" }, 200);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;
  const aesKey = await importAesGcmKey(ENC_KEY_B64);
  try {
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const bodyText = await req.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(bodyText); } catch (_) { body = {}; }
    const url = new URL(req.url);
    const organizationId = getStr(body, ["organizationId"]) || url.searchParams.get("organizationId") || undefined;
    const shopIdStr = getStr(body, ["shop_id"]) || getStr(body, ["shopId"]) || url.searchParams.get("shop_id") || url.searchParams.get("shopId") || null;
    const categoryIdStr = getStr(body, ["category_id"]) || getStr(body, ["categoryId"]) || url.searchParams.get("category_id") || url.searchParams.get("categoryId") || null;
    const languageRaw = getStr(body, ["language"]) || url.searchParams.get("language") || null;
    const language = normalizeLanguage(languageRaw) || "pt-BR";
    const shopIdInput = shopIdStr ? Number(shopIdStr) : null;
    const categoryId = categoryIdStr ? Number(categoryIdStr) : null;
    if (!categoryId || !Number.isFinite(categoryId)) return jsonResponse({ ok: false, error: "Missing category_id" }, 200);
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ ok: false, error: appErr?.message || "App not found", correlationId }, 200);
    const partnerId = String(getField(appRow, "client_id") || "").trim();
    const partnerKey = String(getField(appRow, "client_secret") || "").trim();
    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) return jsonResponse({ ok: false, error: "Missing or invalid Shopee partner credentials", correlationId }, 200);
    const hosts = ["https://openplatform.shopee.com.br", "https://partner.shopeemobile.com"];
    let integration: any = null;
    if (shopIdInput) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .or(`config->>shopee_shop_id.eq.${shopIdInput},meli_user_id.eq.${shopIdInput}`)
        .limit(1);
      integration = (Array.isArray(data) && data.length > 0) ? data[0] : null;
    } else if (organizationId) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .eq("organizations_id", organizationId)
        .limit(1);
      integration = (Array.isArray(data) && data.length > 0) ? data[0] : null;
    }
    if (!integration) return jsonResponse({ ok: false, error: "No Shopee integration found", correlationId }, 200);
    const cfg = getField(integration, "config") as Record<string, unknown> | null;
    const shopIdCandidate = (cfg && typeof cfg?.["shopee_shop_id"] !== "undefined")
      ? Number(cfg?.["shopee_shop_id"])
      : Number(getField(integration, "meli_user_id") || 0);
    if (!Number.isFinite(shopIdCandidate) || shopIdCandidate <= 0) return jsonResponse({ ok: false, error: "Integration missing shop_id", correlationId }, 200);
    const integrationId = String(getField(integration, "id"));
    const accRaw = String(getField(integration, "access_token") || "");
    const refRaw = String(getField(integration, "refresh_token") || "");
    let accessToken = await tryDecryptToken(aesKey, accRaw);
    let refreshTokenPlain = await tryDecryptToken(aesKey, refRaw);
    const refreshPath = "/api/v2/auth/access_token/get";
    const tryRefreshAccessToken = async (): Promise<boolean> => {
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = await hmacSha256Hex(partnerKey, `${partnerId}${refreshPath}${timestamp}`);
      if (!refreshTokenPlain || !String(refreshTokenPlain).trim()) return false;
      for (const host of hosts) {
        const tokenUrl = `${host}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
        try {
          const resp = await fetch(tokenUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ shop_id: Number(shopIdCandidate), refresh_token: refreshTokenPlain, partner_id: Number(partnerId) }),
          });
          const text = await resp.text();
          let json: any = {};
          try { json = JSON.parse(text); } catch (_) { json = {}; }
          if (resp.ok && json && json.access_token) {
            accessToken = String(json.access_token);
            refreshTokenPlain = String(json.refresh_token || refreshTokenPlain);
            try {
              const iv = crypto.getRandomValues(new Uint8Array(12));
              const ctA = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(accessToken));
              const ctB = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(refreshTokenPlain));
              const accEnc = `enc:gcm:${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ctA)))}`;
              const refEnc = `enc:gcm:${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ctB)))}`;
              const expiresAtIso = new Date(Date.now() + (Number(json.expire_in) || 14400) * 1000).toISOString();
              await admin.from("marketplace_integrations").update({ access_token: accEnc, refresh_token: refEnc, expires_in: expiresAtIso }).eq("id", integrationId);
            } catch (_) {}
            return true;
          }
        } catch (_) { continue; }
      }
      return false;
    };
    if (!accessToken) await tryRefreshAccessToken();
    const ts = Math.floor(Date.now() / 1000);
    const path = "/api/v2/product/get_attribute_tree";
    let sign = await hmacSha256Hex(partnerKey, `${partnerId}${path}${ts}${accessToken}${shopIdCandidate}`);
    const buildUrl = (host: string) => {
      const qs = new URLSearchParams({
        partner_id: String(partnerId),
        timestamp: String(ts),
        access_token: String(accessToken),
        shop_id: String(shopIdCandidate),
        sign: String(sign),
      });
      qs.append("category_id_list", String(categoryId));
      qs.set("language", language || "pt-BR");
      const full = `${host}${path}?${qs.toString()}`;
      try {
        console.log("[shopee-product-attributes] request_url", { correlationId, url: full });
      } catch (_) {}
      return full;
    };
    const fetchBrandList = async (host: string): Promise<any[]> => {
      const tsB = Math.floor(Date.now() / 1000);
      const brandPath = "/api/v2/product/get_brand_list";
      const signB = await hmacSha256Hex(partnerKey, `${partnerId}${brandPath}${tsB}${accessToken}${shopIdCandidate}`);
      const pageSize = 100;
      const out: any[] = [];
      const fetchPaged = async (lang: string) => {
        let offset = 0;
        for (let i = 0; i < 3; i++) {
          const qs = new URLSearchParams({
            partner_id: String(partnerId),
            timestamp: String(tsB),
            access_token: String(accessToken),
            shop_id: String(shopIdCandidate),
            sign: String(signB),
          });
          qs.set("category_id", String(categoryId));
          qs.set("status", "1");
          qs.set("offset", String(offset));
          qs.set("page_size", String(pageSize));
          qs.set("language", lang);
          const url = `${host}${brandPath}?${qs.toString()}`;
          try {
            const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
            const text = await resp.text();
            let json: any = null;
            try { json = JSON.parse(text); } catch (_) { json = null; }
            const listA = (json as any)?.brand_list;
            const listB = (json as any)?.response?.brand_list;
            const list = Array.isArray(listA) ? listA : (Array.isArray(listB) ? listB : []);
            for (const b of Array.isArray(list) ? list : []) {
              const bidNum = typeof b?.brand_id === "number" ? b.brand_id : Number(b?.id || 0);
              const bid = Number.isFinite(bidNum) ? bidNum : (typeof b?.brand_id === "number" ? b.brand_id : undefined);
              const bname = String(b?.brand_name || b?.name || (typeof bid === "number" ? bid : "") || "");
              if (typeof bid === "number" && bname.trim()) {
                if (!out.find((x) => Number(x?.brand_id) === Number(bid))) {
                  out.push({ brand_id: bid, brand_name: bname });
                }
              }
            }
            const nextOffset = Number((json as any)?.next_offset || (json as any)?.response?.next_offset || -1);
            if (!Number.isFinite(nextOffset) || nextOffset <= offset || list.length < pageSize) break;
            offset = nextOffset;
          } catch (_) {
            break;
          }
        }
      };
      await fetchPaged(language || "pt-BR");
      return out;
    };
    try { 
      console.log("[shopee-product-attributes] request_build", { correlationId, partnerId, shopIdCandidate, categoryId, language, path }); 
    } catch (_) {}
    for (const host of hosts) {
      const urlReq = buildUrl(host);
      try {
        const doFetch = async (reqUrl: string) => {
          const resp = await fetch(reqUrl, { method: "GET", headers: { "content-type": "application/json" } });
          const text = await resp.text();
          let json: any = null;
          try { json = JSON.parse(text); } catch (_) { json = null; }
          const normalizeOptionList = (values: any[]): any[] => {
            const arr = Array.isArray(values) ? values : [];
            return arr.map((v: any) => {
              const oidNum = typeof v?.value_id === "number" ? v.value_id : Number(v?.option_id || v?.id || 0);
              const oid = Number.isFinite(oidNum) ? oidNum : (typeof v?.option_id === "number" ? v.option_id : (typeof v?.id === "number" ? v.id : undefined));
              const ml = Array.isArray((v as any)?.multi_lang) ? (v as any).multi_lang : null;
              const langKey = String(language || "pt-BR").toLowerCase();
              const chosen = Array.isArray(ml) ? ml.find((m: any) => String((m as any)?.language || "").toLowerCase() === langKey) : null;
              const name = String(((chosen as any)?.value) || v?.option_text || v?.name || v?.value || v?.label || (typeof oid === "number" ? oid : "") || "");
              return { option_id: oid, option_text: name };
            }).filter((o) => typeof o.option_text === "string" && o.option_text.trim());
          };
          const normalizeAttr = (node: any): any | null => {
            if (!node || typeof node !== "object") return null;
            const attrIdNum =
              typeof node?.attribute_id === "number" ? node.attribute_id :
              typeof node?.id === "number" ? node.id :
              Number(node?.attribute_id || node?.id || 0);
            const attrId = Number.isFinite(attrIdNum) ? attrIdNum : (typeof node?.attribute_id === "number" ? node.attribute_id : undefined);
            const attrName = String(node?.attribute_name || node?.name || (typeof attrId === "number" ? attrId : "") || "");
            const mandatory = !!(typeof node?.is_mandatory === "boolean" ? node.is_mandatory : node?.mandatory);
            const info = (node as any)?.attribute_info || {};
            const inputType = typeof info?.input_type === "number" ? info.input_type : (typeof node?.input_type === "number" ? node.input_type : undefined);
            const unitList = Array.isArray((node as any)?.attribute_unit_list) ? (node as any).attribute_unit_list : [];
            const allowedUnits = unitList.map((u: any) => {
              const un = String(u?.value_unit || u?.unit || u?.name || "").trim();
              return un;
            }).filter((s: string) => !!s);
            const defaultUnit = String((node as any)?.default_unit || "").trim() || undefined;
            const values = normalizeOptionList((node as any)?.attribute_value_list || (node as any)?.option_list || (node as any)?.options || []);
            const normalized = {
              attribute_id: attrId,
              attribute_name: attrName,
              is_mandatory: mandatory,
              input_type: inputType,
              option_list: values,
              allowed_units: allowedUnits,
              default_unit: defaultUnit,
            };
            return normalized;
          };
          const flattenAttributes = (rootList: any[]): any[] => {
            const out: any[] = [];
            const walkNode = (node: any) => {
              const normalized = normalizeAttr(node);
              if (normalized && typeof normalized?.attribute_id !== "undefined") out.push(normalized);
              const values = Array.isArray((node as any)?.attribute_value_list) ? (node as any).attribute_value_list : [];
              for (const v of values) {
                const childList = Array.isArray((v as any)?.child_attribute_list) ? (v as any).child_attribute_list : [];
                for (const child of childList) walkNode(child);
              }
              const children = Array.isArray((node as any)?.children) ? (node as any).children : [];
              for (const c of children) walkNode(c);
            };
            for (const n of Array.isArray(rootList) ? rootList : []) walkNode(n);
            return out;
          };
          try {
            const code = (json as any)?.code ?? (json as any)?.error ?? (json as any)?.response?.code ?? (json as any)?.response?.error ?? null;
            const msg = (json as any)?.message ?? (json as any)?.msg ?? (json as any)?.response?.message ?? (json as any)?.response?.msg ?? null;
            const errInfo = (json as any)?.error_info ?? (json as any)?.response?.error_info ?? null;
            const candidates: any[] = [];
            const pushCand = (arr: any) => { if (Array.isArray(arr)) candidates.push(arr); };
            pushCand((json as any)?.attribute_list);
            pushCand((json as any)?.attribute_tree);
            pushCand((json as any)?.response?.attribute_list);
            pushCand((json as any)?.response?.attribute_tree);
            pushCand((json as any)?.data?.attribute_list);
            pushCand((json as any)?.data?.attribute_tree);
            pushCand((json as any)?.result?.attribute_list);
            pushCand((json as any)?.result?.attribute_tree);
            pushCand((json as any)?.response?.result?.attribute_list);
            pushCand((json as any)?.response?.result?.attribute_tree);
            // Suporta estrutura: response.list[].attribute_tree / attribute_list
            const respList = (json as any)?.response?.list;
            if (Array.isArray(respList)) {
              for (const item of respList) {
                pushCand((item as any)?.attribute_tree);
                pushCand((item as any)?.attribute_list);
              }
            }
            const allFlat: any[] = [];
            for (const cand of candidates) {
              const flat = flattenAttributes(cand as any[]);
              for (const item of flat) {
                if (!allFlat.find((x) => Number(x?.attribute_id) === Number(item?.attribute_id))) {
                  allFlat.push(item);
                }
              }
            }
            const attrTreeLen =
              Array.isArray((json as any)?.attribute_tree) ? (json as any)?.attribute_tree.length :
              Array.isArray((json as any)?.response?.attribute_tree) ? (json as any)?.response?.attribute_tree.length :
              Array.isArray((json as any)?.data?.attribute_tree) ? (json as any)?.data?.attribute_tree.length : 0;
            const attrListLen =
              Array.isArray((json as any)?.attribute_list) ? (json as any)?.attribute_list.length :
              Array.isArray((json as any)?.response?.attribute_list) ? (json as any)?.response?.attribute_list.length :
              Array.isArray((json as any)?.data?.attribute_list) ? (json as any)?.data?.attribute_list.length : 0;
            console.log("[shopee-product-attributes] response_info", {
              correlationId, host, status: resp.status, ok: resp.ok, code, msg, error_info: errInfo,
              attribute_tree_length: attrTreeLen,
              attribute_list_length: attrListLen,
              attributes_count_flat: (allFlat || []).length,
            });
            return { resp, json, list: allFlat, code, msg, errInfo };
          } catch (_) {
            return { resp, json, list: [] as any[] };
          }
        };
        let { resp, json, list, code, msg, errInfo } = await doFetch(urlReq);
        if (!resp.ok) {
          const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
          if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token"))) {
            const refreshed = await tryRefreshAccessToken();
            if (refreshed) sign = await hmacSha256Hex(partnerKey, `${partnerId}${path}${ts}${accessToken}${shopIdCandidate}`);
          }
        }
        if (resp.status === 401 || resp.status === 403) continue;
        if (resp.ok) {
          const brands = await fetchBrandList(host);
          const brandOptions = (Array.isArray(brands) ? brands : []).map((b) => ({
            option_id: Number((b as any)?.brand_id),
            option_text: String((b as any)?.original_brand_name || (b as any)?.display_brand_name || (b as any)?.brand_name || ""),
          })).filter((o) => Number.isFinite(o.option_id) && o.option_text.trim());
          if (brandOptions.length) {
            const brandAttr = {
              attribute_id: "BRAND",
              attribute_name: "Marca",
              is_mandatory: true,
              input_type: 1,
              option_list: brandOptions,
              allowed_units: [] as string[],
              default_unit: undefined as string | undefined,
            };
            if (Array.isArray(list)) {
              const exists = list.find((x: any) => String((x as any)?.attribute_id || "").toUpperCase() === "BRAND");
              if (!exists) list = [brandAttr, ...list];
            } else {
              list = [brandAttr];
            }
          }
          if (Array.isArray(list) && list.length > 0) {
            return jsonResponse({ ok: true, correlationId, data: { attribute_list: list, brand_list: brands } }, 200);
          }
        }
        if (resp.ok) {
          const c = String(code || "").toLowerCase();
          const map: Record<string, { status: number; message: string }> = {
            error_data: { status: 422, message: "Falha ao processar dados" },
            error_param: { status: 400, message: "Parâmetros inválidos" },
            error_server: { status: 502, message: "Erro no servidor Shopee" },
            error_shop: { status: 400, message: "Shop ID inválido" },
            error_invalid_language: { status: 400, message: "Idioma inválido" },
            error_invalid_category: { status: 400, message: "Categoria inválida" },
          };
          if (c && c.startsWith("error")) {
            const base = map[c] || { status: 400, message: "Erro na API Shopee" };
            const friendly = msg ? `${base.message}. ${msg}` : base.message;
            return jsonResponse({ ok: false, correlationId, error: friendly, code, error_info: errInfo, data: json }, base.status);
          }
          const brands = await fetchBrandList(host);
          const brandOptions = (Array.isArray(brands) ? brands : []).map((b) => ({
            option_id: Number((b as any)?.brand_id),
            option_text: String((b as any)?.original_brand_name || (b as any)?.display_brand_name || (b as any)?.brand_name || ""),
          })).filter((o) => Number.isFinite(o.option_id) && o.option_text.trim());
          if (brandOptions.length) {
            const brandAttr = {
              attribute_id: "BRAND",
              attribute_name: "Marca",
              is_mandatory: true,
              input_type: 1,
              option_list: brandOptions,
              allowed_units: [] as string[],
              default_unit: undefined as string | undefined,
            };
            const listOut = Array.isArray((json as any)?.attribute_list) ? (json as any).attribute_list : (Array.isArray((json as any)?.attribute_tree) ? (json as any).attribute_tree : []);
            const baseArr = Array.isArray(listOut) ? listOut : [];
            const exists = baseArr.find((x: any) => String((x as any)?.attribute_id || "").toUpperCase() === "BRAND");
            const finalArr = exists ? baseArr : [brandAttr, ...baseArr];
            return jsonResponse({ ok: false, correlationId, error: "Nenhum atributo retornado para esta categoria. Use uma categoria de último nível (has_children=false).", code, error_info: errInfo, data: { ...(json || {}), attribute_list: finalArr, brand_list: brands } }, 404);
          }
          return jsonResponse({ ok: false, correlationId, error: "Nenhum atributo retornado para esta categoria. Use uma categoria de último nível (has_children=false).", code, error_info: errInfo, data: { ...(json || {}), brand_list: brands } }, 404);
        }
        return jsonResponse({ ok: false, correlationId, status: resp.status, error: (json as any)?.message || (json as any)?.msg || "Shopee API error", data: json }, resp.status || 500);
      } catch (_) { continue; }
    }
    return jsonResponse({ ok: false, correlationId, error: "Shopee API unreachable" }, 503);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || "Unknown error");
    return jsonResponse({ ok: false, error: msg }, 500);
  }
})
