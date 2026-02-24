import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmDecryptFromString } from "../_shared/adapters/token-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY") || undefined;

  try {
    const body = await req.json();
    const organizationId: string | undefined = body?.organizationId;
    const categoryId: string = body?.categoryId || "";
    if (!organizationId || !categoryId) return jsonResponse({ error: "organizationId and categoryId required" }, 400);

    const admin = createAdminClient();
    let aesKey: CryptoKey | null = null;
    if (ENC_KEY_B64) {
      try { aesKey = await importAesGcmKey(ENC_KEY_B64); } catch { aesKey = null; }
    }
    const { data: integ, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("access_token, meli_user_id")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .order("expires_in", { ascending: false })
      .limit(1)
      .single();
    if (integErr || !integ) return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);

    let accessToken: string;
    if (aesKey) { try { accessToken = await aesGcmDecryptFromString(aesKey, integ.access_token); } catch { accessToken = integ.access_token; } }
    else { accessToken = integ.access_token; }

    const url = `https://api.mercadolibre.com/users/${encodeURIComponent(String(integ.meli_user_id))}/available_listing_types?category_id=${encodeURIComponent(categoryId)}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    const json = await resp.json();
    if (!resp.ok) return jsonResponse({ error: "listing types failed", meli: json }, 200);
    const types = Array.isArray(json?.available) ? json.available : (Array.isArray(json) ? json : []);
    return jsonResponse({ ok: true, types }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
