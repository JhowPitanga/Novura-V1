// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// AES-GCM helpers for token encryption/decryption
export function strToUint8(str: string): Uint8Array { 
  return new TextEncoder().encode(str); 
}

export function uint8ToB64(bytes: Uint8Array): string { 
  const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join(""); 
  return btoa(bin); 
}

export function b64ToUint8(b64: string): Uint8Array { 
  const bin = atob(b64); 
  const bytes = new Uint8Array(bin.length); 
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); 
  return bytes; 
}

export async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { 
  const keyBytes = b64ToUint8(base64Key); 
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); 
}

export async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { 
  const iv = crypto.getRandomValues(new Uint8Array(12)); 
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, strToUint8(plaintext)); 
  const ctBytes = new Uint8Array(ct); 
  return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(ctBytes)}`; 
}

export async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { 
  const parts = encStr.split(":"); 
  if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") 
    throw new Error("Invalid token format"); 
  const iv = b64ToUint8(parts[2]); 
  const ct = b64ToUint8(parts[3]); 
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); 
  return new TextDecoder().decode(pt); 
}

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  error?: string;
  details?: any;
}

/**
 * Checks if a token is expired and refreshes it if necessary
 * @param admin Supabase admin client
 * @param aesKey Encryption key for tokens
 * @param integrationId Integration ID to refresh
 * @returns TokenRefreshResult with success status and new token if refreshed
 */
export async function checkAndRefreshToken(
  admin: any,
  aesKey: CryptoKey,
  integrationId: string
): Promise<TokenRefreshResult> {
  try {
    // Get integration data
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, access_token, refresh_token, expires_in, meli_user_id, marketplace_name")
      .eq("id", integrationId)
      .single();

    if (integErr || !integration) {
      return { success: false, error: "Integration not found" };
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(integration.expires_in);
    const isExpired = now >= expiresAt;

    if (!isExpired) {
      // Token is still valid, decrypt and return it
      try {
        const accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
        return { success: true, accessToken };
      } catch (e) {
        return { success: false, error: `Failed to decrypt access token: ${e}` };
      }
    }

    console.log(`[token-utils] Token expired for integration ${integrationId}, attempting refresh...`);

    // Get app credentials for refresh
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", integration.marketplace_name === "mercado_livre" ? "Mercado Livre" : integration.marketplace_name)
      .single();

    if (appErr || !appRow) {
      return { success: false, error: "App credentials not found for token refresh" };
    }

    // Decrypt refresh token
    let refreshTokenPlain: string;
    try {
      refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token);
    } catch (e) {
      return { success: false, error: `Failed to decrypt refresh token: ${e}` };
    }

    // Refresh the token
    const form = new URLSearchParams();
    form.append("grant_type", "refresh_token");
    form.append("client_id", appRow.client_id);
    form.append("client_secret", appRow.client_secret);
    form.append("refresh_token", refreshTokenPlain);

    const refreshResp = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const refreshJson = await refreshResp.json();
    if (!refreshResp.ok) {
      return { 
        success: false, 
        error: "Token refresh failed", 
        details: { meli: refreshJson, original_error: "Token expired and refresh failed" }
      };
    }

    const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in, user_id } = refreshJson;
    const newExpiresAtIso = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();

    // Re-encrypt and save new tokens
    const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, newAccessToken);
    const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, newRefreshToken);

    const { error: updErr } = await admin
      .from("marketplace_integrations")
      .update({ 
        access_token: newAccessTokenEnc, 
        refresh_token: newRefreshTokenEnc, 
        expires_in: newExpiresAtIso,
        meli_user_id: user_id 
      })
      .eq("id", integrationId);

    if (updErr) {
      return { success: false, error: `Failed to save refreshed tokens: ${updErr.message}` };
    }

    console.log(`[token-utils] Token refreshed successfully for integration ${integrationId}`);
    return { success: true, accessToken: newAccessToken };

  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { success: false, error: message };
  }
}
