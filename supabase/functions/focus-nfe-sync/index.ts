import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

function digits(s: string | null | undefined): string {
  return String(s || "").replace(/\D/g, "");
}

function toNumberOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

function normalizeFocusUrl(base: string, pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  const p = String(pathOrUrl);
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith("/")) return `${base}${p}`;
  return `${base}/${p}`;
}

async function fetchToBase64(u: string, accept: string, basic: string, token: string): Promise<string | null> {
  try {
    const r = await fetch(u, { method: "GET", headers: { Authorization: `Basic ${basic}`, Accept: accept } });
    if (r.ok) {
      const b = await r.arrayBuffer();
      return arrayBufferToBase64(b);
    }
    if (r.status === 401 || r.status === 403) {
      let u2 = u;
      try {
        const o = new URL(u);
        if (!o.searchParams.has("token")) o.searchParams.set("token", token);
        u2 = o.toString();
      } catch {
        u2 = u + (u.includes("?") ? "&" : "?") + "token=" + token;
      }
      const r2 = await fetch(u2, { method: "GET", headers: { Accept: accept } });
      if (r2.ok) {
        const b2 = await r2.arrayBuffer();
        return arrayBufferToBase64(b2);
      }
    }
    return null;
  } catch {
    return null;
  }
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

serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const reqId = crypto.randomUUID();
  const log = (step: string, context?: any) => {
    try {
      const entry = {
        source: "focus-nfe-sync",
        reqId,
        ts: new Date().toISOString(),
        step,
        context: context ?? null,
      };
      console.log(JSON.stringify(entry));
    } catch {}
  };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const FOCUS_TOKEN = Deno.env.get("FOCUS_API_TOKEN");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !FOCUS_TOKEN) {
      log("config_error");
      return json({ error: "Missing service configuration" }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userRes, error: userErr } = await (admin as any).auth.getUser(token);
    if (userErr || !userRes?.user) {
      log("unauthorized", { userErr: userErr?.message });
      return json({ error: "Unauthorized" }, 401);
    }
    const user = userRes.user;

    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const organizationId: string | undefined = body?.organizationId || body?.organization_id;
    const companyId: string | undefined = body?.companyId || body?.company_id;
    const orderIds: string[] = Array.isArray(body?.orderIds) ? body.orderIds.map((x: any) => String(x)) : [];
    const environmentInput = String(body?.environment || body?.ambiente || "").toLowerCase();
    const useHomolog = environmentInput.includes("homolog") || body?.homologacao === true || body?.homolog === true;
    log("request", { userId: user.id, organizationId, companyId, orderIdsCount: orderIds.length, environmentInput });

    if (!organizationId) return json({ error: "organizationId is required" }, 400);
    if (!companyId) return json({ error: "companyId is required" }, 400);
    if (!orderIds || orderIds.length === 0) return json({ error: "orderIds is required" }, 400);

    const { data: isMemberData, error: isMemberErr } = await admin.rpc("is_org_member", {
      p_user_id: user.id,
      p_org_id: organizationId,
    });
    const isMember = (Array.isArray(isMemberData) ? isMemberData?.[0] : isMemberData) === true;
    if (isMemberErr || !isMember) return json({ error: "Forbidden" }, 403);
    log("is_member", { ok: isMember === true });

    const { data: company, error: compErr } = await admin.from("companies").select("*").eq("id", companyId).single();
    if (compErr || !company) return json({ error: compErr?.message || "Company not found" }, 404);
    if (String(company.organization_id || "") !== String(organizationId)) return json({ error: "Company not in organization" }, 403);

    const tokenProducao = company?.focus_token_producao || null;
    const tokenHomolog = company?.focus_token_homologacao || null;
    const tokenUsed = useHomolog ? (tokenHomolog || FOCUS_TOKEN) : (tokenProducao || FOCUS_TOKEN);
    let tokenForAuth = String(tokenUsed || "").trim();
    let basic = btoa(`${tokenForAuth}:`);
    const apiBase = useHomolog ? "https://homologacao.focusnfe.com.br" : "https://api.focusnfe.com.br";
    log("auth_basic_ready", { environment: useHomolog ? "homologacao" : "producao", tokenLen: tokenForAuth.length, apiBase });
    try {
      const cnpjDigits = digits(String(company?.cnpj || ""));
      if (cnpjDigits) {
        const preUrl = new URL(`${apiBase}/v2/empresas/${cnpjDigits}`);
        log("auth_preflight_start", { companyId, cnpj: cnpjDigits, url: preUrl.toString() });
        let preResp = await fetch(preUrl.toString(), { method: "GET", headers: { Authorization: `Basic ${basic}`, Accept: "application/json" } });
        let preText = await preResp.text();
        let preJson: any = {};
        try { preJson = preText ? JSON.parse(preText) : {}; } catch { preJson = { raw: preText }; }
        log("auth_preflight_response", { status: preResp.status, ok: preResp.ok, message: preJson?.mensagem || preJson?.message || preJson?.error || null });
        if (preResp.status === 401) {
          const globalToken = String(FOCUS_TOKEN || "").trim();
          const isDifferent = globalToken && globalToken !== tokenForAuth;
          if (isDifferent) {
            const basicGlobal = btoa(`${globalToken}:`);
            log("auth_preflight_retry_global", { environment: useHomolog ? "homologacao" : "producao" });
            preResp = await fetch(preUrl.toString(), { method: "GET", headers: { Authorization: `Basic ${basicGlobal}`, Accept: "application/json" } });
            preText = await preResp.text();
            preJson = {};
            try { preJson = preText ? JSON.parse(preText) : {}; } catch { preJson = { raw: preText }; }
            log("auth_preflight_response_global", { status: preResp.status, ok: preResp.ok, message: preJson?.mensagem || preJson?.message || preJson?.error || null });
            if (preResp.ok) {
              tokenForAuth = globalToken;
              basic = basicGlobal;
            }
          }
          if (preResp.status === 401) {
            log("auth_preflight_failed", { reason: "basic_auth_denied", environment: useHomolog ? "homologacao" : "producao" });
            return json({ error: "Focus token unauthorized for company CNPJ", details: { cnpj: cnpjDigits, environment: useHomolog ? "homologacao" : "producao" } }, 401);
          }
        }
      }
    } catch {}

    const results: Array<{ orderId: string; packId?: number | null; ok: boolean; status?: string; response?: any; error?: string }> = [];

    for (const oid of orderIds) {
      log("order_start", { oid });
      const { data: order, error: orderErr } = await admin
        .from("marketplace_orders_presented")
        .select("id, marketplace_order_id, marketplace")
        .eq("id", oid)
        .eq("organizations_id", organizationId)
        .limit(1)
        .single();
      if (orderErr || !order) {
        log("order_not_found", { oid, error: orderErr?.message });
        results.push({ orderId: oid, ok: false, error: orderErr?.message || "Order not found" });
        continue;
      }
      const { data: presentedNew } = await admin
        .from("marketplace_orders_presented_new")
        .select("pack_id")
        .eq("id", oid)
        .eq("organizations_id", organizationId)
        .limit(1)
        .maybeSingle();
      const packId = (presentedNew as any)?.pack_id ?? null;
      const refStr = `pack-${packId ?? "0"}-order-${order.marketplace_order_id}-company-${companyId}`;
      try {
        const url = new URL(`${apiBase}/v2/nfe/${encodeURIComponent(refStr)}`);
        try { url.searchParams.set("completa", "1"); } catch {}
        const resp = await fetch(url.toString(), { method: "GET", headers: { Authorization: `Basic ${basic}`, Accept: "application/json" } });
        const text = await resp.text();
        let jsonResp: any = {};
        try { jsonResp = text ? JSON.parse(text) : {}; } catch { jsonResp = { raw: text }; }
        if (!resp.ok) {
          log("sync_focus_error", { oid, httpStatus: resp.status, message: jsonResp?.mensagem || jsonResp?.message || "Erro na consulta" });
          results.push({ orderId: oid, packId, ok: false, status: jsonResp?.status || jsonResp?.status_sefaz, error: jsonResp?.mensagem || jsonResp?.message || "Falha ao consultar NF-e por referência", response: jsonResp });
          continue;
        }
        let statusSync: string = jsonResp?.status || jsonResp?.status_sefaz || "pendente";
        let focusIdSync: string | null = jsonResp?.uuid || jsonResp?.id || null;
        let nfeKeySync: string | null = jsonResp?.chave || jsonResp?.chave_nfe || jsonResp?.chave_de_acesso || null;
        let nfeNumberSync: number | null = toNumberOrNull(jsonResp?.numero);
        let serieSync: string | null = jsonResp?.serie || null;
        let authorizedAtSync: string | null = String(statusSync).toLowerCase() === "autorizado" ? (jsonResp?.data_autorizacao || new Date().toISOString()) : null;
        let xmlB64Sync: string | null = jsonResp?.xml || jsonResp?.xml_base64 || null;
        let pdfB64Sync: string | null = jsonResp?.danfe || jsonResp?.pdf || null;
        let linksMeta: any = {
          caminho_xml: (typeof jsonResp?.caminho_xml_nota_fiscal === "string" ? jsonResp?.caminho_xml_nota_fiscal : null) || (typeof jsonResp?.caminho_xml === "string" ? jsonResp?.caminho_xml : null),
          caminho_pdf: (typeof jsonResp?.caminho_danfe === "string" ? jsonResp?.caminho_danfe : null) || (typeof jsonResp?.caminho_pdf === "string" ? jsonResp?.caminho_pdf : null) || (typeof jsonResp?.caminho_pdf_danfe === "string" ? jsonResp?.caminho_pdf_danfe : null),
        };
        if (String(statusSync).toLowerCase() === "autorizado" && focusIdSync && (!xmlB64Sync || !pdfB64Sync)) {
          try {
            const cUrl = new URL(`${apiBase}/v2/nfe/${encodeURIComponent(focusIdSync)}`);
            try { cUrl.searchParams.set("completa", "1"); } catch {}
            const cResp = await fetch(cUrl.toString(), { method: "GET", headers: { Authorization: `Basic ${basic}`, Accept: "application/json" } });
            const cText = await cResp.text();
            let cJson: any = {};
            try { cJson = cText ? JSON.parse(cText) : {}; } catch { cJson = { raw: cText }; }
            const stC = cJson?.status || cJson?.status_sefaz || statusSync;
            statusSync = stC;
            if (String(stC).toLowerCase() === "autorizado") {
              xmlB64Sync = cJson?.xml || cJson?.xml_base64 || xmlB64Sync || null;
              pdfB64Sync = cJson?.danfe || cJson?.pdf || pdfB64Sync || null;
              authorizedAtSync = cJson?.data_autorizacao || authorizedAtSync || new Date().toISOString();
              const nfeKeyC: string | null = cJson?.chave || cJson?.chave_nfe || cJson?.chave_de_acesso || null;
              if (nfeKeyC) nfeKeySync = nfeKeyC;
              const nfeNumC: number | null = toNumberOrNull(cJson?.numero);
              if (nfeNumC !== null) nfeNumberSync = nfeNumC;
              linksMeta = {
                caminho_xml: (typeof cJson?.caminho_xml_nota_fiscal === "string" ? cJson?.caminho_xml_nota_fiscal : null) || (typeof cJson?.caminho_xml === "string" ? cJson?.caminho_xml : null) || linksMeta?.caminho_xml || null,
                caminho_pdf: (typeof cJson?.caminho_danfe === "string" ? cJson?.caminho_danfe : null) || (typeof cJson?.caminho_pdf === "string" ? cJson?.caminho_pdf : null) || (typeof cJson?.caminho_pdf_danfe === "string" ? cJson?.caminho_pdf_danfe : null) || linksMeta?.caminho_pdf || null,
              };
              if (!xmlB64Sync) {
                const xmlLink =
                  (typeof cJson?.caminho_xml_nota_fiscal === "string" ? cJson.caminho_xml_nota_fiscal : null) ||
                  (typeof cJson?.caminho_xml === "string" ? cJson.caminho_xml : null);
                if (xmlLink) {
                  const got = await fetchToBase64(xmlLink, "application/xml", basic, tokenForAuth);
                  if (got) {
                    xmlB64Sync = got;
                  } else {
                    log("xml_download_error", { oid, via: "link", status: "failed" });
                  }
                }
                if (!xmlB64Sync && focusIdSync) {
                  const direct = `${apiBase}/v2/nfe/${encodeURIComponent(focusIdSync)}/xml`;
                  const got2 = await fetchToBase64(direct, "application/xml", basic, tokenForAuth);
                  if (got2) {
                    xmlB64Sync = got2;
                  } else {
                    log("xml_download_error", { oid, via: "id_xml", status: "failed" });
                  }
                }
                if (!xmlB64Sync && refStr) {
                  const byRef = `${apiBase}/v2/nfe/${encodeURIComponent(refStr)}/xml`;
                  const got3 = await fetchToBase64(byRef, "application/xml", basic, tokenForAuth);
                  if (got3) {
                    xmlB64Sync = got3;
                  } else {
                    log("xml_download_error", { oid, via: "ref_xml", status: "failed" });
                  }
                }
              }
              if (!pdfB64Sync) {
                const pdfLink =
                  (typeof cJson?.caminho_danfe === "string" ? cJson.caminho_danfe : null) ||
                  (typeof cJson?.caminho_pdf === "string" ? cJson.caminho_pdf : null) ||
                  (typeof cJson?.caminho_pdf_danfe === "string" ? cJson.caminho_pdf_danfe : null);
                if (pdfLink) {
                  const gotP = await fetchToBase64(pdfLink, "application/pdf", basic, tokenForAuth);
                  if (gotP) {
                    pdfB64Sync = gotP;
                  } else {
                    log("danfe_download_error", { oid, via: "link", status: "failed" });
                  }
                }
                if (!pdfB64Sync && focusIdSync) {
                  const directP = `${apiBase}/v2/nfe/${encodeURIComponent(focusIdSync)}/danfe`;
                  const gotP2 = await fetchToBase64(directP, "application/pdf", basic, tokenForAuth);
                  if (gotP2) {
                    pdfB64Sync = gotP2;
                  } else {
                    log("danfe_download_error", { oid, via: "id_danfe", status: "failed" });
                  }
                }
                if (!pdfB64Sync && refStr) {
                  const byRefP = `${apiBase}/v2/nfe/${encodeURIComponent(refStr)}/danfe`;
                  const gotP3 = await fetchToBase64(byRefP, "application/pdf", basic, tokenForAuth);
                  if (gotP3) {
                    pdfB64Sync = gotP3;
                  } else {
                    log("danfe_download_error", { oid, via: "ref_danfe", status: "failed" });
                  }
                }
              }
            }
            log("xml_fetch_retry", { oid, by: "focusId", gotXml: !!xmlB64Sync, gotPdf: !!pdfB64Sync });
          } catch (e: any) {
            log("xml_fetch_retry_error", { oid, message: e?.message || String(e) });
          }
        }
        const xmlUrlSync: string | null = normalizeFocusUrl(apiBase, linksMeta?.caminho_xml || null);
        const pdfUrlSync: string | null = normalizeFocusUrl(apiBase, linksMeta?.caminho_pdf || null);
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
        if (xmlUrlSync) nfWriteSync.xml_url = xmlUrlSync;
        if (pdfUrlSync) nfWriteSync.pdf_url = pdfUrlSync;
        nfWriteSync.marketplace_submission_response = {
          status_sefaz: jsonResp?.status_sefaz || null,
          mensagem_sefaz: jsonResp?.mensagem_sefaz || jsonResp?.mensagem || jsonResp?.message || null,
          links: linksMeta,
        };
        let writeOk = true;
        let lastErrMsg: string | null = null;
        const statusCandidates = [
          mapDomainStatus(statusSync),
          // Tentativas alternativas por possíveis constraints diferentes
          (() => {
            const s = mapDomainStatus(statusSync);
            return s.charAt(0).toUpperCase() + s.slice(1);
          })(),
          "autorizado",
          "rejeitado",
          "denegado",
          "cancelado",
          "pendente",
          "Autorizada",
          "Rejeitada",
          "Denegada",
          "Cancelada",
          "Pendente",
        ];
        for (const candidate of statusCandidates) {
          let errMsg: string | null = null;
          try {
            const payload = { ...nfWriteSync, status: candidate };
            if (existingSync?.id) {
              const { error: updErrS } = await admin.from("notas_fiscais").update(payload).eq("id", existingSync.id);
              if (updErrS) errMsg = updErrS.message;
            } else {
              const { error: insErrS } = await admin.from("notas_fiscais").insert(payload);
              if (insErrS) errMsg = insErrS.message;
            }
          } catch (e: any) {
            errMsg = e?.message || String(e);
          }
          if (!errMsg) {
            writeOk = true;
            lastErrMsg = null;
            log("notas_fiscais_sync_persist_ok", { oid, marketplace_order_id: order.marketplace_order_id, status_used: candidate });
            break;
          } else {
            writeOk = false;
            lastErrMsg = errMsg;
            log("notas_fiscais_sync_persist_try_failed", { oid, marketplace_order_id: order.marketplace_order_id, status_candidate: candidate, error: errMsg });
            // Continua tentando próximos candidatos apenas quando constraint falha
          }
        }
        if (writeOk) {
          log("sync_done", { oid, ref: refStr, status: statusSync });
          results.push({ orderId: oid, packId, ok: true, status: statusSync, response: jsonResp });
        } else {
          log("sync_failed", { oid, ref: refStr, status: statusSync, error: lastErrMsg });
          results.push({ orderId: oid, packId, ok: false, status: statusSync, error: lastErrMsg || "Persistência falhou", response: jsonResp });
        }
        continue;
      } catch (e: any) {
        log("sync_exception", { oid, message: e?.message || String(e) });
        results.push({ orderId: oid, packId, ok: false, error: e?.message || String(e) });
        continue;
      }
    }

    return json({ ok: true, results }, 200);
  } catch (e: any) {
    log("exception", { message: e?.message || String(e) });
    return json({ error: e?.message || "Internal error" }, 500);
  }
});
