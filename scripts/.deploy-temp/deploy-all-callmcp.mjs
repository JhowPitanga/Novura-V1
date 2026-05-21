#!/usr/bin/env node
/**
 * Emit deploy_edge_function args as base64 chunks (stdout) for agent CallMcpTool.
 * Usage: node deploy-all-callmcp.mjs <function-name>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  console.error('Usage: node deploy-all-callmcp.mjs <function-name>');
  process.exit(1);
}

const payloadPath = path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`);
const callArgsPath = path.join(__dirname, 'mcp-call-args', `${fn}.json`);

let payload;
if (fs.existsSync(callArgsPath)) {
  payload = JSON.parse(fs.readFileSync(callArgsPath, 'utf8'));
} else if (fs.existsSync(payloadPath)) {
  payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
} else {
  console.error('No payload for', fn);
  process.exit(1);
}

const args = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path || 'index.ts',
  verify_jwt: VERIFY[fn],
  files: payload.files,
};

const b64 = Buffer.from(JSON.stringify(args), 'utf8').toString('base64');
const CHUNK = 48000;
const parts = Math.ceil(b64.length / CHUNK);
const outDir = path.join(__dirname, 'b64-out', fn);
fs.mkdirSync(outDir, { recursive: true });
for (let i = 0; i < parts; i++) {
  const part = b64.slice(i * CHUNK, (i + 1) * CHUNK);
  fs.writeFileSync(path.join(outDir, `part-${i}.txt`), part);
}
console.log(JSON.stringify({ fn, parts, outDir, b64Len: b64.length, fileCount: args.files.length, verify_jwt: args.verify_jwt }));
