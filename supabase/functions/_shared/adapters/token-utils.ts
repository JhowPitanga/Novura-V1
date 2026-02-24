// AES-GCM helpers for token encryption/decryption.
// Moved from _shared/token-utils.ts to _shared/adapters/token-utils.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { TokenRefreshResult } from "../domain/types.ts";

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

export async function importAesGcmKey(
  base64OrHexKey: string,
): Promise<CryptoKey> {
  const cleaned = base64OrHexKey.trim().replace(/^0x/i, "").replace(/[\s-]/g, "");
  let keyBytes: Uint8Array | null = null;

  try {
    const b64Bytes = b64ToUint8(cleaned);
    if ([16, 24, 32].includes(b64Bytes.length)) {
      keyBytes = b64Bytes;
    }
  } catch (_) {
    keyBytes = null;
  }

  if (!keyBytes) {
    const isHex = /^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 2 === 0;
    if (!isHex) throw new Error("Invalid key format");
    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < cleaned.length; i += 2) {
      bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
    }
    if (![16, 24, 32].includes(bytes.length)) {
      throw new Error("Invalid key length");
    }
    keyBytes = bytes;
  }

  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function aesGcmEncryptToString(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    strToUint8(plaintext),
  );
  return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(new Uint8Array(ct))}`;
}

export async function aesGcmDecryptFromString(
  key: CryptoKey,
  encStr: string,
): Promise<string> {
  const parts = encStr.split(":");
  if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") {
    throw new Error("Invalid token format");
  }
  const iv = b64ToUint8(parts[2]);
  const ct = b64ToUint8(parts[3]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

/**
 * Attempts to decrypt a token string. Returns plaintext if encrypted,
 * or the original string if it's not in enc:gcm format.
 */
export async function tryDecryptToken(
  key: CryptoKey,
  encStr: string,
): Promise<string> {
  const s = String(encStr || "");
  if (!s) return "";
  try {
    if (s.startsWith("enc:gcm:")) return await aesGcmDecryptFromString(key, s);
  } catch (_) {
    // Not encrypted or corrupted – return as-is
  }
  return s;
}

/**
 * Computes HMAC-SHA256 and returns uppercase hex string.
 * Used by Shopee API for request signing.
 */
export async function hmacSha256Hex(
  key: string,
  message: string,
): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex.toUpperCase();
}

type SupabaseAdmin = ReturnType<typeof createClient>;

/**
 * Checks if a Mercado Livre token is expired and refreshes it if necessary.
 * Tables accessed: marketplace_integrations (read + write), apps (read).
 * No schema changes – adapter translates existing rows.
 */
export async function checkAndRefreshToken(
  admin: SupabaseAdmin,
  aesKey: CryptoKey,
  integrationId: string,
): Promise<TokenRefreshResult> {
  try {
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, access_token, refresh_token, expires_in, meli_user_id, marketplace_name")
      .eq("id", integrationId)
      .single();

    if (integErr || !integration) {
      return { success: false, error: "Integration not found" };
    }

    const isExpired = new Date() >= new Date(integration.expires_in);

    if (!isExpired) {
      try {
        const accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
        return { success: true, accessToken };
      } catch (e) {
        return { success: false, error: `Failed to decrypt access token: ${e}` };
      }
    }

    console.log(
      `[token-utils] Token expired for integration ${integrationId}, attempting refresh...`,
    );

    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq(
        "name",
        integration.marketplace_name === "mercado_livre"
          ? "Mercado Livre"
          : integration.marketplace_name,
      )
      .single();

    if (appErr || !appRow) {
      return { success: false, error: "App credentials not found for token refresh" };
    }

    let refreshTokenPlain: string;
    try {
      refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token);
    } catch (e) {
      return { success: false, error: `Failed to decrypt refresh token: ${e}` };
    }

    const form = new URLSearchParams();
    form.append("grant_type", "refresh_token");
    form.append("client_id", appRow.client_id);
    form.append("client_secret", appRow.client_secret);
    form.append("refresh_token", refreshTokenPlain);

    const refreshResp = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const refreshJson = await refreshResp.json();
    if (!refreshResp.ok) {
      return {
        success: false,
        error: "Token refresh failed",
        details: { meli: refreshJson, original_error: "Token expired and refresh failed" },
      };
    }

    const {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in,
      user_id,
    } = refreshJson;

    const newExpiresAtIso = new Date(
      Date.now() + (Number(expires_in) || 0) * 1000,
    ).toISOString();

    const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, newAccessToken);
    const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, newRefreshToken);

    const { error: updErr } = await admin
      .from("marketplace_integrations")
      .update({
        access_token: newAccessTokenEnc,
        refresh_token: newRefreshTokenEnc,
        expires_in: newExpiresAtIso,
        meli_user_id: user_id,
      })
      .eq("id", integrationId);

    if (updErr) {
      return { success: false, error: `Failed to save refreshed tokens: ${updErr.message}` };
    }

    console.log(
      `[token-utils] Token refreshed successfully for integration ${integrationId}`,
    );
    return { success: true, accessToken: newAccessToken };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { success: false, error: message };
  }
}
