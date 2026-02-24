// deno-lint-ignore-file no-explicit-any
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmDecryptFromString, aesGcmEncryptToString } from "../_shared/adapters/token-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) return jsonResponse({ error: "Missing service configuration" }, 500);

  const admin = createAdminClient();
  const aesKey = await importAesGcmKey(ENC_KEY_B64);

  try {
    const bodyText = await req.text();
    let parsed: any = {}; try { parsed = bodyText ? JSON.parse(bodyText) : {}; } catch { parsed = {}; }
    const urlObj = new URL(req.url);
    const organizationId = parsed?.organizationId || urlObj.searchParams.get('organizationId');
    const categoryId = parsed?.categoryId || urlObj.searchParams.get('categoryId');
    const attributes = Array.isArray(parsed?.attributes) ? parsed.attributes : [];
    if (!organizationId || !categoryId) return jsonResponse({ error: "organizationId and categoryId required" }, 400);

    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, marketplace_name, access_token, refresh_token")
      .eq("organizations_id", String(organizationId))
      .eq("marketplace_name", "Mercado Livre")
      .single();
    if (integErr || !integration) return jsonResponse({ error: "Integration not found" }, 404);

    const reqBody = { attributes };
    let accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
    let resp = await fetch(`https://api.mercadolibre.com/categories/${categoryId}/attributes/conditional`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(reqBody)
    });
    if (resp.status === 401 || resp.status === 403) {
      const { data: appRow, error: appErr } = await admin.from("apps").select("client_id, client_secret").eq("name", "Mercado Livre").single();
      if (!appRow || appErr) return jsonResponse({ error: "App credentials not found" }, 500);
      const refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token);
      const tokenResp = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: String(appRow.client_id), client_secret: String(appRow.client_secret), refresh_token: refreshTokenPlain })
      });
      if (!tokenResp.ok) return jsonResponse({ error: "Token refresh failed", status: tokenResp.status }, 200);
      const tokenJson = await tokenResp.json();
      const newAccessEnc = await aesGcmEncryptToString(aesKey, tokenJson.access_token);
      const newRefreshEnc = await aesGcmEncryptToString(aesKey, tokenJson.refresh_token);
      const expiresAtIso = new Date(Date.now() + (Number(tokenJson.expires_in) || 3600) * 1000).toISOString();
      await admin.from("marketplace_integrations").update({ access_token: newAccessEnc, refresh_token: newRefreshEnc, token_expires_at: expiresAtIso }).eq("id", integration.id);
      resp = await fetch(`https://api.mercadolibre.com/categories/${categoryId}/attributes/conditional`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(reqBody)
      });
    }
    if (!resp.ok) return jsonResponse({ error: "Failed", status: resp.status }, 200);
    const ml = await resp.json();
    let requiredIds: string[] = [];
    try {
      if (Array.isArray(ml?.required_attributes)) requiredIds = (ml.required_attributes as any[]).map((x: any) => String(x?.id || x)).filter(Boolean);
      else if (Array.isArray(ml?.attributes)) requiredIds = (ml.attributes as any[]).filter((x: any) => x?.tags?.required || x?.tags?.conditional_required).map((x: any) => String(x?.id)).filter(Boolean);
    } catch {}
    return jsonResponse({ required_ids: requiredIds, raw: ml }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
