#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2] || 'listings-backfill';
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const invokePath = path.join(__dirname, `invoke-${fn}.json`);

const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
args.verify_jwt = false;

const transport = new StreamableHTTPClientTransport(
  new URL(`https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}`),
);
const client = new Client({ name: 'novura-deploy-one', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);
const res = await client.callTool({ name: 'deploy_edge_function', arguments: args });
const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
console.log(text);
await client.close();
