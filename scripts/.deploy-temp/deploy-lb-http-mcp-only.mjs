#!/usr/bin/env node
/** Deploy listings-backfill only via Supabase HTTP MCP (OAuth session). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const MCP_URL = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`;
const invokePath = path.join(__dirname, 'invoke-listings-backfill.json');
const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));

const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
const client = new Client({ name: 'novura-lb-deploy', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
  const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 800) };
  }
  console.log(
    JSON.stringify({
      ok: !parsed?.error && !res.isError,
      isError: res.isError,
      parsed,
      file_count: args.files.length,
      bytes: JSON.stringify(args).length,
    }),
  );
  if (parsed?.error || res.isError) process.exit(1);
} catch (err) {
  console.log(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
} finally {
  await client.close();
}
