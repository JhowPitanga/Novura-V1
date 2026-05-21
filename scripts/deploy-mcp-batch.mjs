#!/usr/bin/env node
/**
 * Reads mcp-payloads and prints deploy params as JSON lines for agent MCP calls.
 * Usage: node deploy-mcp-batch.mjs [function-name]
 * Without args: prints one line per function with {fn, argsPath}
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

const payloadsDir = path.join(__dirname, 'mcp-payloads');
const outDir = path.join(__dirname, '.deploy-temp');
fs.mkdirSync(outDir, { recursive: true });

const targets = process.argv[2] ? [process.argv[2]] : ORDER;

for (const fn of targets) {
  const raw = fs.readFileSync(path.join(payloadsDir, `${fn}.json`), 'utf8');
  const payload = JSON.parse(raw);
  const args = {
    name: payload.name,
    entrypoint_path: payload.entrypoint_path,
    verify_jwt: payload.verify_jwt,
    files: payload.files,
  };
  const argsPath = path.join(outDir, `${fn}.args.json`);
  fs.writeFileSync(argsPath, JSON.stringify(args));
  console.log(JSON.stringify({ fn, argsPath, bytes: fs.statSync(argsPath).size }));
}
