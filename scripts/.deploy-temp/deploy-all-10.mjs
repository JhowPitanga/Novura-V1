#!/usr/bin/env node
/**
 * Deploy all 10 listing functions via user-supabase MCP (OAuth in Cursor).
 * Run from agent: CallMcpTool cannot be invoked from Node; this script
 * writes per-function deploy payloads to mcp-deploy-queue/*.json and prints
 * instructions. For automated deploy use deploy-one-from-invoke-file.mjs with valid token.
 *
 * Agent loop: for each fn in ORDER, CallMcpTool deploy_edge_function with
 * JSON.parse(fs.readFileSync(`scripts/.deploy-temp/mcp-deploy-queue/${fn}.json`))
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDER = [
  { fn: 'listings-sync-one', verify_jwt: true },
  { fn: 'listings-backfill', verify_jwt: false },
  { fn: 'mercado-livre-sync-items', verify_jwt: false },
  { fn: 'shopee-sync-items', verify_jwt: false },
  { fn: 'mercado-livre-update-metrics', verify_jwt: false },
  { fn: 'mercado-livre-update-quality', verify_jwt: false },
  { fn: 'mercado-livre-update-reviews', verify_jwt: false },
  { fn: 'mercado-livre-sync-prices', verify_jwt: false },
  { fn: 'mercado-livre-sync-stock-distribution', verify_jwt: false },
  { fn: 'shopee-webhook-items', verify_jwt: false },
];

const queueDir = path.join(__dirname, 'mcp-deploy-queue');
fs.mkdirSync(queueDir, { recursive: true });

for (const { fn, verify_jwt } of ORDER) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
  );
  const args = {
    name: payload.name,
    entrypoint_path: payload.entrypoint_path || 'index.ts',
    verify_jwt,
    files: payload.files,
  };
  fs.writeFileSync(path.join(queueDir, `${fn}.json`), JSON.stringify(args));
  console.log(fn, fs.statSync(path.join(queueDir, `${fn}.json`)).size, 'files', args.files.length);
}
