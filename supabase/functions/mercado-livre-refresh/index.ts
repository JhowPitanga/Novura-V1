// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { integrationId } = await req.json();
    if (!integrationId) return jsonResponse({ error: "Missing integrationId" }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: integ, error: getErr } = await admin
      .from("marketplace_integrations")
      .select("id, refresh_token, marketplace_name")
      .eq("id", integrationId)
      .single();

    if (getErr || !integ) return jsonResponse({ error: getErr?.message || "Integration not found" }, 404);
    if (!integ.refresh_token) return jsonResponse({ error: "Missing refresh_token" }, 400);

    // Fetch app credentials from public.apps by marketplace_name
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", integ.marketplace_name === "mercado_livre" ? "Mercado Livre" : integ.marketplace_name)
      .single();

    if (appErr || !appRow) return jsonResponse({ error: appErr?.message || "App credentials not found" }, 404);

    const clientSecret = appRow.client_secret || Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET") || null;
    if (!clientSecret) return jsonResponse({ error: "Missing client_secret (DB or env)" }, 400);

    const form = new URLSearchParams();
    form.append("grant_type", "refresh_token");
    form.append("client_id", appRow.client_id);
    form.append("client_secret", clientSecret);
    form.append("refresh_token", integ.refresh_token);

    const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const json = await resp.json();
    if (!resp.ok) return jsonResponse({ error: json?.error_description || "Refresh failed", details: json }, resp.status);

    const { access_token, refresh_token, expires_in, user_id } = json;

    const { error: updErr } = await admin
      .from("marketplace_integrations")
      .update({ access_token, refresh_token, expires_in, meli_user_id: user_id })
      .eq("id", integrationId);

    if (updErr) return jsonResponse({ error: updErr.message }, 500);

    return jsonResponse({ ok: true, access_token, expires_in });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});