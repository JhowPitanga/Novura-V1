#!/usr/bin/env node
/** Split mcp-payload into per-file chunks for agent MCP deploy. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node split-payload-for-mcp.mjs <function-name>');
  process.exit(1);
}

const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'mcp-payloads', `${fn}.json`), 'utf8'),
);
const outDir = path.join(__dirname, '.deploy-temp', 'parts', fn);
fs.mkdirSync(outDir, { recursive: true });

const manifest = payload.files.map((f, i) => {
  const safe = `${String(i).padStart(2, '0')}_${f.name.replace(/[/\\]/g, '__')}.txt`;
  fs.writeFileSync(path.join(outDir, safe), f.content, 'utf8');
  return { name: f.name, part: safe, bytes: f.content.length };
});

fs.writeFileSync(
  path.join(outDir, '_manifest.json'),
  JSON.stringify(
    {
      name: payload.name,
      entrypoint_path: payload.entrypoint_path || 'index.ts',
      verify_jwt: payload.verify_jwt,
      files: manifest,
    },
    null,
    2,
  ),
);
console.log(outDir, manifest.length, 'files');
