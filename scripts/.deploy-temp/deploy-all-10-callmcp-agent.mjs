#!/usr/bin/env node
/**
 * Deploy all 10 listing edge functions via Management API.
 * Requires valid token: supabase login OR SUPABASE_ACCESS_TOKEN (full PAT, 80+ chars).
 *
 * Usage: node scripts/.deploy-temp/deploy-all-10-callmcp-agent.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';

const ORDER = [
  { fn: 'listings-sync-one', verify_jwt: true },
  { fn: 'listings-backfill', verify_jwt: false },
  { fn: 'mercado-livre-sync-items', verify_jwt: false },
  { fn: 'shopee-sync-items', verify_jwt: false },
  { fn: 'mercado-livre-update-metrics', verify_jwt: false },
  { fn: 'mercado-livre-update-quality', verify_jwt: false },
  { fn: 'mercado-livre-update-reviews', verify_jwt: false },
  { fn: 'mercado-livre-sync-prices', verify_jwt: false },
  { fn: 'mercado-livre-sync-stock-distribution', verify_jwt: false },
  { fn: 'shopee-webhook-items', verify_jwt: false },
];

function getToken() {
  const env = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (env && env.length >= 60) return env;
  const home = process.env.USERPROFILE || process.env.HOME;
  for (const rel of ['.supabase/access-token', 'AppData/Roaming/supabase/access-token']) {
    const p = path.join(home, ...rel.split('/'));
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, 'utf8').trim();
      if (t.length >= 60) return t;
    }
  }
  return null;
}

async function deployOne(args, token) {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(args.name)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      slug: args.name,
      name: args.name,
      entrypoint_path: args.entrypoint_path || 'index.ts',
      verify_jwt: args.verify_jwt,
      files: args.files,
    }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${body?.message ?? JSON.stringify(body)}`);
  }
  return body;
}

const token = getToken();
const results = [];

if (!token) {
  console.error(
    JSON.stringify({
      ok: false,
      error:
        'No valid Supabase token. Run: supabase login  OR  set SUPABASE_ACCESS_TOKEN (full PAT from dashboard). ' +
        'Current env token is too short (401). Use Cursor CallMcpTool user-supabase deploy_edge_function instead.',
    }),
  );
  process.exit(1);
}

const who = await fetch('https://api.supabase.com/v1/projects', {
  headers: { Authorization: `Bearer ${token}` },
});
if (!who.ok) {
  console.error(JSON.stringify({ ok: false, error: `Token invalid HTTP ${who.status}` }));
  process.exit(1);
}

for (const { fn, verify_jwt } of ORDER) {
  const argsPath = path.join(__dirname, 'callmcp-args', `${fn}.json`);
  const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
  args.verify_jwt = verify_jwt;
  process.stderr.write(`Deploying ${fn} (${args.files.length} files, ${JSON.stringify(args).length} bytes)...\n`);
  try {
    const body = await deployOne(args, token);
    const version = String(body?.version ?? body?.id ?? '?');
    const status = body?.status ?? 'ACTIVE';
    results.push({ function: fn, version, success: true, status });
    console.log(JSON.stringify({ fn, ok: true, version, status }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ function: fn, version: msg, success: false });
    console.log(JSON.stringify({ fn, ok: false, error: msg }));
  }
}

fs.writeFileSync(path.join(__dirname, 'deploy-results-final.json'), JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.success) ? 1 : 0);
