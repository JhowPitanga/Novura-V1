// Re-export from new location for backwards compatibility.
// Existing functions that import from "../_shared/token-utils.ts" will continue to work.
// New code should import from "../_shared/adapters/infra/token-utils.ts" directly.
export {
  aesGcmDecryptFromString,
  aesGcmEncryptToString,
  b64ToUint8,
  hmacSha256Hex,
  importAesGcmKey,
  strToUint8,
  tryDecryptToken,
  uint8ToB64,
} from "./adapters/infra/token-utils.ts";
