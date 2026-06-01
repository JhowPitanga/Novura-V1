// Generic OAuth start-auth Edge Function.
// Accepts: POST { appId?, providerKey, organizationId, companyId?, storeName?, connectedByUserId?, redirectUri? }
// Returns: { authorization_url, state, code_verifier? }

import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import type { SupabaseClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import type { AppCredentialsRecord } from "../_shared/ports/app-credentials-port.ts";
import { getProvider } from "../_shared/adapters/oauth/registry.ts";
import { resolveRedirectUriForApp } from "../_shared/adapters/oauth/redirect-resolver.ts";
import { buildOAuthContext } from "../_shared/adapters/oauth/state-utils.ts";

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
      appId?: string;
      providerKey: string;
      organizationId: string;
      companyId?: string | null;
      storeName?: string | null;
      connectedByUserId?: string | null;
      redirectUri?: string;
      correlationId?: string;
      openerOrigin?: string | null;
      reconnectIntegrationId?: string | null;
    };

    const { providerKey, organizationId } = body;
    if (!providerKey) throw new Error("missing_provider_key");
    if (!organizationId) throw new Error("missing_organization_id");

    const adapter = getProvider(providerKey);
    const admin = createAdminClient();
    const appCreds = await resolveAppCredentials(admin, body);
    if (!appCreds) throw new Error(`no_credentials_for_provider:${providerKey}`);

    const { authorization_url, state, code_verifier } = await resolveAndBuild(
      adapter, body, appCreds, admin,
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

async function resolveAppCredentials(
  admin: SupabaseClient,
  body: { appId?: string; providerKey: string },
): Promise<AppCredentialsRecord | null> {
  const credsAdapter = new SupabaseAppCredentialsAdapter(admin);

  if (body.appId?.trim()) {
    const byApp = await credsAdapter.getByAppId(body.appId.trim());
    if (byApp) return byApp;
    throw new Error(`no_credentials_for_app:${body.appId.trim()}`);
  }

  const { data: providerRow } = await admin
    .from("marketplace_providers")
    .select("display_name")
    .eq("key", body.providerKey)
    .maybeSingle();

  const candidates = [
    providerRow?.display_name,
    body.providerKey,
  ].filter((name): name is string => Boolean(name && String(name).trim()));

  for (const name of candidates) {
    const creds = await credsAdapter.getByName(name);
    if (creds) {
      return {
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        app_id: "",
        config: {},
      };
    }
  }
  return null;
}

type BodyFields = {
  appId?: string;
  providerKey: string;
  organizationId: string;
  companyId?: string | null;
  storeName?: string | null;
  connectedByUserId?: string | null;
  redirectUri?: string;
  correlationId?: string;
  openerOrigin?: string | null;
  reconnectIntegrationId?: string | null;
};

async function resolveAndBuild(
  adapter: ReturnType<typeof getProvider>,
  body: BodyFields,
  appCreds: AppCredentialsRecord,
  admin: SupabaseClient,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const redirectUri = await resolveRedirectUriForApp(admin, {
    providerKey: body.providerKey,
    appId: body.appId ?? appCreds.app_id ?? null,
    requested: body.redirectUri ?? null,
    supabaseUrl,
  });

  const ctx = buildOAuthContext({
    providerKey: body.providerKey,
    organizationId: body.organizationId,
    companyId: body.companyId ?? null,
    storeName: body.storeName ?? null,
    connectedByUserId: body.connectedByUserId ?? null,
    redirectUri,
    correlationId: body.correlationId ?? crypto.randomUUID(),
    appId: body.appId ?? appCreds.app_id ?? null,
    appConfig: appCreds.config,
    openerOrigin: body.openerOrigin ?? null,
    reconnectIntegrationId: body.reconnectIntegrationId ?? null,
  });

  console.log("[oauth-start-auth] redirect_resolved", {
    providerKey: body.providerKey,
    appId: ctx.appId,
    environment: ctx.appConfig?.environment ?? "production",
    redirectUri,
  });

  const result = await adapter.buildAuthorizationUrl(ctx, {
    clientId: appCreds.client_id,
    clientSecret: appCreds.client_secret,
  });

  return {
    authorization_url: result.authorizationUrl,
    state: result.state,
    code_verifier: result.codeVerifier ?? null,
  };
}
