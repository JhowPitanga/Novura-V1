#!/usr/bin/env node
/**
 * Assembles listings-backfill deploy args from file-chunks and calls deploy_edge_function
 * via Supabase HTTP MCP. Requires Cursor OAuth (no Authorization header = uses session).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const fn = 'listings-backfill';
const chunkDir = path.join(__dirname, 'file-chunks', fn);
const meta = JSON.parse(fs.readFileSync(path.join(chunkDir, 'meta.json'), 'utf8'));
const files = [];
for (let i = 0; i < meta.count; i++) {
  files.push(JSON.parse(fs.readFileSync(path.join(chunkDir, `f${i}.json`), 'utf8')));
}
const args = {
  name: meta.name,
  entrypoint_path: meta.entrypoint_path || 'index.ts',
  verify_jwt: meta.verify_jwt,
  files,
};

const bearer =
  process.env.SUPABASE_MCP_BEARER?.trim() ||
  process.env.SUPABASE_ACCESS_TOKEN?.trim();
const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
const url = new URL(`https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`);
const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
const client = new Client({ name: 'novura-deploy-lb-chunks', version: '1.0.0' }, { capabilities: {} });

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
      hint: 'Use CallMcpTool user-supabase deploy_edge_function with assembled args',
    }),
  );
  process.exit(1);
} finally {
  await client.close();
}
