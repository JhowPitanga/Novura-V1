// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({}, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { organizationId, itemId, targetStatus } = await req.json();
    if (!organizationId || !itemId || !targetStatus) return jsonResponse({ error: "Missing params" }, 400);

    // Fetch Mercado Livre integration
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, access_token, marketplace_name, organizations_id")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .single();
    if (integErr || !integration) return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);

    // Decrypt token if needed
    const enc = String(integration.access_token || "");
    let accessToken = enc;
    if (enc.startsWith("enc:gcm:")) {
      const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY")!;
      const b64ToUint8 = (b64: string) => { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; };
      const importKey = async (k: string) => crypto.subtle.importKey("raw", b64ToUint8(k), { name: "AES-GCM" }, false, ["decrypt"]);
      const parts = enc.split(":");
      const iv = b64ToUint8(parts[2]);
      const ct = b64ToUint8(parts[3]);
      const key = await importKey(ENC_KEY_B64);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
      accessToken = new TextDecoder().decode(pt);
    }

    // Call Mercado Livre to update status
    // For pause: PUT /items/{id} { status: "paused" }
    // For activate: PUT /items/{id} { status: "active" }
    const mlUrl = `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}`;
    const resp = await fetch(mlUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: String(targetStatus) }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return jsonResponse({ error: "ML update failed", details: json }, resp.status);

    // Reflect in DB
    const { error: updErr } = await admin
      .from("marketplace_items")
      .update({ status: String(targetStatus), updated_at: new Date().toISOString() })
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .eq("marketplace_item_id", String(itemId));
    if (updErr) return jsonResponse({ error: updErr.message, details: json }, 500);

    return jsonResponse({ ok: true, result: json });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});


