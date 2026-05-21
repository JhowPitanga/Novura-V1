#!/usr/bin/env node
/**
 * Deploy one edge function via Supabase MCP HTTP (Streamable HTTP transport).
 * Uses SUPABASE_ACCESS_TOKEN or OAuth session cookie if set.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const fn = process.argv[2];

if (!fn) {
  console.error('Usage: node http-mcp-deploy-one.mjs <function-name>');
  process.exit(1);
}

const payloadPath = path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`);
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

const args = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path || 'index.ts',
  verify_jwt: payload.verify_jwt,
  files: payload.files,
};

const headers = {};
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (token) headers.Authorization = `Bearer ${token}`;

const url = new URL(`https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`);
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers },
});

const client = new Client({ name: 'novura-http-deploy', version: '1.0.0' }, { capabilities: {} });

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
  console.log(JSON.stringify({ fn, ok: true, parsed }));
} catch (err) {
  console.log(JSON.stringify({ fn, ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
} finally {
  await client.close();
}
