import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import type { DraftData, ShippingModesResult, BuildMLPayloadParams, BuildShopeePayloadParams, PublishListingParams, PublishResult } from "@/types/create-listing";

// ─── Marketplace helpers ─────────────────────────────────────────────────────

export function marketplaceSlugify(name: string): string {
  const raw = String(name || "").trim().toLowerCase();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  if (normalized === "mercado_livre") return "mercado-livre";
  return normalized;
}

export function marketplaceDisplayNameFromSlug(slug: string): string {
  const s = String(slug || "").trim().toLowerCase();
  if (s === "mercado-livre" || s === "mercado_livre" || s === "mercado") return "Mercado Livre";
  if (s === "shopee") return "Shopee";
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Edge function invoker ───────────────────────────────────────────────────

export async function invokeFn(fnName: string, body: any): Promise<{ data: any; error: any }> {
  try {
    const headers = { apikey: SUPABASE_PUBLISHABLE_KEY };
    console.groupCollapsed(`[invokeFn] ${fnName}`);
    console.log("request_meta", { url: `${SUPABASE_URL}/functions/v1/${fnName}`, headers, body });
    const res = await (supabase as any).functions.invoke(fnName, { body, headers });
    console.log("response_meta", { status: (res as any)?.status || null, data_preview: JSON.stringify(res?.data)?.slice(0, 300) });
    console.groupEnd();
    return { data: res.data, error: res.error };
  } catch (err) {
    console.error("[invokeFn] error", { name: (err as any)?.name, message: (err as any)?.message });
    return { data: null, error: err instanceof Error ? err : new Error("Invoke failed") };
  }
}

// ─── Image utilities ─────────────────────────────────────────────────────────

export async function compressImage(file: File, quality = 0.8, maxDim = 1280): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const canvas = document.createElement("canvas");
  let { width, height } = img;
  if (width > height && width > maxDim) {
    height = Math.round((height * maxDim) / width);
    width = maxDim;
  } else if (height > maxDim) {
    width = Math.round((width * maxDim) / height);
    height = maxDim;
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", quality)
  );
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function ensureFile(f: any): Promise<File | null> {
  if (f instanceof File) return f;
  if (f instanceof Blob) return new File([f], "upload.jpg", { type: (f as any).type || "application/octet-stream" });
  if (f && typeof f === "object") {
    if ((f as any).file instanceof File) return (f as any).file as File;
    const src = typeof (f as any).preview === "string" ? (f as any).preview : (typeof (f as any).url === "string" ? (f as any).url : null);
    if (src) {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        const name = (src.split("/").pop() || "upload").split("?")[0];
        return new File([blob], name, { type: blob.type || "application/octet-stream" });
      } catch { }
    }
  }
  if (typeof f === "string") {
    try {
      const res = await fetch(f);
      const blob = await res.blob();
      const name = (f.split("/").pop() || "upload").split("?")[0];
      return new File([blob], name, { type: blob.type || "application/octet-stream" });
    } catch { }
  }
  return null;
}

export async function uploadImageToStorage(
  file: File,
  organizationId: string | null | undefined,
  draftId: string | null | undefined
): Promise<string | null> {
  let toUpload = file;
  if (/^image\//.test(toUpload.type)) {
    try { toUpload = await compressImage(toUpload, 0.8, 1280); } catch { }
  }
  const safeName = (toUpload.name || "upload").replace(/[^a-zA-Z0-9._-]/g, "-");
  const folder = `${organizationId ? `org_${organizationId}` : "org_anon"}/${draftId ? `draft_${draftId}` : "temp"}/${crypto.randomUUID()}`;
  const path = `${folder}/${safeName}`;
  const { error: upErr } = await supabase.storage.from("ad-images").upload(path, toUpload, { upsert: true, contentType: toUpload.type });
  if (upErr) return null;
  const { data } = supabase.storage.from("ad-images").getPublicUrl(path);
  return data?.publicUrl || null;
}

