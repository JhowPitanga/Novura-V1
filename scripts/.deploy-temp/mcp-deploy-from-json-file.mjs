#!/usr/bin/env node
/**
 * Deploy edge function via Supabase HTTP MCP (no PAT — relies on Cursor OAuth session in HTTP transport).
 * Usage: node mcp-deploy-from-json-file.mjs <args-json-path>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const MCP_URL = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`;

const argsPath = process.argv[2] || path.join(__dirname, 'DEPLOY-LB-ARGS.json');
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));

const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
const client = new Client({ name: 'novura-mcp-deploy-file', version: '1.0.0' }, { capabilities: {} });

await client.connect(transport);
const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text.slice(0, 1200) };
}
const out = { ok: !parsed?.error && !res.isError, isError: res.isError, parsed };
fs.writeFileSync(path.join(__dirname, '_last-http-mcp-deploy.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
await client.close();
process.exit(out.ok ? 0 : 1);
