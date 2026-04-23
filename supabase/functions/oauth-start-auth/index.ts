// Generic OAuth start-auth Edge Function.
// Replaces mercado-livre-start-auth and shopee-start-auth.
// Accepts: POST { providerKey, organizationId, companyId?, storeName?, connectedByUserId?, redirectUri? }
// Returns: { authorization_url, state, code_verifier? }

import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { getProvider } from "../_shared/adapters/oauth/registry.ts";
import { buildOAuthContext } from "../_shared/adapters/oauth/state-utils.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json() as {
      providerKey: string;
      organizationId: string;
      companyId?: string | null;
      storeName?: string | null;
      connectedByUserId?: string | null;
      redirectUri?: string;
      correlationId?: string;
    };

    const { providerKey, organizationId } = body;
    if (!providerKey) throw new Error("missing_provider_key");
    if (!organizationId) throw new Error("missing_organization_id");

    // Load adapter for this provider
    const adapter = getProvider(providerKey);

    // Fetch credentials from apps table
    const admin = createAdminClient();
    const creds = await new SupabaseAppCredentialsAdapter(admin).getByName(
      // Provider display_name is used as the app name in the apps table.
      // We look up by provider_key matching apps.provider_key via the view.
      providerKey,
    );
    if (!creds) {
      // Fallback: try looking up by display name from marketplace_providers
      const { data: providerRow } = await admin
        .from("marketplace_providers")
        .select("display_name")
        .eq("key", providerKey)
        .single();
      const displayName = providerRow?.display_name;
      if (displayName) {
        const credsFallback = await new SupabaseAppCredentialsAdapter(admin).getByName(displayName);
        if (!credsFallback) throw new Error(`no_credentials_for_provider:${providerKey}`);
        // Continue with credsFallback — replace creds reference
        const { authorization_url, state, code_verifier } = await resolveAndBuild(
          adapter, body, credsFallback,
        );
        return Response.json(
          { authorization_url, state, code_verifier },
          { headers: CORS },
        );
      }
      throw new Error(`no_credentials_for_provider:${providerKey}`);
    }

    const { authorization_url, state, code_verifier } = await resolveAndBuild(
      adapter, body, creds,
    );

    return Response.json(
      { authorization_url, state, code_verifier },
      { headers: CORS },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oauth-start-auth] error:", msg);
    return Response.json(
      { error: msg },
      { status: 400, headers: CORS },
    );
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BodyFields = {
  providerKey: string;
  organizationId: string;
  companyId?: string | null;
  storeName?: string | null;
  connectedByUserId?: string | null;
  redirectUri?: string;
  correlationId?: string;
};

async function resolveAndBuild(
  adapter: ReturnType<typeof getProvider>,
  body: BodyFields,
  creds: { client_id: string; client_secret: string },
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const defaultRedirect = getDefaultRedirectUri(supabaseUrl, body.providerKey);

  const ctx = buildOAuthContext({
    providerKey: body.providerKey,
    organizationId: body.organizationId,
    companyId: body.companyId ?? null,
    storeName: body.storeName ?? null,
    connectedByUserId: body.connectedByUserId ?? null,
    redirectUri: body.redirectUri ?? defaultRedirect,
    correlationId: body.correlationId ?? crypto.randomUUID(),
  });

  const result = await adapter.buildAuthorizationUrl(ctx, {
    clientId: creds.client_id,
    clientSecret: creds.client_secret,
  });

  return {
    authorization_url: result.authorizationUrl,
    state: result.state,
    code_verifier: result.codeVerifier ?? null,
  };
}

function getDefaultRedirectUri(supabaseUrl: string, providerKey: string): string {
  // Keep backward compatibility with provider consoles that still point
  // to legacy callback endpoints.
  if (providerKey === "mercado_livre") {
    return `${supabaseUrl}/functions/v1/mercado-livre-callback`;
  }
  if (providerKey === "shopee") {
    return `${supabaseUrl}/functions/v1/shopee-callback`;
  }
  return `${supabaseUrl}/functions/v1/oauth-callback`;
}
