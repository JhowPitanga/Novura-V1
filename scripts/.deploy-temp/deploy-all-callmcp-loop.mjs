#!/usr/bin/env node
/**
 * Deploy all 10 listing functions by writing deploy results to deploy-results-callmcp.json.
 * This script prepares payloads; the Cursor agent must call CallMcpTool deploy_edge_function
 * for each entry in deploy-queue.json (name, verify_jwt, payloadPath).
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

const queueDir = path.join(__dirname, 'deploy-queue');
fs.mkdirSync(queueDir, { recursive: true });

const queue = [];
for (const { fn, verify_jwt } of ORDER) {
  const src = path.join(__dirname, 'mcp-invoke-ready', `${fn}.json`);
  const payload = JSON.parse(fs.readFileSync(src, 'utf8'));
  payload.verify_jwt = verify_jwt;
  const out = path.join(queueDir, `${fn}.json`);
  fs.writeFileSync(out, JSON.stringify(payload));
  queue.push({ fn, verify_jwt, payloadPath: out, bytes: fs.statSync(out).size, files: payload.files.length });
}

fs.writeFileSync(path.join(__dirname, 'deploy-queue.json'), JSON.stringify(queue, null, 2));
console.log(JSON.stringify(queue, null, 2));