export async function serializeImages(
  items: any[],
  organizationId: string | null | undefined,
  draftId: string | null | undefined,
  limit = 8
): Promise<string[]> {
  const out: string[] = [];
  for (const it of items) {
    const f = await ensureFile(it);
    if (f) {
      const url = await uploadImageToStorage(f, organizationId, draftId);
      if (url) {
        out.push(url);
      } else {
        const b64 = await fileToBase64(f);
        out.push(`data:${f.type};base64,${b64}`);
      }
    } else if (typeof it === "string") {
      out.push(it);
    } else if (it && typeof it === "object") {
      const src = typeof (it as any).preview === "string"
        ? (it as any).preview
        : typeof (it as any).url === "string" ? (it as any).url : null;
      if (src) out.push(src);
    }
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Draft persistence ───────────────────────────────────────────────────────

export async function loadDraft(draftId: string, orgId: string): Promise<DraftData | null> {
  const { data, error } = await (supabase as any)
    .from("marketplace_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("organizations_id", orgId)
    .limit(1)
    .single();
  if (error) return null;
  return (data as DraftData) || null;
}

export async function saveDraftToDB(
  draft: DraftData,
  draftId: string | null,
  orgId: string
): Promise<string | null> {
  if (draftId) {
    await (supabase as any)
      .from("marketplace_drafts")
      .update(draft)
      .eq("id", draftId)
      .eq("organizations_id", orgId);
    return draftId;
  }
  const { data, error } = await (supabase as any)
    .from("marketplace_drafts")
    .insert(draft)
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

export async function deleteDraftFromDB(draftId: string, orgId: string): Promise<void> {
  try {
    await (supabase as any)
      .from("marketplace_drafts")
      .delete()
      .eq("id", draftId)
      .eq("organizations_id", orgId);
  } catch { }
}

// ─── Connected apps ──────────────────────────────────────────────────────────

export async function fetchConnectedApps(orgId: string): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from("marketplace_integrations")
    .select("marketplace_name")
    .eq("organizations_id", orgId);
  if (error) return [];
  const names: string[] = (data || []).map((r: any) => String(r?.marketplace_name || ""));
  const mapped = names.map((n) => (n === "mercado_livre" ? "Mercado Livre" : n));
  return Array.from(new Set<string>(mapped)).filter((n): n is string => !!n);
}

// ─── Attributes & metadata ───────────────────────────────────────────────────

export async function fetchMLAttributes(orgId: string, categoryId: string): Promise<any[]> {
  const { data, error } = await (supabase as any).functions.invoke("mercado-livre-categories-attributes", {
    body: { organizationId: orgId, categoryId },
  });
  if (error) return [];
  return Array.isArray(data?.attributes) ? data.attributes : [];
}

export function parseShopeeAttributesResponse(payload: any): { attrs: any[]; brandList: any[] } {
  const listData = Array.isArray(payload?.data?.attribute_list) ? payload.data.attribute_list : (Array.isArray(payload?.data?.attribute_tree) ? payload.data.attribute_tree : []);
  const listResp = Array.isArray(payload?.response?.attribute_list) ? payload.response.attribute_list : (Array.isArray(payload?.response?.attribute_tree) ? payload.response.attribute_tree : []);
  const listRoot = Array.isArray(payload?.attribute_list) ? payload.attribute_list : (Array.isArray(payload?.attribute_tree) ? payload.attribute_tree : []);
  const listAny = Array.isArray(payload?.list) ? payload.list : [];
  const list: any[] = listAny.length ? listAny : (listData.length ? listData : (listResp.length ? listResp : listRoot));

  const attrs = list.map((a: any) => {
    const idNum = typeof a?.attribute_id === "number" ? a.attribute_id : Number(a?.attribute_id || 0);
    const idStr = Number.isFinite(idNum) ? String(idNum) : String(a?.attribute_id || "");
    const nameStr = String(a?.attribute_name || a?.name || idStr || "");
    const opts = Array.isArray(a?.option_list) ? a.option_list : (Array.isArray(a?.options) ? a.options : []);
    const values = opts.map((o: any) => {
      const oidNum = typeof o?.option_id === "number" ? o.option_id : Number(o?.id || 0);
      const oid = Number.isFinite(oidNum) ? String(oidNum) : String(o?.option_id || o?.id || "");
      const ml = Array.isArray((o as any)?.multi_lang) ? (o as any).multi_lang : null;
      const translated = Array.isArray(ml) ? ml.find((m: any) => String((m as any)?.language || "").toLowerCase() === "pt-br") : null;
      const oname = String((translated as any)?.value || o?.option_text || o?.name || o?.value || o?.label || oid || "");
      return { id: oid, name: oname };
    });
    const allowed_units = Array.isArray(a?.allowed_units) ? a.allowed_units : [];
    const default_unit = String((a as any)?.default_unit || "");
    const itype = String(a?.input_type || a?.value_type || "").toLowerCase();
    const vtype = values.length > 0 ? "list" : (allowed_units.length > 0 ? "number_unit" : (itype.includes("number") ? "number" : "string"));
    const mandatory = !!(a?.is_mandatory || a?.mandatory);
    const allowVar = !!(a?.is_attribute_for_variation || a?.allow_variations || (Array.isArray(a?.tags) ? a.tags.includes("allow_variations") : false));
    const tags = { required: mandatory, allow_variations: allowVar };
    return { id: idStr, name: nameStr, values, value_type: vtype, tags, allowed_units, default_unit };
  });

  const brandRaw = Array.isArray(payload?.data?.brand_list) ? payload.data.brand_list
    : (Array.isArray(payload?.response?.brand_list) ? payload.response.brand_list
      : (Array.isArray(payload?.brand_list) ? payload.brand_list : []));
  const brandList = (Array.isArray(brandRaw) ? brandRaw : []).map((b: any, idx: number) => {
    const bidNum = typeof b?.brand_id === "number" ? b.brand_id : Number(b?.id || 0);
    const bid = Number.isFinite(bidNum) ? String(bidNum) : String(b?.brand_id || b?.id || idx);
    const bname = String(b?.original_brand_name || b?.display_brand_name || b?.brand_name || b?.name || bid);
    return { id: bid, name: bname };
  });

  return { attrs, brandList };
}

export async function fetchShopeeAttributes(orgId: string, categoryId: string): Promise<{ attrs: any[]; brandList: any[] }> {
  const attrsRes = await (supabase as any).functions.invoke("shopee-product-attributes", {
    body: { organizationId: orgId, category_id: categoryId, language: "pt-BR" },
  });
  if (attrsRes.error) return { attrs: [], brandList: [] };
  return parseShopeeAttributesResponse(attrsRes.data || {});
}

export async function fetchTechSpecsInput(orgId: string, categoryId: string): Promise<any | null> {
  const { data, error } = await (supabase as any).functions.invoke("mercado-livre-technical-specs-input", {
    body: { organizationId: orgId, categoryId },
  });
  if (error) return null;
  return data || null;
}

export async function fetchSaleTermsMeta(orgId: string, categoryId: string): Promise<any[]> {
  const { data, error } = await (supabase as any).functions.invoke("mercado-livre-categories-sale-terms", {
    body: { organizationId: orgId, categoryId },
  });
  if (error) return [];
  return Array.isArray((data as any)?.terms) ? (data as any).terms : [];
}

export async function evaluateConditionalRequired(
  orgId: string,
  categoryId: string,
  attributes: any[]
): Promise<string[]> {
  const { data, error } = await (supabase as any).functions.invoke("mercado-livre-attributes-conditional", {
    body: { organizationId: orgId, categoryId, attributes },
  });
  if (error) return [];
  return Array.isArray((data as any)?.required_ids) ? (data as any).required_ids : [];
}

// ─── Listing types & prices ──────────────────────────────────────────────────

export async function fetchMLListingTypes(
  orgId: string,
  categoryId: string,
  siteId: string
): Promise<any[]> {
  let arr: any[] = [];
  try {
    const { data, error } = await (supabase as any).functions.invoke("mercado-livre-available-listing-types", {
      body: { organizationId: orgId, categoryId },
    });
    arr = Array.isArray(data?.types) ? data.types : [];
    if (!error && arr.length === 0) {
      try {
        const res = await fetch(`https://api.mercadolibre.com/sites/${siteId}/listing_types`);
        const json = await res.json();
        if (Array.isArray(json)) arr = json;
      } catch { }
    }
  } catch { }
  if (String(siteId).toUpperCase() === "MLB") {
    const pick = new Set(["gold_special", "gold_pro"]);
    arr = arr.filter((t: any) => pick.has(String(t?.id || t))).map((t: any) => {
      const id = String(t?.id || t);
      const name = id === "gold_special" ? "Clássico" : (id === "gold_pro" ? "Premium" : String(t?.name || t?.listing_type_name || id));
      return { id, name };
    });
  }
  return arr;
}

export async function fetchMLListingPrices(
  orgId: string,
  siteId: string,
  categoryId: string,
  price: number
): Promise<any[]> {
  const { data, error } = await (supabase as any).functions.invoke("mercado-livre-listing-prices", {
    body: { organizationId: orgId, siteId, price, categoryId },
  });
  if (error) return [];
  return Array.isArray(data?.prices) ? data.prices : [];
}

// ─── Shipping modes ──────────────────────────────────────────────────────────

function parseJsonSafe(raw: any): any[] | null {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { } }
  return null;
}

function scanFreeShipMandatory(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).toLowerCase();
    if (key.includes("free") && key.includes("ship")) {
      if (typeof v === "boolean" && v === true) return true;
      if (typeof v === "string") {
        const s = v.toLowerCase();
        if (s.includes("mandatory") || s.includes("obrig") || s === "true" || s === "enabled" || s === "active") return true;
      }
    }
    if (v && typeof v === "object" && scanFreeShipMandatory(v as any)) return true;
  }
  return false;
}

