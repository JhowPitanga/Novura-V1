#!/usr/bin/env node
/**
 * Deploy all listing functions by reading mcp-payloads and invoking
 * deploy_edge_function through @supabase/mcp-server-supabase (stdio).
 * Requires SUPABASE_ACCESS_TOKEN with Management API scope.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim();

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
  console.error('SUPABASE_ACCESS_TOKEN required');
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: 'npx',
  args: [
    '-y',
    '@supabase/mcp-server-supabase@latest',
    `--project-ref=${PROJECT_REF}`,
    `--access-token=${TOKEN}`,
  ],
});

const client = new Client({ name: 'novura-deploy', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

const results = [];
for (const fn of ORDER) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
  );
  const args = {
    name: payload.name,
    entrypoint_path: payload.entrypoint_path || 'index.ts',
    verify_jwt: payload.verify_jwt,
    files: payload.files,
  };
  process.stderr.write(`Deploying ${fn} (${args.files.length} files)...\n`);
  try {
    const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
    const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
    const parsed = JSON.parse(text);
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
fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
if (results.some((r) => !r.success)) process.exit(1);
