#!/usr/bin/env node
/** Deploy listings-backfill via stdio MCP using callmcp-args JSON. */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const argsPath = path.join(__dirname, 'callmcp-args', 'listings-backfill-slim.json');
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  for (const rel of ['.supabase/access-token', 'AppData/Roaming/supabase/access-token']) {
    const p = path.join(home, ...rel.split('/'));
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, 'utf8').trim();
      if (t) return t;
    }
  }
  return null;
}

const token = getToken();
if (!token) {
  console.error(JSON.stringify({ ok: false, error: 'No Supabase token in env' }));
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: 'npx',
  args: [
    '-y',
    '@supabase/mcp-server-supabase@latest',
    `--project-ref=${PROJECT_REF}`,
    `--access-token=${token}`,
  ],
});

const client = new Client({ name: 'novura-lb-deploy', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);
const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text.slice(0, 800) };
}
console.log(JSON.stringify({ ok: !parsed?.error, parsed, isError: res.isError }));
await client.close();
