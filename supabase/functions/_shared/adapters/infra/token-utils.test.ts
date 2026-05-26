/**
 * Unit tests for infra/token-utils (encoding, AES-GCM, tryDecryptToken, HMAC).
 * Run with: deno test -A token-utils.test.ts
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  strToUint8,
  uint8ToB64,
  b64ToUint8,
  importAesGcmKey,
  aesGcmEncryptToString,
  aesGcmDecryptFromString,
  tryDecryptToken,
  hmacSha256Hex,
} from "./token-utils.ts";

Deno.test("strToUint8 and uint8ToB64 roundtrip", () => {
  const str = "hello";
  const bytes = strToUint8(str);
  assertEquals(bytes.length, 5);
  assertEquals(uint8ToB64(bytes), btoa(str));
});

Deno.test("b64ToUint8 roundtrip with uint8ToB64", () => {
  const b64 = "dGVzdA==";
  const bytes = b64ToUint8(b64);
  assertEquals(uint8ToB64(bytes), b64);
});

Deno.test("importAesGcmKey: accepts 32-byte base64 key", async () => {
  // 32 bytes in base64
  const keyB64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const key = await importAesGcmKey(keyB64);
  assertEquals(key.type, "secret");
  assertEquals(key.algorithm?.name, "AES-GCM");
});

Deno.test("importAesGcmKey: throws for invalid key format", async () => {
  await assertRejects(
    () => importAesGcmKey("not-valid-base64!!"),
    Error,
    "Invalid key format",
  );
});

Deno.test("importAesGcmKey: throws for invalid key length (hex)", async () => {
  // Valid lengths are 16, 24, 32 bytes (32, 48, 64 hex chars). 10 bytes = 20 hex chars is invalid.
  await assertRejects(
    () => importAesGcmKey("0123456789abcdef0123"),
    Error,
    "Invalid key length",
  );
});

Deno.test("aesGcmEncryptToString and aesGcmDecryptFromString roundtrip", async () => {
  const keyB64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const key = await importAesGcmKey(keyB64);
  const plain = "secret-token-123";
  const enc = await aesGcmEncryptToString(key, plain);
  assertEquals(enc.startsWith("enc:gcm:"), true);
  const dec = await aesGcmDecryptFromString(key, enc);
  assertEquals(dec, plain);
});

Deno.test("aesGcmDecryptFromString: throws for invalid format", async () => {
  const key = await importAesGcmKey("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  await assertRejects(
    () => aesGcmDecryptFromString(key, "enc:gcm:bad"),
    Error,
    "Invalid token format",
  );
  await assertRejects(
    () => aesGcmDecryptFromString(key, "plain-text"),
    Error,
    "Invalid token format",
  );
});

Deno.test("tryDecryptToken: returns plain string when not enc:gcm:", async () => {
  const key = await importAesGcmKey("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  assertEquals(await tryDecryptToken(key, "plain"), "plain");
  assertEquals(await tryDecryptToken(key, ""), "");
});

Deno.test("tryDecryptToken: decrypts when enc:gcm: prefix", async () => {
  const keyB64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const key = await importAesGcmKey(keyB64);
  const enc = await aesGcmEncryptToString(key, "my-token");
  assertEquals(await tryDecryptToken(key, enc), "my-token");
});

Deno.test("hmacSha256Hex: deterministic output for same key and message", async () => {
  const key = "test-key";
  const msg = "message";
  const a = await hmacSha256Hex(key, msg);
  const b = await hmacSha256Hex(key, msg);
  assertEquals(a, b);
  assertEquals(a.length, 64);
  assertEquals(/^[0-9A-F]+$/.test(a), true);
});

Deno.test("hmacSha256Hex: different message produces different hash", async () => {
  const key = "key";
  const h1 = await hmacSha256Hex(key, "msg1");
  const h2 = await hmacSha256Hex(key, "msg2");
  assertEquals(h1 !== h2, true);
});
