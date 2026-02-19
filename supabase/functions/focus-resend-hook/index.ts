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

const RID = crypto.randomUUID();
function log(step: string, context?: any) {
  try {
    const entry = { source: "focus-resend-hook", rid: RID, ts: new Date().toISOString(), step, context: context ?? null };
    console.log(JSON.stringify(entry));
  } catch {}
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    log("config_missing", { hasUrl: !!SUPABASE_URL, hasKey: !!SERVICE_ROLE_KEY });
    return json({ error: "Missing service configuration" }, 500);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userRes, error: userErr } = await (admin as any).auth.getUser(token);
    if (userErr || !userRes?.user) {
      log("unauthorized", { error: userErr?.message });
      return json({ error: "Unauthorized" }, 401);
    }

    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    log("request_body", { length: raw?.length ?? 0, preview: raw ? String(raw).slice(0, 400) : "" });

    const organizationId: string | null = body?.organizationId || body?.organizations_id || null;
    const companyIdInput: string | null = body?.companyId || null;
    const environmentRaw: string = String(body?.environment || "").toLowerCase();
    const environment: "homologacao" | "producao" = environmentRaw.includes("prod") ? "producao" : "homologacao";
    const tipoRaw: string = String(body?.tipo || body?.type || "nfe").toLowerCase();
    const tipo: "nfe" | "nfse" | "cte" | "nfes_recebidas" | "nfsen" | "nfcom" =
      tipoRaw === "nfse" ? "nfse" :
      tipoRaw === "cte" ? "cte" :
      tipoRaw === "nfes_recebidas" || tipoRaw === "mde" ? "nfes_recebidas" :
      tipoRaw === "nfsen" ? "nfsen" :
      tipoRaw === "nfcom" ? "nfcom" : "nfe";
    const referencia: string | null = body?.referencia || body?.ref || null;
    const chaveNfe: string | null = body?.chave_nfe || body?.chave || body?.chave_de_acesso || null;
    let companyIdFromRef: string | null = null;
    try {
      if (referencia && typeof referencia === "string") {
        const rr = String(referencia);
        const marker = "-company-";
        const idx = rr.indexOf(marker);
        if (idx >= 0) {
          const start = idx + marker.length;
          const retryIdx = rr.indexOf("-retry-", start);
          const compRaw = rr.substring(start, retryIdx >= 0 ? retryIdx : rr.length).trim();
          if (compRaw) companyIdFromRef = compRaw;
        }
      }
    } catch {}

    if (!organizationId && !companyIdInput) {
      log("missing_org_or_company");
      return json({ error: "organizationId or companyId required" }, 400);
    }

    let companyRow: any = null;
    const targetCompanyId = companyIdInput || companyIdFromRef || null;
    if (targetCompanyId) {
      const { data: comp } = await admin.from("companies").select("id, organization_id, focus_token_producao, focus_token_homologacao").eq("id", targetCompanyId).limit(1).maybeSingle();
      companyRow = comp ?? null;
    } else if (organizationId) {
      const { data: comps } = await admin.from("companies").select("id, organization_id, focus_token_producao, focus_token_homologacao").eq("organization_id", organizationId).limit(50);
      const list = Array.isArray(comps) ? comps : [];
      const chosen = list.find((c: any) => environment === "homologacao" ? !!c.focus_token_homologacao : !!c.focus_token_producao) || list[0] || null;
      companyRow = chosen ?? null;
    }
    if (!companyRow) {
      log("company_not_found", { organizationId, companyIdInput, companyIdFromRef });
      return json({ error: "Company not found" }, 404);
    }

    const useToken = environment === "homologacao" ? companyRow.focus_token_homologacao : companyRow.focus_token_producao;
    if (!useToken) {
      log("focus_token_missing", { environment, company_id: companyRow.id });
      return json({ error: "Focus token not configured for environment" }, 400);
    }

    const apiBase = environment === "homologacao" ? "https://homologacao.focusnfe.com.br" : "https://api.focusnfe.com.br";
    let path = "";
    if (tipo === "nfes_recebidas") {
      if (!chaveNfe) {
        log("missing_chave_nfe");
        return json({ error: "chave_nfe required for nfes_recebidas" }, 400);
      }
      path = `/v2/nfes_recebidas/${encodeURIComponent(String(chaveNfe))}/hook`;
    } else {
      if (!referencia) {
        log("missing_referencia");
        return json({ error: "referencia required for this tipo" }, 400);
      }
      const tipoPath = tipo;
      path = `/v2/${tipoPath}/${encodeURIComponent(String(referencia))}/hook`;
    }
    const fullUrl = `${apiBase}${path}`;
    const tokenToUse = environment === "homologacao" ? String(companyRow.focus_token_homologacao || "") : String(companyRow.focus_token_producao || "");
    if (!tokenToUse) {
      return json({ error: "No Focus token for requested environment", environment, company_id: companyRow?.id || null }, 400);
    }
    const basic = btoa(`${tokenToUse}:`);
    log("focus_resend_start", { url: fullUrl, environment, tipo });
    const resp = await fetch(fullUrl, { method: "POST", headers: { Authorization: `Basic ${basic}`, Accept: "application/json", "Content-Type": "application/json" } });
    const text = await resp.text();
    let jsonResp: any = {};
    try { jsonResp = text ? JSON.parse(text) : {}; } catch { jsonResp = { raw: text }; }
    const hooksCount = Array.isArray(jsonResp) ? jsonResp.length : (Array.isArray(jsonResp?.hooks) ? jsonResp.hooks.length : undefined);
    log("focus_resend_status", { status: resp.status, ok: resp.ok, hooksCount, responsePreview: typeof text === "string" ? text.slice(0, 300) : null });
    if (!resp.ok) {
      const code = jsonResp?.codigo || "erro";
      const msg = jsonResp?.mensagem || jsonResp?.message || `HTTP ${resp.status}`;
      return json({ ok: false, status: resp.status, codigo: code, error: msg, response: jsonResp, url: fullUrl, environment, company_id: companyRow?.id || null }, resp.status);
    }
    return json({ ok: true, status: resp.status, response: jsonResp, url: fullUrl, hooks_count: hooksCount }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("exception", { message: msg });
    return json({ error: msg }, 500);
  }
});
