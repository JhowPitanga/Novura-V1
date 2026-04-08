/**
 * Unit tests for infra/http-utils. Run with: deno test -A http-utils.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { corsHeaders, jsonResponse, handleOptions } from "./http-utils.ts";

Deno.test("corsHeaders: returns default CORS headers", () => {
  const h = corsHeaders();
  assertEquals(h["access-control-allow-origin"], "*");
  assertEquals(h["access-control-allow-methods"], "GET, POST, OPTIONS");
  assertEquals(h["access-control-allow-headers"], "authorization, x-client-info, apikey, content-type");
});

Deno.test("corsHeaders: merges extra headers", () => {
  const h = corsHeaders({ "x-custom": "value" });
  assertEquals(h["access-control-allow-origin"], "*");
  assertEquals(h["x-custom"], "value");
});

Deno.test("jsonResponse: returns 200 and JSON body by default", () => {
  const res = jsonResponse({ foo: "bar" });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "application/json");
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});

Deno.test("jsonResponse: uses custom status and extra headers", async () => {
  const res = jsonResponse({ error: "Not found" }, 404, { "x-request-id": "abc" });
  assertEquals(res.status, 404);
  assertEquals(res.headers.get("x-request-id"), "abc");
  const body = await res.json();
  assertEquals(body.error, "Not found");
});

Deno.test("handleOptions: returns 204 with CORS", () => {
  const res = handleOptions();
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});
