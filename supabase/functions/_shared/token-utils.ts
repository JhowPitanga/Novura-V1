// Re-export from new location for backwards compatibility.
// Existing functions that import from "../_shared/token-utils.ts" will continue to work.
// New code should import from "../_shared/adapters/token-utils.ts" directly.
export {
  aesGcmDecryptFromString,
  aesGcmEncryptToString,
  b64ToUint8,
  checkAndRefreshToken,
  hmacSha256Hex,
  importAesGcmKey,
  strToUint8,
  tryDecryptToken,
  uint8ToB64,
} from "./adapters/token-utils.ts";

export type { TokenRefreshResult } from "./domain/types.ts";
