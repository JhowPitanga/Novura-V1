#!/usr/bin/env node
/**
 * Sequential deploy of all 10 listing functions.
 * Uses Management API (same body as deploy_edge_function MCP tool).
 * Requires valid SUPABASE_ACCESS_TOKEN (full PAT, not sbp_ short key).
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

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token || token.length < 80) {
  console.error(
    JSON.stringify({
      error:
        'Need full Supabase PAT (80+ chars). Short sbp_ key returns 401. Use CallMcpTool deploy_edge_function from Cursor agent instead.',
      tokenLen: token?.length ?? 0,
    }),
  );
  process.exit(1);
}

const results = [];

for (const { fn, verify_jwt } of ORDER) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
  );
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(payload.name)}`;
  const body = {
    slug: payload.name,
    name: payload.name,
    entrypoint_path: payload.entrypoint_path || 'index.ts',
    verify_jwt,
    files: payload.files,
  };

  process.stderr.write(`Deploying ${fn} (${body.files.length} files)...\n`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 400) };
    }
    if (!res.ok) {
      results.push({ function: fn, version: `HTTP ${res.status}`, success: false, error: json });
      console.log(JSON.stringify({ fn, ok: false, status: res.status, error: json }));
      continue;
    }
    const version = String(json?.version ?? json?.id ?? '?');
    const status = json?.status ?? 'ACTIVE';
    results.push({ function: fn, version, success: true, status });
    console.log(JSON.stringify({ fn, ok: true, version, status }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ function: fn, version: msg, success: false });
    console.log(JSON.stringify({ fn, ok: false, error: msg }));
  }
}

const outPath = path.join(__dirname, 'deploy-results-final.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log('\nWrote', outPath);
if (results.some((r) => !r.success)) process.exit(1);