export async function fetchShippingModesData(
  orgId: string,
  siteId: string,
  price: string
): Promise<ShippingModesResult & { defaultShippingMode: string; freeConfigDefault: boolean }> {
  const { data, error } = await (supabase as any).functions.invoke("mercado-livre-shipping-methods", {
    body: { organizationId: orgId, siteId },
  });
  if (error) throw error;

  const methods = Array.isArray(data?.methods) ? data.methods : [];
  const prefs = data?.preferences && typeof data.preferences === "object" ? data.preferences : null;

  // Parse modes
  let modes: string[] = [];
  const modesArr = parseJsonSafe(prefs ? (prefs as any).modes : null);
  if (Array.isArray(modesArr)) {
    modes = modesArr.map((m) => String(m));
  } else {
    const set = new Set<string>();
    methods.forEach((m: any) => {
      (Array.isArray(m?.shipping_modes) ? m.shipping_modes : []).forEach((x: any) => set.add(String(x)));
    });
    modes = Array.from(set);
  }

  // Parse logistics
  const logisticsMap: Record<string, string[]> = {};
  const defaultsMap: Record<string, string> = {};
  const logisticsArr = parseJsonSafe(prefs ? (prefs as any).logistics : null);
  if (Array.isArray(logisticsArr)) {
    logisticsArr.forEach((entry: any) => {
      const mode = String(entry?.mode || "");
      const types = Array.isArray(entry?.types) ? entry.types.map((t: any) => String(t?.type || t)) : [];
      logisticsMap[mode] = types;
      const def = Array.isArray(entry?.types) ? entry.types.find((t: any) => t?.default === true) : null;
      if (def?.type) defaultsMap[mode] = String(def.type);
    });
  }

  // Parse mandatory settings
  const mandatoryRaw = prefs ? (prefs as any).mandatorySettings : null;
  const mandatoryObj = mandatoryRaw && typeof mandatoryRaw === "object"
    ? mandatoryRaw
    : (typeof mandatoryRaw === "string" ? (() => { try { return JSON.parse(mandatoryRaw); } catch { return null; } })() : null);
  const preferredMode = mandatoryObj?.mode
    ? String(mandatoryObj.mode)
    : (modes.includes("me2") ? "me2" : (modes.includes("me1") ? "me1" : (modes[0] || "")));

  const freeMandatory = scanFreeShipMandatory(mandatoryObj);
  const priceVal = (() => { const s = String(price || "").replace(/\./g, "").replace(/,/g, "."); const n = Number(s); return isNaN(n) ? 0 : n; })();
  const isPriceMandatoryMLB = String(siteId).toUpperCase() === "MLB" && priceVal >= 79 && preferredMode === "me2";
  const cfgMandatory = freeMandatory && preferredMode === "me2";

  // Determine available logistic types
  const knownTypes = ["drop_off", "xd_drop_off", "self_service"];
  const modeForTypes = preferredMode || "me2";
  const typesForMode = (logisticsMap[modeForTypes] || []).filter((t: string) => t !== "fulfillment");
  const toShow = typesForMode.length > 0 ? typesForMode : knownTypes;

  const defType = String((defaultsMap as any)[modeForTypes] || "");
  const nonFlex = toShow.filter((t) => String(t || "") !== "self_service");
  const primaryLogistic = nonFlex.includes(defType) ? defType : (nonFlex[0] || "");

  // Determine free config default
  let freeConfigDefault = false;
  const fcArr = parseJsonSafe(prefs ? (prefs as any).freeConfigurations : null);
  if (preferredMode === "me2" && Array.isArray(fcArr)) {
    const def = fcArr.find((r: any) => r?.rule?.default === true);
    if (def?.rule?.free_shipping_flag === true) freeConfigDefault = true;
  }

  return {
    modesAvailable: modes,
    logisticsByMode: logisticsMap,
    logisticsDefaults: defaultsMap,
    availableLogisticTypes: toShow,
    preferredMode,
    freeShippingMandatoryCfg: cfgMandatory,
    freeShippingMandatory: cfgMandatory || isPriceMandatoryMLB,
    defaultShippingMode: preferredMode,
    freeConfigDefault,
  };
}

