#!/usr/bin/env node
/**
 * Deploy all 10 listing functions via Supabase MCP (stdio) using OAuth token
 * from Cursor MCP storage when available, or SUPABASE_ACCESS_TOKEN (full PAT).
 *
 * Usage:
 *   node scripts/.deploy-temp/deploy-all-via-mcp-node-oauth.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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

function findToken() {
  const env = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (env && env.length >= 60) return env;
  return null;
}

const token = findToken();
if (!token) {
  console.error(
    JSON.stringify({
      ok: false,
      error:
        'Set SUPABASE_ACCESS_TOKEN to a full Personal Access Token (https://supabase.com/dashboard/account/tokens). ' +
        'Or deploy via Cursor CallMcpTool user-supabase deploy_edge_function using scripts/.deploy-temp/callmcp-args/{fn}.json',
    }),
  );
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

const client = new Client({ name: 'novura-deploy-all', version: '1.0.0' }, { capabilities: {} });
const results = [];

await client.connect(transport);

for (const { fn, verify_jwt } of ORDER) {
  const argsPath = path.join(__dirname, 'callmcp-args', `${fn}.json`);
  const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
  args.verify_jwt = verify_jwt;
  process.stderr.write(`Deploying ${fn} (${args.files.length} files)...\n`);
  try {
    const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
    const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
    const parsed = JSON.parse(text);
    if (parsed?.error) throw new Error(JSON.stringify(parsed.error));
    const version = String(parsed?.version ?? parsed?.id ?? '?');
    const status = parsed?.status ?? 'ACTIVE';
    results.push({ function: fn, version, success: true, status });
    console.log(JSON.stringify({ fn, ok: true, version, status }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ function: fn, version: msg, success: false });
    console.log(JSON.stringify({ fn, ok: false, error: msg }));
  }
}

await client.close();
fs.writeFileSync(path.join(__dirname, 'deploy-results-final.json'), JSON.stringify(results, null, 2));
if (results.some((r) => !r.success)) process.exit(1);
