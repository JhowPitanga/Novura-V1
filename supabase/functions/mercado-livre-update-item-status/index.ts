// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmDecryptFromString } from "../_shared/adapters/token-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const admin = createAdminClient();

    const { organizationId, itemId, targetStatus } = await req.json();
    if (!organizationId || !itemId || !targetStatus) return jsonResponse({ error: "Missing params" }, 400);

    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, access_token, marketplace_name, organizations_id")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .single();
    if (integErr || !integration) return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);

    const enc = String(integration.access_token || "");
    let accessToken = enc;
    if (enc.startsWith("enc:gcm:")) {
      const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY")!;
      const aesKey = await importAesGcmKey(ENC_KEY_B64);
      accessToken = await aesGcmDecryptFromString(aesKey, enc);
    }

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
