#!/usr/bin/env node
/**
 * Reads mcp-payloads and writes deploy args JSON for CallMcpTool (one file per function).
 * Usage: node deploy-all-call-mcp.mjs [function-name]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

const targets = process.argv[2] ? [process.argv[2]] : ORDER;
const outDir = path.join(__dirname, 'mcp-call-args');
fs.mkdirSync(outDir, { recursive: true });

for (const fn of targets) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
  );
  const args = {
    name: payload.name,
    entrypoint_path: payload.entrypoint_path || 'index.ts',
    verify_jwt: payload.verify_jwt,
    files: payload.files,
  };
  const outPath = path.join(outDir, `${fn}.json`);
  fs.writeFileSync(outPath, JSON.stringify(args));
  console.log(JSON.stringify({ fn, outPath, bytes: fs.statSync(outPath).size }));
}
