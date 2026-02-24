import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmDecryptFromString } from "../_shared/adapters/token-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) return jsonResponse({ error: "Missing service configuration" }, 500);

  try {
    const rid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    let parsed: any = {}; try { parsed = await req.json(); } catch { parsed = {}; }
    const organizationId: string | undefined = parsed?.organizationId;
    const categoryId: string | undefined = parsed?.categoryId;
    if (!organizationId || !categoryId) return jsonResponse({ error: "organizationId and categoryId required", rid }, 400);

    const admin = createAdminClient();
    const aesKey = await importAesGcmKey(ENC_KEY_B64);

    const { data: integ, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, marketplace_name, access_token")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    if (integErr || !integ) return jsonResponse({ error: integErr?.message || "Integration not found", rid }, 404);

    let accessToken: string; try { accessToken = await aesGcmDecryptFromString(aesKey, integ.access_token); } catch { accessToken = String(integ.access_token || ""); }

    const url = `https://api.mercadolibre.com/categories/${encodeURIComponent(categoryId)}/sale_terms`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    const json = await resp.json();
    if (!resp.ok) return jsonResponse({ error: "sale_terms fetch failed", rid, meli: json }, resp.status || 400);
    return jsonResponse({ ok: true, terms: Array.isArray(json) ? json : [] }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
