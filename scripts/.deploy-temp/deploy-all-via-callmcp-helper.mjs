#!/usr/bin/env node
/**
 * Assembles deploy args from mcp-payloads and writes per-function invoke JSON
 * plus a manifest for the agent (CallMcpTool deploy_edge_function).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';

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

const outDir = path.join(__dirname, 'mcp-invoke-ready');
fs.mkdirSync(outDir, { recursive: true });

const manifest = [];

for (const { fn, verify_jwt } of ORDER) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
  );
  const args = {
    name: payload.name,
    entrypoint_path: payload.entrypoint_path || 'index.ts',
    verify_jwt,
    files: payload.files,
  };
  const outPath = path.join(outDir, `${fn}.json`);
  fs.writeFileSync(outPath, JSON.stringify(args));
  manifest.push({
    fn,
    verify_jwt,
    path: outPath,
    bytes: fs.statSync(outPath).size,
    file_count: args.files.length,
  });
}

fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify({ project_ref: PROJECT_REF, functions: manifest }, null, 2),
);
console.log(JSON.stringify(manifest, null, 2));
