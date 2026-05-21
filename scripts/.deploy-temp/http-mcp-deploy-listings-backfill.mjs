#!/usr/bin/env node
/** Deploy listings-backfill via Supabase MCP HTTP with SUPABASE_ACCESS_TOKEN (sbp_ or PAT). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const invokePath = path.join(__dirname, 'invoke-listings-backfill.json');

const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
args.verify_jwt = false;

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const headers = token ? { Authorization: `Bearer ${token}` } : {};

const url = new URL(`https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`);
const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
const client = new Client({ name: 'novura-http-lb', version: '1.0.0' }, { capabilities: {} });

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
      verify_jwt: args.verify_jwt,
    }),
  );
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
} finally {
  await client.close();
}
