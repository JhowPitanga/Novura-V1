#!/usr/bin/env node
/**
 * OAuth smoke test — validates edge function endpoints before production deploy.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_ACCESS_TOKEN=... node scripts/oauth-smoke-test.mjs
 *
 * Optional:
 *   OAUTH_TEST_APP_ID=Shopee
 *   OAUTH_TEST_ORG_ID=<uuid>
 */

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const TEST_APP_ID = process.env.OAUTH_TEST_APP_ID ?? "Shopee";
const TEST_ORG_ID = process.env.OAUTH_TEST_ORG_ID;
const TEST_PROVIDER = process.env.OAUTH_TEST_PROVIDER ?? "shopee";

function fail(message) {
  console.error(`[oauth-smoke] FAIL: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`[oauth-smoke] OK: ${message}`);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    fail("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  // 1) oauth-callback without params should not crash server (expect HTML error payload path)
  {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/oauth-callback`);
    const text = await resp.text();
    if (!text.includes("missing_provider_key") && !text.includes("oauth_error")) {
      fail(`oauth-callback GET unexpected response: ${text.slice(0, 120)}`);
    }
    ok("oauth-callback reachable and returns structured oauth error without params");
  }

  // 2) oauth-start-auth requires auth + valid body
  if (!ACCESS_TOKEN || !TEST_ORG_ID) {
    console.warn("[oauth-smoke] SKIP start-auth live test (set SUPABASE_ACCESS_TOKEN and OAUTH_TEST_ORG_ID)");
    ok("partial smoke completed");
    return;
  }

  const startResp = await fetch(`${SUPABASE_URL}/functions/v1/oauth-start-auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      appId: TEST_APP_ID,
      providerKey: TEST_PROVIDER,
      organizationId: TEST_ORG_ID,
      storeName: "Smoke Test Store",
    }),
  });

  const startJson = await startResp.json().catch(() => ({}));
  if (!startResp.ok || !startJson.authorization_url) {
    fail(`oauth-start-auth failed: ${startJson.error ?? startResp.status}`);
  }
  ok(`oauth-start-auth returned authorization_url for app ${TEST_APP_ID}`);

  // 3) oauth-callback POST with invalid state should fail gracefully
  const cbResp = await fetch(`${SUPABASE_URL}/functions/v1/oauth-callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      code: "invalid",
      state: "invalid",
      provider_key: TEST_PROVIDER,
      shop_id: "123",
    }),
  });
  const cbJson = await cbResp.json().catch(() => ({}));
  if (cbJson.type !== "oauth_error") {
    fail(`oauth-callback POST expected oauth_error, got: ${JSON.stringify(cbJson).slice(0, 200)}`);
  }
  ok("oauth-callback POST rejects invalid state/code as expected");

  ok("full smoke completed");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
