// Signed state helpers for the universal OAuth flow.
// The `state` parameter is a base64url-encoded JSON object signed with
// HMAC-SHA256 using the TOKENS_ENCRYPTION_KEY env var as the secret.
// A TTL of 15 minutes is enforced to mitigate replays.

import type { OAuthContext, StatePayload } from "../../domain/oauth/oauth-provider.types.ts";
import { hmacSha256Hex } from "../infra/token-utils.ts";

const STATE_TTL_SECONDS = 15 * 60; // 15 minutes

function base64urlEncode(input: string): string {
  return btoa(input)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64urlDecode(input: string): string {
  const padded = input.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (input.length % 4)) % 4);
  return atob(padded);
}

function buildSignableBody(payload: Omit<StatePayload, "sig">): string {
  // Stable JSON sort to avoid signature mismatches due to key ordering
  const sorted = Object.fromEntries(
    Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify(sorted);
}

/** Create a signed state string from an OAuthContext. */
export async function createSignedState(
  ctx: OAuthContext,
  encKeyB64: string,
): Promise<string> {
  const body: Omit<StatePayload, "sig"> = {
    providerKey: ctx.providerKey,
    organizationId: ctx.organizationId,
    companyId: ctx.companyId,
    storeName: ctx.storeName,
    connectedByUserId: ctx.connectedByUserId,
    redirectUri: ctx.redirectUri,
    correlationId: ctx.correlationId,
    nonce: ctx.nonce,
    issuedAt: ctx.issuedAt,
  };
  const signable = buildSignableBody(body);
  const sig = await hmacSha256Hex(encKeyB64, signable);
  const payload: StatePayload = { ...body, sig };
  return base64urlEncode(JSON.stringify(payload));
}

/** Verify a signed state string and return the parsed payload. Throws on invalid/expired. */
export async function verifyAndParseState(
  stateStr: string,
  encKeyB64: string,
): Promise<StatePayload> {
  let payload: StatePayload;
  try {
    payload = JSON.parse(base64urlDecode(stateStr)) as StatePayload;
  } catch {
    throw new Error("invalid_state:parse_failed");
  }

  const { sig, ...rest } = payload;
  const signable = buildSignableBody(rest);
  const expectedSig = await hmacSha256Hex(encKeyB64, signable);

  if (sig !== expectedSig) {
    throw new Error("invalid_state:signature_mismatch");
  }

  const age = Math.floor(Date.now() / 1000) - payload.issuedAt;
  if (age > STATE_TTL_SECONDS) {
    throw new Error("invalid_state:expired");
  }

  return payload;
}

/** Generate a cryptographically random nonce */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Build an OAuthContext from raw request body fields */
export function buildOAuthContext(fields: {
  providerKey: string;
  organizationId: string;
  companyId?: string | null;
  storeName?: string | null;
  connectedByUserId?: string | null;
  redirectUri: string;
  correlationId: string;
}): OAuthContext {
  return {
    providerKey: fields.providerKey,
    organizationId: fields.organizationId,
    companyId: fields.companyId ?? null,
    storeName: fields.storeName ?? null,
    connectedByUserId: fields.connectedByUserId ?? null,
    redirectUri: fields.redirectUri,
    correlationId: fields.correlationId,
    nonce: generateNonce(),
    issuedAt: Math.floor(Date.now() / 1000),
  };
}
