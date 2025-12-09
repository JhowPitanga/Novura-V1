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

export async function importAesGcmKey(base64OrHexKey: string): Promise<CryptoKey> { 
  const cleaned = base64OrHexKey.trim().replace(/^0x/i, "").replace(/[\s-]/g, "");
  let keyBytes: Uint8Array | null = null;
  try {
    const b64Bytes = b64ToUint8(cleaned);
    if (b64Bytes.length === 16 || b64Bytes.length === 24 || b64Bytes.length === 32) {
      keyBytes = b64Bytes;
    } else {
      keyBytes = null;
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
    if (!(bytes.length === 16 || bytes.length === 24 || bytes.length === 32)) {
      throw new Error("Invalid key length");
    }
    keyBytes = bytes;
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); 
}

export async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { 
  const iv = crypto.getRandomValues(new Uint8Array(12)); 
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, strToUint8(plaintext)); 
  const ctBytes = new Uint8Array(ct); 
  return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(ctBytes)}`; 
}
