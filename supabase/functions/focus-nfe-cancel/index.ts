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
      const entry = { source: "focus-nfe-cancel", reqId, ts: new Date().toISOString(), step, context: context ?? null };
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
    const orderId: string | undefined = body?.orderId || body?.order_id;
    const justificativa: string = String(body?.justificativa || "").trim();
    const environmentInput = String(body?.environment || body?.ambiente || "").toLowerCase();
    const useHomolog = environmentInput.includes("homolog") || body?.homologacao === true || body?.homolog === true;
    log("request", { userId: user.id, organizationId, companyId, orderId, environmentInput });

    if (!organizationId) return json({ error: "organizationId is required" }, 400);
    if (!companyId) return json({ error: "companyId is required" }, 400);
    if (!orderId) return json({ error: "orderId is required" }, 400);
    if (!justificativa || justificativa.length < 15 || justificativa.length > 255) {
      return json({ error: "justificativa length must be between 15 and 255 characters" }, 400);
    }

    const { data: isMemberData, error: isMemberErr } = await admin.rpc("is_org_member", { p_user_id: user.id, p_org_id: organizationId });
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

    const { data: order, error: orderErr } = await admin
      .from("marketplace_orders_presented")
      .select("id, marketplace_order_id, marketplace, organizations_id")
      .eq("id", orderId)
      .eq("organizations_id", organizationId)
      .limit(1)
      .single();
    if (orderErr || !order) {
      log("order_not_found", { orderId, error: orderErr?.message });
      return json({ error: orderErr?.message || "Order not found" }, 404);
    }
    const { data: presentedNew } = await admin
      .from("marketplace_orders_presented_new")
      .select("pack_id")
      .eq("id", orderId)
      .eq("organizations_id", organizationId)
      .limit(1)
      .maybeSingle();
    const packId = (presentedNew as any)?.pack_id ?? null;
    const refStr = `pack-${packId ?? "0"}-order-${order.marketplace_order_id}-company-${companyId}`;

    const url = new URL(`${apiBase}/v2/nfe/${encodeURIComponent(refStr)}`);
    log("cancel_request_start", { url: url.toString(), ref: refStr });
    const resp = await fetch(url.toString(), {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ justificativa }),
    });
    const text = await resp.text();
    let jsonResp: any = {};
    try { jsonResp = text ? JSON.parse(text) : {}; } catch { jsonResp = { raw: text }; }

    if (!resp.ok) {
      log("cancel_error", { httpStatus: resp.status, message: jsonResp?.mensagem || jsonResp?.message || "Erro no cancelamento" });
      try {
        const { data: existing } = await admin
          .from("notas_fiscais")
          .select("id")
          .eq("company_id", companyId)
          .eq("marketplace_order_id", order.marketplace_order_id)
          .eq("emissao_ambiente", useHomolog ? "homologacao" : "producao")
          .limit(1)
          .maybeSingle();
        const nfErrWrite: any = {
          company_id: companyId,
          order_id: orderId,
          marketplace: order.marketplace,
          marketplace_order_id: order.marketplace_order_id,
          pack_id: packId,
          emissao_ambiente: useHomolog ? "homologacao" : "producao",
          status_focus: jsonResp?.status || jsonResp?.status_sefaz || null,
          status: mapDomainStatus(jsonResp?.status || jsonResp?.status_sefaz || null),
          error_details: {
            status_sefaz: jsonResp?.status_sefaz || null,
            mensagem_sefaz: jsonResp?.mensagem_sefaz || jsonResp?.mensagem || jsonResp?.message || "Falha ao cancelar NF-e",
          },
        };
        if (existing?.id) {
          await admin.from("notas_fiscais").update(nfErrWrite).eq("id", existing.id);
        } else {
          await admin.from("notas_fiscais").insert(nfErrWrite);
        }
      } catch {}
      return json({ ok: false, error: jsonResp?.mensagem || jsonResp?.message || `HTTP ${resp.status}`, response: jsonResp }, resp.status);
    }

    let statusCancel: string = jsonResp?.status || jsonResp?.status_sefaz || "cancelado";
    const { data: existingNf } = await admin
      .from("notas_fiscais")
      .select("id")
      .eq("company_id", companyId)
      .eq("marketplace_order_id", order.marketplace_order_id)
      .eq("emissao_ambiente", useHomolog ? "homologacao" : "producao")
      .limit(1)
      .maybeSingle();
    const nfWrite: any = {
      company_id: companyId,
      order_id: orderId,
      marketplace: order.marketplace,
      marketplace_order_id: order.marketplace_order_id,
      pack_id: packId,
      status_focus: String(statusCancel),
      status: mapDomainStatus(statusCancel),
      emissao_ambiente: useHomolog ? "homologacao" : "producao",
    };
    if (existingNf?.id) {
      await admin.from("notas_fiscais").update(nfWrite).eq("id", existingNf.id);
    } else {
      await admin.from("notas_fiscais").insert(nfWrite);
    }
    log("cancel_ok", { ref: refStr, status: statusCancel });
    return json({ ok: true, status: statusCancel, response: jsonResp }, 200);
  } catch (e: any) {
    log("exception", { message: e?.message || String(e) });
    return json({ error: e?.message || "Internal error" }, 500);
  }
});
