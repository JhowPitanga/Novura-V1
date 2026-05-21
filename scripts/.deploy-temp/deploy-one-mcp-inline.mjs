#!/usr/bin/env node
/** Print deploy args JSON to stdout for piping into MCP (single line). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2] || 'listings-sync-one';
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

const invokePath = path.join(__dirname, 'mcp-invoke', `${fn}.json`);
const payloadPath = path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`);
const chunkDir = path.join(__dirname, 'file-chunks', fn);

let args;
if (fs.existsSync(invokePath)) {
  args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
} else if (fs.existsSync(payloadPath)) {
  args = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
} else if (fs.existsSync(path.join(chunkDir, 'meta.json'))) {
  const meta = JSON.parse(fs.readFileSync(path.join(chunkDir, 'meta.json'), 'utf8'));
  const files = [];
  for (let i = 0; i < meta.count; i++) {
    files.push(JSON.parse(fs.readFileSync(path.join(chunkDir, `f${i}.json`), 'utf8')));
  }
  args = { name: meta.name, entrypoint_path: meta.entrypoint_path, verify_jwt: meta.verify_jwt, files };
} else {
  console.error('No payload for', fn);
  process.exit(1);
}

const out = {
  name: args.name,
  entrypoint_path: args.entrypoint_path || 'index.ts',
  verify_jwt: VERIFY[fn] ?? !!args.verify_jwt,
  files: args.files,
};

process.stdout.write(JSON.stringify(out));
