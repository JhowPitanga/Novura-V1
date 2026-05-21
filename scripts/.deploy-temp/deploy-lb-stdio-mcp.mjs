#!/usr/bin/env node
/**
 * Deploy listings-backfill via stdio MCP + SUPABASE_ACCESS_TOKEN from env.
 * Usage: set valid sbp_* PAT (80+ chars) then: node deploy-lb-stdio-mcp.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const argsPath = path.join(__dirname, 'CALLMCP-DEPLOY-LB-NOW.json');
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token || token.length < 60) {
  console.error(JSON.stringify({ ok: false, error: `Invalid SUPABASE_ACCESS_TOKEN length ${token?.length ?? 0}` }));
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@supabase/mcp-server-supabase@latest', `--project-ref=${PROJECT_REF}`, `--access-token=${token}`],
});
const client = new Client({ name: 'novura-lb-stdio', version: '1.0.0' }, { capabilities: {} });

await client.connect(transport);
const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text.slice(0, 1200) };
}
console.log(JSON.stringify({ ok: !parsed?.error && !res.isError, parsed, isError: res.isError }));
await client.close();
process.exit(parsed?.error || res.isError ? 1 : 0);
