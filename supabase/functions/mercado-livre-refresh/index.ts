// deno-lint-ignore-file no-explicit-any
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { importAesGcmKey, aesGcmEncryptToString, aesGcmDecryptFromString } from "../_shared/adapters/token-utils.ts";

const mlRefreshHandler = async (req: Request) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST" && req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const rid = (crypto as any)?.randomUUID ? crypto.randomUUID() : String(Date.now());
    console.log("[ml-refresh]", rid, "start");
    let integrationId: string | undefined;
    let organizationId: string | undefined;
    const h = req.headers;
    integrationId = h.get("x-integration-id") || h.get("x-integrationid") || h.get("x-integration_id") || undefined;
    organizationId = h.get("x-organization-id") || h.get("x-org-id") || h.get("x-organization_id") || undefined;
    let rawText: string | null = null;
    try { rawText = await req.text(); } catch (_) { rawText = null; }
    if (!integrationId && rawText && rawText.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawText);
        integrationId = (parsed as any)?.integrationId || (parsed as any)?.id || (parsed as any)?.integration_id || integrationId;
        organizationId = (parsed as any)?.organizationId || (parsed as any)?.organization_id || organizationId;
      } catch (_) {
        try {
          const params = new URLSearchParams(rawText);
          integrationId = params.get("integrationId") || params.get("id") || params.get("integration_id") || integrationId;
          organizationId = params.get("organizationId") || params.get("organization_id") || organizationId;
        } catch (_) {}
      }
    }
    if (!integrationId || !organizationId) {
      try {
        const u = new URL(req.url);
        integrationId = integrationId || u.searchParams.get("integrationId") || u.searchParams.get("id") || u.searchParams.get("integration_id") || undefined;
        organizationId = organizationId || u.searchParams.get("organizationId") || u.searchParams.get("organization_id") || undefined;
      } catch (_) {}
    }
    if (!integrationId) {
      const defInteg = Deno.env.get("MERCADO_LIVRE_DEFAULT_INTEGRATION_ID") || null;
      if (defInteg) integrationId = defInteg;
    }
    // Raw REST calls require env vars directly
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);
    console.log("[ml-refresh]", rid, "env_present", { hasSupabaseUrl: !!SUPABASE_URL, hasServiceRoleKey: !!SERVICE_ROLE_KEY });
    const rest = `${SUPABASE_URL}/rest/v1`;
    const baseHeaders: Record<string,string> = { accept: "application/json", apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` };
    let integ: any = null;
    if (!integrationId) {
      organizationId = organizationId || Deno.env.get("MERCADO_LIVRE_DEFAULT_ORGANIZATION_ID") || undefined;
      if (organizationId) {
        const mktName = "Mercado Livre";
        const byOrgResp = await fetch(`${rest}/marketplace_integrations?organizations_id=eq.${encodeURIComponent(organizationId)}&marketplace_name=eq.${encodeURIComponent(mktName)}&select=id,refresh_token,marketplace_name&limit=1`, { headers: { ...baseHeaders, Prefer: "single-object" } });
        const byOrg = await byOrgResp.json();
        if (byOrgResp.ok && byOrg?.id) { integ = byOrg; integrationId = String(byOrg.id); }
      }
    }
    console.log("[ml-refresh]", rid, "integrationId", integrationId || null);

    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
    if (!ENC_KEY_B64) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);
    const aesKey = await importAesGcmKey(ENC_KEY_B64);
    console.log("[ml-refresh]", rid, "enc_key_present", !!ENC_KEY_B64);
    if (!integ && integrationId) {
      const integResp = await fetch(`${rest}/marketplace_integrations?id=eq.${encodeURIComponent(integrationId)}&select=id,refresh_token,marketplace_name&limit=1`, { headers: { ...baseHeaders, Prefer: "single-object" } });
      integ = await integResp.json();
      if (!integResp.ok || !integ) return jsonResponse({ error: (integ && integ.message) || "Integration not found" }, 404);
    }
    const targets: any[] = integ ? [integ] : [];
    if (targets.length === 0) {
      const listResp = await fetch(`${rest}/marketplace_integrations?marketplace_name=eq.${encodeURIComponent("Mercado Livre")}&select=id,refresh_token,marketplace_name`, { headers: baseHeaders });
      const list = await listResp.json();
      if (listResp.ok && Array.isArray(list)) {
        for (const row of list) { if (row?.id) targets.push(row); }
      }
    }
    if (targets.length === 0) return jsonResponse({ error: "No Mercado Livre integrations found" }, 404);
    const appResp = await fetch(`${rest}/apps?name=eq.${encodeURIComponent("Mercado Livre")}&select=client_id,client_secret&limit=1`, { headers: { ...baseHeaders, Prefer: "single-object" } });
    const appRow = await appResp.json();
    const clientId = (appResp.ok && appRow?.client_id) ? appRow.client_id : (Deno.env.get("MERCADO_LIVRE_CLIENT_ID") || null);
    const clientSecret = (appResp.ok && appRow?.client_secret) ? appRow.client_secret : (Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET") || null);
    if (!clientId || !clientSecret) return jsonResponse({ error: "Missing client credentials (DB or env)", appName: "Mercado Livre" }, 400);
    const results: any[] = [];
    for (const t of targets) {
      if (!t?.refresh_token) { results.push({ id: t?.id, ok: false, error: "Missing refresh_token" }); continue; }
      const enc = String(t.refresh_token);
      let plain = enc;
      if (enc.startsWith("enc:gcm:")) {
        try { plain = await aesGcmDecryptFromString(aesKey, enc); } catch (e) { results.push({ id: t.id, ok: false, error: `Failed to decrypt refresh_token: ${e instanceof Error ? e.message : String(e)}` }); continue; }
      }
      const form = new URLSearchParams();
      form.append("grant_type", "refresh_token");
      form.append("client_id", clientId);
      form.append("client_secret", clientSecret);
      form.append("refresh_token", plain);
      let resp: Response;
      try {
        resp = await fetch("https://api.mercadolibre.com/oauth/token", { method: "POST", headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
      } catch (e) {
        results.push({ id: t.id, ok: false, error: `Failed to call ML oauth/token: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }
      const txt = await resp.text();
      let js: any = null; try { js = JSON.parse(txt); } catch { js = { raw: txt }; }
      if (!resp.ok) { results.push({ id: t.id, ok: false, status: resp.status, error: js?.error_description || js?.message || "Refresh failed", meli_error: js?.error }); continue; }
      const { access_token, refresh_token, expires_in, user_id } = js;
      const expiresIso = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();
      const accessEnc = await aesGcmEncryptToString(aesKey, access_token);
      const refreshEnc = await aesGcmEncryptToString(aesKey, refresh_token);
      const upd = await fetch(`${rest}/marketplace_integrations?id=eq.${encodeURIComponent(String(t.id))}`, { method: "PATCH", headers: { ...baseHeaders, "content-type": "application/json" }, body: JSON.stringify({ access_token: accessEnc, refresh_token: refreshEnc, expires_in: expiresIso, meli_user_id: user_id }) });
      if (!upd.ok) { let err: any = null; try { err = await upd.json(); } catch {} results.push({ id: t.id, ok: false, error: (err && err.message) || "Update failed" }); continue; }
      results.push({ id: t.id, ok: true, expires_in: expiresIso, user_id });
    }
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    return jsonResponse({ ok: okCount > 0, refreshed: okCount, failed: failCount, results }, okCount > 0 ? 200 : 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.log("[ml-refresh]", "unhandled_exception", message);
    return jsonResponse({ error: message }, 500);
  }
};

Deno.serve(mlRefreshHandler);
