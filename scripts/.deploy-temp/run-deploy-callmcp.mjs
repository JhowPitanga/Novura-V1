#!/usr/bin/env node
/**
 * Decode b64 parts and write deploy args for agent CallMcpTool.
 * Usage: node run-deploy-callmcp.mjs listings-sync-one
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

const invokePath = path.join(__dirname, 'mcp-invoke', `${fn}.json`);
const argsPath = path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`);
const callArgsPath = path.join(__dirname, 'mcp-call-args', `${fn}.json`);

let args;
for (const p of [invokePath, callArgsPath, argsPath]) {
  if (fs.existsSync(p)) {
    args = JSON.parse(fs.readFileSync(p, 'utf8'));
    break;
  }
}
if (!args) {
  console.error('No args for', fn);
  process.exit(1);
}

const out = {
  name: args.name,
  entrypoint_path: args.entrypoint_path || 'index.ts',
  verify_jwt: VERIFY[fn] ?? !!args.verify_jwt,
  files: args.files,
};

const outFile = path.join(__dirname, 'callmcp-ready', `${fn}.json`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(JSON.stringify({ fn, outFile, size: fs.statSync(outFile).size, files: out.files.length, verify_jwt: out.verify_jwt }));