// ─── Category browsing ───────────────────────────────────────────────────────

export async function loadCategoryRoots(
  siteId: string,
  isShopeeMode: boolean,
  orgId: string
): Promise<{ roots: Array<{ id: string; name: string }>; shopeeCategoriesRaw?: any[] }> {
  if (isShopeeMode) {
    const { data, error } = await invokeFn("shopee-categories-predict", {
      organizationId: orgId, action: "get_category", language: "pt-br",
    });
    if (error) return { roots: [], shopeeCategoriesRaw: [] };
    const api = (data as any)?.data || (data as any);
    const resp = (api as any)?.response || api;
    const list: any[] = Array.isArray((resp as any)?.category_list) ? (resp as any).category_list : [];
    const roots = list
      .filter((c: any) => Number(c?.parent_category_id || 0) === 0)
      .map((c: any) => ({
        id: String(c?.category_id || ""),
        name: String(c?.display_category_name || c?.original_category_name || c?.category_name || ""),
      }));
    return { roots, shopeeCategoriesRaw: list };
  }

  const res = await fetch(`https://api.mercadolibre.com/sites/${siteId}/categories`);
  const data = await res.json();
  const roots = Array.isArray(data) ? data.map((c: any) => ({ id: String(c?.id || ""), name: String(c?.name || "") })) : [];
  if (roots.length > 0) return { roots };

  // Fallback: fetch all categories
  try {
    const resAll = await fetch(`https://api.mercadolibre.com/sites/${siteId}/categories/all`);
    const dataAll = await resAll.json();
    const rootMap = new Map<string, string>();
    const visit = (node: any) => {
      const p = Array.isArray((node as any)?.path_from_root) ? (node as any).path_from_root : [];
      if (p.length > 0 && p[0]?.id) rootMap.set(String(p[0].id), String(p[0].name || ""));
      (Array.isArray((node as any)?.children_categories) ? (node as any).children_categories : []).forEach(visit);
    };
    if (Array.isArray(dataAll)) dataAll.forEach(visit);
    else if (Array.isArray((dataAll as any)?.categories)) (dataAll as any).categories.forEach(visit);
    else if (dataAll && typeof dataAll === "object") Object.values(dataAll as any).forEach((v: any) => { if (v && typeof v === "object") visit(v); });
    return { roots: Array.from(rootMap.entries()).map(([id, name]) => ({ id, name })) };
  } catch {
    return { roots: [] };
  }
}

export async function loadCategoryChildren(
  id: string,
  isShopeeMode: boolean,
  shopeeCategoriesRaw: any[]
): Promise<{ children: Array<{ id: string; name: string }>; pathById?: Record<string, string> }> {
  if (isShopeeMode) {
    const children = (shopeeCategoriesRaw || [])
      .filter((c: any) => String(c?.parent_category_id || "") === String(id))
      .map((c: any) => ({
        id: String(c?.category_id || ""),
        name: String(c?.display_category_name || c?.original_category_name || c?.category_name || ""),
      }));
    return { children };
  }
  try {
    const res = await fetch(`https://api.mercadolibre.com/categories/${id}`);
    const data = await res.json();
    const children = (Array.isArray((data as any)?.children_categories) ? (data as any).children_categories : [])
      .map((c: any) => ({ id: String(c?.id || ""), name: String(c?.name || "") }));
    const pathArr = Array.isArray((data as any)?.path_from_root) ? (data as any).path_from_root : [];
    const fullPath = pathArr.map((p: any) => String(p?.name || "")).filter(Boolean).join(" › ");
    const pathById = fullPath ? { [String((data as any)?.id || id)]: fullPath } : undefined;
    return { children, pathById };
  } catch {
    return { children: [] };
  }
}

export async function getCategoryPath(categoryId: string, siteId: string): Promise<string> {
  try {
    const res = await fetch(`https://api.mercadolibre.com/categories/${categoryId}`);
    const data = await res.json();
    const pathArr = Array.isArray((data as any)?.path_from_root) ? (data as any).path_from_root : [];
    return pathArr.map((p: any) => String(p?.name || "")).filter(Boolean).join(" › ");
  } catch {
    return categoryId;
  }
}

// ─── Category prediction ─────────────────────────────────────────────────────

export async function predictCategoriesML(
  orgId: string,
  title: string,
  siteId: string
): Promise<{ suggestions: any[]; domainSuggestions: any[] }> {
  const { data, error } = await (supabase as any).functions.invoke("mercado-livre-categories-predict", {
    body: { organizationId: orgId, siteId, title: title.trim() },
  });
  if (error) throw error;
  const preds = Array.isArray(data?.predictions) ? data.predictions : [];
  const doms = Array.isArray(data?.domain_discovery) ? data.domain_discovery : [];
  return { suggestions: preds, domainSuggestions: doms };
}

