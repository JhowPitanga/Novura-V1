#!/usr/bin/env node
/**
 * Deploy edge functions from mcp-payloads via Supabase Management API
 * (same contract as user-supabase deploy_edge_function MCP tool).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

const ORDER = [
  'listings-sync-one',
  'listings-backfill',
  'mercado-livre-sync-items',
  'shopee-sync-items',
  'mercado-livre-update-metrics',
  'mercado-livre-update-quality',
  'mercado-livre-update-reviews',
  'mercado-livre-sync-prices',
  'mercado-livre-sync-stock-distribution',
  'shopee-webhook-items',
];

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is required');
  process.exit(1);
}

async function deployOne(fn) {
  const filePath = path.join(__dirname, 'mcp-payloads', `${fn}.json`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw);

  const form = new FormData();
  form.append(
    'metadata',
    JSON.stringify({
      entrypoint_path: payload.entrypoint_path,
      name: payload.name,
      verify_jwt: payload.verify_jwt,
    }),
  );

  for (const f of payload.files) {
    form.append('file', new Blob([f.content], { type: 'text/plain' }), f.name);
  }

  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(payload.name)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
  }

  const version = body?.version ?? body?.id ?? body?.slug ?? 'deployed';
  return { name: payload.name, version, body };
}

const results = [];
for (const fn of ORDER) {
  process.stderr.write(`Deploying ${fn}...\n`);
  try {
    const r = await deployOne(fn);
    results.push({ function: r.name, status: 'success', version: String(r.version) });
    console.log(JSON.stringify({ fn, ok: true, version: r.version }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ function: fn, status: 'error', version: msg });
    console.log(JSON.stringify({ fn, ok: false, error: msg }));
  }
}

fs.writeFileSync(
  path.join(__dirname, '.deploy-temp', 'results.json'),
  JSON.stringify(results, null, 2),
);
