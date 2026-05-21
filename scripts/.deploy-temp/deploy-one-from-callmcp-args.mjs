#!/usr/bin/env node
/**
 * Loads deploy args from callmcp-args/{fn}.json and writes deploy result.
 * Used with: node deploy-one-from-callmcp-args.mjs listings-sync-one
 * Requires SUPABASE_ACCESS_TOKEN (full PAT) OR run deploy via Cursor CallMcpTool instead.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const fn = process.argv[2];

if (!fn) {
  console.error('Usage: node deploy-one-from-callmcp-args.mjs <function-name>');
  process.exit(1);
}

const argsPath = path.join(__dirname, 'callmcp-args', `${fn}.json`);
if (!fs.existsSync(argsPath)) {
  console.error('Missing', argsPath, '- run deploy-all-callmcp-from-chunks.mjs first');
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!token || token.length < 60) {
  console.log(
    JSON.stringify({
      fn,
      ok: false,
      error:
        'SUPABASE_ACCESS_TOKEN missing or too short. Use Cursor CallMcpTool user-supabase deploy_edge_function with args from ' +
        argsPath,
      argsPath,
      file_count: args.files.length,
      verify_jwt: args.verify_jwt,
    }),
  );
  process.exit(0);
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

const client = new Client({ name: 'novura-deploy-args', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text.slice(0, 500) };
}

const version = parsed?.version ?? parsed?.id ?? null;
const status = parsed?.status ?? 'ACTIVE';
console.log(
  JSON.stringify({
    fn,
    ok: !parsed?.error,
    version,
    status,
    error: parsed?.error?.message ?? parsed?.message ?? null,
  }),
);
await client.close();
