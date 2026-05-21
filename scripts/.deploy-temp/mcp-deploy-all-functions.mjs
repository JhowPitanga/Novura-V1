#!/usr/bin/env node
/**
 * Deploy all 10 listing edge functions via Supabase MCP deploy_edge_function.
 * Reads full bundles from scripts/mcp-payloads/{fn}.json
 *
 * Auth: SUPABASE_ACCESS_TOKEN (PAT from https://supabase.com/dashboard/account/tokens)
 *   OR run after: supabase login
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';

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

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  for (const rel of ['.supabase/access-token', 'AppData/Roaming/supabase/access-token']) {
    const p = path.join(home, ...rel.split('/'));
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, 'utf8').trim();
      if (t.length > 50) return t;
    }
  }
  return null;
}

const token = getToken();
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN required (PAT) or run: supabase login');
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: 'npx',
  args: [
    '-y',
    '@supabase/mcp-server-supabase@latest',
    `--project-ref=${PROJECT_REF}`,
    `--access-token=${token}`,
  ],
});

const client = new Client({ name: 'novura-listing-deploy', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

const results = [];

for (const fn of ORDER) {
  const payloadPath = path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`);
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const args = {
    name: payload.name,
    entrypoint_path: payload.entrypoint_path || 'index.ts',
    verify_jwt: payload.verify_jwt,
    files: payload.files,
  };

  process.stderr.write(`Deploying ${fn} (${args.files.length} files, verify_jwt=${args.verify_jwt})...\n`);

  try {
    const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
    const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }

    if (parsed?.error) {
      throw new Error(typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error));
    }

    const version = parsed?.version ?? parsed?.id ?? '?';
    const status = parsed?.status ?? 'ACTIVE';
    results.push({ function: fn, version: String(version), status, success: true });
    console.log(JSON.stringify({ fn, ok: true, version, status }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ function: fn, version: msg, success: false });
    console.log(JSON.stringify({ fn, ok: false, error: msg }));
  }
}

await client.close();

const outPath = path.join(__dirname, 'deploy-results.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log('\nWrote', outPath);

if (results.some((r) => !r.success)) process.exit(1);
