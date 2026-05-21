#!/usr/bin/env node
/**
 * Reads invoke JSON and prints deploy result via stdio MCP (needs valid PAT).
 * For Cursor agent: use CallMcpTool deploy_edge_function with parsed args instead.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const invokePath =
  process.argv[2] ||
  path.join(__dirname, 'invoke-listings-backfill.json');
const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token || token.length < 60) {
  console.log(
    JSON.stringify({
      ok: false,
      error:
        'No valid SUPABASE_ACCESS_TOKEN in env; use CallMcpTool user-supabase deploy_edge_function with args from invoke JSON.',
      hint: invokePath,
      file_count: args.files?.length,
      bytes: JSON.stringify(args).length,
    }),
  );
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: 'npx',
  args: [
    '-y',
    '@supabase/mcp-server-supabase@latest',
    '--project-ref=frwnfukydjwilfobxxhw',
    `--access-token=${token}`,
  ],
});
const client = new Client({ name: 'run-callmcp-deploy', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);
const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text.slice(0, 2000), isError: res.isError };
}
await client.close();
if (parsed?.error) {
  console.log(JSON.stringify({ ok: false, error: parsed.error, response: parsed }));
  process.exit(1);
}
console.log(
  JSON.stringify({
    ok: true,
    version: parsed?.version ?? parsed?.id ?? null,
    status: parsed?.status ?? 'ACTIVE',
    name: args.name,
    verify_jwt: args.verify_jwt,
    response: parsed,
  }),
);
