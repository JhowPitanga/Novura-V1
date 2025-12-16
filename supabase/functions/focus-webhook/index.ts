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

serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const FOCUS_WEBHOOK_SECRET = Deno.env.get("FOCUS_WEBHOOK_SECRET") || "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Missing service configuration" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;

  try {
    const url = new URL(req.url);
    const tokenQ = url.searchParams.get("secret") || url.searchParams.get("token") || "";
    const tokenH1 = req.headers.get("x-webhook-secret") || "";
    const tokenH2 = req.headers.get("x-webhook-token") || "";
    const tokenH3 = req.headers.get("x-focus-webhook-secret") || "";
    const provided = [tokenQ, tokenH1, tokenH2, tokenH3].filter(Boolean);
    const secretOk = !!FOCUS_WEBHOOK_SECRET ? provided.some((v) => v === FOCUS_WEBHOOK_SECRET) : true;
    if (!secretOk) return json({ error: "Unauthorized webhook" }, 401);

    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }

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
    const links = {
      caminho_xml: body?.caminho_xml || body?.caminho_xml_nota_fiscal || null,
      caminho_pdf: body?.caminho_pdf || body?.caminho_pdf_danfe || body?.caminho_danfe || null,
    };

    let ref: any = null;
    try { ref = referenciaStr ? JSON.parse(referenciaStr) : null; } catch { ref = null; }

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
    }

    const nfWrite: any = {
      status_focus: status || null,
      focus_nfe_id: focusId,
      nfe_key: nfeKey,
      nfe_number: nfeNumber,
      serie: serieLocal,
      authorized_at: authorizedAt,
    };
    try {
      const envRaw: string | null = (body?.environment || body?.ambiente || null) ? String(body?.environment || body?.ambiente) : null;
      const envLower = envRaw ? envRaw.toLowerCase() : "";
      const emissaoAmbiente = envLower.includes("homolog") ? "homologacao" : (envLower ? "producao" : null);
      if (emissaoAmbiente) (nfWrite as any).emissao_ambiente = emissaoAmbiente;
    } catch {}

    if (xmlB64) nfWrite.xml_base64 = xmlB64;
    if (pdfB64) nfWrite.pdf_base64 = pdfB64;

    if (companyId) nfWrite.company_id = companyId;
    if (marketplace) nfWrite.marketplace = marketplace;
    if (marketplaceOrderId) nfWrite.marketplace_order_id = marketplaceOrderId;
    if (packId !== null && packId !== undefined) nfWrite.pack_id = packId;

    const respMeta = {
      status_sefaz: body?.status_sefaz || null,
      mensagem_sefaz: body?.mensagem_sefaz || null,
      links,
    };

    nfWrite.marketplace_submission_response = respMeta;
    try {
      function normalize(path: string | null): string | null {
        if (!path) return null;
        const p = String(path);
        if (p.startsWith("http://") || p.startsWith("https://")) return p;
        try { const base = new URL("https://api.focusnfe.com.br/"); return new URL(p, base).toString(); } catch { return p; }
      }
      const xmlUrlNorm = normalize(links.caminho_xml || null);
      const pdfUrlNorm = normalize(links.caminho_pdf || null);
      if (xmlUrlNorm) (nfWrite as any).xml_url = xmlUrlNorm;
      if (pdfUrlNorm) (nfWrite as any).pdf_url = pdfUrlNorm;
    } catch {}

    if (existing?.id) {
      const { error: updErr } = await admin.from("notas_fiscais").update(nfWrite).eq("id", existing.id);
      if (updErr) return json({ ok: false, error: updErr.message }, 200);
      let organizationsId: string | null = null;
      if (companyId) {
        try {
          const { data: compOrg } = await admin.from("companies").select("organization_id, focus_token_producao, focus_token_homologacao").eq("id", companyId).limit(1).maybeSingle();
          organizationsId = compOrg?.organization_id || null;
          const st = String(status || "").toLowerCase();
          const isAuthorized = st.includes("autoriz");
          if (isAuthorized && organizationsId && companyId && marketplaceOrderId) {
            let xmlText: string | null = null;
            const xmlUrl = (nfWrite as any)?.xml_url || null;
            const envLower = String((nfWrite as any)?.emissao_ambiente || "").toLowerCase();
            const useToken = envLower.includes("homolog") ? compOrg?.focus_token_homologacao : compOrg?.focus_token_producao;
            if (xmlUrl) {
              try {
                const basic = useToken ? "Basic " + btoa(`${String(useToken)}:`) : undefined;
                const respXml = await fetch(String(xmlUrl), { method: "GET", headers: basic ? { Authorization: basic } : undefined });
                if (respXml.ok) xmlText = await respXml.text();
              } catch {}
            }
            if (!xmlText && xmlB64) {
              try { xmlText = atob(xmlB64); } catch {}
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
              } catch {}
            }
          }
        } catch {}
      }
      return json({ ok: true, updated_id: existing.id });
    } else {
      const { data: ins, error: insErr } = await admin.from("notas_fiscais").insert(nfWrite).select("id").single();
      if (insErr) return json({ ok: false, error: insErr.message }, 200);
      let organizationsId: string | null = null;
      if (companyId) {
        try {
          const { data: compOrg } = await admin.from("companies").select("organization_id, focus_token_producao, focus_token_homologacao").eq("id", companyId).limit(1).maybeSingle();
          organizationsId = compOrg?.organization_id || null;
          const st = String(status || "").toLowerCase();
          const isAuthorized = st.includes("autoriz");
          if (isAuthorized && organizationsId && companyId && marketplaceOrderId) {
            let xmlText: string | null = null;
            const xmlUrl = (nfWrite as any)?.xml_url || null;
            const envLower = String((nfWrite as any)?.emissao_ambiente || "").toLowerCase();
            const useToken = envLower.includes("homolog") ? compOrg?.focus_token_homologacao : compOrg?.focus_token_producao;
            if (xmlUrl) {
              try {
                const basic = useToken ? "Basic " + btoa(`${String(useToken)}:`) : undefined;
                const respXml = await fetch(String(xmlUrl), { method: "GET", headers: basic ? { Authorization: basic } : undefined });
                if (respXml.ok) xmlText = await respXml.text();
              } catch {}
            }
            if (!xmlText && xmlB64) {
              try { xmlText = atob(xmlB64); } catch {}
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
              } catch {}
            }
          }
        } catch {}
      }
      return json({ ok: true, inserted_id: ins?.id || null });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
