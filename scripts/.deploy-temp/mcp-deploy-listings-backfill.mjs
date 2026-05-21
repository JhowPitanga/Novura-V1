#!/usr/bin/env node
/**
 * Build deploy args from file-chunks and invoke deploy_edge_function via MCP HTTP.
 * Requires SUPABASE_MCP_BEARER or Cursor OAuth session.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const chunkDir = path.join(__dirname, 'file-chunks', 'listings-backfill');
const meta = JSON.parse(fs.readFileSync(path.join(chunkDir, 'meta.json'), 'utf8'));

const files = [];
for (let i = 0; i < meta.count; i++) {
  files.push(JSON.parse(fs.readFileSync(path.join(chunkDir, `f${i}.json`), 'utf8')));
}

const args = {
  name: meta.name,
  entrypoint_path: meta.entrypoint_path || 'index.ts',
  verify_jwt: meta.verify_jwt,
  files,
};

async function main() {
  const bearer =
    process.env.SUPABASE_MCP_BEARER?.trim() ||
    process.env.SUPABASE_ACCESS_TOKEN?.trim();

  const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
  const url = new URL(`https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`);
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  const client = new Client({ name: 'novura-lb-deploy', version: '1.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
    const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 2000) };
    }
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
        file_count: args.files.length,
        bytes: JSON.stringify(args).length,
      }),
    );
  } catch (err) {
    console.log(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        hint: bearer ? 'HTTP MCP failed' : 'Set SUPABASE_MCP_BEARER from Cursor MCP OAuth',
      }),
    );
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();