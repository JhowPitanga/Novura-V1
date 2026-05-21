#!/usr/bin/env node
/** Deploy listings-backfill via Supabase HTTP MCP (same as Cursor user-supabase). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const invokePath = path.join(__dirname, 'invoke-listings-backfill.json');
const raw = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
const args = {
  name: raw.name ?? 'listings-backfill',
  entrypoint_path: raw.entrypoint_path ?? 'index.ts',
  verify_jwt: false,
  files: raw.files,
};

const url = new URL(`https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`);
const transport = new StreamableHTTPClientTransport(url);
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
  console.log(
    JSON.stringify({
      ok: !res.isError && !parsed?.error,
      isError: res.isError,
      version: parsed?.version ?? null,
      status: parsed?.status ?? null,
      error: parsed?.error ?? parsed?.message ?? null,
      parsed,
    }),
  );
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err?.message ?? String(err) }));
  process.exit(1);
} finally {
  await client.close();
}
