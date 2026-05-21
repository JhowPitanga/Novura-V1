#!/usr/bin/env node
/** Assemble deploy args from callmcp-deploy-files and write for MCP deploy. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'callmcp-deploy-files');
const files = [];
for (let i = 0; i < 16; i++) {
  const p = path.join(dir, `file-${String(i).padStart(2, '0')}.json`);
  files.push(JSON.parse(fs.readFileSync(p, 'utf8')));
}
const args = {
  name: 'listings-backfill',
  entrypoint_path: 'index.ts',
  verify_jwt: false,
  files,
};
const out = path.join(__dirname, '_mcp-deploy-args-utf8.json');
fs.writeFileSync(out, JSON.stringify(args), 'utf8');
const idx = files.find((f) => f.name === 'index.ts');
console.log(
  JSON.stringify({
    ok: true,
    out,
    bytes: fs.statSync(out).size,
    file_count: files.length,
    index_has_backfill: idx?.content?.includes('listings-backfill') ?? false,
    index_has_placeholder: idx?.content?.includes('PLACEHOLDER') ?? false,
  }),
);
