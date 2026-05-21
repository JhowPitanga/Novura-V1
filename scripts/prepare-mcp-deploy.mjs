#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FUNCTIONS = [
  ['listings-sync-one', true],
  ['listings-backfill', false],
  ['mercado-livre-sync-items', false],
  ['shopee-sync-items', false],
  ['mercado-livre-update-metrics', false],
  ['mercado-livre-update-quality', false],
  ['mercado-livre-update-reviews', false],
  ['mercado-livre-sync-prices', false],
  ['mercado-livre-sync-stock-distribution', false],
  ['shopee-webhook-items', false],
];

for (const [fn, verifyJwt] of FUNCTIONS) {
  execSync(`node "${path.join(__dirname, 'bundle-edge-function-files.mjs')}" ${fn} --write`, {
    stdio: 'inherit',
  });
  const bundle = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'deploy-bundles', `${fn}.json`), 'utf8'),
  );
  const files = bundle.files.map((f) => ({
    name: f.name.replace(`${fn}/`, ''),
    content: f.content,
  }));
  const payload = {
    name: fn,
    entrypoint_path: 'index.ts',
    verify_jwt: verifyJwt,
    files,
  };
  const outPath = path.join(__dirname, 'mcp-payloads', `${fn}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log('mcp payload', fn, files.length, 'files', fs.statSync(outPath).size, 'bytes');
}
