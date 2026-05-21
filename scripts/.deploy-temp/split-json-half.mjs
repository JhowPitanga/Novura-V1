#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
const base = process.argv[3] || 'half';
if (!src) {
  console.error('Usage: node split-json-half.mjs <json-file> [prefix]');
  process.exit(1);
}
const s = fs.readFileSync(path.join(__dirname, src), 'utf8');
const mid = Math.floor(s.length / 2);
let split = s.lastIndexOf('},{"name":', mid);
if (split < 0) split = mid;
fs.writeFileSync(path.join(__dirname, `${base}-0.txt`), s.slice(0, split));
fs.writeFileSync(path.join(__dirname, `${base}-1.txt`), s.slice(split));
console.log('0', split, '1', s.length - split);