export async function predictCategoriesShopee(
  orgId: string,
  title: string
): Promise<{
  suggestions: any[];
  shopeeCategoriesRaw: any[];
  roots: Array<{ id: string; name: string }>;
  nameById: Record<string, string>;
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
}> {
  const { data, error } = await invokeFn("shopee-categories-predict", {
    organizationId: orgId, title: title.trim(), action: "recommend", language: "pt-br",
  });
  if (error) throw error;

  const ok = !!((data as any)?.ok);
  const api = (data as any)?.data || (data as any);
  const resp = (api as any)?.response || api;
  let preds: any[] = [];
  if (Array.isArray((resp as any)?.category_list)) preds = (resp as any).category_list;
  else if (Array.isArray((resp as any)?.data?.category_list)) preds = (resp as any).data.category_list;
  else {
    const vals = Object.values(resp || {}).filter((v: any) => Array.isArray(v)) as any[];
    const found = vals.find((arr) => Array.isArray(arr) && arr.some((it: any) => typeof it === "object" && ("category_id" in it || "category_name" in it)));
    if (Array.isArray(found)) preds = found;
  }
  const normalized = preds.map((c: any) => ({
    category_id: String(c?.category_id ?? c?.id ?? ""),
    category_name: String(c?.category_name ?? c?.name ?? ""),
  })).filter((c: any) => c.category_id && c.category_name);

  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  if (!ok) {
    errorCode = String((api as any)?.code ?? (api as any)?.error ?? "");
    errorMessage = String((api as any)?.message ?? (api as any)?.msg ?? (api as any)?.error_info ?? "");
  }

  // Fetch tree
  let shopeeCategoriesRaw: any[] = [];
  let roots: Array<{ id: string; name: string }> = [];
  const nameById: Record<string, string> = {};
  try {
    const { data: treeData, error: treeErr } = await invokeFn("shopee-categories-predict", {
      organizationId: orgId, action: "get_category", language: "pt-br",
    });
    if (!treeErr) {
      const api2 = (treeData as any)?.data || (treeData as any);
      const resp2 = (api2 as any)?.response || api2;
      const list: any[] = Array.isArray((resp2 as any)?.category_list) ? (resp2 as any).category_list : [];
      shopeeCategoriesRaw = list;
      for (const c of list) {
        const key = String((c as any)?.category_id ?? (c as any)?.id ?? "");
        const val = String((c as any)?.display_category_name ?? (c as any)?.original_category_name ?? (c as any)?.category_name ?? "");
        if (key) nameById[key] = val;
      }
      roots = list
        .filter((c: any) => Number(c?.parent_category_id || 0) === 0)
        .map((c: any) => ({
          id: String(c?.category_id || ""),
          name: String(c?.display_category_name || c?.original_category_name || c?.category_name || "Categoria"),
        }));
    }
  } catch { }

  const suggestions = normalized.map((s: any) => ({
    ...s,
    category_name: nameById[String(s.category_id)] || s.category_name,
  }));

  return { suggestions, shopeeCategoriesRaw, roots, nameById, ok, errorCode, errorMessage };
}

// ─── Payload builders ────────────────────────────────────────────────────────

function parsePrice(price: string): number {
  const raw = String(price || "").trim();
  if (!raw) return 0;
  const norm = raw.replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const val = Number(norm);
  return isNaN(val) ? 0 : val;
}

