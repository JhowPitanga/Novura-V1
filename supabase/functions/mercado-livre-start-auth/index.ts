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
    const { marketplaceName = "Mercado Livre", redirect_uri, organizationId, storeName, connectedByUserId } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Fetch app row
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("name, client_id, auth_url")
      .eq("name", marketplaceName)
      .single();

    if (appErr || !appRow) return jsonResponse({ error: appErr?.message || "App not found" }, 404);

    // Resolve credentials from DB or environment
    const clientId = appRow.client_id || Deno.env.get("MERCADO_LIVRE_CLIENT_ID") || null;
    const authUrl = appRow.auth_url || Deno.env.get("MERCADO_LIVRE_AUTH_URL") || "https://auth.mercadolivre.com.br/authorization";
    if (!clientId || !authUrl) return jsonResponse({ error: "App missing client_id or auth_url (DB or env)" }, 400);

    // Generate state for CSRF protection and pass-through context
    const csrf = crypto.randomUUID();
    const statePayload = {
      csrf,
      organizationId: organizationId ?? null,
      marketplaceName: appRow.name,
      storeName: storeName ?? null,
      connectedByUserId: connectedByUserId ?? null,
    };
    const state = btoa(JSON.stringify(statePayload));

    // Determine redirect URI (env fallback if not provided)
    const envRedirect = Deno.env.get("MERCADO_LIVRE_REDIRECT_URI") || Deno.env.get("MERCADO_LIVRE_CALLBACK_URL") || null;
    const finalRedirect = redirect_uri || envRedirect;

    // Build authorization URL
    const base = new URL(authUrl);
    base.searchParams.set("client_id", clientId);
    base.searchParams.set("response_type", "code");
    base.searchParams.set("state", state);
    if (finalRedirect) {
      base.searchParams.set("redirect_uri", finalRedirect);
    }

    return jsonResponse({ authorization_url: base.toString(), state });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});