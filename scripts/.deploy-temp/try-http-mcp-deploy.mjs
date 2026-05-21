#!/usr/bin/env node
/** Try deploy via Supabase MCP HTTP (Streamable HTTP) — may need OAuth session. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const fn = process.argv[2] || 'listings-sync-one';

const args = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'mcp-call-args', `${fn}.json`), 'utf8'),
);

const url = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`;

const initRes = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'novura-deploy', version: '1.0.0' },
    },
  }),
});

const initText = await initRes.text();
console.log('init status', initRes.status, initText.slice(0, 300));

const sessionId = initRes.headers.get('mcp-session-id');
const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};
if (sessionId) headers['mcp-session-id'] = sessionId;

const toolRes = await fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'deploy_edge_function',
      arguments: args,
    },
  }),
});

const toolText = await toolRes.text();
console.log('tool status', toolRes.status, toolText.slice(0, 500));
