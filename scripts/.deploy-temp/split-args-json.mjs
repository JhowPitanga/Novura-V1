import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2] || 'listings-sync-one';
const args = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'callmcp-args', `${fn}.json`), 'utf8'),
);
const s = JSON.stringify(args);
const half = Math.ceil(s.length / 2);
let idx = s.indexOf('},{"name"', half - 8000);
if (idx < 0) idx = half;
const a = s.slice(0, idx + 1);
const b = s.slice(idx + 1);
fs.writeFileSync(path.join(__dirname, 'args-a.json'), a);
fs.writeFileSync(path.join(__dirname, 'args-b.json'), b);
try {
  JSON.parse(a + b);
  console.log(JSON.stringify({ ok: true, aLen: a.length, bLen: b.length }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e), aLen: a.length, bLen: b.length }));
  process.exit(1);
}
