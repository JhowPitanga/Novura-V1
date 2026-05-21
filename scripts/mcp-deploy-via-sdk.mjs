#!/usr/bin/env node
/**
 * Deploy edge functions via @supabase/mcp-server-supabase (deploy_edge_function tool).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

const ORDER = [
  'listings-sync-one',
  'listings-backfill',
  'mercado-livre-sync-items',
  'shopee-sync-items',
  'mercado-livre-update-metrics',
  'mercado-livre-update-quality',
  'mercado-livre-update-reviews',
  'mercado-livre-sync-prices',
  'mercado-livre-sync-stock-distribution',
  'shopee-webhook-items',
];

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is required');
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: 'npx',
  args: [
    '-y',
    '@supabase/mcp-server-supabase@latest',
    `--project-ref=${PROJECT_REF}`,
    `--access-token=${TOKEN}`,
  ],
});

const client = new Client({ name: 'novura-deploy', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

const results = [];

for (const fn of ORDER) {
  const filePath = path.join(__dirname, 'mcp-payloads', `${fn}.json`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw);

  const args = {
    name: payload.name,
    entrypoint_path: payload.entrypoint_path,
    verify_jwt: payload.verify_jwt,
    files: payload.files,
  };

  process.stderr.write(`Deploying ${fn} (${payload.files.length} files)...\n`);

  try {
    const res = await client.callTool({
      name: 'deploy_edge_function',
      arguments: args,
    });

    const text = res.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? '';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    if (parsed?.error || text.includes('"error"')) {
      const errMsg = parsed?.error?.message ?? text.slice(0, 300);
      throw new Error(errMsg);
    }

    const version = parsed?.version ?? parsed?.id ?? text.slice(0, 120);
    results.push({ function: fn, status: 'success', version: String(version) });
    console.log(JSON.stringify({ fn, ok: true, version }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ function: fn, status: 'error', version: msg });
    console.log(JSON.stringify({ fn, ok: false, error: msg }));
  }
}

await client.close();
fs.mkdirSync(path.join(__dirname, '.deploy-temp'), { recursive: true });
fs.writeFileSync(
  path.join(__dirname, '.deploy-temp', 'results.json'),
  JSON.stringify(results, null, 2),
);
