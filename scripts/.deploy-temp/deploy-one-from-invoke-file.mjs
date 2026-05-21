#!/usr/bin/env node
/**
 * Deploy one function: reads mcp-invoke-ready/{fn}.json and calls deploy_edge_function
 * via Supabase MCP HTTP. Set SUPABASE_MCP_BEARER to a valid OAuth/MCP session token if 401.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const fn = process.argv[2];

const VERIFY = {
  'listings-sync-one': true,
  'listings-backfill': false,
  'mercado-livre-sync-items': false,
  'shopee-sync-items': false,
  'mercado-livre-update-metrics': false,
  'mercado-livre-update-quality': false,
  'mercado-livre-update-reviews': false,
  'mercado-livre-sync-prices': false,
  'mercado-livre-sync-stock-distribution': false,
  'shopee-webhook-items': false,
};

if (!fn) {
  console.error('Usage: node deploy-one-from-invoke-file.mjs <function-name>');
  process.exit(1);
}

const invokePath = path.join(__dirname, 'mcp-invoke-ready', `${fn}.json`);
if (!fs.existsSync(invokePath)) {
  console.error('Missing', invokePath);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
const args = {
  name: raw.name,
  entrypoint_path: raw.entrypoint_path || 'index.ts',
  verify_jwt: VERIFY[fn] ?? !!raw.verify_jwt,
  files: raw.files,
};

const headers = {};
const bearer =
  process.env.SUPABASE_MCP_BEARER?.trim() ||
  process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (bearer) headers.Authorization = `Bearer ${bearer}`;

const url = new URL(`https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`);
const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
const client = new Client({ name: 'novura-deploy', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
  const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }
  if (parsed?.error) throw new Error(JSON.stringify(parsed.error));
  const version = parsed?.version ?? parsed?.id ?? '?';
  const status = parsed?.status ?? 'ACTIVE';
  console.log(JSON.stringify({ fn, ok: true, version: String(version), status }));
} catch (err) {
  console.log(
    JSON.stringify({
      fn,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
} finally {
  await client.close();
}
