import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importAesGcmKey, aesGcmDecryptFromString } from "../_shared/token-utils.ts";

function jsonResponse(body: any, status = 200) {
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
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY") || undefined;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);

  try {
    const body = await req.json();
    const organizationId: string | undefined = body?.organizationId;
    const siteId: string = body?.siteId || "MLB";
    const title: string = body?.title || "";
    if (!organizationId || !title) return jsonResponse({ error: "organizationId and title required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    let aesKey: CryptoKey | null = null;
    if (ENC_KEY_B64) {
      try { aesKey = await importAesGcmKey(ENC_KEY_B64); } catch { aesKey = null; }
    }
    const { data: integ, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("access_token")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .order("expires_in", { ascending: false })
      .limit(1)
      .single();
    if (integErr || !integ) return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);

    let accessToken: string;
    if (aesKey) { try { accessToken = await aesGcmDecryptFromString(aesKey, integ.access_token); } catch { accessToken = integ.access_token; } }
    else { accessToken = integ.access_token; }

    const url = `https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/category_predictor/predict`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ title })
    });
    const ct = resp.headers.get("content-type") || "";
    let json: any = null;
    let text: string | null = null;
    if (ct.includes("application/json")) {
      try { json = await resp.json(); } catch { try { text = await resp.text(); } catch { text = null; } }
    } else {
      try { text = await resp.text(); } catch { text = null; }
      if (text) { try { json = JSON.parse(text); } catch { json = null; } }
    }
    let domainResults: any[] = [];
    try {
      const ddUrl = `https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/domain_discovery/search?q=${encodeURIComponent(title)}&limit=6`;
      const ddResp = await fetch(ddUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
      const ddct = ddResp.headers.get("content-type") || "";
      let ddJson: any = [];
      let ddText: string | null = null;
      if (ddct.includes("application/json")) {
        try { ddJson = await ddResp.json(); } catch { try { ddText = await ddResp.text(); } catch { ddText = null; } }
      } else {
        try { ddText = await ddResp.text(); } catch { ddText = null; }
        if (ddText) { try { ddJson = JSON.parse(ddText); } catch { ddJson = []; } }
      }
      domainResults = Array.isArray(ddJson) ? ddJson : [];
    } catch {}
    // Fallback sem Authorization e caminho alternativo com site_id
    if (!domainResults || domainResults.length === 0) {
      try {
        const ddUrl2 = `https://api.mercadolibre.com/domain_discovery/search?q=${encodeURIComponent(title)}&site_id=${encodeURIComponent(siteId)}&limit=6`;
        const ddResp2 = await fetch(ddUrl2, { headers: { Accept: "application/json" } });
        const ddct2 = ddResp2.headers.get("content-type") || "";
        let ddJson2: any = [];
        let ddText2: string | null = null;
        if (ddct2.includes("application/json")) {
          try { ddJson2 = await ddResp2.json(); } catch { try { ddText2 = await ddResp2.text(); } catch { ddText2 = null; } }
        } else {
          try { ddText2 = await ddResp2.text(); } catch { ddText2 = null; }
          if (ddText2) { try { ddJson2 = JSON.parse(ddText2); } catch { ddJson2 = []; } }
        }
        domainResults = Array.isArray(ddJson2) ? ddJson2 : [];
      } catch {}
    }
    if (!resp.ok) return jsonResponse({ error: "predict failed", meli: (json ?? {}), meli_text: text ?? undefined, domain_discovery: domainResults }, 200);
    return jsonResponse({ ok: true, predictions: json?.path_from_root ? [json] : (json?.predictions || []), domain_discovery: domainResults }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});