export function buildMLPayload(p: BuildMLPayloadParams): any {
  const priceNum = parsePrice(p.price);
  const hasVariations = (p.variations || []).length > 0;

  const sanitizedVariations = hasVariations
    ? (p.variations || []).map((v: any) => {
        let combos = Array.isArray(v?.attribute_combinations)
          ? (v.attribute_combinations as any[]).filter((c: any) => !!c?.id && (!!c?.value_id || !!c?.value_name))
          : [];
        if (String(p.categoryId).toUpperCase() === "MLB33388") {
          const bad = new Set(["GTIN", "DETAILED_MODEL", "MAIN_COLOR", "SELLER_SKU"]);
          combos = combos.filter((c: any) => !bad.has(String(c?.id || "").toUpperCase()));
        }
        const qty = Number(v?.available_quantity) || 0;
        const obj: any = { attribute_combinations: combos, available_quantity: qty };
        if (priceNum) obj.price = priceNum;
        const varAttrs = Array.isArray(v?.attributes)
          ? (v.attributes as any[]).filter((a: any) => !!a?.id && (!!a?.value_id || !!a?.value_name || !!a?.value_struct) && String(a?.id || "").toUpperCase() !== "MAIN_COLOR")
          : [];
        if (varAttrs.length > 0) obj.attributes = varAttrs;
        return obj;
      })
    : [];

  const condAttr = (p.attributes || []).find((x: any) => String(x?.id || "").toUpperCase() === "ITEM_CONDITION");
  let normalizedCondition: string | undefined;
  if (condAttr) {
    const vid = String((condAttr as any)?.value_id || "");
    const vname = String((condAttr as any)?.value_name || "").toLowerCase();
    if (vid === "2230284" || /\bnovo\b|\bnew\b/.test(vname)) normalizedCondition = "new";
    else if (vid === "2230581" || /\busado\b|\bused\b/.test(vname)) normalizedCondition = "used";
    else if (vid === "2230580" || /\bn[aã]o\s*especificado\b|\bnot\s*specified\b/.test(vname)) normalizedCondition = "not_specified";
    else if (/\brecondicionad[oa]\b|\brefurbished\b/.test(vname)) normalizedCondition = "refurbished";
  }

  const payload: any = {
    site_id: p.siteId,
    title: p.title,
    category_id: p.categoryId,
    currency_id: p.currencyId,
    pictures: p.pictures.slice(0, 6).map((url) => ({ source: url })),
  };

  const supportedConditions = new Set(["new", "used", "not_specified", "refurbished"]);
  if (normalizedCondition && supportedConditions.has(normalizedCondition)) {
    payload.condition = normalizedCondition;
    payload.attributes = [...(p.attributes || []).filter((x: any) => String(x?.id || "").toUpperCase() !== "ITEM_CONDITION")];
  } else {
    payload.attributes = [...(p.attributes || [])];
  }

  if (sanitizedVariations.length > 0) payload.variations = sanitizedVariations;
  if (!hasVariations && p.availableQuantity) payload.available_quantity = p.availableQuantity;
  if (!hasVariations && priceNum) payload.price = priceNum;
  if (p.listingTypeId) payload.listing_type_id = p.listingTypeId;

  if (p.shipping && Object.keys(p.shipping).length > 0) {
    const dimsObj = (p.shipping as any)?.dimensions || null;
    const w = dimsObj?.width || 0;
    const h = dimsObj?.height || 0;
    const l = dimsObj?.length || 0;
    const weight = (p.shipping as any)?.weight || 0;
    const ih = Math.round(h); const il = Math.round(l);
    const iw = Math.round(w); const ig = Math.round(weight);
    const sellerAttrs: any[] = [];
    if (ih > 0) sellerAttrs.push({ id: "SELLER_PACKAGE_HEIGHT", value_name: `${ih} cm` });
    if (il > 0) sellerAttrs.push({ id: "SELLER_PACKAGE_LENGTH", value_name: `${il} cm` });
    if (iw > 0) sellerAttrs.push({ id: "SELLER_PACKAGE_WIDTH", value_name: `${iw} cm` });
    if (ig > 0) sellerAttrs.push({ id: "SELLER_PACKAGE_WEIGHT", value_name: `${ig} g` });
    if (sellerAttrs.length > 0) {
      const baseAttrs = (payload.attributes || []).filter((x: any) => !/^(SELLER_PACKAGE_HEIGHT|SELLER_PACKAGE_LENGTH|SELLER_PACKAGE_WIDTH|SELLER_PACKAGE_WEIGHT)$/i.test(String(x?.id || "")));
      payload.attributes = [...baseAttrs, ...sellerAttrs];
    }
    const dimsStr = il && ih && iw && ig ? `${il}x${ih}x${iw},${ig}` : undefined;
    const ship: any = {};
    if ((p.shipping as any)?.mode) ship.mode = (p.shipping as any).mode;
    if (typeof (p.shipping as any)?.local_pick_up !== "undefined") ship.local_pick_up = !!(p.shipping as any).local_pick_up;
    if (typeof (p.shipping as any)?.free_shipping !== "undefined") ship.free_shipping = !!(p.shipping as any).free_shipping;
    if (dimsStr) ship.dimensions = dimsStr;
    if (ship.mode && Array.isArray(p.shippingModesAvailable) && p.shippingModesAvailable.length > 0) {
      const mm = String(ship.mode || "").toLowerCase();
      const avail = p.shippingModesAvailable.map((m) => String(m).toLowerCase());
      if (!avail.includes(mm)) ship.mode = avail.includes("me2") ? "me2" : p.shippingModesAvailable[0];
    }
    payload.shipping = ship;
  }

  if (p.saleTerms.length > 0) payload.sale_terms = p.saleTerms;
  if (p.preferFlex) payload.sellerShippingPreferences = { prefer_flex: true };

  return { payload, sanitizedVariations, priceNum, hasVariations };
}

export function buildShopeePayload(p: BuildShopeePayloadParams): any {
  const priceNum = parsePrice(p.price);
  const imageUrlList = (p.pictures || []).slice(0, 8).filter((u) => typeof u === "string" && /^https?:\/\//i.test(String(u)));
  const weightKg = (() => {
    const w = Number((p.shipping as any)?.weight || 0);
    return Number.isFinite(w) && w > 0 ? w / 1000 : undefined;
  })();
  const dim = (p.shipping as any)?.dimensions || {};
  const pkgHeight = Number(dim?.height || (p.shipping as any)?.height || 0);
  const pkgLength = Number(dim?.length || (p.shipping as any)?.length || 0);
  const pkgWidth = Number(dim?.width || (p.shipping as any)?.width || 0);

  const models: any = (() => {
    if (!p.variationsEnabled || !Array.isArray(p.variations) || p.variations.length === 0) return [];
    const uniqueComboIds = Array.from(new Set<string>((p.variations || []).flatMap((v: any) => {
      return (Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : []).map((c: any) => String(c?.id || ""));
    }).filter(Boolean)));
    const orderedIds = (p.variationAttrs || []).map((a: any) => String(a?.id || "")).filter((id: string) => uniqueComboIds.includes(id));
    const tiers = orderedIds.map((id: string) => {
      const name = String((p.variationAttrs || []).find((a: any) => String(a?.id || "") === id)?.name || id);
      const optsSet = new Set<string>();
      (p.variations || []).forEach((v: any) => {
        const cur = (Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : []).find((c: any) => String(c?.id || "") === id);
        const text = String(cur?.value_name || cur?.name || "").trim();
        if (text) optsSet.add(text);
      });
      return { name, option_list: Array.from(optsSet).map((t) => ({ option_text: t })) };
    });
    const model_list = (p.variations || []).map((v: any) => {
      const combos = Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : [];
      const tier_index = orderedIds.map((id: string, idx: number) => {
        const cur = combos.find((c: any) => String(c?.id || "") === id);
        const text = String(cur?.value_name || cur?.name || "").trim();
        const i = (tiers[idx]?.option_list || []).findIndex((o: any) => String(o?.option_text || "") === text);
        return i >= 0 ? i : 0;
      });
      const skuAttr = (Array.isArray(v?.attributes) ? v.attributes : []).find((a: any) => String(a?.id || "").toUpperCase() === "SELLER_SKU");
      const model_sku = String((skuAttr as any)?.value_name || "") || undefined;
      const priceStr = String(v?.price || "").trim();
      const priceNumVar = (() => {
        if (!priceStr) return priceNum || 0;
        const norm = priceStr.replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9.]/g, "");
        const val = Number(norm);
        return isNaN(val) ? priceNum || 0 : val;
      })();
      return { tier_index, model_sku, price: priceNumVar, normal_stock: Math.max(0, Number(v?.available_quantity) || 0) };
    });
    return { tiers, model_list };
  })();

  const payloadShopee: any = {
    category_id: Number(p.categoryId) || 0,
    item_name: p.title,
    attributes: p.attributes || [],
    original_price: priceNum || undefined,
    description: p.description,
    image: imageUrlList.length ? { image_url_list: imageUrlList } : undefined,
    weight: weightKg,
    dimension: (pkgHeight && pkgLength && pkgWidth) ? {
      package_height: pkgHeight, package_length: pkgLength, package_width: pkgWidth,
    } : undefined,
    item_status: "UNLIST",
    ...(Array.isArray((models as any)?.model_list) && (models as any).model_list.length > 0 ? {
      tier_variation: (models as any).tiers,
      model_list: (models as any).model_list,
    } : {}),
  };

  return payloadShopee;
}

