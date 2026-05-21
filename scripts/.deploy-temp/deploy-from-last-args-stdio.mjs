#!/usr/bin/env node
/** Deploy using LAST-MCP-DEPLOY-ARGS.json via stdio MCP + PAT (80+ chars). */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';

function getToken() {
  const env = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (env && env.length >= 60) return env;
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  for (const rel of ['.supabase/access-token', 'AppData/Roaming/supabase/access-token']) {
    const p = path.join(home, ...rel.split('/'));
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, 'utf8').trim();
      if (t.length >= 60) return t;
    }
  }
  return null;
}

const token = getToken();
const argsPath = path.join(__dirname, 'LAST-MCP-DEPLOY-ARGS.json');
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
args.verify_jwt = false;

if (!token) {
  console.log(
    JSON.stringify({
      ok: false,
      error: 'Need SUPABASE_ACCESS_TOKEN (full PAT, 80+ chars). CallMcpTool user-supabase deploy_edge_function is the Cursor OAuth path.',
      argsPath,
      bytes: fs.statSync(argsPath).size,
      file_count: args.files.length,
    }),
  );
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

const client = new Client({ name: 'novura-deploy-lb', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);
const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text.slice(0, 800) };
}
await client.close();

if (parsed?.error) {
  console.log(JSON.stringify({ ok: false, error: parsed.error }));
  process.exit(1);
}
console.log(
  JSON.stringify({
    ok: true,
    version: String(parsed?.version ?? parsed?.id ?? '?'),
    status: parsed?.status ?? 'ACTIVE',
    name: args.name,
    verify_jwt: args.verify_jwt,
  }),
);
