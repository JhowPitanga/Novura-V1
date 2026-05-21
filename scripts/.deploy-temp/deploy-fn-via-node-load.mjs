#!/usr/bin/env node
/**
 * Loads deploy args from mcp-invoke-ready/{fn}.json and writes result to deploy-results.jsonl
 * Agent should CallMcpTool deploy_edge_function per function; this script only validates payloads.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node deploy-fn-via-node-load.mjs <function-name>');
  process.exit(1);
}

const src = path.join(__dirname, 'mcp-invoke-ready', `${fn}.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));
args.verify_jwt = VERIFY[fn] ?? args.verify_jwt;

// Write args for CallMcpTool (agent reads path only — full body stays on disk)
const out = path.join(__dirname, 'callmcp-args', `${fn}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(args));

console.log(
  JSON.stringify({
    fn,
    name: args.name,
    verify_jwt: args.verify_jwt,
    file_count: args.files.length,
    bytes: fs.statSync(out).size,
    argsPath: out,
  }),
);
