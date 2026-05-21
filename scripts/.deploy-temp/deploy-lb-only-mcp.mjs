#!/usr/bin/env node
/**
 * Deploy listings-backfill via Supabase HTTP MCP (Cursor OAuth session).
 * Loads invoke-listings-backfill.json — same payload as CallMcpTool deploy_edge_function.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const MCP_URL = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`;
const invokePath = path.join(__dirname, 'invoke-listings-backfill.json');

const raw = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
const args = {
  name: raw.name,
  entrypoint_path: raw.entrypoint_path || 'index.ts',
  verify_jwt: false,
  files: raw.files,
};

const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
const client = new Client({ name: 'novura-deploy-lb', version: '1.0.0' }, { capabilities: {} });

await client.connect(transport);
const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
await client.close();

const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text.slice(0, 2000) };
}
console.log(JSON.stringify(parsed, null, 2));
if (parsed?.error) process.exit(1);
