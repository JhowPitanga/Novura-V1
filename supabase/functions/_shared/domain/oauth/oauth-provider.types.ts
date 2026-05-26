// Domain types for the universal OAuth provider adapter.
// Each marketplace provider implements OAuthProviderAdapter to plug into
// the generic oauth-start-auth / oauth-callback / oauth-refresh edge functions.

import type { IntegrationRow } from "../integration-types.ts";

export interface ProviderCreds {
  clientId: string;
  clientSecret: string;
}

export interface OAuthContext {
  providerKey: string;
  organizationId: string;
  companyId: string | null;
  storeName: string | null;
  connectedByUserId: string | null;
  redirectUri: string;
  correlationId: string;
  /** CSRF nonce embedded in the signed state */
  nonce: string;
  /** Unix timestamp (seconds) at which the state was issued */
  issuedAt: number;
}

export interface AuthorizationResult {
  authorizationUrl: string;
  /** Signed state string to be sent to the marketplace authorization endpoint */
  state: string;
  /** PKCE code verifier — must be stored client-side (sessionStorage) and NOT in state */
  codeVerifier?: string;
}

export interface NormalizedTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  /** The seller/shop identifier as returned by the marketplace (used as external_account_id) */
  externalAccountId: string;
  /** Any extra metadata to merge into marketplace_integrations.config */
  extra?: Record<string, unknown>;
}

export interface OAuthProviderAdapter {
  /** Unique key matching marketplace_providers.key */
  key: string;

  /**
   * Parse the raw callback request (GET redirect or POST body) and return
   * the normalized fields needed by oauth-callback.
   */
  parseCallbackRequest(req: Request): Promise<{
    code: string;
    state: string;
    extras: Record<string, string>;
  }>;

  /**
   * Build the marketplace authorization URL given the OAuthContext and provider credentials.
   * For PKCE providers: generate code_verifier + challenge here.
   * For HMAC providers: sign the request here.
   */
  buildAuthorizationUrl(
    ctx: OAuthContext,
    creds: ProviderCreds,
  ): Promise<AuthorizationResult>;

  /**
   * Exchange the authorization code for tokens and return a NormalizedTokenSet.
   */
  exchangeCode(
    ctx: OAuthContext,
    code: string,
    codeVerifier: string | null,
    creds: ProviderCreds,
    extras: Record<string, string>,
  ): Promise<NormalizedTokenSet>;

  /**
   * Use the stored (decrypted) refresh_token to obtain a new token set.
   * Called by oauth-refresh-worker for each integration.
   */
  refreshTokens(
    row: IntegrationRow,
    creds: ProviderCreds,
  ): Promise<NormalizedTokenSet>;

  /**
   * Build the postMessage payload sent from the callback HTML page back to the opener.
   * Typically `{ providerKey, integrationId, externalAccountId }`.
   */
  buildPostMessagePayload(
    result: NormalizedTokenSet,
    integrationId: string,
  ): Record<string, unknown>;
}

export interface StatePayload {
  providerKey: string;
  organizationId: string;
  companyId: string | null;
  storeName: string | null;
  connectedByUserId: string | null;
  redirectUri: string;
  correlationId: string;
  nonce: string;
  issuedAt: number;
  /** HMAC-SHA256 signature over the rest of the fields (hex) */
  sig: string;
}
