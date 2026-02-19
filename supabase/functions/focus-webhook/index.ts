import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, HEAD, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

function mapDomainStatus(s: string | null | undefined): string {
  const v = String(s || "").trim().toLowerCase();
  const norm = v.replace(/[^a-z]/g, "");
  if (norm === "autorizado" || norm === "autorizada") return "autorizada";
  if (norm === "rejeitado" || norm === "rejeitada") return "rejeitada";
  if (norm === "denegado" || norm === "denegada") return "denegada";
  if (norm === "cancelado" || norm === "cancelada") return "cancelada";
  return "pendente";
}

const RID = crypto.randomUUID();
function log(step: string, context?: any) {
  try {
    const entry = { source: "focus-webhook", rid: RID, ts: new Date().toISOString(), step, context: context ?? null };
    console.log(JSON.stringify(entry));
  } catch {}
}

serve(async (req) => {
  try {
    const hdr = {
      host: req.headers.get("host") || null,
      content_type: req.headers.get("content-type") || null,
      user_agent: req.headers.get("user-agent") || null,
      forwarded_for: req.headers.get("x-forwarded-for") || null,
      authorization_present: !!req.headers.get("authorization"),
    };
    log("request_start", { method: req.method, url: req.url, headers: hdr });
  } catch {}
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method === "HEAD") return new Response("", { status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, GET, HEAD, OPTIONS", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" } });
  if (!["POST", "GET"].includes(req.method)) {
    log("method_not_allowed", { method: req.method, url: req.url });
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const FOCUS_WEBHOOK_SECRET = Deno.env.get("FOCUS_WEBHOOK_SECRET") || "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    log("config_missing", { hasUrl: !!SUPABASE_URL, hasKey: !!SERVICE_ROLE_KEY });
    return json({ error: "Missing service configuration" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;

  try {
    const url = new URL(req.url);
    const tokenQ = url.searchParams.get("secret") || url.searchParams.get("token") || "";
    const tokenH1 = req.headers.get("x-webhook-secret") || "";
    const tokenH2 = req.headers.get("x-webhook-token") || "";
    const tokenH3 = req.headers.get("x-focus-webhook-secret") || "";
    const tokenH4 = req.headers.get("x-api-token") || "";
    const tokenH5 = req.headers.get("x-focus-token") || "";
    const provided = [tokenQ, tokenH1, tokenH2, tokenH3, tokenH4, tokenH5].filter(Boolean);
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || req.headers.get("x-authorization") || req.headers.get("X-Authorization") || "";
    let secretOk = !!FOCUS_WEBHOOK_SECRET ? provided.some((v) => v === FOCUS_WEBHOOK_SECRET) : true;
    let envFromAuth: "homologacao" | "producao" | null = null;
    log("request_metadata", { method: req.method, url: req.url, providedCount: provided.length, hasServerSecret: !!FOCUS_WEBHOOK_SECRET, hasAuthHeader: !!authHeader, altHeadersPresent: { x_api_token: !!tokenH4, x_focus_token: !!tokenH5 } });
    if (!secretOk) {
      try {
        const isBasic = authHeader && authHeader.toLowerCase().startsWith("basic ");
        log("auth_basic_check", { isBasic });
        if (isBasic) {
          const b64 = authHeader.slice(6).trim();
          let raw = "";
          try { raw = atob(b64) || ""; } catch {}
          const tokenCandidate = (raw.split(":")[0] || "").trim();
          log("auth_basic_token_candidate", { length: tokenCandidate.length > 0 ? tokenCandidate.length : 0 });
          if (tokenCandidate) {
            const { data: compMatch } = await admin
              .from("companies")
              .select("id, focus_token_producao, focus_token_homologacao")
              .or(`focus_token_producao.eq.${tokenCandidate},focus_token_homologacao.eq.${tokenCandidate}`)
              .limit(1)
              .maybeSingle();
            secretOk = !!compMatch?.id;
            if (compMatch?.id) {
              const prodTok = String(compMatch.focus_token_producao || "");
              const homTok = String(compMatch.focus_token_homologacao || "");
              envFromAuth = tokenCandidate === homTok ? "homologacao" : (tokenCandidate === prodTok ? "producao" : null);
            }
            log("auth_basic_company_match", { matched: !!compMatch?.id, envFromAuth });
          }
        } else if (authHeader) {
          try {
            const ah = String(authHeader).trim();
            const lower = ah.toLowerCase();
            let tokenCandidate = "";
            if (lower.startsWith("bearer ")) {
              tokenCandidate = ah.slice(7).trim();
            } else if (lower.startsWith("token ")) {
              tokenCandidate = ah.slice(6).trim();
            } else {
              tokenCandidate = ah;
            }
            log("auth_header_token_candidate", { scheme: lower.split(/\s+/)[0] || "raw", length: tokenCandidate ? tokenCandidate.length : 0 });
            const candidates = [tokenCandidate].filter((v) => !!v);
            for (const cand of candidates) {
              const { data: compMatch2 } = await admin
                .from("companies")
                .select("id, focus_token_producao, focus_token_homologacao")
                .or(`focus_token_producao.eq.${cand},focus_token_homologacao.eq.${cand}`)
                .limit(1)
                .maybeSingle();
              if (compMatch2?.id) {
                secretOk = true;
                const prodTok = String(compMatch2.focus_token_producao || "");
                const homTok = String(compMatch2.focus_token_homologacao || "");
                envFromAuth = cand === homTok ? "homologacao" : (cand === prodTok ? "producao" : null);
                log("auth_header_company_match", { matched: true, envFromAuth });
                break;
              }
            }
          } catch {}
        }
      } catch {}
    }
    if (!secretOk) {
      const providedCount = provided.length;
      const hasAuthHeader = !!authHeader;
      log("unauthorized", { providedCount, hasAuthHeader, reason: !!FOCUS_WEBHOOK_SECRET ? "server_secret_mismatch_or_basic_invalid" : "basic_invalid_or_missing" });
      return json({ error: "Unauthorized webhook" }, 401);
    }

    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    try {
      const isGet = req.method === "GET";
      const hasQuery = url.search && url.search.length > 1;
      if ((!body || Object.keys(body).length === 0) && isGet && hasQuery) {
        const obj: any = {};
        url.searchParams.forEach((v, k) => { obj[k] = v; });
        const embedded = obj.payload || obj.data || obj.body || null;
        if (embedded && typeof embedded === "string") {
          try { body = { ...obj, ...JSON.parse(embedded) }; } catch { body = obj; }
        } else {
          body = obj;
        }
        log("query_params_parsed", { method: req.method, query_keys: Object.keys(obj), query_count: Object.keys(obj).length });
      }
    } catch {}
    try {
      const ct = String(req.headers.get("content-type") || "").toLowerCase();
      const shouldParseForm = (!body || Object.keys(body).length === 0) && (ct.includes("application/x-www-form-urlencoded") || (typeof raw === "string" && raw.includes("=") && raw.includes("&")));
      if (shouldParseForm) {
        const params = new URLSearchParams(raw || "");
        const obj: any = {};
        params.forEach((v, k) => { obj[k] = v; });
        const embedded = obj.payload || obj.data || obj.body || null;
        if (embedded && typeof embedded === "string") {
          try { body = { ...obj, ...JSON.parse(embedded) }; } catch { body = obj; }
        } else {
          body = obj;
        }
        log("form_body_parsed", { method: req.method, keys: Object.keys(obj), count: Object.keys(obj).length });
      }
    } catch {}
    log("body_received", { length: raw?.length ?? 0, preview: raw ? String(raw).slice(0, 500) : "" });

    // Token webhook handling
    try {
      const tokenProducao = body?.token_producao || body?.api_token || body?.token || null;
      const tokenHomologacao = body?.token_homologacao || null;
      const env: string | null = (body?.environment || body?.ambiente || null) ? String(body?.environment || body?.ambiente) : null;
      const refStrInit: string | null = body?.referencia || null;
      let refInit: any = null;
      try { refInit = refStrInit ? JSON.parse(refStrInit) : null; } catch { refInit = null; }
      const companyIdForToken: string | null = refInit?.companyId || null;
      const cnpjForToken: string | null = body?.cnpj || body?.cnpj_emitente || null;
      if (tokenProducao || tokenHomologacao) {
        let targetCompanyId: string | null = companyIdForToken;
        if (!targetCompanyId && cnpjForToken) {
          const { data: foundCompany } = await admin
            .from("companies")
            .select("id")
            .eq("cnpj", String(cnpjForToken).replace(/\D/g, ""))
            .limit(1)
            .maybeSingle();
          targetCompanyId = foundCompany?.id || null;
        }
        if (targetCompanyId) {
          const updatePayload: any = {};
          if (!env || String(env).toLowerCase().includes("prod")) updatePayload.focus_token_producao = tokenProducao || null;
          if (!env || String(env).toLowerCase().includes("homolog")) updatePayload.focus_token_homologacao = tokenHomologacao || null;
          if (Object.keys(updatePayload).length > 0) {
            await admin.from("companies").update(updatePayload).eq("id", targetCompanyId);
            log("token_update_saved", { company_id: targetCompanyId, saved: Object.keys(updatePayload) });
            return json({ ok: true, updated_company_id: targetCompanyId, saved: Object.keys(updatePayload) }, 200);
          }
        }
      }
    } catch {}

    const status: string = String(body?.status || body?.status_sefaz || "").trim();
    const focusId: string | null = body?.uuid || body?.id || null;
    const nfeKey: string | null = body?.chave || body?.chave_nfe || body?.chave_de_acesso || null;
    const nfeNumber: number | null = typeof body?.numero === "number" ? body?.numero : null;
    const serieLocal: string | null = body?.serie || null;
    const authorizedAt: string | null = body?.data_autorizacao || null;
    const referenciaStr: string | null = body?.referencia || body?.ref || null;
    const xmlB64: string | null = body?.xml_base64 || null;
    const pdfB64: string | null = body?.pdf_base64 || null;
    const eventRaw: string | null = body?.event || url.searchParams.get("event") || null;
    const links = {
      caminho_xml: body?.caminho_xml || body?.caminho_xml_nota_fiscal || null,
      caminho_pdf: body?.caminho_pdf || body?.caminho_pdf_danfe || body?.caminho_danfe || null,
    };
    log("hook_event_meta", { event: eventRaw, status, status_sefaz: body?.status_sefaz || null, mensagem_sefaz: body?.mensagem_sefaz || body?.message || null, referencia: referenciaStr, focusId, nfeKey, nfeNumber, serieLocal });

    let ref: any = null;
    try { ref = referenciaStr ? JSON.parse(referenciaStr) : null; } catch { ref = null; }
    if ((!ref || typeof ref !== "object") && referenciaStr) {
      const rr = String(referenciaStr);
      let companyIdP: string | null = null;
      let orderIdP: string | null = null;
      let packIdP: string | null = null;
      const packIdx = rr.indexOf("pack-");
      const orderIdx = rr.indexOf("order-");
      const companyMarker = "-company-";
      const companyIdx = rr.indexOf(companyMarker);
      if (packIdx >= 0 && orderIdx > packIdx) {
        packIdP = rr.substring(packIdx + 5, orderIdx).trim();
      }
      if (orderIdx >= 0 && companyIdx > orderIdx) {
        orderIdP = rr.substring(orderIdx + 6, companyIdx).trim();
      }
      if (companyIdx >= 0) {
        const start = companyIdx + companyMarker.length;
        const retryIdx = rr.indexOf("-retry-", start);
        const compRaw = rr.substring(start, retryIdx >= 0 ? retryIdx : rr.length).trim();
        companyIdP = compRaw;
      }
      const parsed = {
        companyId: companyIdP || null,
        marketplace_order_id: orderIdP || null,
        pack_id: packIdP || null,
      };
      ref = parsed;
      log("ref_string_parsed", { companyId: parsed.companyId ?? null, marketplaceOrderId: parsed.marketplace_order_id ?? null, packId: parsed.pack_id ?? null });
    }
    log("payload_meta", { status, focusId, nfeKey, nfeNumber, serieLocal, authorizedAt, hasXmlB64: !!xmlB64, hasPdfB64: !!pdfB64, ref_companyId: ref?.companyId ?? null, ref_marketplace: ref?.marketplace ?? null, ref_order_id: ref?.marketplace_order_id ?? null, ref_pack_id: ref?.pack_id ?? null });

    const companyId: string | null = ref?.companyId || null;
    const marketplace: string | null = ref?.marketplace || null;
    const marketplaceOrderId: string | null = ref?.marketplace_order_id || null;
    const packId: number | null = typeof ref?.pack_id === "number" ? ref.pack_id : null;

    const whereKey = nfeKey ? { nfe_key: nfeKey } : (focusId ? { focus_nfe_id: focusId } : null);
    let existing: any = null;
    if (whereKey) {
      const { data: found, error: selErr } = await admin
        .from("notas_fiscais")
        .select("id, company_id")
        .match(whereKey)
        .limit(1)
        .maybeSingle();
      if (!selErr && found) existing = found;
      log("nf_select", { whereKey, selErr: selErr?.message ?? null, foundId: found?.id ?? null });
    }

    const nfWrite: any = {
      status_focus: status || null,
      status: mapDomainStatus(status || null),
      focus_nfe_id: focusId,
      nfe_key: nfeKey,
      nfe_number: nfeNumber,
      serie: serieLocal,
      authorized_at: authorizedAt,
      tipo: "Saída",
    };
    try {
      let envRaw: string | null = (body?.environment || body?.ambiente || null) ? String(body?.environment || body?.ambiente) : null;
      if (!envRaw && ref && typeof ref?.environment === "string") envRaw = String(ref.environment);
      const envLower = envRaw ? envRaw.toLowerCase() : "";
      let emissaoAmbiente = envLower.includes("homolog") ? "homologacao" : (envLower ? "producao" : null);
      if (!emissaoAmbiente && envFromAuth) emissaoAmbiente = envFromAuth;
      if (emissaoAmbiente) (nfWrite as any).emissao_ambiente = emissaoAmbiente;
      log("env_resolved", { envRaw, emissaoAmbiente });
    } catch {}

    if (xmlB64) nfWrite.xml_base64 = xmlB64;
    if (pdfB64) nfWrite.pdf_base64 = pdfB64;

    if (companyId) nfWrite.company_id = companyId;
    if (marketplace) nfWrite.marketplace = marketplace;
    if (marketplaceOrderId) nfWrite.marketplace_order_id = marketplaceOrderId;
    {
      const packRaw: any = ref?.pack_id;
      if (packRaw !== undefined && packRaw !== null) {
        const cleaned = String(packRaw).trim().replace(/\-$/, "");
        (nfWrite as any).pack_id = cleaned;
      }
    }

    try {
      let orderIdResolved: string | null = null;
      if (companyId && marketplaceOrderId) {
        try {
          const { data: row1 } = await admin
            .from("marketplace_orders_presented_new")
            .select("id, marketplace, pack_id")
            .eq("company_id", companyId)
            .eq("marketplace_order_id", marketplaceOrderId)
            .limit(1)
            .maybeSingle();
          orderIdResolved = row1?.id || null;
          if (row1) {
            const mk = String((row1 as any)?.marketplace || "").trim();
            if (mk && !nfWrite.marketplace) (nfWrite as any).marketplace = mk;
            const pNew = (row1 as any)?.pack_id;
            if ((nfWrite as any).pack_id === undefined || (nfWrite as any).pack_id === null) {
              if (pNew !== undefined && pNew !== null) {
                const cleaned = String(pNew).trim().replace(/\-$/, "");
                (nfWrite as any).pack_id = cleaned;
              }
            }
          }
        } catch {}
        if (!orderIdResolved) {
          try {
            const { data: row1b } = await admin
              .from("marketplace_orders_presented")
              .select("id, marketplace, pack_id")
              .eq("company_id", companyId)
              .eq("marketplace_order_id", marketplaceOrderId)
              .limit(1)
              .maybeSingle();
            orderIdResolved = row1b?.id || null;
            if (row1b) {
              const mk = String((row1b as any)?.marketplace || "").trim();
              if (mk && !nfWrite.marketplace) (nfWrite as any).marketplace = mk;
              const pNew = (row1b as any)?.pack_id;
              if ((nfWrite as any).pack_id === undefined || (nfWrite as any).pack_id === null) {
                if (pNew !== undefined && pNew !== null) {
                  const cleaned = String(pNew).trim().replace(/\-$/, "");
                  (nfWrite as any).pack_id = cleaned;
                }
              }
            }
          } catch {}
        }
        if (!orderIdResolved) {
          try {
            const { data: row2 } = await admin
              .from("orders")
              .select("id")
              .eq("company_id", companyId)
              .eq("marketplace_order_id", marketplaceOrderId)
              .limit(1)
              .maybeSingle();
            orderIdResolved = row2?.id || null;
          } catch {}
        }
        if (orderIdResolved) (nfWrite as any).order_id = orderIdResolved;
        log("order_id_resolved", { companyId, marketplaceOrderId, orderId: orderIdResolved });
      }
    } catch {}

    try {
      if (!existing && companyId && (nfWrite as any)?.order_id) {
        const { data: found2 } = await admin
          .from("notas_fiscais")
          .select("id, company_id")
          .eq("company_id", companyId)
          .eq("order_id", (nfWrite as any).order_id)
          .limit(1)
          .maybeSingle();
        if (found2?.id) {
          existing = found2;
          log("nf_select_fallback", { companyId, orderId: (nfWrite as any).order_id, foundId: found2?.id ?? null });
        }
      }
    } catch {}

    const respMeta = {
      status_sefaz: body?.status_sefaz || null,
      mensagem_sefaz: body?.mensagem_sefaz || body?.message || body?.error || null,
      links,
    };
    const stLowerMeta = String(status || "").toLowerCase();
    if (stLowerMeta === "erro_autorizacao" || stLowerMeta === "rejeitado" || stLowerMeta === "denegado") {
      (nfWrite as any).error_details = respMeta;
    }
    try {
      function normalize(path: string | null): string | null {
        if (!path) return null;
        const p0 = String(path).trim();
        const p = p0.replace(/^['"`]\s*|\s*['"`]$/g, "");
        if (p.startsWith("http://") || p.startsWith("https://")) return p;
        try { const base = new URL("https://api.focusnfe.com.br/"); return new URL(p, base).toString(); } catch { return p; }
      }
      const xmlUrlNorm = normalize(links.caminho_xml || null);
      const pdfUrlNorm = normalize(links.caminho_pdf || null);
      if (xmlUrlNorm) (nfWrite as any).xml_url = xmlUrlNorm;
      if (pdfUrlNorm) (nfWrite as any).pdf_url = pdfUrlNorm;
      log("links_normalized", { xmlUrl: xmlUrlNorm ?? null, pdfUrl: pdfUrlNorm ?? null });
    } catch {}

    if (existing?.id) {
      const { error: updErr } = await admin.from("notas_fiscais").update(nfWrite).eq("id", existing.id);
      if (updErr) {
        log("nf_update_error", { id: existing.id, error: updErr.message });
        return json({ ok: false, error: updErr.message }, 200);
      }
      log("nf_update_ok", { id: existing.id });
      let organizationsId: string | null = null;
      if (companyId) {
        try {
          const { data: compOrg } = await admin.from("companies").select("organization_id, focus_token_producao, focus_token_homologacao").eq("id", companyId).limit(1).maybeSingle();
          organizationsId = compOrg?.organization_id || null;
          const st = String(status || "").toLowerCase();
          const isAuthorized = (st === "autorizado" || st === "autorizada" || st === "authorized");
          if (isAuthorized && organizationsId && companyId && marketplaceOrderId) {
            let xmlText: string | null = null;
            const xmlUrl = (nfWrite as any)?.xml_url || null;
            const envLower = String((nfWrite as any)?.emissao_ambiente || "").toLowerCase();
            const useToken = envLower.includes("homolog") ? compOrg?.focus_token_homologacao : compOrg?.focus_token_producao;
            if (xmlUrl) {
              try {
                const basic = useToken ? "Basic " + btoa(`${String(useToken)}:`) : undefined;
                const respXml = await fetch(String(xmlUrl), { method: "GET", headers: basic ? { Authorization: basic } : undefined });
                log("xml_fetch_attempt", { url: xmlUrl, status: respXml.status });
                if (respXml.ok) xmlText = await respXml.text();
              } catch {}
            }
            if (!xmlText && xmlB64) {
              try { xmlText = atob(xmlB64); } catch {}
            }
            if (xmlText) {
              try {
                const m = xmlText.match(/<vNF>([\d.,]+)<\/vNF>/);
                if (m && m[1]) {
                  const raw = m[1].replace(/,/g, "."); 
                  const num = Number(raw);
                  if (Number.isFinite(num)) {
                    await admin.from("notas_fiscais").update({ total_value: num, tipo: "Saída" }).eq("id", existing.id);
                    log("nf_total_value_set", { id: existing.id, total_value: num });
                  }
                }
              } catch {}
            }
            if (xmlText) {
              try {
                const mNNF = xmlText.match(/<nNF>(\d+)<\/nNF>/);
                const mSerie = xmlText.match(/<serie>(\d+)<\/serie>/);
                const mDhEmi = xmlText.match(/<dhEmi>([^<]+)<\/dhEmi>/);
                const updates: any = {};
                if (mNNF && mNNF[1]) updates.nfe_number = Number(mNNF[1]);
                if (mSerie && mSerie[1]) updates.serie = mSerie[1];
                if (mDhEmi && mDhEmi[1] && !authorizedAt) {
                  const iso = new Date(mDhEmi[1]).toISOString();
                  updates.authorized_at = iso;
                }
                if (Object.keys(updates).length > 0) {
                  await admin.from("notas_fiscais").update(updates).eq("id", existing.id);
                  log("nf_meta_from_xml_set", { id: existing.id, hasNNF: !!updates.nfe_number, hasSerie: !!updates.serie, hasAuthorizedAt: !!updates.authorized_at });
                }
              } catch {}
            }
            if (xmlText) {
              try {
                await admin
                  .from("marketplace_orders_presented_new")
                  .update({ xml_to_submit: xmlText })
                  .eq("organizations_id", organizationsId)
                  .eq("company_id", companyId)
                  .eq("marketplace", marketplace)
                  .eq("marketplace_order_id", marketplaceOrderId);
                log("presented_new_xml_saved", { organizationsId, companyId, marketplaceOrderId });
              } catch {}
            }
          }
          if (organizationsId && companyId && marketplaceOrderId) {
            const stLower = String(status || "").toLowerCase();
            if (stLower === "rejeitado" || stLower === "denegado" || stLower === "erro_autorizacao") {
              try {
                await admin
                  .from("marketplace_orders_presented_new")
                  .update({ status_interno: "Falha na emissão" })
                  .eq("organizations_id", organizationsId)
                  .eq("company_id", companyId)
                  .eq("marketplace", marketplace)
                  .eq("marketplace_order_id", marketplaceOrderId);
                log("presented_new_update_failed", { organizationsId, companyId, marketplaceOrderId, status: stLower });
              } catch {}
            } else if (isAuthorized) {
              try {
                let nextInternal: string = "subir xml";
                await admin
                  .from("notas_fiscais")
                  .update({ marketplace_submission_status: "pending" })
                  .eq("company_id", companyId)
                  .eq("marketplace_order_id", marketplaceOrderId);
                let updOk = false;
                try {
                  const { data: d1, error: e1 } = await admin
                    .from("marketplace_orders_presented_new")
                    .update({ status_interno: nextInternal })
                    .eq("organizations_id", organizationsId)
                    .eq("company_id", companyId)
                    .eq("marketplace", marketplace)
                    .eq("marketplace_order_id", marketplaceOrderId)
                    .select("id");
                  updOk = !e1 && Array.isArray(d1) && d1.length > 0;
                  if (!updOk) {
                    const { data: d2, error: e2 } = await admin
                      .from("marketplace_orders_presented_new")
                      .update({ status_interno: nextInternal })
                      .eq("organizations_id", organizationsId)
                      .eq("company_id", companyId)
                      .eq("marketplace_order_id", marketplaceOrderId)
                      .select("id");
                    updOk = !e2 && Array.isArray(d2) && d2.length > 0;
                    if (!updOk) {
                      const { data: d3, error: e3 } = await admin
                        .from("marketplace_orders_presented_new")
                        .update({ status_interno: nextInternal })
                        .eq("company_id", companyId)
                        .eq("marketplace_order_id", marketplaceOrderId)
                        .select("id");
                      updOk = !e3 && Array.isArray(d3) && d3.length > 0;
                    }
                  }
                } catch {}
                if (updOk) {
                  log("presented_new_update_authorized", { organizationsId, companyId, marketplaceOrderId, status_interno: nextInternal, marketplace_submission_status: "pending" });
                } else {
                  log("presented_new_update_authorized_not_found", { organizationsId, companyId, marketplaceOrderId, marketplace, attempted: ["with_marketplace", "without_marketplace", "company_only"] });
                }
              } catch {}
            }
          }
        } catch {}
      }
      return json({ ok: true, updated_id: existing.id });
    } else {
      if (!((nfWrite as any).company_id)) {
        log("nf_insert_blocked_missing_company", { companyId, marketplaceOrderId, hasCompanyId: !!(nfWrite as any).company_id, hasOrderId: !!(nfWrite as any).order_id });
        return json({ ok: false, error: "Missing company_id for notas_fiscais insert" }, 422);
      }
      const { data: ins, error: insErr } = await admin.from("notas_fiscais").insert(nfWrite).select("id").single();
      if (insErr) {
        log("nf_insert_error", { error: insErr.message });
        return json({ ok: false, error: insErr.message }, 200);
      }
      log("nf_insert_ok", { id: ins?.id ?? null });
      let organizationsId: string | null = null;
      if (companyId) {
        try {
          const { data: compOrg } = await admin.from("companies").select("organization_id, focus_token_producao, focus_token_homologacao").eq("id", companyId).limit(1).maybeSingle();
          organizationsId = compOrg?.organization_id || null;
          const st = String(status || "").toLowerCase();
          const isAuthorized = (st === "autorizado" || st === "autorizada" || st === "authorized");
          if (isAuthorized && organizationsId && companyId && marketplaceOrderId) {
            let xmlText: string | null = null;
            const xmlUrl = (nfWrite as any)?.xml_url || null;
            const envLower = String((nfWrite as any)?.emissao_ambiente || "").toLowerCase();
            const useToken = envLower.includes("homolog") ? compOrg?.focus_token_homologacao : compOrg?.focus_token_producao;
            if (xmlUrl) {
              try {
                const basic = useToken ? "Basic " + btoa(`${String(useToken)}:`) : undefined;
                const respXml = await fetch(String(xmlUrl), { method: "GET", headers: basic ? { Authorization: basic } : undefined });
                log("xml_fetch_attempt", { url: xmlUrl, status: respXml.status });
                if (respXml.ok) xmlText = await respXml.text();
              } catch {}
            }
            if (!xmlText && xmlB64) {
              try { xmlText = atob(xmlB64); } catch {}
            }
            if (xmlText && ins?.id) {
              try {
                const m = xmlText.match(/<vNF>([\d.,]+)<\/vNF>/);
                if (m && m[1]) {
                  const raw = m[1].replace(/,/g, "."); 
                  const num = Number(raw);
                  if (Number.isFinite(num)) {
                    await admin.from("notas_fiscais").update({ total_value: num, tipo: "Saída" }).eq("id", ins.id);
                    log("nf_total_value_set", { id: ins.id, total_value: num });
                  }
                }
              } catch {}
            }
            if (xmlText && ins?.id) {
              try {
                const mNNF = xmlText.match(/<nNF>(\d+)<\/nNF>/);
                const mSerie = xmlText.match(/<serie>(\d+)<\/serie>/);
                const mDhEmi = xmlText.match(/<dhEmi>([^<]+)<\/dhEmi>/);
                const updates: any = {};
                if (mNNF && mNNF[1]) updates.nfe_number = Number(mNNF[1]);
                if (mSerie && mSerie[1]) updates.serie = mSerie[1];
                if (mDhEmi && mDhEmi[1] && !authorizedAt) {
                  const iso = new Date(mDhEmi[1]).toISOString();
                  updates.authorized_at = iso;
                }
                if (Object.keys(updates).length > 0) {
                  await admin.from("notas_fiscais").update(updates).eq("id", ins.id);
                  log("nf_meta_from_xml_set", { id: ins.id, hasNNF: !!updates.nfe_number, hasSerie: !!updates.serie, hasAuthorizedAt: !!updates.authorized_at });
                }
              } catch {}
            }
            if (xmlText) {
              try {
                await admin
                  .from("marketplace_orders_presented_new")
                  .update({ xml_to_submit: xmlText })
                  .eq("organizations_id", organizationsId)
                  .eq("company_id", companyId)
                  .eq("marketplace", marketplace)
                  .eq("marketplace_order_id", marketplaceOrderId);
                log("presented_new_xml_saved", { organizationsId, companyId, marketplaceOrderId });
              } catch {}
            }
          }
          if (organizationsId && companyId && marketplaceOrderId) {
            const stLower = String(status || "").toLowerCase();
            if (stLower === "rejeitado" || stLower === "denegado" || stLower === "erro_autorizacao") {
              try {
                await admin
                  .from("marketplace_orders_presented_new")
                  .update({ status_interno: "Falha na emissão" })
                  .eq("organizations_id", organizationsId)
                  .eq("company_id", companyId)
                  .eq("marketplace", marketplace)
                  .eq("marketplace_order_id", marketplaceOrderId);
                log("presented_new_update_failed", { organizationsId, companyId, marketplaceOrderId, status: stLower });
              } catch {}
            } else if (isAuthorized) {
              try {
                let nextInternal: string = "subir xml";
                await admin
                  .from("notas_fiscais")
                  .update({ marketplace_submission_status: "pending" })
                  .eq("company_id", companyId)
                  .eq("marketplace_order_id", marketplaceOrderId);
                let updOk = false;
                try {
                  const { data: d1, error: e1 } = await admin
                    .from("marketplace_orders_presented_new")
                    .update({ status_interno: nextInternal })
                    .eq("organizations_id", organizationsId)
                    .eq("company_id", companyId)
                    .eq("marketplace", marketplace)
                    .eq("marketplace_order_id", marketplaceOrderId)
                    .select("id");
                  updOk = !e1 && Array.isArray(d1) && d1.length > 0;
                  if (!updOk) {
                    const { data: d2, error: e2 } = await admin
                      .from("marketplace_orders_presented_new")
                      .update({ status_interno: nextInternal })
                      .eq("organizations_id", organizationsId)
                      .eq("company_id", companyId)
                      .eq("marketplace_order_id", marketplaceOrderId)
                      .select("id");
                    updOk = !e2 && Array.isArray(d2) && d2.length > 0;
                    if (!updOk) {
                      const { data: d3, error: e3 } = await admin
                        .from("marketplace_orders_presented_new")
                        .update({ status_interno: nextInternal })
                        .eq("company_id", companyId)
                        .eq("marketplace_order_id", marketplaceOrderId)
                        .select("id");
                      updOk = !e3 && Array.isArray(d3) && d3.length > 0;
                    }
                  }
                } catch {}
                if (updOk) {
                  log("presented_new_update_authorized", { organizationsId, companyId, marketplaceOrderId, status_interno: nextInternal, marketplace_submission_status: "pending" });
                } else {
                  log("presented_new_update_authorized_not_found", { organizationsId, companyId, marketplaceOrderId, marketplace, attempted: ["with_marketplace", "without_marketplace", "company_only"] });
                }
              } catch {}
            }
          }
        } catch {}
      }
      return json({ ok: true, inserted_id: ins?.id || null });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("exception", { message: msg });
    return json({ error: msg }, 500);
  }
});
