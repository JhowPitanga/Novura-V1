#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, 'callmcp-args', 'listings-backfill.json');
const raw = fs.readFileSync(src, 'utf8');
const chunkSize = 75000;
const dir = path.join(__dirname, 'callmcp-args-parts-lb');
fs.mkdirSync(dir, { recursive: true });
for (let i = 0, p = 0; i < raw.length; i += chunkSize, p++) {
  fs.writeFileSync(path.join(dir, `part-${p}.txt`), raw.slice(i, i + chunkSize), 'utf8');
}
console.log(JSON.stringify({ parts: Math.ceil(raw.length / chunkSize), total: raw.length, dir }));