// ─── Publish ─────────────────────────────────────────────────────────────────

/** Maps API error message and causes to a step id and field name for UX. */
export function mapErrorToStep(
  errorMessage: string,
  causes: string[],
  isShopeeMode: boolean
): { stepId: number; field: string } {
  const merged = [errorMessage, ...causes].join(" \n ").toLowerCase();
  const find = (kw: string | RegExp) => {
    if (typeof kw === "string") return merged.includes(kw.toLowerCase());
    return (kw as RegExp).test(merged);
  };
  let stepId = 8;
  let field = "Revisão";
  if (find(/categor(y|ia)/i)) { stepId = 2; field = "Categoria"; }
  else if (find(/title|título/i)) { stepId = 2; field = "Título"; }
  else if (find(/description|descri[cç][aã]o/i)) { stepId = 3; field = "Descrição"; }
  else if (find(/item[_-]?condition|condi[cç][aã]o/i)) { stepId = 3; field = "Condição"; }
  else if (find(/attribute|atributo/i) && !find(/variation|varia[cç][aã]o/i)) { stepId = isShopeeMode ? 4 : 3; field = "Atributos"; }
  else if (find(/ficha|technical|t[eé]cnica/i)) { stepId = isShopeeMode ? 4 : 5; field = "Ficha técnica"; }
  else if (find(/variation|varia[cç][aã]o|attribute[_-]?combinations/i)) { stepId = isShopeeMode ? 5 : 4; field = "Variações"; }
  else if (find(/picture|pictures|image|foto|thumbnail/i) || find(/pictures\s+are\s+mandatory|fotos\s+obrigat[oó]rias/i)) { stepId = isShopeeMode ? 3 : 4; field = "Imagens"; }
  else if (find(/price|pre[cç]o|listing[_-]?type/i)) { stepId = 6; field = "Preço/Publicação"; }
  else if (find(/shipping|envio|dimensions|dimens[oõ]es|weight|peso|me2|mercado\s*envios/i)) { stepId = 7; field = "Envio e dimensões"; }
  else if (find(/available[_-]?quantity|estoque/i)) { stepId = isShopeeMode ? 5 : 4; field = "Estoque da variação"; }
  return { stepId, field };
}

