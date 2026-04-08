// AES-GCM helpers for token encryption/decryption.
// Context: adapters/infra (shared crypto for ML/Shopee tokens).

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
    keyBytes as BufferSource,
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
    strToUint8(plaintext) as BufferSource,
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
  const iv = b64ToUint8(parts[2]) as BufferSource;
  const ct = b64ToUint8(parts[3]) as BufferSource;
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
