#!/usr/bin/env node
/**
 * Deploy all 10 listing functions via user-supabase MCP deploy_edge_function.
 * Reads invoke-{fn}.json (generate with write-invoke.mjs first).
 * Requires Cursor agent to run CallMcpTool per function OR set SUPABASE_ACCESS_TOKEN.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

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

for (const { fn, verify_jwt } of ORDER) {
  const invokePath = path.join(__dirname, `invoke-${fn}.json`);
  if (!fs.existsSync(invokePath)) {
    execFileSync(process.execPath, [path.join(__dirname, 'write-invoke.mjs'), fn], {
      stdio: 'inherit',
      maxBuffer: 50 * 1024 * 1024,
    });
  }
  const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
  args.verify_jwt = verify_jwt;
  const outPath = path.join(__dirname, 'mcp-call-args', `${fn}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(args));
  console.log(JSON.stringify({ fn, bytes: fs.statSync(outPath).size, files: args.files.length, verify_jwt }));
}
