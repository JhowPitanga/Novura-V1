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
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) return jsonResponse({ error: "Missing service configuration" }, 500);

  try {
    const body = await req.json();
    const organizationId: string | undefined = body?.organizationId;
    const siteId: string = body?.siteId || "MLB";
    if (!organizationId || !siteId) return jsonResponse({ error: "organizationId and siteId required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const aesKey = await importAesGcmKey(ENC_KEY_B64);
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
    try { accessToken = await aesGcmDecryptFromString(aesKey, integ.access_token); } catch { accessToken = integ.access_token; }

    const url = `https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/shipping_methods`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    const json = await resp.json();
    if (!resp.ok) return jsonResponse({ error: "shipping methods failed", meli: json }, 200);
    return jsonResponse({ ok: true, methods: json || [] }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});