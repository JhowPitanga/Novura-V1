// Generic OAuth start-auth Edge Function.
// Replaces mercado-livre-start-auth and shopee-start-auth.
// Accepts: POST { providerKey, organizationId, companyId?, storeName?, connectedByUserId?, redirectUri? }
// Returns: { authorization_url, state, code_verifier? }

import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import type { SupabaseClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { getProvider } from "../_shared/adapters/oauth/registry.ts";
import { buildOAuthContext } from "../_shared/adapters/oauth/state-utils.ts";
import { resolveShopeeRedirectUri } from "../_shared/adapters/oauth/shopee-oauth-config.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
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

    const admin = createAdminClient();
    const creds = await resolveProviderCredentials(admin, providerKey);
    if (!creds) throw new Error(`no_credentials_for_provider:${providerKey}`);

    const { authorization_url, state, code_verifier } = await resolveAndBuild(
      adapter, body, creds, admin,
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

async function resolveProviderCredentials(
  admin: SupabaseClient,
  providerKey: string,
): Promise<{ client_id: string; client_secret: string } | null> {
  const credsAdapter = new SupabaseAppCredentialsAdapter(admin);
  const { data: providerRow } = await admin
    .from("marketplace_providers")
    .select("display_name")
    .eq("key", providerKey)
    .maybeSingle();

  const candidates = [
    providerRow?.display_name,
    providerKey,
  ].filter((name): name is string => Boolean(name && String(name).trim()));

  for (const name of candidates) {
    const creds = await credsAdapter.getByName(name);
    if (creds) return creds;
  }
  return null;
}

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
  admin: SupabaseClient,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  let redirectUri = body.redirectUri ?? getDefaultRedirectUri(supabaseUrl, body.providerKey);

  if (body.providerKey === "shopee") {
    redirectUri = await resolveShopeeRedirectUri(admin, body.redirectUri ?? redirectUri);
  }

  const ctx = buildOAuthContext({
    providerKey: body.providerKey,
    organizationId: body.organizationId,
    companyId: body.companyId ?? null,
    storeName: body.storeName ?? null,
    connectedByUserId: body.connectedByUserId ?? null,
    redirectUri,
    correlationId: body.correlationId ?? crypto.randomUUID(),
  });

  console.log("[oauth-start-auth] redirect_resolved", {
    providerKey: body.providerKey,
    redirectUri,
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
    const envRedirect = Deno.env.get("SHOPEE_REDIRECT_URI")?.trim();
    if (envRedirect) return envRedirect;
    // Must match Redirect URL Domain in Shopee Partner Console (apex, no www).
    return "https://novuraerp.com.br/oauth/shopee/callback";
  }
  return `${supabaseUrl}/functions/v1/oauth-callback`;
}
