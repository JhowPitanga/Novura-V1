// Shopee OAuth start — runs inline (does not delegate to oauth-start-auth).

import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import type { SupabaseClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { shopeeAdapter } from "../_shared/adapters/oauth/providers/shopee.ts";
import { buildOAuthContext } from "../_shared/adapters/oauth/state-utils.ts";
import { resolveShopeeRedirectUri } from "../_shared/adapters/oauth/shopee-oauth-config.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROVIDER_KEY = "shopee";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const body = await req.json() as {
      organizationId: string;
      companyId?: string | null;
      storeName?: string | null;
      connectedByUserId?: string | null;
      redirectUri?: string;
      correlationId?: string;
    };

    const organizationId = body.organizationId;
    if (!organizationId) throw new Error("missing_organization_id");

    const admin = createAdminClient();
    const creds = await resolveShopeeCredentials(admin);
    if (!creds) throw new Error(`no_credentials_for_provider:${PROVIDER_KEY}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    let redirectUri = body.redirectUri ??
      Deno.env.get("SHOPEE_REDIRECT_URI")?.trim() ??
      "https://novuraerp.com.br/oauth/shopee/callback";
    redirectUri = await resolveShopeeRedirectUri(admin, redirectUri);

    const ctx = buildOAuthContext({
      providerKey: PROVIDER_KEY,
      organizationId,
      companyId: body.companyId ?? null,
      storeName: body.storeName ?? null,
      connectedByUserId: body.connectedByUserId ?? null,
      redirectUri,
      correlationId: body.correlationId ?? crypto.randomUUID(),
    });

    const result = await shopeeAdapter.buildAuthorizationUrl(ctx, {
      clientId: creds.client_id,
      clientSecret: creds.client_secret,
    });

    return Response.json(
      {
        authorization_url: result.authorizationUrl,
        state: result.state,
        code_verifier: result.codeVerifier ?? null,
      },
      { headers: CORS },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[shopee-start-auth] error:", msg);
    return Response.json({ error: msg }, { status: 400, headers: CORS });
  }
});

async function resolveShopeeCredentials(
  admin: SupabaseClient,
): Promise<{ client_id: string; client_secret: string } | null> {
  const credsAdapter = new SupabaseAppCredentialsAdapter(admin);
  const { data: providerRow } = await admin
    .from("marketplace_providers")
    .select("display_name")
    .eq("key", PROVIDER_KEY)
    .maybeSingle();

  for (const name of [providerRow?.display_name, "Shopee", PROVIDER_KEY]) {
    if (!name) continue;
    const creds = await credsAdapter.getByName(name);
    if (creds) return creds;
  }
  return null;
}
