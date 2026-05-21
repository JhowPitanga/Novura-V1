#!/usr/bin/env node
/**
 * Deploy all 10 listing functions via Supabase MCP HTTP (Streamable HTTP).
 * Run inside Cursor agent shell — may inherit MCP OAuth session cookies.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const MCP_URL = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`;

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

const headers = {};
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (token) headers.Authorization = `Bearer ${token}`;

const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
  requestInit: { headers },
});
const client = new Client({ name: 'novura-http-deploy-all', version: '1.0.0' }, { capabilities: {} });

const results = [];

try {
  await client.connect(transport);

  for (const { fn, verify_jwt } of ORDER) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'mcp-invoke-ready', `${fn}.json`), 'utf8'),
    );
    const args = {
      name: raw.name,
      entrypoint_path: raw.entrypoint_path || 'index.ts',
      verify_jwt,
      files: raw.files,
    };

    process.stderr.write(`Deploying ${fn} (${args.files.length} files)...\n`);

    try {
      const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
      const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text.slice(0, 400) };
      }
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
} catch (err) {
  console.error('MCP connect failed:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.close();
}

const outPath = path.join(__dirname, 'deploy-results-callmcp.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log('\nWrote', outPath);
if (results.some((r) => !r.success)) process.exit(1);
