#!/usr/bin/env node
/**
 * Load deploy args from mcp-payloads and write compact summary + full args path.
 * Agent uses CallMcpTool with args from assemble-deploy-args stdout via this helper.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
const VERIFY = {
  'listings-sync-one': true,
  'listings-backfill': false,
  'mercado-livre-sync-items': false,
  'shopee-sync-items': false,
  'mercado-livre-update-metrics': false,
  'mercado-livre-update-quality': false,
  'mercado-livre-update-reviews': false,
  'mercado-livre-sync-prices': false,
  'mercado-livre-sync-stock-distribution': false,
  'shopee-webhook-items': false,
};

if (!fn || !VERIFY.hasOwnProperty(fn)) {
  console.error('Usage: node deploy-one-from-disk.mjs <function-name>');
  process.exit(1);
}

const payloadPath = path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`);
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
const args = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path || 'index.ts',
  verify_jwt: VERIFY[fn],
  files: payload.files,
};

const outPath = path.join(__dirname, 'mcp-invoke', `${fn}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(args));

// Emit args JSON to stdout for piping (agent / MCP bridge)
process.stdout.write(JSON.stringify(args));
