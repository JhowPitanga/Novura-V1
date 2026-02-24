import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse as json, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { digits, mapDomainStatus } from "../_shared/domain/focus-status.ts";

function toNumberOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isCpf(s: string | null | undefined): boolean {
  const v = digits(s);
  return v.length === 11;
}

function isCnpj(s: string | null | undefined): boolean {
  const v = digits(s);
  return v.length === 14;
}

function arrayBufferToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}
function simplifyItems(arr: any[]): any[] {
  const out: any[] = [];
  for (const it of Array.isArray(arr) ? arr : []) {
    const title = typeof it?.item?.title === "string" ? it.item.title : (typeof it?.title === "string" ? it.title : "");
    const qtyRaw = it?.quantity ?? (it?.requested_quantity?.value ?? 1);
    const qty = Number(qtyRaw);
    const priceRaw = it?.unit_price ?? it?.price ?? 0;
    const price = Number(priceRaw);
    const sku = String(it?.item?.seller_sku ?? it?.seller_sku ?? "");
    out.push({
      product_name: title,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      price_per_unit: Number.isFinite(price) && price >= 0 ? price : 0,
      sku,
    });
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({}, 200);
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const reqId = crypto.randomUUID();
    const log = (step: string, context?: any) => {
      try {
        const entry = {
          source: "focus-nfe-emit",
          reqId,
          ts: new Date().toISOString(),
          step,
          context: context ?? null,
        };
        console.log(JSON.stringify(entry));
      } catch (_) {}
    };
    const FOCUS_TOKEN = Deno.env.get("FOCUS_API_TOKEN");
    if (!FOCUS_TOKEN) {
      log("config_error");
      return json({ error: "Missing service configuration" }, 500);
    }

    const admin = createAdminClient() as any;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    let user: any = null;
    try {
      const { data: userRes, error: userErr } = await (admin as any).auth.getUser(token);
      if (!userErr && userRes?.user) user = userRes.user;
      else log("unauthorized", { userErr: userErr?.message || "Auth session missing!" });
    } catch (_) {
      log("unauthorized", { userErr: "Auth session missing!" });
    }

    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const organizationId: string | undefined = body?.organizationId || body?.organization_id;
    const companyId: string | undefined = body?.companyId || body?.company_id;
    const orderIds: string[] = Array.isArray(body?.orderIds) ? body.orderIds.map((x: any) => String(x)) : [];
    const syncOnly: boolean = body?.syncOnly === true || body?.sync_only === true || String(body?.operation || "").toLowerCase() === "sync";
    const forceNewNumber: boolean = body?.forceNewNumber === true || body?.force_new_number === true;
    const forceNewRef: boolean = body?.forceNewRef === true || body?.force_new_ref === true;
    const refOverride: string | null = (typeof body?.refOverride === "string" && String(body?.refOverride || "").trim()) ? String(body.refOverride) : null;
    log("request", { userId: user?.id, organizationId, companyId, orderIdsCount: orderIds.length });

    if (!organizationId) return json({ error: "organizationId is required" }, 400);
    if (!companyId) return json({ error: "companyId is required" }, 400);
    if (!orderIds || orderIds.length === 0) return json({ error: "orderIds is required" }, 400);

    if (user?.id) {
      const { data: isMemberData, error: isMemberErr } = await admin.rpc("is_org_member", {
        p_user_id: user.id,
        p_org_id: organizationId,
      });
      const isMember = (Array.isArray(isMemberData) ? isMemberData?.[0] : isMemberData) === true;
      if (isMemberErr || !isMember) return json({ error: "Forbidden" }, 403);
      log("is_member", { ok: isMember === true });
    } else {
      log("is_member_skipped_service", { organizationId });
    }

    const { data: company, error: compErr } = await admin.from("companies").select("*").eq("id", companyId).single();
    if (compErr || !company) return json({ error: compErr?.message || "Company not found" }, 404);
    if (String(company.organization_id || "") !== String(organizationId)) return json({ error: "Company not in organization" }, 403);

    const numeroSerie = company?.numero_serie ?? null;
    let proximaNfe = company?.proxima_nfe ?? null;
    log("company_conf", { hasSerie: !!numeroSerie, proximaNfe });

    const { data: taxConf, error: taxErr } = await admin
      .from("company_tax_configs")
      .select("id, organizations_id, payload, is_default, icms, ipi, pis, cofins, adicionais, natureza_saida, natureza_entrada")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();

    const naturezaSaidaCol: string | null = taxConf?.natureza_saida ? String(taxConf.natureza_saida) : null;
    const naturezaEntradaCol: string | null = taxConf?.natureza_entrada ? String(taxConf.natureza_entrada) : null;
    const naturezaSaidaPayload: string | null = taxConf?.payload?.basics?.naturezaSaida ? String(taxConf.payload.basics.naturezaSaida) : null;
    const naturezaEntradaPayload: string | null = taxConf?.payload?.basics?.naturezaEntrada ? String(taxConf.payload.basics.naturezaEntrada) : null;
    const naturezaSaida: string | null = (naturezaSaidaCol || naturezaSaidaPayload || null);
    const naturezaEntrada: string | null = (naturezaEntradaCol || naturezaEntradaPayload || null);
    log("tax_conf", { hasDefault: !!taxConf, hasNatureza: !!naturezaSaida });

    const environmentInput = String(body?.environment || body?.ambiente || "").toLowerCase();
  const useHomolog = environmentInput.includes("homolog") || environmentInput.includes("teste") || environmentInput.includes("test") || body?.homologacao === true || body?.homolog === true;
    const tokenProducao = company?.focus_token_producao || null;
    const tokenHomolog = company?.focus_token_homologacao || null;
    const FOCUS_TOKEN_USED = useHomolog ? (tokenHomolog || FOCUS_TOKEN) : (tokenProducao || FOCUS_TOKEN);
    log("env_select", {
      environment: environmentInput,
      useHomolog,
      hasCompanyHomolog: !!tokenHomolog,
      hasCompanyProd: !!tokenProducao,
      tokenSource: useHomolog ? (tokenHomolog ? "company_homolog" : "global") : (tokenProducao ? "company_prod" : "global"),
    });
    let tokenForAuth = String(FOCUS_TOKEN_USED || "").trim();
    let basic = btoa(`${tokenForAuth}:`);
    const apiBase = useHomolog ? "https://homologacao.focusnfe.com.br" : "https://api.focusnfe.com.br";
    log("auth_basic_ready", { environment: useHomolog ? "homologacao" : "producao", tokenLen: tokenForAuth.length, apiBase });
    try {
      const cnpjDigits = digits(String(company?.cnpj || ""));
      if (cnpjDigits) {
        const preUrl = new URL(`${apiBase}/v2/empresas/${cnpjDigits}`);
        log("auth_preflight_start", { companyId, cnpj: cnpjDigits, url: preUrl.toString() });
        let preResp = await fetch(preUrl.toString(), {
          method: "GET",
          headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
        });
        let preText = await preResp.text();
        let preJson: any = {};
        try { preJson = preText ? JSON.parse(preText) : {}; } catch { preJson = { raw: preText }; }
        log("auth_preflight_response", { status: preResp.status, ok: preResp.ok, message: preJson?.mensagem || preJson?.message || preJson?.error || null });
        if (preResp.status === 401) {
          // Tentar fallback com token global se diferente do atual
          const globalToken = String(FOCUS_TOKEN || "").trim();
          const isDifferent = globalToken && globalToken !== tokenForAuth;
          if (isDifferent) {
            const basicGlobal = btoa(`${globalToken}:`);
            log("auth_preflight_retry_global", { environment: useHomolog ? "homologacao" : "producao" });
            preResp = await fetch(preUrl.toString(), {
              method: "GET",
              headers: { Authorization: `Basic ${basicGlobal}`, Accept: "application/json" },
            });
            preText = await preResp.text();
            preJson = {};
            try { preJson = preText ? JSON.parse(preText) : {}; } catch { preJson = { raw: preText }; }
            log("auth_preflight_response_global", { status: preResp.status, ok: preResp.ok, message: preJson?.mensagem || preJson?.message || preJson?.error || null });
            if (preResp.ok) {
              // Atualiza credencial para usar token global
              tokenForAuth = globalToken;
              // reatribui basic
              // @ts-expect-error reassigning Basic credential to use global token
              basic = basicGlobal;
            }
          }
          if (preResp.status === 401) {
            log("auth_preflight_failed", { reason: "basic_auth_denied", environment: useHomolog ? "homologacao" : "producao" });
            return json({ error: "Focus token unauthorized for company CNPJ", details: { cnpj: cnpjDigits, environment: useHomolog ? "homologacao" : "producao" } }, 401);
          }
        }
      }
    } catch (_) {}
  const results: Array<{ orderId: string; packId?: number | null; ok: boolean; status?: string; response?: any; error?: string }> = [];

  // Operação de importação de NFe via XML
  const operation = String(body?.operation || "").toLowerCase();
  if (operation === "import_xml" || operation === "importacao") {
    try {
      const xmlBase64: string | null = (typeof body?.xml_base64 === "string" && String(body?.xml_base64).trim()) ? String(body?.xml_base64) : null;
      const xmlText: string | null = (typeof body?.xml_text === "string" && String(body?.xml_text).trim()) ? String(body?.xml_text) : null;
      const nfeKeyInput: string | null = (typeof body?.nfe_key === "string" && String(body?.nfe_key).trim()) ? String(body?.nfe_key) : null;
      const refOverride: string | null = (typeof body?.ref === "string" && String(body?.ref).trim()) ? String(body?.ref) : null;
      const refValue = refOverride || nfeKeyInput || `company-${companyId}-${Date.now()}`;
      const postUrl = new URL(`${apiBase}/v2/nfe/importacao`);
      try { postUrl.searchParams.set("ref", refValue); } catch {}
      const xmlBody = xmlText || (xmlBase64 ? atob(xmlBase64) : null);
      if (!xmlBody) {
        return json({ ok: false, error: "xml_required" }, 400);
      }
      const resp = await fetch(postUrl.toString(), {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, Accept: "application/json", "Content-Type": "application/xml" },
        body: xmlBody,
      });
      const text = await resp.text();
      let j: any = {};
      try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }
      log("focus_import_response", { status: resp.status, ok: resp.ok });
      if (!resp.ok) {
        return json({ ok: false, error: j?.mensagem || j?.message || j?.error || `HTTP ${resp.status}`, response: j }, resp.status);
      }
      const st = j?.status || j?.status_sefaz || "ok";
      const focusId: string | null = j?.uuid || j?.id || null;
      const nfeKey: string | null = j?.chave || j?.chave_nfe || j?.chave_de_acesso || nfeKeyInput || null;
      const nfeNumber: number | null = (j?.numero != null ? Number(j.numero) : null);
      const serie: string | null = j?.serie || null;
      const authorizedAt: string | null = String(st).toLowerCase() === "autorizado" ? (j?.data_autorizacao || new Date().toISOString()) : null;
      const xmlB64: string | null = j?.xml || j?.xml_base64 || (xmlBase64 || (xmlText ? btoa(xmlText) : null));
      const pdfB64: string | null = j?.danfe || j?.pdf || null;
      try {
        const nfWrite: any = {
          company_id: companyId,
          order_id: null,
          marketplace: null,
          pack_id: null,
          tipo: "Saída",
          nfe_number: nfeNumber,
          serie,
          nfe_key: nfeKey,
          status_focus: String(st),
          status: mapDomainStatus(st),
          authorized_at: authorizedAt,
          focus_nfe_id: focusId,
          emissao_ambiente: useHomolog ? "homologacao" : "producao",
          xml_base64: xmlB64 || null,
          pdf_base64: pdfB64 || null,
        };
        const { data: existing } = await admin
          .from("notas_fiscais")
          .select("id")
          .eq("company_id", companyId)
          .eq("nfe_key", nfeKey)
          .eq("emissao_ambiente", useHomolog ? "homologacao" : "producao")
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          await admin.from("notas_fiscais").update(nfWrite).eq("id", existing.id);
        } else {
          await admin.from("notas_fiscais").insert(nfWrite);
        }
        if (String(st).toLowerCase() === "autorizado" && typeof nfeNumber === "number") {
          const nextSeq = Math.max(Number(company?.proxima_nfe || 0), Number(nfeNumber)) + 1;
          try { await admin.from("companies").update({ proxima_nfe: nextSeq }).eq("id", companyId); } catch {}
        }
        log("import_done", { ref: refValue, status: st });
      } catch (_) {}
      return json({ ok: true, response: j });
    } catch (e: any) {
      return json({ ok: false, error: e?.message || String(e) }, 500);
    }
  }

    for (const oid of orderIds) {
      log("order_start", { oid });
      const { data: order, error: orderErr } = await admin
        .from("marketplace_orders_presented_new")
        .select("*")
        .eq("id", oid)
        .eq("organizations_id", organizationId)
        .limit(1)
        .single();

      if (orderErr || !order) {
        log("order_not_found", { oid, error: orderErr?.message });
        results.push({ orderId: oid, ok: false, error: orderErr?.message || "Order not found" });
        continue;
      }

      let destinatarioNome: string = String(order.customer_name || "").trim();
      let ufDest: string = String(order.shipping_state_uf || "").trim();
      const ufEmpresa: string = String(company.estado || "").trim();
      let dentroEstado = !!ufDest && !!ufEmpresa && ufDest.toUpperCase() === ufEmpresa.toUpperCase();

      let addressCity: string = String(order.shipping_city_name || "").trim();
      let addressState: string = String(order.shipping_state_name || ufDest || "").trim();

      let destinatarioDoc: string | null = null;
      let isPessoaFisica = true;
      try {
        const buyerObj: any = order?.buyer || {};
        const docFromBilling = buyerObj?.billing_info?.doc_number || buyerObj?.billing_info?.number || null;
        const docFromId = buyerObj?.identification?.number || null;
        destinatarioDoc = docFromBilling || docFromId || null;
        isPessoaFisica = destinatarioDoc ? isCpf(destinatarioDoc) : true;
      } catch (_) {}

      const { data: presentedNew, error: pNewErr } = await admin
        .from("marketplace_orders_presented_new")
        .select("shipping_city_name, shipping_state_name, shipping_state_uf, shipping_street_name, shipping_street_number, shipping_neighborhood_name, shipping_zip_code, shipping_comment, shipping_address_line, pack_id, linked_products, items_total_quantity, items_total_amount, first_item_title, billing_name, billing_doc_number, billing_doc_type")
        .eq("id", oid)
        .eq("organizations_id", organizationId)
        .limit(1)
        .maybeSingle();

      if (!pNewErr && presentedNew) {
        const ufFromNew = String(presentedNew.shipping_state_uf || "").trim();
        const cityFromNew = String(presentedNew.shipping_city_name || "").trim();
        const stateFromNew = String(presentedNew.shipping_state_name || "").trim();
        const overrideUf = ufFromNew || ufDest;
        const overrideCity = cityFromNew || addressCity;
        const overrideState = stateFromNew || addressState;
        // override address fields from presented_new when available
        ufDest = overrideUf;
        addressCity = overrideCity;
        addressState = overrideState;
        try {
          const emitCity = String(company?.cidade || "").trim();
          const shipCity = String(addressCity || "").trim();
          const n = (s: string) => s
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9\s]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
          if (emitCity && shipCity) {
            const sameCity = n(emitCity) === n(shipCity);
            if (sameCity) {
              dentroEstado = true;
            } else if (ufDest && ufEmpresa) {
              dentroEstado = String(ufDest).toUpperCase() === String(ufEmpresa).toUpperCase();
            }
          } else if (ufDest && ufEmpresa) {
            dentroEstado = String(ufDest).toUpperCase() === String(ufEmpresa).toUpperCase();
          }
        } catch {}
        const destNomeOverride = String((presentedNew as any)?.billing_name || "").trim();
        if (destNomeOverride) {
          // Prefer nome de faturamento completo quando disponível
          destinatarioNome = destNomeOverride;
        }
        const docFromPresented = String((presentedNew as any)?.billing_doc_number || "").trim();
        const docTypeFromPresented = String((presentedNew as any)?.billing_doc_type || "").trim().toUpperCase();
        if (docFromPresented) {
          destinatarioDoc = docFromPresented;
        }
        if (docTypeFromPresented === "CPF") {
          isPessoaFisica = true;
        } else if (docTypeFromPresented === "CNPJ") {
          isPessoaFisica = false;
        } else if (docFromPresented) {
          isPessoaFisica = isCpf(docFromPresented);
        }
        log("presented_new", { oid });
      }
      const addrStreetNew = String((presentedNew as any)?.shipping_street_name || "");
      const addrNumberNew = String((presentedNew as any)?.shipping_street_number || "");
      const addrNeighNew = String((presentedNew as any)?.shipping_neighborhood_name || "");
      const addrZipNew = String((presentedNew as any)?.shipping_zip_code || "");
      const addrCommentNew = String((((presentedNew as any)?.shipping_comment || (presentedNew as any)?.shipping_address_line) || "") || "");
      const pessoaKey = isPessoaFisica ? "PF" : "PJ";
      const abrKey = dentroEstado ? "dentro" : "fora";
      const icmsKey = `saida_${pessoaKey}_${abrKey}`;
      let cfop: string | null = null;
      let sitTribRaw: string | number | null = null;
      let origemFallback: string | number | null = null;
      {
        const icmsCfg = (taxConf as any)?.icms?.[icmsKey] || (taxConf?.payload?.icms?.[icmsKey] || {});
        cfop = icmsCfg?.cfop || null;
        sitTribRaw = icmsCfg?.csosn || icmsCfg?.cst || null;
        origemFallback = icmsCfg?.origem ?? null;
      }
      if (!cfop) {
        results.push({ orderId: oid, ok: false, error: "CFOP não configurado para o cenário de saída" });
        continue;
      }
      if (sitTribRaw === null || sitTribRaw === undefined) {
        results.push({ orderId: oid, ok: false, error: "Situação tributária ICMS não configurada para cenário de saída" });
        continue;
      }
      const tributacao = String(company?.tributacao || "").toLowerCase();
      const regimeSimples = tributacao.includes("simples") || tributacao.includes("mei");
      const regimeNormal = tributacao.includes("regime normal");
      // Não enviar defaults de ICMS. Exigir configuração explícita via company_tax_configs.icms

      let itemsArr: any[] = simplifyItems(Array.isArray(order.order_items) ? order.order_items : []);
      let extrasRowsAll: any[] = [];
      if (!itemsArr || itemsArr.length === 0) {
        try {
          const { data: extrasRows, error: extrasErr } = await admin
            .from("marketplace_order_items")
            .select("model_sku_externo, item_name, quantity, unit_price, linked_products")
            .eq("id", oid);
          if (!extrasErr && Array.isArray(extrasRows) && extrasRows.length > 0) {
            extrasRowsAll = extrasRows;
            itemsArr = extrasRows.map((r: any) => ({
              product_name: String(r?.item_name || ""),
              quantity: Number(r?.quantity || 0),
              price_per_unit: Number(r?.unit_price || 0),
              sku: String(r?.model_sku_externo || ""),
            }));
            log("items_fallback_from_marketplace_order_items", { oid, count: itemsArr.length });
          }
        } catch (_) {}
        if (!itemsArr || itemsArr.length === 0) {
          log("items_missing", { oid });
          results.push({ orderId: oid, ok: false, error: "Pedido sem itens para emissão" });
          continue;
        }
      }
      log("items_parsed", { oid, count: itemsArr.length });

      try {
        const { data: extrasRows, error: extrasErr } = await admin
          .from("marketplace_order_items")
          .select("model_sku_externo, item_name, quantity, unit_price, linked_products")
          .eq("id", oid);
        if (!extrasErr && Array.isArray(extrasRows) && extrasRows.length > 0) {
          extrasRowsAll = extrasRows;
          const bySku = new Map<string, any>();
          const byName = new Map<string, any>();
          for (const r of extrasRows) {
            const kSku = String(r?.model_sku_externo || "").trim();
            const kName = String(r?.item_name || "").trim();
            if (kSku) bySku.set(kSku, r);
            if (kName) byName.set(kName, r);
          }
          if (itemsArr.length === 0) {
            itemsArr = extrasRows.map((r: any) => ({
              product_name: String(r?.item_name || ""),
              quantity: Number(r?.quantity || 0),
              price_per_unit: Number(r?.unit_price || 0),
              sku: String(r?.model_sku_externo || ""),
            }));
          } else {
            itemsArr = itemsArr.map((it: any) => {
              const skuKey = String(it?.sku || "").trim();
              const nameKey = String(it?.product_name || "").trim();
              const match = (skuKey && bySku.get(skuKey)) || (nameKey && byName.get(nameKey)) || null;
              if (match) {
                const q = Number(match.quantity);
                const u = Number(match.unit_price);
                return {
                  ...it,
                  quantity: Number.isFinite(q) && q > 0 ? q : it.quantity,
                  price_per_unit: Number.isFinite(u) && u >= 0 ? u : it.price_per_unit,
                };
              }
              return it;
            });
          }
          log("items_enriched_from_marketplace_order_items", { oid, extrasCount: extrasRows.length });
        }
      } catch (_) {}

      const productById: Record<string, any> = {};
      const linkedBySku: Record<string, string> = {};
      const linkedSkuToProductId: Record<string, string> = {};
      let linkedArrFinal: any[] = [];
      try {
        let linkedArr: any[] = [];
        if (Array.isArray(extrasRowsAll) && extrasRowsAll.length > 0) {
          for (const r of extrasRowsAll) {
            const lp = String(r?.linked_products || "").trim();
            if (lp) {
              let pid: string | null = null;
              try {
                const parsed = JSON.parse(lp);
                if (Array.isArray(parsed)) {
                  for (const e of parsed) {
                    const p = String(e?.product_id || "").trim();
                    const s = String(e?.sku || "").trim();
                    if (p) linkedArr.push({ product_id: p, sku: s });
                  }
                } else if (parsed && typeof parsed === "object") {
                  const p = String(parsed?.product_id || "").trim();
                  const s = String(parsed?.sku || "").trim();
                  if (p) linkedArr.push({ product_id: p, sku: s });
                } else {
                  pid = lp;
                }
              } catch {
                pid = lp;
              }
              if (pid) {
                const s = String(r?.model_sku_externo || "").trim();
                linkedArr.push({ product_id: pid, sku: s || undefined });
              }
            }
          }
        }
        linkedArrFinal = linkedArr;
        const productIds = Array.from(new Set(linkedArr.map((e: any) => String(e?.product_id || "")).filter((x) => !!x)));
        if (productIds.length > 0) {
          const { data: prods, error: prodsErr } = await admin
            .from("products")
            .select("id, sku, ncm, tax_origin_code, barcode, cest, name")
            .in("id", productIds);
          if (!prodsErr && Array.isArray(prods)) {
            for (const p of prods) {
              productById[String(p.id)] = p;
              const skuKey = String(p.sku || "");
              if (skuKey) linkedBySku[skuKey] = String(p.id);
            }
            // map linked_products sku to product_id explicitly to honor the vínculo
            for (const e of linkedArr) {
              const pid = String(e?.product_id || "");
              const sku = String(e?.sku || "");
              if (pid && sku) linkedSkuToProductId[sku] = pid;
            }
          }
        }
        const linkedSkus = Array.from(new Set(linkedArr.map((e: any) => String(e?.sku || "")).filter((x) => !!x)));
        if (linkedSkus.length > 0) {
          const { data: prodsBySku, error: prodsBySkuErr } = await admin
            .from("products")
            .select("id, sku, ncm, tax_origin_code, barcode, cest, name")
            .in("sku", linkedSkus);
          if (!prodsBySkuErr && Array.isArray(prodsBySku)) {
            for (const p of prodsBySku) {
              productById[String(p.id)] = p;
              const skuKey = String(p.sku || "");
              if (skuKey) {
                linkedBySku[skuKey] = String(p.id);
                if (!linkedSkuToProductId[skuKey]) linkedSkuToProductId[skuKey] = String(p.id);
              }
            }
          }
        }
      } catch (_) {
        // best-effort
      }
      try {
        const { data: mipl, error: miplErr } = await admin
          .from("marketplace_item_product_links")
          .select("product_id")
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", order.marketplace);
        if (!miplErr && Array.isArray(mipl)) {
          const extraIds = Array.from(new Set(mipl.map((x: any) => String(x?.product_id || "")).filter((id: string) => !!id && !productById[id])));
          if (extraIds.length > 0) {
            const { data: prods2, error: prodsErr2 } = await admin
              .from("products")
              .select("id, sku, ncm, tax_origin_code, barcode, cest, name")
              .in("id", extraIds);
            if (!prodsErr2 && Array.isArray(prods2)) {
              for (const p of prods2) {
                productById[String(p.id)] = p;
                const skuKey = String(p.sku || "");
                if (skuKey && !linkedBySku[skuKey]) linkedBySku[skuKey] = String(p.id);
              }
            }
          }
        }
      } catch (_) {}
      log("products_loaded", { oid, productsCount: Object.keys(productById).length });

      const mappedItems: any[] = [];
      let itemsOk = true;
      let missingLinkSku: string | null = null;
      let itemError: string | null = null;
      if (!cfop) {
        log("cfop_missing", { oid });
        results.push({ orderId: oid, ok: false, error: "CFOP não configurado no ICMS padrão" });
        continue;
      }

      for (const it of itemsArr) {
        const sku = String(it?.sku || "").trim();
        let descricao = String(it?.product_name || "").trim() || "Item";
        const qtd = Number(it?.quantity || 1);
        const unitPrice = Number(it?.price_per_unit || 0);
        let ncm: string | null = null;
        const unidade: string = "UN";
        let origem: string | null = null;
        let barcode: string | null = null;
        let cest: string | null = null;
        let lpUsed: any = null;

        if (sku) {
          // Prefer the product vinculado (linked_products) for this SKU
          const linkedIdViaLinks = linkedSkuToProductId[sku];
          const linkedIdForSku = linkedIdViaLinks || linkedBySku[sku];
          if (linkedIdForSku && productById[linkedIdForSku]) {
            const lp = productById[linkedIdForSku];
            lpUsed = lp;
            ncm = lp?.ncm ? String(lp.ncm) : null;
            origem = (lp?.tax_origin_code !== null && lp?.tax_origin_code !== undefined) ? String(lp.tax_origin_code) : null;
            barcode = lp?.barcode ? String(lp.barcode) : null;
            cest = lp?.cest ? String(lp.cest) : null;
          } else {
              if (linkedBySku[sku] && productById[linkedBySku[sku]]) {
                const lp = productById[linkedBySku[sku]];
                lpUsed = lp;
                ncm = lp?.ncm ? String(lp.ncm) : null;
                origem = (lp?.tax_origin_code !== null && lp?.tax_origin_code !== undefined) ? String(lp.tax_origin_code) : null;
                barcode = lp?.barcode ? String(lp.barcode) : null;
                cest = lp?.cest ? String(lp.cest) : null;
              } else {
                const { data: pBySku2 } = await admin
                  .from("products")
                  .select("id, sku, ncm, tax_origin_code, barcode, cest, name")
                  .eq("sku", sku)
                  .limit(1)
                  .maybeSingle();
                if (pBySku2) {
                  const pid2 = String(pBySku2.id);
                  productById[pid2] = pBySku2;
                  linkedBySku[sku] = pid2;
                  lpUsed = pBySku2;
                  ncm = pBySku2?.ncm ? String(pBySku2.ncm) : null;
                  origem = (pBySku2?.tax_origin_code !== null && pBySku2?.tax_origin_code !== undefined) ? String(pBySku2.tax_origin_code) : null;
                  barcode = pBySku2?.barcode ? String(pBySku2.barcode) : null;
                  cest = pBySku2?.cest ? String(pBySku2.cest) : null;
                } else {
                  let onlyPid2: string | null = null;
                  if (linkedArrFinal.length === 1) {
                    onlyPid2 = String(linkedArrFinal[0]?.product_id || "") || null;
                  }
                  if (!onlyPid2 && Array.isArray(linkedArrFinal) && linkedArrFinal.length > 0) {
                    const uniqPids = Array.from(new Set(linkedArrFinal.map((e: any) => String(e?.product_id || "")).filter((x) => !!x)));
                    if (uniqPids.length === 1) onlyPid2 = uniqPids[0];
                  }
                  if (!onlyPid2 && Array.isArray(extrasRowsAll) && extrasRowsAll.length > 0) {
                    const match = extrasRowsAll.find((r: any) => String(r?.item_name || "").trim() === descricao);
                    if (match) {
                      const rawLp = String(match?.linked_products || "").trim();
                      if (rawLp) {
                        try {
                          const parsed = JSON.parse(rawLp);
                          if (Array.isArray(parsed) && parsed.length > 0) {
                            onlyPid2 = String(parsed[0]?.product_id || "") || null;
                          } else if (parsed && typeof parsed === "object") {
                            onlyPid2 = String(parsed?.product_id || "") || null;
                          } else {
                            onlyPid2 = rawLp || null;
                          }
                        } catch {
                          onlyPid2 = rawLp || null;
                        }
                      }
                    }
                  }
                  if (onlyPid2) {
                    let lp2 = productById[onlyPid2] || null;
                    if (!lp2) {
                      const { data: pOne2 } = await admin
                        .from("products")
                        .select("id, sku, ncm, tax_origin_code, barcode, cest, name")
                        .eq("id", onlyPid2)
                        .limit(1)
                        .maybeSingle();
                      if (pOne2) {
                        productById[String(pOne2.id)] = pOne2;
                        lp2 = pOne2;
                      }
                    }
                    if (lp2) {
                      lpUsed = lp2;
                      ncm = lp2?.ncm ? String(lp2.ncm) : null;
                      origem = (lp2?.tax_origin_code !== null && lp2?.tax_origin_code !== undefined) ? String(lp2.tax_origin_code) : null;
                      barcode = lp2?.barcode ? String(lp2.barcode) : null;
                      cest = lp2?.cest ? String(lp2.cest) : null;
                    } else {
                      missingLinkSku = sku || descricao;
                      itemsOk = false;
                      itemError = "produto_nao_encontrado";
                      break;
                    }
                  } else {
                    missingLinkSku = sku || descricao;
                    itemsOk = false;
                    itemError = "produto_nao_encontrado";
                    break;
                  }
                }
              }
          }
        } else {
          // Sem SKU: se existir vínculo único, usa o produto vinculado
          if (linkedArrFinal.length === 1) {
            const onlyPid = String(linkedArrFinal[0]?.product_id || "");
            let lp = onlyPid && productById[onlyPid] ? productById[onlyPid] : null;
            if (!lp && onlyPid) {
              const { data: pOne } = await admin
                .from("products")
                .select("id, sku, ncm, tax_origin_code, barcode, cest, name")
                .eq("id", onlyPid)
                .limit(1)
                .maybeSingle();
              if (pOne) {
                productById[String(pOne.id)] = pOne;
                lp = pOne;
              }
            }
            if (lp) {
              lpUsed = lp;
              ncm = lp?.ncm ? String(lp.ncm) : null;
              origem = (lp?.tax_origin_code !== null && lp?.tax_origin_code !== undefined) ? String(lp.tax_origin_code) : null;
              barcode = lp?.barcode ? String(lp.barcode) : null;
              cest = lp?.cest ? String(lp.cest) : null;
            } else {
              missingLinkSku = descricao;
              itemsOk = false;
              itemError = "produto_nao_encontrado";
              break;
            }
          } else {
            missingLinkSku = descricao;
            itemsOk = false;
            itemError = "produto_nao_encontrado";
            break;
          }
        }

        let origemIsMissing = origem === null || origem === undefined;
        if (origemIsMissing && (origemFallback !== null && origemFallback !== undefined)) {
          origem = String(origemFallback);
          origemIsMissing = origem === null || origem === undefined;
        }
        if (!ncm || !cfop || origemIsMissing) {
          itemsOk = false;
          missingLinkSku = sku || descricao;
          if (!ncm) itemError = "ncm_ausente";
          else if (origemIsMissing) itemError = "origem_ausente";
          break;
        }

        if ((!descricao || descricao === "Item") && lpUsed?.name) {
          descricao = String(lpUsed.name);
        }

        descricao = lpUsed?.name ? String(lpUsed.name) : descricao;
        const codigoOut = lpUsed?.sku ? String(lpUsed.sku) : (sku || descricao);
        const itemPayload: any = {
          codigo: codigoOut,
          descricao,
          ncm,
          cfop,
          unidade_comercial: unidade,
          quantidade_comercial: qtd,
          valor_unitario_comercial: unitPrice,
        };
        const sitNum = sitTribRaw !== null && sitTribRaw !== undefined
          ? Number(String(sitTribRaw).replace(/\D/g, ""))
          : NaN;
        itemPayload.icms_situacao_tributaria = Number.isFinite(sitNum) ? sitNum : undefined;
        itemPayload.origem = Number(String(origem).replace(/\D/g, ""));
        if (barcode) itemPayload.ean = barcode;
        if (cest) itemPayload.cest = cest;
        mappedItems.push(itemPayload);
      }

      if (!itemsOk) {
        log("items_invalid", { oid, missingLinkSku });
        const errMsg = itemError === "produto_nao_encontrado"
          ? (missingLinkSku ? `Item ${missingLinkSku} não vinculado a nenhum produto` : "Item não vinculado a produto")
          : (itemError === "ncm_ausente"
            ? (missingLinkSku ? `Produto ${missingLinkSku} sem NCM configurado` : "Produto sem NCM configurado")
            : (itemError === "origem_ausente"
              ? (missingLinkSku ? `Produto ${missingLinkSku} sem origem ICMS (tax_origin_code)` : "Produto sem origem ICMS (tax_origin_code)")
              : "Missing NCM/CFOP/Origem para itens"));
        results.push({ orderId: oid, ok: false, error: errMsg });
        continue;
      }

      if (!numeroSerie) {
        log("serie_number_missing", { oid, numeroSerie, proximaNfe });
        results.push({ orderId: oid, ok: false, error: "Missing NF series" });
        continue;
      }

      const modalidadeFrete = 2;
      const totalPago = Number(order.payment_total_paid_amount || order.order_total || 0);
      const destinatarioObj: any = {
        nome: destinatarioNome || "Cliente",
        endereco: {
          logradouro: "",
          numero: "",
          complemento: "",
          bairro: "",
          municipio: addressCity || "",
          uf: ufDest || "",
          cep: "",
        },
      };
      if (destinatarioDoc && isCpf(destinatarioDoc)) destinatarioObj.cpf = digits(destinatarioDoc);
      if (destinatarioDoc && isCnpj(destinatarioDoc)) destinatarioObj.cnpj = digits(destinatarioDoc);
      try {
        destinatarioObj.endereco.logradouro = String(addrStreetNew || destinatarioObj.endereco.logradouro || "");
        destinatarioObj.endereco.numero = String(addrNumberNew || destinatarioObj.endereco.numero || "");
        destinatarioObj.endereco.bairro = String(addrNeighNew || destinatarioObj.endereco.bairro || "");
        destinatarioObj.endereco.cep = digits(addrZipNew || destinatarioObj.endereco.cep || "");
        destinatarioObj.endereco.complemento = String(addrCommentNew || destinatarioObj.endereco.complemento || "");
        const shipmentsArr: any[] = Array.isArray(order?.shipments) ? order.shipments : [];
        const s0: any = shipmentsArr.length > 0 ? shipmentsArr[0] : null;
        const rx: any = s0?.receiver_address || s0?.receiver || s0?.address || null;
        const street = rx?.street_name || rx?.address_line || rx?.street_address || rx?.street || "";
        const number = rx?.street_number || rx?.number || "";
        const neigh = (rx?.neighborhood && (rx?.neighborhood?.name || rx?.neighborhood?.id)) || rx?.neighborhood_name || "";
        const zip = rx?.zip_code || rx?.zipcode || rx?.zip || "";
        const comp = rx?.comment || rx?.complement || "";
        destinatarioObj.endereco.logradouro = String(street || destinatarioObj.endereco.logradouro || "");
        destinatarioObj.endereco.numero = String(number || destinatarioObj.endereco.numero || "");
        destinatarioObj.endereco.bairro = String(neigh || destinatarioObj.endereco.bairro || "");
        destinatarioObj.endereco.cep = digits(zip || destinatarioObj.endereco.cep || "");
        destinatarioObj.endereco.complemento = String(comp || destinatarioObj.endereco.complemento || "");
        if (!destinatarioObj.endereco.logradouro || !destinatarioObj.endereco.numero || !destinatarioObj.endereco.bairro || !destinatarioObj.endereco.cep) {
          const dest1: any = s0?.destination?.shipping_address || null;
          const street1 = dest1?.street_name || dest1?.address_line || dest1?.street_address || dest1?.street || "";
          const number1 = dest1?.street_number || dest1?.number || "";
          const neigh1 = (dest1?.neighborhood && (dest1?.neighborhood?.name || dest1?.neighborhood?.id)) || dest1?.neighborhood_name || "";
          const zip1 = dest1?.zip_code || dest1?.zipcode || dest1?.zip || "";
          const comp1 = dest1?.comment || dest1?.complement || "";
          destinatarioObj.endereco.logradouro = String(destinatarioObj.endereco.logradouro || street1 || "");
          destinatarioObj.endereco.numero = String(destinatarioObj.endereco.numero || number1 || "");
          destinatarioObj.endereco.bairro = String(destinatarioObj.endereco.bairro || neigh1 || "");
          destinatarioObj.endereco.cep = digits(destinatarioObj.endereco.cep || zip1 || "");
          destinatarioObj.endereco.complemento = String(destinatarioObj.endereco.complemento || comp1 || "");
        }
        if (!destinatarioObj.endereco.logradouro || !destinatarioObj.endereco.numero || !destinatarioObj.endereco.bairro || !destinatarioObj.endereco.cep) {
          const dx: any = (order as any)?.data?.shipping?.receiver_address || (order as any)?.data?.shipping?.shipping_address || null;
          const street2 = dx?.street_name || dx?.address_line || dx?.street_address || dx?.street || "";
          const number2 = dx?.street_number || dx?.number || "";
          const neigh2 = (dx?.neighborhood && (dx?.neighborhood?.name || dx?.neighborhood?.id)) || dx?.neighborhood_name || "";
          const zip2 = dx?.zip_code || dx?.zipcode || dx?.zip || "";
          const comp2 = dx?.comment || dx?.complement || "";
          destinatarioObj.endereco.logradouro = String(destinatarioObj.endereco.logradouro || street2 || "");
          destinatarioObj.endereco.numero = String(destinatarioObj.endereco.numero || number2 || "");
          destinatarioObj.endereco.bairro = String(destinatarioObj.endereco.bairro || neigh2 || "");
          destinatarioObj.endereco.cep = digits(destinatarioObj.endereco.cep || zip2 || "");
          destinatarioObj.endereco.complemento = String(destinatarioObj.endereco.complemento || comp2 || "");
        }
      } catch (_) {}
      log("destinatario_ready", {
        oid,
        hasDoc: !!(destinatarioObj.cpf || destinatarioObj.cnpj),
        municipio: destinatarioObj.endereco.municipio,
        uf: destinatarioObj.endereco.uf,
        cepLen: String(destinatarioObj.endereco.cep || "").length,
      });
      log("destinatario_endereco", {
        oid,
        logradouro: destinatarioObj.endereco.logradouro,
        numero: destinatarioObj.endereco.numero,
        bairro: destinatarioObj.endereco.bairro,
        cep: destinatarioObj.endereco.cep,
        complemento: destinatarioObj.endereco.complemento,
      });

      const packId = (presentedNew as any)?.pack_id || null;
      const packIdStr = String(packId ?? "").trim();
      const packIdRef = packIdStr && packIdStr !== "0" ? packIdStr : String(order.marketplace_order_id || "");
      const referenciaObj: any = {
        companyId,
        marketplace: order.marketplace,
        marketplace_order_id: order.marketplace_order_id,
        pack_id: packIdRef,
        environment: (useHomolog ? "homologacao" : "producao"),
      };
      let refStr = `pack-${packIdRef}-order-${order.marketplace_order_id}-company-${companyId}`;
      if (refOverride) {
        refStr = refOverride;
      } else if (forceNewRef) {
        refStr = `${refStr}-retry-${Date.now()}`;
      }

      if (syncOnly) {
        try {
          const cUrl = new URL(`${apiBase}/v2/nfe/${encodeURIComponent(refStr)}`);
          try { cUrl.searchParams.set("completa", "1"); } catch {}
          const cResp = await fetch(cUrl.toString(), {
            method: "GET",
            headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
          });
          const cText = await cResp.text();
          let cJson: any = {};
          try { cJson = cText ? JSON.parse(cText) : {}; } catch { cJson = { raw: cText }; }
          if (!cResp.ok) {
            log("sync_focus_error", { oid, httpStatus: cResp.status, message: cJson?.mensagem || cJson?.message || "Erro na consulta" });
            results.push({ orderId: oid, packId, ok: false, status: cJson?.status || cJson?.status_sefaz, error: cJson?.mensagem || cJson?.message || "Falha ao consultar NF-e por referência", response: cJson });
            continue;
          }
          const statusSync: string = cJson?.status || cJson?.status_sefaz || "pendente";
          const focusIdSync: string | null = cJson?.uuid || cJson?.id || null;
          const nfeKeySync: string | null = cJson?.chave || cJson?.chave_nfe || cJson?.chave_de_acesso || null;
          const nfeNumberSync: number | null = typeof cJson?.numero === "number" ? cJson?.numero : null;
          const serieSync: string | null = cJson?.serie || null;
          const authorizedAtSync: string | null = String(statusSync).toLowerCase() === "autorizado" ? (cJson?.data_autorizacao || new Date().toISOString()) : null;
          const xmlB64Sync: string | null = cJson?.xml || cJson?.xml_base64 || null;
          const pdfB64Sync: string | null = cJson?.danfe || cJson?.pdf || null;
          const { data: existingSync } = await admin
            .from("notas_fiscais")
            .select("id")
            .eq("company_id", companyId)
            .eq("marketplace_order_id", order.marketplace_order_id)
            .eq("emissao_ambiente", useHomolog ? "homologacao" : "producao")
            .limit(1)
            .maybeSingle();
          const nfWriteSync: any = {
            company_id: companyId,
            order_id: oid,
            marketplace: order.marketplace,
            marketplace_order_id: order.marketplace_order_id,
            pack_id: packId,
            nfe_number: nfeNumberSync,
            serie: serieSync,
            nfe_key: nfeKeySync,
            status_focus: String(statusSync),
            status: mapDomainStatus(statusSync),
            authorized_at: authorizedAtSync,
            focus_nfe_id: focusIdSync,
            emissao_ambiente: useHomolog ? "homologacao" : "producao",
          };
          if (xmlB64Sync) nfWriteSync.xml_base64 = xmlB64Sync;
          if (pdfB64Sync) nfWriteSync.pdf_base64 = pdfB64Sync;
          if (existingSync?.id) {
            const { error: updErrS } = await admin.from("notas_fiscais").update(nfWriteSync).eq("id", existingSync.id);
            if (updErrS) log("notas_fiscais_sync_update_error", { oid, marketplace_order_id: order.marketplace_order_id, error: updErrS.message });
          } else {
            const { error: insErrS } = await admin.from("notas_fiscais").insert(nfWriteSync);
            if (insErrS) log("notas_fiscais_sync_insert_error", { oid, marketplace_order_id: order.marketplace_order_id, error: insErrS.message });
          }
          log("sync_done", { oid, ref: refStr, status: statusSync });
          results.push({ orderId: oid, packId, ok: true, status: statusSync, response: cJson });
          continue;
        } catch (e: any) {
          log("sync_exception", { oid, message: e?.message || String(e) });
          results.push({ orderId: oid, packId, ok: false, error: e?.message || String(e) });
          continue;
        }
      }

      // Definir número e série a utilizar, priorizando sequência de notas_fiscais; fallback para companies.proxima_nfe
      let nfeNumberToUse: number | null = null;
      let serieToUse: string | null = numeroSerie || null;
      try {
        // Buscar o maior número já utilizado para a empresa/ambiente (e série quando disponível)
        const baseSel = admin
          .from("notas_fiscais")
          .select("nfe_number, serie")
          .eq("company_id", companyId)
          .eq("emissao_ambiente", useHomolog ? "homologacao" : "producao");
        if (serieToUse) (baseSel as any).eq("serie", serieToUse);
        const { data: maxRow } = await (baseSel as any)
          .order("nfe_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        const hasAny = !!maxRow && typeof maxRow?.nfe_number === "number";
        if (hasAny) {
          nfeNumberToUse = Number(maxRow!.nfe_number) + 1;
        } else {
          nfeNumberToUse = Number(proximaNfe || 0) || 1;
        }
      } catch (_) {}
      try {
        const baseAuth = admin
          .from("notas_fiscais")
          .select("nfe_number, serie, status_focus")
          .eq("company_id", companyId)
          .eq("emissao_ambiente", useHomolog ? "homologacao" : "producao");
        if (serieToUse) (baseAuth as any).eq("serie", serieToUse);
        const { data: maxAuthRow } = await (baseAuth as any)
          .order("nfe_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        const stAuth = String(maxAuthRow?.status_focus || "").toLowerCase();
        const maxAuth = stAuth === "autorizado" ? (typeof maxAuthRow?.nfe_number === "number" ? Number(maxAuthRow!.nfe_number) : 0) : 0;
        if (Number(nfeNumberToUse || 0) <= maxAuth) {
          nfeNumberToUse = maxAuth + 1;
        }
      } catch (_) {}
      try {
        const { data: existingNf } = await admin
          .from("notas_fiscais")
          .select("id, status_focus, nfe_number, serie, nfe_key, focus_nfe_id")
          .eq("company_id", companyId)
          .eq("marketplace_order_id", order.marketplace_order_id)
          .eq("emissao_ambiente", useHomolog ? "homologacao" : "producao")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const st = String(existingNf?.status_focus || "").toLowerCase();
        if (existingNf?.id) {
          if (st === "autorizado") {
            results.push({ orderId: oid, ok: false, error: "NF-e já emitida para este pedido" });
            continue;
          }
          if (st === "denegado") {
            results.push({ orderId: oid, ok: false, error: "Documento denegado: reenvio não permitido" });
            continue;
          }
          if (st !== "cancelado" && st !== "cancelada" && !forceNewNumber && typeof existingNf?.nfe_number === "number") {
            nfeNumberToUse = existingNf!.nfe_number!;
          }
          if (!forceNewNumber && existingNf?.serie) {
            serieToUse = String(existingNf!.serie);
          }
          if (st === "cancelado" || st === "cancelada") {
            const prevNum = typeof existingNf?.nfe_number === "number" ? Number(existingNf!.nfe_number) : null;
            if (prevNum !== null) {
              try { referenciaObj.retry_of_nfe_number = prevNum; } catch {}
            }
          }
        }
      } catch (_) {}

      const dNow = new Date();
      const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', timeZoneName: 'shortOffset', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(dNow);
      const val = (t: string) => (parts.find((p) => p.type === t)?.value) || '00';
      const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-3';
      const sign = tzName.includes('+') ? '+' : '-';
      const m = tzName.match(/GMT([+-]\d+)/);
      const hh = m ? String(Math.abs(parseInt(String(m[1]), 10))).padStart(2, '0') : '03';
      const offset = `${sign}${hh}:00`;
      const dateStr = `${val('year')}-${val('month')}-${val('day')}T${val('hour')}:${val('minute')}:${val('second')}${offset}`;
      const emitCnpj = isCnpj(company?.cnpj) ? digits(company?.cnpj) : null;
      const emitCpf = !emitCnpj && isCpf(company?.cnpj) ? digits(company?.cnpj) : null;
      const emitNome = String(company?.razao_social || "");
      const emitFantasia = String((company as any)?.nome_fantasia || emitNome || "");
      const emitLogradouro = String(company?.endereco || "");
      const emitNumero = Number(company?.numero || 0);
      const emitBairro = String(company?.bairro || "");
      const emitMunicipio = String(company?.cidade || "");
      const emitUf = String(company?.estado || "");
      const emitCep = digits(String(company?.cep || ""));
      const emitIe = String(company?.inscricao_estadual || "");
      const destNome = String(destinatarioObj?.nome || destinatarioNome || "Cliente");
      const destCpf = destinatarioObj?.cpf ? digits(destinatarioObj.cpf) : null;
      const destCnpj = destinatarioObj?.cnpj ? digits(destinatarioObj.cnpj) : null;
      const destLogradouro = String(destinatarioObj?.endereco?.logradouro || "");
      const destNumero = Number(destinatarioObj?.endereco?.numero || 0);
      const destBairro = String(destinatarioObj?.endereco?.bairro || "");
      const destMunicipio = String(destinatarioObj?.endereco?.municipio || "");
      const destUf = String(destinatarioObj?.endereco?.uf || "");
      const destCep = Number(digits(String(destinatarioObj?.endereco?.cep || "")) || 0);
      const destPais = "Brasil";
      if (!destCpf && !destCnpj) {
        log("destinatario_doc_missing", {
          oid,
          billing_doc_number: String((presentedNew as any)?.billing_doc_number || ""),
          billing_doc_type: String((presentedNew as any)?.billing_doc_type || ""),
        });
        results.push({ orderId: oid, packId, ok: false, error: "Documento do destinatário não encontrado (CPF/CNPJ)" });
        continue;
      }
      let pisCst: string | null = null;
      let cofinsCst: string | null = null;
      let pisAliquotaNum: number | null = null;
      let cofinsAliquotaNum: number | null = null;
      let ipiCst: string | null = null;
      let ipiAliquotaNum: number | null = null;
      let ipiCodigoEnquadramento: string | null = null;
      {
        const pisCfg = pessoaKey === "PF"
          ? ((taxConf as any)?.pis?.pf || (taxConf?.payload as any)?.pis?.pf || {})
          : ((taxConf as any)?.pis?.pj || (taxConf?.payload as any)?.pis?.pj || {});
        const cofCfg = pessoaKey === "PF"
          ? ((taxConf as any)?.cofins?.pf || (taxConf?.payload as any)?.cofins?.pf || {})
          : ((taxConf as any)?.cofins?.pj || (taxConf?.payload as any)?.cofins?.pj || {});
        pisCst = pisCfg?.cst ? String(pisCfg.cst) : null;
        cofinsCst = cofCfg?.cst ? String(cofCfg.cst) : null;
        try {
          const pAliq = pisCfg?.aliquota;
          const cAliq = cofCfg?.aliquota;
          pisAliquotaNum = (pAliq !== null && pAliq !== undefined) ? Number(String(pAliq).replace(",", ".")) : null;
          cofinsAliquotaNum = (cAliq !== null && cAliq !== undefined) ? Number(String(cAliq).replace(",", ".")) : null;
        } catch {}
        const ipiCfg = pessoaKey === "PF"
          ? ((taxConf as any)?.ipi?.pf || (taxConf?.payload as any)?.ipi?.pf || {})
          : ((taxConf as any)?.ipi?.pj || (taxConf?.payload as any)?.ipi?.pj || {});
        ipiCst = ipiCfg?.cst ? String(ipiCfg.cst) : null;
        try {
          const iAliq = ipiCfg?.aliquota;
          ipiAliquotaNum = (iAliq !== null && iAliq !== undefined) ? Number(String(iAliq).replace(",", ".")) : null;
        } catch {}
        ipiCodigoEnquadramento = ipiCfg?.codigoEnquadramento ? String(ipiCfg.codigoEnquadramento) : null;
      }
      if (!pisCst || !cofinsCst) {
        results.push({ orderId: oid, packId, ok: false, error: "Configuração PIS/COFINS ausente para cenário de saída" });
        continue;
      }
      const itemsFocus = mappedItems.map((it: any, idx: number) => {
        const qtd = Number(it?.quantidade_comercial || it?.quantidade || 1);
        const unit = Number(it?.valor_unitario_comercial || it?.valor_unitario || it?.price_per_unit || 0);
        const ncmNum = Number(String(it?.ncm || "").replace(/\D/g, "")) || null;
        const origemNum = it?.origem !== undefined && it?.origem !== null ? Number(String(it?.origem).replace(/\D/g, "")) : undefined;
        const itemOut: any = {
          numero_item: idx + 1,
          codigo_produto: String(it?.codigo || it?.descricao || ""),
          descricao: String(it?.descricao || ""),
          cfop: Number(it?.cfop || cfop || 0),
          unidade_comercial: String(it?.unidade_comercial || "UN").toLowerCase(),
          quantidade_comercial: qtd,
          valor_unitario_comercial: unit,
          valor_unitario_tributavel: unit,
          unidade_tributavel: String(it?.unidade_comercial || "UN").toLowerCase(),
          codigo_ncm: ncmNum,
          quantidade_tributavel: qtd,
          valor_bruto: Number((qtd || 0) * (unit || 0)),
          icms_origem: origemNum,
          pis_situacao_tributaria: String(pisCst),
          cofins_situacao_tributaria: String(cofinsCst),
        };
        if (pisAliquotaNum !== null && pisAliquotaNum !== undefined) itemOut.pis_aliquota = Number(pisAliquotaNum);
        if (cofinsAliquotaNum !== null && cofinsAliquotaNum !== undefined) itemOut.cofins_aliquota = Number(cofinsAliquotaNum);
        {
          const stNum = Number(String(it?.icms_situacao_tributaria ?? sitTribRaw).replace(/\D/g, ""));
          itemOut.icms_situacao_tributaria = Number.isFinite(stNum) ? stNum : undefined;
        }
        return itemOut;
      });
      const valorProdutos = itemsFocus.reduce((acc: number, cur: any) => acc + Number(cur?.valor_bruto || 0), 0);
      const valorFrete = 0;
      const valorSeguro = 0;
      let payload: any = {
        natureza_operacao: naturezaSaida || "Venda de mercadorias",
        data_emissao: dateStr,
        data_entrada_saida: dateStr,
        tipo_documento: 1,
        finalidade_emissao: 1,
        cnpj_emitente: emitCnpj || undefined,
        cpf_emitente: emitCpf || undefined,
        nome_emitente: emitNome,
        nome_fantasia_emitente: emitFantasia,
        logradouro_emitente: emitLogradouro,
        numero_emitente: Number.isFinite(emitNumero) && emitNumero > 0 ? emitNumero : undefined,
        bairro_emitente: emitBairro,
        municipio_emitente: emitMunicipio,
        uf_emitente: emitUf,
        cep_emitente: emitCep,
        inscricao_estadual_emitente: emitIe || undefined,
        nome_destinatario: destNome,
        cpf_destinatario: destCpf || undefined,
        cnpj_destinatario: destCnpj || undefined,
        logradouro_destinatario: destLogradouro,
        numero_destinatario: Number.isFinite(destNumero) && destNumero > 0 ? destNumero : undefined,
        bairro_destinatario: destBairro,
        municipio_destinatario: destMunicipio,
        uf_destinatario: destUf,
        pais_destinatario: destPais,
        cep_destinatario: destCep || undefined,
        valor_frete: valorFrete,
        valor_seguro: valorSeguro,
        valor_total: Number(valorProdutos + valorFrete + valorSeguro),
        valor_produtos: Number(valorProdutos),
        modalidade_frete: Number(modalidadeFrete),
        serie: serieToUse,
        numero: nfeNumberToUse,
        referencia: JSON.stringify(referenciaObj),
        ref: refStr,
        items: itemsFocus,
      };
      log("payload_ready", { oid, items: itemsFocus.length, valorProdutos, valorTotal: Number(valorProdutos + valorFrete + valorSeguro), ref: refStr });

      try {
        const { data: reserveRes, error: reserveErr } = await (admin as any).rpc('fn_reservar_e_numerar_notas', {
          p_company_id: companyId,
          p_order_id: oid,
          p_emissao_ambiente: (useHomolog ? "homologacao" : "producao"),
          p_payload: payload,
          p_marketplace: order.marketplace,
          p_marketplace_order_id: order.marketplace_order_id,
          p_pack_id: packIdRef,
          p_tipo: "Saída",
          p_total_value: Number(valorProdutos + valorFrete + valorSeguro)
        });
        if (reserveErr) {
          results.push({ orderId: oid, packId, ok: false, error: reserveErr?.message || String(reserveErr) });
          continue;
        }
        const newPayload = reserveRes?.payload || payload;
        payload = newPayload;
        const numeroRpc = reserveRes?.numero;
        const serieRpc = reserveRes?.serie;
        if (numeroRpc != null) nfeNumberToUse = Number(numeroRpc);
        if (serieRpc != null) serieToUse = String(serieRpc);
        log("nf_reserved", { oid, nfeNumber: nfeNumberToUse, serie: serieToUse });
      } catch (e: any) {
        results.push({ orderId: oid, packId, ok: false, error: e?.message || String(e) });
        continue;
      }

      const url = new URL(`${apiBase}/v2/nfe`);
      try { url.searchParams.set("ref", refStr); } catch {}
      log("focus_url", { oid, url: url.toString() });
      const resp = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      let jsonResp: any = {};
      try { jsonResp = text ? JSON.parse(text) : {}; } catch { jsonResp = { raw: text }; }
      log("focus_response", { oid, httpStatus: resp.status, ok: resp.ok, status: jsonResp?.status || jsonResp?.status_sefaz });

      if (!resp.ok) {
        const errCode = String(jsonResp?.codigo || jsonResp?.error_code || "").toLowerCase();
        const errMsgRaw = jsonResp?.mensagem || jsonResp?.message || jsonResp?.error;
        log("focus_error", { oid, message: errMsgRaw, code: errCode });
        try { log("focus_error_details", { oid, raw: text?.slice(0, 400) || null }); } catch {}
        // Se a API indicar que a nota já foi processada, consultar por ref e sincronizar como autorizada
        if (errCode === "already_processed") {
          try {
            const cUrl = new URL(`${apiBase}/v2/nfe/${encodeURIComponent(refStr)}`);
            try { cUrl.searchParams.set("completa", "1"); } catch {}
            const cResp = await fetch(cUrl.toString(), {
              method: "GET",
              headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
            });
            const cText = await cResp.text();
            let cJson: any = {};
            try { cJson = cText ? JSON.parse(cText) : {}; } catch { cJson = { raw: cText }; }
            const stC = cJson?.status || cJson?.status_sefaz || "ok";
            const focusIdC: string | null = cJson?.uuid || cJson?.id || null;
            const nfeKeyC: string | null = cJson?.chave || cJson?.chave_nfe || cJson?.chave_de_acesso || null;
            const nfeNumberC: number | null = toNumberOrNull(cJson?.numero) ?? nfeNumberToUse;
            const serieC: string | null = cJson?.serie || serieToUse || null;
            const authorizedAtC: string | null = String(stC).toLowerCase() === "autorizado" ? (cJson?.data_autorizacao || new Date().toISOString()) : null;
            const xmlB64C: string | null = cJson?.xml || cJson?.xml_base64 || null;
            const pdfB64C: string | null = cJson?.danfe || cJson?.pdf || null;
            const { data: existingAuth } = await admin
              .from("notas_fiscais")
              .select("id")
              .eq("company_id", companyId)
              .eq("marketplace_order_id", order.marketplace_order_id)
              .eq("emissao_ambiente", useHomolog ? "homologacao" : "producao")
              .limit(1)
              .maybeSingle();
            const writeAuth: any = {
              status_focus: String(stC),
              status: mapDomainStatus(stC),
              authorized_at: authorizedAtC,
              nfe_number: nfeNumberC,
              xml_base64: xmlB64C || null,
              pdf_base64: pdfB64C || null,
              nfe_key: nfeKeyC,
              focus_nfe_id: focusIdC,
              serie: serieC,
            };
            if (existingAuth?.id) {
              await admin.from("notas_fiscais").update(writeAuth).eq("id", existingAuth.id);
            } else {
              await admin.from("notas_fiscais").insert({
                company_id: companyId,
                order_id: oid,
                marketplace: order.marketplace,
                marketplace_order_id: order.marketplace_order_id,
                pack_id: packId,
                nfe_number: nfeNumberC,
                serie: serieC,
                nfe_key: nfeKeyC,
                status_focus: String(stC),
                status: mapDomainStatus(stC),
                authorized_at: authorizedAtC,
                focus_nfe_id: focusIdC,
                emissao_ambiente: useHomolog ? "homologacao" : "producao",
                xml_base64: xmlB64C || null,
                pdf_base64: pdfB64C || null,
              });
            }
            // Atualizar próxima numeração com base no número autorizado
            const nextSeq = Math.max(Number(proximaNfe || 0), Number(nfeNumberC || 0)) + 1;
            try {
              const { error: updErr2 } = await admin.from("companies").update({ proxima_nfe: nextSeq }).eq("id", companyId);
              if (!updErr2) proximaNfe = nextSeq;
            } catch {}
            try {
              await admin
                .from("notas_fiscais")
                .update({ marketplace_submission_status: "pending" })
                .eq("company_id", companyId)
                .eq("marketplace_order_id", order.marketplace_order_id);
            } catch {}
            try {
              let updOk = false;
              const { data: d1, error: e1 } = await admin
                .from("marketplace_orders_presented_new")
                .update({ status_interno: "subir xml" })
                .eq("organizations_id", organizationId)
                .eq("company_id", companyId)
                .eq("marketplace", order.marketplace)
                .eq("marketplace_order_id", order.marketplace_order_id)
                .select("id");
              updOk = !e1 && Array.isArray(d1) && d1.length > 0;
              if (!updOk) {
                const { data: d2, error: e2 } = await admin
                  .from("marketplace_orders_presented_new")
                  .update({ status_interno: "subir xml" })
                  .eq("organizations_id", organizationId)
                  .eq("company_id", companyId)
                  .eq("marketplace_order_id", order.marketplace_order_id)
                  .select("id");
                updOk = !e2 && Array.isArray(d2) && d2.length > 0;
                if (!updOk) {
                  const { data: d3, error: e3 } = await admin
                    .from("marketplace_orders_presented_new")
                    .update({ status_interno: "subir xml" })
                    .eq("company_id", companyId)
                    .eq("marketplace_order_id", order.marketplace_order_id)
                    .select("id");
                  updOk = !e3 && Array.isArray(d3) && d3.length > 0;
                }
              }
              if (!updOk) {
                log("presented_new_update_authorized_not_found", { organizationId, companyId, marketplaceOrderId: order.marketplace_order_id, marketplace: order.marketplace, attempted: ["with_marketplace", "without_marketplace", "company_only"] });
              }
            } catch {}
            log("already_processed_sync", { oid, status: stC });
            results.push({ orderId: oid, packId, ok: true, status: stC, response: cJson });
            continue;
          } catch (_) {
            // Falhou sincronização, cair para escrita de erro
          }
        }
        try {
          const { data: existingErr } = await admin
            .from("notas_fiscais")
            .select("id")
            .eq("company_id", companyId)
            .eq("order_id", oid)
            .eq("emissao_ambiente", useHomolog ? "homologacao" : "producao")
            .limit(1)
            .maybeSingle();
          const nfErrWrite: any = {
            company_id: companyId,
            order_id: oid,
            marketplace: order.marketplace,
            ...(String(order.marketplace_order_id || "").match(/^\d+$/) ? { marketplace_order_id: String(order.marketplace_order_id) } : {}),
            pack_id: packId,
            nfe_number: nfeNumberToUse,
            serie: serieToUse,
            nfe_key: jsonResp?.chave || jsonResp?.chave_nfe || null,
            status_focus: String(jsonResp?.status || "erro_autorizacao"),
            status: mapDomainStatus(jsonResp?.status),
            focus_nfe_id: jsonResp?.uuid || jsonResp?.id || null,
            emissao_ambiente: useHomolog ? "homologacao" : "producao",
            error_details: {
              status_sefaz: jsonResp?.status_sefaz || null,
              mensagem_sefaz: jsonResp?.mensagem_sefaz || jsonResp?.message || jsonResp?.error || null,
            },
          };
          if (existingErr?.id) {
            await admin.from("notas_fiscais").update(nfErrWrite).eq("id", existingErr.id);
          } else {
            await admin.from("notas_fiscais").insert(nfErrWrite);
          }
          try {
            await admin
              .from("marketplace_orders_presented_new")
              .update({ status_interno: "Falha na emissão" })
              .eq("organizations_id", organizationId)
              .eq("company_id", companyId)
              .eq("marketplace", order.marketplace)
              .eq("marketplace_order_id", order.marketplace_order_id);
          } catch (_) {}
        } catch (_) {}
        results.push({ orderId: oid, packId, ok: false, error: errMsgRaw || `HTTP ${resp.status}`, response: jsonResp });
        continue;
      }

      let status: string = jsonResp?.status || jsonResp?.status_sefaz || "ok";
      const focusId: string | null = jsonResp?.uuid || jsonResp?.id || null;
      let nfeKey: string | null = jsonResp?.chave || jsonResp?.chave_nfe || jsonResp?.chave_de_acesso || null;
      let nfeNumber: number | null = toNumberOrNull(jsonResp?.numero) ?? nfeNumberToUse;
      const serieLocal: string | null = jsonResp?.serie || serieToUse || null;
      let authorizedAt: string | null = String(status).toLowerCase() === "autorizado" ? (jsonResp?.data_autorizacao || new Date().toISOString()) : null;
      let xmlB64: string | null = jsonResp?.xml || jsonResp?.xml_base64 || null;
      let pdfB64: string | null = jsonResp?.danfe || jsonResp?.pdf || null;
      try {
        const cUrl = new URL(`${apiBase}/v2/nfe/${encodeURIComponent(refStr)}`);
        try { cUrl.searchParams.set("completa", "1"); } catch {}
        const cResp = await fetch(cUrl.toString(), {
          method: "GET",
          headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
        });
        const cText = await cResp.text();
        let cJson: any = {};
        try { cJson = cText ? JSON.parse(cText) : {}; } catch { cJson = { raw: cText }; }
        const stC = cJson?.status || cJson?.status_sefaz || status;
        status = stC;
        if (String(stC).toLowerCase() === "autorizado") {
          xmlB64 = cJson?.xml || cJson?.xml_base64 || xmlB64 || null;
          pdfB64 = cJson?.danfe || cJson?.pdf || pdfB64 || null;
          authorizedAt = cJson?.data_autorizacao || authorizedAt || new Date().toISOString();
          nfeNumber = toNumberOrNull(cJson?.numero) ?? nfeNumber;
        }
        const nfeKeyC: string | null = cJson?.chave || cJson?.chave_nfe || cJson?.chave_de_acesso || null;
        if (nfeKeyC) nfeKey = nfeKeyC;
      } catch (_) {}

      {
          const { data: existing } = await admin
            .from("notas_fiscais")
            .select("id")
            .eq("company_id", companyId)
            .eq("order_id", oid)
            .eq("emissao_ambiente", useHomolog ? "homologacao" : "producao")
            .limit(1)
            .maybeSingle();
        const nfWriteBase: any = {
          company_id: companyId,
          order_id: oid,
          marketplace: order.marketplace,
          ...(String(order.marketplace_order_id || "").match(/^\d+$/) ? { marketplace_order_id: String(order.marketplace_order_id) } : {}),
          pack_id: packId,
          nfe_number: nfeNumber,
          serie: serieLocal,
          nfe_key: nfeKey,
          status_focus: String(status),
          status: mapDomainStatus(status),
          authorized_at: authorizedAt,
          focus_nfe_id: focusId,
          emissao_ambiente: useHomolog ? "homologacao" : "producao",
        };
        if (xmlB64) nfWriteBase.xml_base64 = xmlB64;
        if (pdfB64) nfWriteBase.pdf_base64 = pdfB64;
        if (existing?.id) {
          const { error: updErr } = await admin.from("notas_fiscais").update(nfWriteBase).eq("id", existing.id);
          if (updErr) log("notas_fiscais_upsert_error", { oid, marketplace_order_id: order.marketplace_order_id, error: updErr.message });
        } else {
          const { error: insErr } = await admin.from("notas_fiscais").insert(nfWriteBase);
          if (insErr) log("notas_fiscais_insert_error", { oid, marketplace_order_id: order.marketplace_order_id, error: insErr.message });
        }
        log("notas_fiscais_upsert", { oid, marketplace_order_id: order.marketplace_order_id, status });
      }

      if (String(status).toLowerCase() !== "autorizado" && focusId) {
        let finalStatus = status;
        let rejected = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          const sResp = await fetch(`https://api.focusnfe.com.br/v2/nfe/${focusId}`, {
            method: "GET",
            headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
          });
          const sText = await sResp.text();
          let sJson: any = {};
          try { sJson = sText ? JSON.parse(sText) : {}; } catch { sJson = { raw: sText }; }
          const st2 = sJson?.status || sJson?.status_sefaz || finalStatus;
          finalStatus = st2;
          log("poll_status", { oid, attempt, status: st2 });
          if (String(st2).toLowerCase() === "autorizado") {
            xmlB64 = sJson?.xml || sJson?.xml_base64 || xmlB64 || null;
            pdfB64 = sJson?.danfe || sJson?.pdf || pdfB64 || null;
            authorizedAt = sJson?.data_autorizacao || new Date().toISOString();
            nfeNumber = toNumberOrNull(sJson?.numero) ?? nfeNumber;
            break;
          }
          if (String(st2).toLowerCase() === "rejeitado" || String(st2).toLowerCase() === "denegado") {
            rejected = true;
            const errMsg = sJson?.message || sJson?.motivo || sJson?.mensagem_sefaz || "Rejeitado";
            await admin
              .from("notas_fiscais")
              .update({
                status_focus: String(st2),
                status: mapDomainStatus(st2),
                error_details: {
                  status_sefaz: sJson?.status_sefaz || null,
                  mensagem_sefaz: sJson?.mensagem_sefaz || sJson?.message || sJson?.motivo || null,
                },
              })
              .eq("company_id", companyId)
              .eq("order_id", oid);
              //.eq("emissao_ambiente", useHomolog ? "homologacao" : "producao");
            try {
              await admin
                .from("marketplace_orders_presented_new")
                .update({ status_interno: "Falha na emissão" })
                .eq("organizations_id", organizationId)
                .eq("company_id", companyId)
                .eq("marketplace", order.marketplace)
                .eq("marketplace_order_id", order.marketplace_order_id);
            } catch (_) {}
            log("poll_rejected", { oid, status: st2, errMsg });
            results.push({ orderId: oid, packId, ok: false, status: st2, error: errMsg, response: sJson });
            break;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
        status = finalStatus;
        if (!rejected && String(status).toLowerCase() === "autorizado") {
          try {
            const nextSeq = Math.max(Number(proximaNfe || 0), Number(nfeNumber || 0)) + 1;
            const { error: updErr2 } = await admin
              .from("companies")
              .update({ proxima_nfe: nextSeq })
              .eq("id", companyId);
            if (!updErr2) proximaNfe = nextSeq;
          } catch {}
          {
            const { data: existingAuth } = await admin
              .from("notas_fiscais")
              .select("id")
              .eq("company_id", companyId)
              .eq("marketplace_order_id", order.marketplace_order_id)
              .eq("emissao_ambiente", useHomolog ? "homologacao" : "producao")
              .limit(1)
              .maybeSingle();
            const writeAuth: any = {
              status_focus: String(status),
              status: mapDomainStatus(status),
              authorized_at: authorizedAt,
              nfe_number: nfeNumber,
              xml_base64: xmlB64 || null,
              pdf_base64: pdfB64 || null,
            };
            if (existingAuth?.id) {
              await admin.from("notas_fiscais").update(writeAuth).eq("id", existingAuth.id);
            } else {
              const baseInsert: any = {
                company_id: companyId,
                order_id: oid,
                marketplace: order.marketplace,
                marketplace_order_id: order.marketplace_order_id,
                pack_id: packId,
                nfe_number: nfeNumber,
                serie: serieLocal,
                nfe_key: nfeKey,
                status_focus: String(status),
                status: mapDomainStatus(status),
                authorized_at: authorizedAt,
                focus_nfe_id: focusId,
                emissao_ambiente: useHomolog ? "homologacao" : "producao",
                xml_base64: xmlB64 || null,
                pdf_base64: pdfB64 || null,
              };
              await admin.from("notas_fiscais").insert(baseInsert);
            }
            try {
              await admin
                .from("notas_fiscais")
                .update({ marketplace_submission_status: "pending" })
                .eq("company_id", companyId)
                .eq("marketplace_order_id", order.marketplace_order_id);
            } catch {}
            try {
              let updOk = false;
              const { data: d1, error: e1 } = await admin
                .from("marketplace_orders_presented_new")
                .update({ status_interno: "subir xml" })
                .eq("organizations_id", organizationId)
                .eq("company_id", companyId)
                .eq("marketplace", order.marketplace)
                .eq("marketplace_order_id", order.marketplace_order_id)
                .select("id");
              updOk = !e1 && Array.isArray(d1) && d1.length > 0;
              if (!updOk) {
                const { data: d2, error: e2 } = await admin
                  .from("marketplace_orders_presented_new")
                  .update({ status_interno: "subir xml" })
                  .eq("organizations_id", organizationId)
                  .eq("company_id", companyId)
                  .eq("marketplace_order_id", order.marketplace_order_id)
                  .select("id");
                updOk = !e2 && Array.isArray(d2) && d2.length > 0;
                if (!updOk) {
                  const { data: d3, error: e3 } = await admin
                    .from("marketplace_orders_presented_new")
                    .update({ status_interno: "subir xml" })
                    .eq("company_id", companyId)
                    .eq("marketplace_order_id", order.marketplace_order_id)
                    .select("id");
                  updOk = !e3 && Array.isArray(d3) && d3.length > 0;
                }
              }
              if (!updOk) {
                log("presented_new_update_authorized_not_found", { organizationId, companyId, marketplaceOrderId: order.marketplace_order_id, marketplace: order.marketplace, attempted: ["with_marketplace", "without_marketplace", "company_only"] });
              }
            } catch {}
          }
          //.eq("emissao_ambiente", useHomolog ? "homologacao" : "producao");
          log("poll_authorized", { oid, status });
          results.push({ orderId: oid, packId, ok: true, status, response: { id: focusId, chave: nfeKey } });
          continue;
        }
        if (!rejected) {
          log("poll_timeout", { oid, finalStatus: status });
          results.push({ orderId: oid, packId, ok: false, status, error: "Timeout aguardando autorização", response: { id: focusId } });
          continue;
        }
      } else {
        // Somente incrementa quando status atual já for autorizado
        if (String(status).toLowerCase() === "autorizado") {
          try {
            const nextSeq = Math.max(Number(proximaNfe || 0), Number(nfeNumber || nfeNumberToUse || 0)) + 1;
            const { error: updErr2 } = await admin
              .from("companies")
              .update({ proxima_nfe: nextSeq })
              .eq("id", companyId);
            if (!updErr2) proximaNfe = nextSeq;
          } catch {}
          log("sent_authorized", { oid, status });
        } else {
          log("sent_not_authorized", { oid, status });
        }
        if (String(status).toLowerCase() === "autorizado") {
          try {
            await admin
              .from("notas_fiscais")
              .update({ marketplace_submission_status: "pending" })
              .eq("company_id", companyId)
              .eq("marketplace_order_id", order.marketplace_order_id);
          } catch {}
          try {
            let updOk = false;
            const { data: d1, error: e1 } = await admin
              .from("marketplace_orders_presented_new")
              .update({ status_interno: "subir xml" })
              .eq("organizations_id", organizationId)
              .eq("company_id", companyId)
              .eq("marketplace", order.marketplace)
              .eq("marketplace_order_id", order.marketplace_order_id)
              .select("id");
            updOk = !e1 && Array.isArray(d1) && d1.length > 0;
            if (!updOk) {
              const { data: d2, error: e2 } = await admin
                .from("marketplace_orders_presented_new")
                .update({ status_interno: "subir xml" })
                .eq("organizations_id", organizationId)
                .eq("company_id", companyId)
                .eq("marketplace_order_id", order.marketplace_order_id)
                .select("id");
              updOk = !e2 && Array.isArray(d2) && d2.length > 0;
              if (!updOk) {
                const { data: d3, error: e3 } = await admin
                  .from("marketplace_orders_presented_new")
                  .update({ status_interno: "subir xml" })
                  .eq("company_id", companyId)
                  .eq("marketplace_order_id", order.marketplace_order_id)
                  .select("id");
                updOk = !e3 && Array.isArray(d3) && d3.length > 0;
              }
            }
            if (!updOk) {
              log("presented_new_update_authorized_not_found", { organizationId, companyId, marketplaceOrderId: order.marketplace_order_id, marketplace: order.marketplace, attempted: ["with_marketplace", "without_marketplace", "company_only"] });
            }
          } catch {}
        }
        results.push({ orderId: oid, packId, ok: true, status, response: jsonResp });
      }
    }

    const allFailed = results.length > 0 && results.every((r) => r && r.ok === false);
    if (allFailed) {
      log("all_failed", results.map((r) => ({ orderId: r.orderId, error: r.error })));
      return json({ ok: false, results, error: "All orders failed" }, 400);
    }
    log("done", { ok: true, count: results.length });
    return json({ ok: true, results });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    try { console.error("focus-nfe-emit", { error: msg }); } catch (_) {}
    return json({ error: msg }, 500);
  }
});