export async function publishListing(p: PublishListingParams): Promise<PublishResult> {
  const priceNum = parsePrice(p.price);
  const hasVariations = (p.variations || []).length > 0;

  // Validation: variation data
  if (hasVariations) {
    const invalid = (p.variations || []).find(
      (v: any) =>
        !Array.isArray(v?.attribute_combinations) ||
        v.attribute_combinations.length === 0 ||
        typeof v?.available_quantity !== "number" ||
        v.available_quantity <= 0 ||
        !(Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0)
    );
    if (invalid) {
      return { success: false, errorStepId: 4, errorField: "Variações", errorMessage: "Cada variação precisa de atributos, quantidade e ao menos uma foto." };
    }
    if (!priceNum) {
      return { success: false, errorStepId: 6, errorField: "Preço", errorMessage: "Informe o preço para variações." };
    }
    if (Array.isArray(p.variationRequiredIds) && p.variationRequiredIds.length > 0) {
      const sanitized = (p.variations || []).map((v: any) => {
        const combos = Array.isArray(v?.attribute_combinations) ? (v.attribute_combinations as any[]).filter((c: any) => !!c?.id && (!!c?.value_id || !!c?.value_name)) : [];
        return { attribute_combinations: combos };
      });
      const missingAny = sanitized.find((vv: any) => {
        const idsSet = new Set((vv?.attribute_combinations || []).map((c: any) => String(c?.id || "").toUpperCase()));
        return p.variationRequiredIds.some((rid) => !idsSet.has(String(rid || "").toUpperCase()));
      });
      if (missingAny) {
        const namesMap = new Map<string, string>();
        (p.variationAttrs || []).forEach((a: any) => namesMap.set(String(a?.id || "").toUpperCase(), String(a?.name || a?.id || "")));
        const reqNames = p.variationRequiredIds.map((id) => namesMap.get(String(id).toUpperCase()) || id).join(", ");
        return { success: false, errorStepId: 4, errorField: "Atributos de variação", errorMessage: `Informe: ${reqNames}` };
      }
    }
  }

  // Validation: ME2 dimensions
  const mode = String(p.shipping?.mode || "").toLowerCase();
  const isMe2 = mode === "me2";
  if (isMe2 && p.shipping && Object.keys(p.shipping).length > 0) {
    const dims = (p.shipping as any)?.dimensions || {};
    const h = Math.round(Number(dims?.height));
    const l = Math.round(Number(dims?.length));
    const w = Math.round(Number(dims?.width));
    const g = Math.round(Number((p.shipping as any)?.weight || dims?.weight || 0));
    if (!(h > 0 && l > 0 && w > 0 && g > 0)) {
      return { success: false, errorStepId: 7, errorField: "Dimensões do pacote", errorMessage: "Informe altura, comprimento, largura e peso do pacote em inteiros (cm/g)." };
    }
  }

  // Build upload variation files (ML)
  const uploadVariationFiles: any[][] = [];
  if ((p.variations || []).length > 0) {
    for (let i = 0; i < p.variations.length; i++) {
      const v = p.variations[i];
      const files = Array.isArray(v?.pictureFiles) ? v.pictureFiles : [];
      const arr: any[] = [];
      for (const f of files) {
        let fileObj = await ensureFile(f);
        if (!fileObj) continue;
        if (/^image\//.test(fileObj.type)) {
          try { fileObj = await compressImage(fileObj, 0.85, 1280); } catch { }
        }
        const b64 = await fileToBase64(fileObj);
        arr.push({ filename: fileObj.name || "upload", type: fileObj.type || "application/octet-stream", data_b64: b64 });
        if (arr.length >= 10) break;
      }
      uploadVariationFiles.push(arr);
    }
  }

  // Resolve picture URLs for ML payload
  let pictureUrls: string[] = hasVariations ? [] : (p.pictures || []).filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));
  const opt2 = (p.listingPriceOptions || []).find((o: any) => String(o?.listing_type_id || o?.id || "") === String(p.listingTypeId || ""));
  const requiresPic2 = !!(opt2 as any)?.requires_picture || String(p.listingTypeId || "").toLowerCase() === "gold_pro" || String(p.listingTypeId || "").toLowerCase() === "gold_special";
  if (hasVariations && requiresPic2 && pictureUrls.length === 0 && p.organizationId) {
    for (let i = 0; i < (p.variations || []).length; i++) {
      const v = p.variations[i];
      const files = Array.isArray(v?.pictureFiles) ? v.pictureFiles : [];
      if (files.length > 0) {
        const first = await ensureFile(files[0]);
        if (first) {
          const url = await uploadImageToStorage(first, p.organizationId, p.currentDraftId);
          if (url) { pictureUrls = [url]; break; }
        }
      }
    }
  }
  if (!hasVariations && (p.pictures || []).some((x) => x instanceof File)) {
    const resolved: string[] = [];
    for (const item of p.pictures || []) {
      if (typeof item === "string" && /^https?:\/\//i.test(item)) resolved.push(item);
      else if (item instanceof File) {
        const url = await uploadImageToStorage(item, p.organizationId, p.currentDraftId);
        if (url) resolved.push(url);
      }
    }
    if (resolved.length > 0) pictureUrls = resolved;
  }

  let data: any = null;
  let error: any = null;

  if (p.isShopeeMode) {
    const payloadShopee = buildShopeePayload({
      categoryId: p.categoryId,
      title: p.title,
      attributes: p.attributes,
      price: p.price,
      description: p.description,
      pictures: pictureUrls.length > 0 ? pictureUrls : (p.pictures || []).filter((u): u is string => typeof u === "string").slice(0, 8),
      shipping: p.shipping,
      variations: p.variations,
      variationAttrs: p.variationAttrs,
      variationsEnabled: p.variationsEnabled,
    });
    const res = await publishToShopee(p.organizationId!, payloadShopee);
    data = res.data;
    error = res.error;
  } else {
    const built = buildMLPayload({
      siteId: p.siteId,
      title: p.title,
      categoryId: p.categoryId,
      currencyId: p.currencyId,
      attributes: p.attributes,
      variations: p.variations,
      pictures: pictureUrls,
      price: p.price,
      listingTypeId: p.listingTypeId,
      shipping: p.shipping,
      saleTerms: p.saleTerms || [],
      availableQuantity: p.availableQuantity,
      shippingModesAvailable: p.shippingModesAvailable || [],
      preferFlex: p.preferFlex,
    });
    const sellerShippingPreferences = p.preferFlex ? { prefer_flex: true } : undefined;
    const res = await publishToML(
      p.organizationId!,
      built.payload,
      p.description,
      uploadVariationFiles,
      sellerShippingPreferences
    );
    data = res.data;
    error = res.error;
  }

  if (error || (data && (data as any)?.error)) {
    const rawMsg = error?.message || (data as any)?.meli?.message || (data as any)?.message || (data as any)?.error || "Erro";
    const rawCauses: string[] = Array.isArray((data as any)?.meli?.cause)
      ? ((data as any).meli.cause as any[]).map((c: any) => String(c?.message || c?.code || "")).filter(Boolean)
      : [];
    const { stepId, field } = mapErrorToStep(rawMsg, rawCauses, p.isShopeeMode);
    return { success: false, errorStepId: stepId, errorField: field, errorMessage: rawMsg };
  }

  if (p.currentDraftId && p.organizationId) {
    try {
      await (supabase as any).from("marketplace_drafts").delete().eq("id", p.currentDraftId).eq("organizations_id", p.organizationId);
    } catch { }
  }
  return { success: true };
}
