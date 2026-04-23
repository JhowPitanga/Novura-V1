// Generic OAuth callback Edge Function.
// Handles both GET (redirect from marketplace) and POST (PKCE code exchange from client).
//
// Flow:
//  1. Parse code + state (and extras like shop_id) from request
//  2. Verify signed state (HMAC + TTL)
//  3. Exchange code for tokens via provider adapter
//  4. Check global account uniqueness (provider_id + external_account_id, deactivated_at IS NULL)
//     - If claimed by another active org → 409 + postMessage error
//     - If claimed but deactivated → allow transfer (soft-delete old, insert new)
//  5. Upsert marketplace_integrations
//  6. Return HTML that posts { type:'oauth_success', payload } to opener

import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { getProvider } from "../_shared/adapters/oauth/registry.ts";
import { verifyAndParseState } from "../_shared/adapters/oauth/state-utils.ts";
import {
  aesGcmEncryptToString,
  importAesGcmKey,
} from "../_shared/adapters/infra/token-utils.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    return await handleCallback(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oauth-callback] unhandled error:", msg);
    return buildErrorHtml(msg, null);
  }
});

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handleCallback(req: Request): Promise<Response> {
  const admin = createAdminClient();
  const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";

  // Clone the request before the adapter reads the body
  const reqClone = req.clone();

  // The provider key may come from a query param (?provider_key=) when it's
  // a GET redirect from the marketplace, or we will infer it from the state.
  // We first peek at the URL for a hint:
  const url = new URL(req.url);
  const providerKeyHint = url.searchParams.get("provider_key") ?? null;

  // For GET requests (marketplace redirect), we must parse state before dispatching to adapter
  // because we need to know the provider. Read state from URL or fallback to body.
  const rawState = req.method === "GET"
    ? (url.searchParams.get("state") ?? "")
    : "";

  // Try to decode providerKey from state (without verifying yet) to select adapter
  let providerKeyFromState: string | null = null;
  if (rawState) {
    try {
      const decoded = JSON.parse(atob(rawState.replaceAll("-", "+").replaceAll("_", "/") + "=="));
      providerKeyFromState = decoded?.providerKey ?? null;
    } catch {
      // State may be fully encoded — parse will fail, that's ok
    }
  }

  const providerKeyGuess = providerKeyHint ?? providerKeyFromState;
  if (!providerKeyGuess) {
    return buildErrorHtml("missing_provider_key", null);
  }

  const adapter = getProvider(providerKeyGuess);

  // Let the adapter parse the full callback (code, state, extras)
  const { code, state: stateStr, extras } = await adapter.parseCallbackRequest(reqClone);

  // Verify signed state and extract context
  const statePayload = await verifyAndParseState(stateStr, encKey);
  const {
    providerKey,
    organizationId,
    companyId,
    storeName,
    connectedByUserId,
    redirectUri,
    correlationId,
  } = statePayload;

  // Load provider credentials
  const credsAdapter = new SupabaseAppCredentialsAdapter(admin);
  let creds = await credsAdapter.getByName(providerKey);
  if (!creds) {
    const { data: prov } = await admin
      .from("marketplace_providers")
      .select("display_name")
      .eq("key", providerKey)
      .single();
    if (prov?.display_name) {
      creds = await credsAdapter.getByName(prov.display_name);
    }
  }
  if (!creds) return buildErrorHtml(`no_credentials_for_provider:${providerKey}`, providerKey);

  // Look up provider row to get provider_id and marketplace_name
  const { data: providerRow, error: provErr } = await admin
    .from("marketplace_providers")
    .select("id, display_name")
    .eq("key", providerKey)
    .single();
  if (provErr || !providerRow) {
    return buildErrorHtml(`provider_not_found:${providerKey}`, providerKey);
  }
  const providerId = providerRow.id;
  const marketplaceName = providerRow.display_name;

  // PKCE code verifier comes through extras or was stored in state (Shopee does not use PKCE)
  const codeVerifier = extras["code_verifier"] ?? null;

  // Exchange code for tokens
  const ctx = {
    providerKey,
    organizationId,
    companyId: companyId ?? null,
    storeName: storeName ?? null,
    connectedByUserId: connectedByUserId ?? null,
    redirectUri: redirectUri ?? "",
    correlationId: correlationId ?? "",
    nonce: statePayload.nonce,
    issuedAt: statePayload.issuedAt,
  };

  let tokens;
  try {
    tokens = await adapter.exchangeCode(ctx, code, codeVerifier, {
      clientId: creds.client_id,
      clientSecret: creds.client_secret,
    }, extras);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return buildErrorHtml(`token_exchange_failed:${msg}`, providerKey);
  }

  const { accessToken, refreshToken, expiresInSeconds, externalAccountId, extra } = tokens;

  // -------------------------------------------------------------------------
  // Global uniqueness check
  // -------------------------------------------------------------------------
  const { data: existingRows } = await admin
    .from("marketplace_integrations")
    .select("id, organizations_id, deactivated_at, status")
    .eq("provider_id", providerId)
    .eq("external_account_id", externalAccountId)
    .is("deactivated_at", null);

  const conflictInOtherOrg = (existingRows ?? []).find(
    (r) => r.organizations_id !== organizationId,
  );

  if (conflictInOtherOrg) {
    // Account is actively linked to a different organization — block
    return buildErrorHtml(
      "account_already_linked_elsewhere",
      providerKey,
      "account_already_linked_elsewhere",
    );
  }

  // If it exists in a different org but is deactivated — we allow reuse.
  // (Covered by the partial unique index that excludes deactivated_at IS NOT NULL rows.)

  // -------------------------------------------------------------------------
  // Encrypt tokens
  // -------------------------------------------------------------------------
  const aesKey = await importAesGcmKey(encKey);
  const encAccessToken = await aesGcmEncryptToString(aesKey, accessToken);
  const encRefreshToken = refreshToken
    ? await aesGcmEncryptToString(aesKey, refreshToken)
    : null;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();

  // -------------------------------------------------------------------------
  // Upsert integration row
  // -------------------------------------------------------------------------
  // Check if there is already an integration in this org for this account
  const { data: ownOrgRow } = await admin
    .from("marketplace_integrations")
    .select("id")
    .eq("provider_id", providerId)
    .eq("external_account_id", externalAccountId)
    .eq("organizations_id", organizationId)
    .is("deactivated_at", null)
    .maybeSingle();

  const upsertData = {
    organizations_id: organizationId,
    provider_id: providerId,
    marketplace_name: marketplaceName,
    external_account_id: externalAccountId,
    access_token: encAccessToken,
    refresh_token: encRefreshToken,
    expires_at: expiresAt,
    expires_in: String(expiresInSeconds),
    status: "active" as const,
    store_name: storeName ?? null,
    connected_at: now.toISOString(),
    connected_by_user_id: connectedByUserId ?? null,
    setup_status: "pending" as const,
    last_refresh_at: null as string | null,
    last_refresh_error: null as string | null,
    token_key_version: 1,
    config: {
      ...(extra ?? {}),
      correlationId,
      // Backcompat fields
      ...(extra?.meli_user_id ? { meli_user_id: extra.meli_user_id } : {}),
      ...(extra?.shopee_shop_id ? { shopee_shop_id: extra.shopee_shop_id } : {}),
    },
  };

  let integrationId: string;

  if (ownOrgRow?.id) {
    // Reconnection — update existing row but preserve setup_status if already completed
    const { data: updated, error: upErr } = await admin
      .from("marketplace_integrations")
      .update({
        access_token: upsertData.access_token,
        refresh_token: upsertData.refresh_token,
        expires_at: upsertData.expires_at,
        expires_in: upsertData.expires_in,
        status: "active",
        last_refresh_at: null,
        last_refresh_error: null,
        token_key_version: 1,
        config: upsertData.config,
      })
      .eq("id", ownOrgRow.id)
      .select("id, setup_status")
      .single();
    if (upErr || !updated) throw new Error(upErr?.message ?? "update_failed");
    integrationId = updated.id;
  } else {
    // New integration
    const { data: inserted, error: insErr } = await admin
      .from("marketplace_integrations")
      .insert(upsertData)
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "insert_failed");
    integrationId = inserted.id;
  }

  // Also update meli_user_id column for ML (backward compat)
  if (extra?.meli_user_id) {
    await admin
      .from("marketplace_integrations")
      .update({ meli_user_id: Number(extra.meli_user_id) })
      .eq("id", integrationId);
  }

  // -------------------------------------------------------------------------
  // Return success HTML (postMessage to opener)
  // -------------------------------------------------------------------------
  const payload = adapter.buildPostMessagePayload(tokens, integrationId);
  return buildSuccessHtml(payload);
}

// ---------------------------------------------------------------------------
// HTML response builders
// ---------------------------------------------------------------------------

function buildSuccessHtml(payload: Record<string, unknown>): Response {
  const json = JSON.stringify({ type: "oauth_success", payload });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>
<script>
  (function(){
    var payload = ${json};
    if(window.opener){ window.opener.postMessage(payload, '*'); }
    setTimeout(function(){ window.close(); }, 300);
  })();
</script>
<p>Autenticação concluída. Esta janela será fechada automaticamente.</p>
</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function buildErrorHtml(
  error: string,
  providerKey: string | null,
  reason?: string,
): Response {
  const payload = JSON.stringify({
    type: "oauth_error",
    error,
    reason: reason ?? error,
    providerKey,
  });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>
<script>
  (function(){
    var payload = ${payload};
    if(window.opener){ window.opener.postMessage(payload, '*'); }
    setTimeout(function(){ window.close(); }, 1500);
  })();
</script>
<p>Erro na autenticação: ${error.replace(/[<>]/g, "")}. Feche esta janela e tente novamente.</p>
</body></html>`;
  return new Response(html, {
    status: 200, // 200 so the browser renders the HTML
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
