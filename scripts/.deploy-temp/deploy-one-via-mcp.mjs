#!/usr/bin/env node
/** Deploy one edge function via Supabase HTTP MCP; prints JSON result to stdout. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2] || 'listings-backfill';
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const MCP_URL = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`;

const invokePath = path.join(__dirname, `invoke-${fn}.json`);
const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));

const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
const client = new Client({ name: 'novura-deploy-one', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
  const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 2000), isError: res.isError };
  }
  if (parsed?.error) {
    console.log(JSON.stringify({ success: false, error: parsed.error, response: parsed }));
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      success: true,
      name: fn,
      version: parsed?.version ?? parsed?.id ?? null,
      status: parsed?.status ?? null,
      response: parsed,
    }),
  );
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(JSON.stringify({ success: false, error: msg }));
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
