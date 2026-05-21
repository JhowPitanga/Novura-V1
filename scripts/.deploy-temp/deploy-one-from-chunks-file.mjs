#!/usr/bin/env node
/**
 * Assembles deploy args from file-chunks and writes callmcp-args.
 * Prints metadata to stderr; writes full args path for agent CallMcpTool.
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
  console.error('Usage: node deploy-one-from-chunks-file.mjs <function-name>');
  process.exit(1);
}

const chunkDir = path.join(__dirname, 'file-chunks', fn);
const meta = fs.existsSync(path.join(chunkDir, 'meta.json'))
  ? JSON.parse(fs.readFileSync(path.join(chunkDir, 'meta.json'), 'utf8'))
  : { name: fn, entrypoint_path: 'index.ts' };

const files = fs
  .readdirSync(chunkDir)
  .filter((f) => /^f\d+\.json$/.test(f))
  .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
  .map((f) => JSON.parse(fs.readFileSync(path.join(chunkDir, f), 'utf8')));

const args = {
  name: meta.name ?? fn,
  entrypoint_path: meta.entrypoint_path ?? 'index.ts',
  verify_jwt: VERIFY[fn] ?? meta.verify_jwt ?? false,
  files,
};

const outPath = path.join(__dirname, 'callmcp-args', `${fn}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(args));

console.log(
  JSON.stringify({
    fn,
    file_count: files.length,
    bytes: JSON.stringify(args).length,
    outPath,
    verify_jwt: args.verify_jwt,
  }),
);
