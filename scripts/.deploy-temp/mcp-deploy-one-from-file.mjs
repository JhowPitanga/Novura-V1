#!/usr/bin/env node
/**
 * Deploy one function via @supabase/mcp-server-supabase using payload from mcp-payloads.
 * Requires: authenticated MCP session — set SUPABASE_ACCESS_TOKEN (PAT with deploy scope)
 * or run after `supabase login` with valid ~/.supabase/access-token.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const fn = process.argv[2];

if (!fn) {
  console.error('Usage: node mcp-deploy-one-from-file.mjs <function-name>');
  process.exit(1);
}

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
  console.error('No Supabase token. Set SUPABASE_ACCESS_TOKEN or run: supabase login');
  process.exit(1);
}

const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
);

const args = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path || 'index.ts',
  verify_jwt: payload.verify_jwt,
  files: payload.files,
};

const transport = new StdioClientTransport({
  command: 'npx',
  args: [
    '-y',
    '@supabase/mcp-server-supabase@latest',
    `--project-ref=${PROJECT_REF}`,
    `--access-token=${token}`,
  ],
});

const client = new Client({ name: 'novura-mcp-deploy', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text.slice(0, 500) };
}

const version = parsed?.version ?? parsed?.id ?? '?';
const status = parsed?.status ?? 'ACTIVE';
console.log(JSON.stringify({ fn, ok: true, version, status, parsed }));
await client.close();
