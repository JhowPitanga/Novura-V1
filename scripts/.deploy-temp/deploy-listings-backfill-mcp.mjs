#!/usr/bin/env node
/**
 * Deploy listings-backfill via Supabase MCP HTTP (Cursor OAuth bearer).
 * Usage: set SUPABASE_MCP_BEARER from Cursor MCP session, then:
 *   node scripts/.deploy-temp/deploy-listings-backfill-mcp.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const invokePath = path.join(__dirname, 'invoke-listings-backfill.json');

const raw = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
const args = {
  name: raw.name,
  entrypoint_path: raw.entrypoint_path || 'index.ts',
  verify_jwt: false,
  files: raw.files,
};

const bearer =
  process.env.SUPABASE_MCP_BEARER?.trim() ||
  process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!bearer) {
  console.error(
    JSON.stringify({
      ok: false,
      error: 'Set SUPABASE_MCP_BEARER (Cursor MCP OAuth) or full SUPABASE_ACCESS_TOKEN',
    }),
  );
  process.exit(1);
}

const url = new URL(`https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`);
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
});
const client = new Client({ name: 'novura-deploy-lb', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
  const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 800) };
  }
  if (parsed?.error) throw new Error(JSON.stringify(parsed.error));
  console.log(
    JSON.stringify({
      ok: true,
      version: String(parsed?.version ?? parsed?.id ?? '?'),
      status: parsed?.status ?? 'ACTIVE',
      name: args.name,
      verify_jwt: args.verify_jwt,
      file_count: args.files.length,
    }),
  );
} catch (err) {
  console.log(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
} finally {
  await client.close();
}
