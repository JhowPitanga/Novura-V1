#!/usr/bin/env node
/** Deploy listings-backfill via stdio MCP without PAT (Cursor may inject OAuth to child). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = JSON.parse(fs.readFileSync(path.join(__dirname, 'CALLMCP-DEPLOY-LB-NOW.json'), 'utf8'));

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@supabase/mcp-server-supabase@latest', '--project-ref=frwnfukydjwilfobxxhw'],
});
const client = new Client({ name: 'novura-lb-oauth', version: '1.0.0' }, { capabilities: {} });

try {
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
  process.exit(parsed?.error || res.isError ? 1 : 0);
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
} finally {
  await client.close();
}
