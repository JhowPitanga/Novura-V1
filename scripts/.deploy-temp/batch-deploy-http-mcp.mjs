#!/usr/bin/env node
/**
 * Deploy all listing functions via Supabase HTTP MCP (same as Cursor user-supabase).
 * Requires OAuth session — run from Cursor terminal after MCP auth, or use CallMcpTool.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const MCP_URL = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`;

const ORDER = [
  ['listings-sync-one', true],
  ['listings-backfill', false],
  ['mercado-livre-sync-items', false],
  ['shopee-sync-items', false],
  ['mercado-livre-update-metrics', false],
  ['mercado-livre-update-quality', false],
  ['mercado-livre-update-reviews', false],
  ['mercado-livre-sync-prices', false],
  ['mercado-livre-sync-stock-distribution', false],
  ['shopee-webhook-items', false],
];

function loadArgs(fn, verifyJwt) {
  const invokePath = path.join(__dirname, `invoke-${fn}.json`);
  if (!fs.existsSync(invokePath)) {
    execFileSync(process.execPath, [path.join(__dirname, 'write-invoke.mjs'), fn], {
      stdio: 'inherit',
      maxBuffer: 50 * 1024 * 1024,
    });
  }
  const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
  args.verify_jwt = verifyJwt;
  return args;
}

const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
const client = new Client({ name: 'novura-batch-deploy', version: '1.0.0' }, { capabilities: {} });

await client.connect(transport);

const results = [];

for (const [fn, verifyJwt] of ORDER) {
  const args = loadArgs(fn, verifyJwt);
  process.stderr.write(`Deploying ${fn} (${args.files.length} files)...\n`);
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
    results.push({ function: fn, version: String(version), success: true, status });
    console.log(JSON.stringify({ fn, ok: true, version, status }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ function: fn, version: msg, success: false });
    console.log(JSON.stringify({ fn, ok: false, error: msg }));
  }
}

await client.close();
fs.writeFileSync(path.join(__dirname, 'deploy-results.json'), JSON.stringify(results, null, 2));
console.log('\nWrote deploy-results.json');
if (results.some((r) => !r.success)) process.exit(1);
