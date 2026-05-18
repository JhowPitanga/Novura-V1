/**
 * Unit tests for SupabaseAppCredentialsAdapter. Uses mock Supabase client.
 * Run with: deno test -A app-credentials-adapter.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SupabaseAppCredentialsAdapter } from "./app-credentials-adapter.ts";
import type { SupabaseClient } from "../infra/supabase-client.ts";

function createMockAdmin(rows: Record<string, { client_id: string; client_secret: string } | null>) {
  const from = (table: string) => {
    if (table !== "apps") return {};
    return {
      select: () => ({
        eq: (_col: string, appName: string) => ({
          single: () => {
            const row = rows[appName] ?? null;
            return Promise.resolve({
              data: row,
              error: row == null ? { message: "PGRST116" } : null,
            });
          },
        }),
      }),
    };
  };
  return { from } as unknown as SupabaseClient;
}

Deno.test("SupabaseAppCredentialsAdapter getByName: returns credentials when row exists", async () => {
  const admin = createMockAdmin({
    "Mercado Livre": { client_id: "cid-123", client_secret: "secret-456" },
  });
  const adapter = new SupabaseAppCredentialsAdapter(admin);
  const result = await adapter.getByName("Mercado Livre");
  assertEquals(result, { client_id: "cid-123", client_secret: "secret-456" });
});

Deno.test("SupabaseAppCredentialsAdapter getByName: returns null when row not found", async () => {
  const admin = createMockAdmin({});
  const adapter = new SupabaseAppCredentialsAdapter(admin);
  const result = await adapter.getByName("Unknown App");
  assertEquals(result, null);
});

Deno.test("SupabaseAppCredentialsAdapter getByName: returns null when client_id empty", async () => {
  const admin = createMockAdmin({
    Shopee: { client_id: "  ", client_secret: "key" },
  });
  const adapter = new SupabaseAppCredentialsAdapter(admin);
  const result = await adapter.getByName("Shopee");
  assertEquals(result, null);
});

Deno.test("SupabaseAppCredentialsAdapter getByName: returns null when client_secret empty", async () => {
  const admin = createMockAdmin({
    Shopee: { client_id: "pid", client_secret: "" },
  });
  const adapter = new SupabaseAppCredentialsAdapter(admin);
  const result = await adapter.getByName("Shopee");
  assertEquals(result, null);
});

Deno.test("SupabaseAppCredentialsAdapter getByName: trims client_id and client_secret", async () => {
  const admin = createMockAdmin({
    App: { client_id: "  id  ", client_secret: "  sec  " },
  });
  const adapter = new SupabaseAppCredentialsAdapter(admin);
  const result = await adapter.getByName("App");
  assertEquals(result, { client_id: "id", client_secret: "sec" });
});
