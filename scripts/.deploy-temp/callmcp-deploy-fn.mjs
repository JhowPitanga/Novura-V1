#!/usr/bin/env node
/**
 * Prints deploy_edge_function arguments JSON to stdout for agent CallMcpTool.
 * Usage: node callmcp-deploy-fn.mjs listings-sync-one > out.json
 * Agent: CallMcpTool deploy_edge_function with JSON.parse(fs.readFileSync('out.json'))
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

const p = path.join(__dirname, 'mcp-invoke-ready', `${fn}.json`);
const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
const args = {
  name: raw.name,
  entrypoint_path: raw.entrypoint_path || 'index.ts',
  verify_jwt: VERIFY[fn] ?? !!raw.verify_jwt,
  files: raw.files,
};
process.stdout.write(JSON.stringify(args));
