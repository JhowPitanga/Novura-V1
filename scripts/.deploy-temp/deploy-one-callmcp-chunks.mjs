#!/usr/bin/env node
/**
 * Writes deploy args as base64 chunks for agent CallMcpTool assembly.
 * Usage: node deploy-one-callmcp-chunks.mjs listings-sync-one
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node deploy-one-callmcp-chunks.mjs <function-name>');
  process.exit(1);
}

const argsPath = path.join(__dirname, 'callmcp-args', `${fn}.json`);
const b64 = Buffer.from(fs.readFileSync(argsPath, 'utf8')).toString('base64');
const chunkSize = 60000;
const outDir = path.join(__dirname, 'b64-chunks', fn);
fs.mkdirSync(outDir, { recursive: true });
let i = 0;
for (let p = 0; p < b64.length; p += chunkSize, i++) {
  fs.writeFileSync(path.join(outDir, `c${i}.txt`), b64.slice(p, p + chunkSize));
}
fs.writeFileSync(
  path.join(outDir, 'meta.json'),
  JSON.stringify({ fn, chunks: i, bytes: b64.length }),
);
console.log(JSON.stringify({ fn, chunks: i, dir: outDir }));
