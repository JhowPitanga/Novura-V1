#!/usr/bin/env node
/**
 * Assembles deploy args from file-chunks/{fn}/f*.json for agent CallMcpTool.
 * Prints one JSON line: { fn, args } where args is ready for deploy_edge_function.
 * Usage: node deploy-all-callmcp-from-chunks.mjs listings-sync-one 2>stderr | Out-File -Encoding utf8 deploy-out.json
 * Agent: parse stdout JSON and CallMcpTool user-supabase deploy_edge_function with arguments=args
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
  console.error('Usage: node deploy-all-callmcp-from-chunks.mjs <function-name>');
  process.exit(1);
}

const chunkDir = path.join(__dirname, 'file-chunks', fn);
const metaPath = path.join(chunkDir, 'meta.json');
let name = fn;
let entrypoint_path = 'index.ts';
let verify_jwt = VERIFY[fn] ?? false;

if (fs.existsSync(metaPath)) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  name = meta.name ?? fn;
  entrypoint_path = meta.entrypoint_path ?? 'index.ts';
  verify_jwt = VERIFY[fn] ?? meta.verify_jwt ?? false;
} else {
  const payload = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
  );
  name = payload.name;
  entrypoint_path = payload.entrypoint_path || 'index.ts';
}

const files = [];
if (fs.existsSync(chunkDir)) {
  const chunks = fs
    .readdirSync(chunkDir)
    .filter((f) => /^f\d+\.json$/.test(f))
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  for (const c of chunks) {
    files.push(JSON.parse(fs.readFileSync(path.join(chunkDir, c), 'utf8')));
  }
} else {
  const payload = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
  );
  files.push(...payload.files);
}

const args = { name, entrypoint_path, verify_jwt, files };
const outPath = path.join(__dirname, 'callmcp-args', `${fn}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(args));

// stderr = meta for agent; stdout = full args for piping (may be large)
console.error(
  JSON.stringify({ fn, file_count: files.length, bytes: JSON.stringify(args).length, outPath }),
);
process.stdout.write(JSON.stringify({ fn, args }));
