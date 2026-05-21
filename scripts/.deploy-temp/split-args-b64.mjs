#!/usr/bin/env node
/** Split deploy args JSON into base64 chunks under 70k chars for agent Read tool. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node split-args-b64.mjs <function-name>');
  process.exit(1);
}

const src = path.join(__dirname, 'mcp-call-args', `${fn}.json`);
if (!fs.existsSync(src)) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
  );
  const args = {
    name: payload.name,
    entrypoint_path: payload.entrypoint_path || 'index.ts',
    verify_jwt: payload.verify_jwt,
    files: payload.files,
  };
  fs.mkdirSync(path.join(__dirname, 'mcp-call-args'), { recursive: true });
  fs.writeFileSync(src, JSON.stringify(args));
}

const b64 = fs.readFileSync(src).toString('base64');
const chunkSize = 50000;
const outDir = path.join(__dirname, 'b64-chunks', fn);
fs.mkdirSync(outDir, { recursive: true });
let i = 0;
for (let o = 0; o < b64.length; o += chunkSize) {
  const part = b64.slice(o, o + chunkSize);
  fs.writeFileSync(path.join(outDir, `part-${i}.txt`), part);
  i++;
}
console.log(JSON.stringify({ fn, parts: i, totalB64: b64.length }));
