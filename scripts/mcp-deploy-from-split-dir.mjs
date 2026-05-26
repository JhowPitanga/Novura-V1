#!/usr/bin/env node
/**
 * Build deploy_edge_function args from split file-contents dir and print summary.
 * Agent: read each file from dir, then CallMcpTool deploy_edge_function.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node mcp-deploy-from-split-dir.mjs <function-name>');
  process.exit(1);
}

const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'mcp-payloads', `${fn}.json`), 'utf8'),
);
const dir = path.join(__dirname, '.deploy-temp', 'file-contents', fn);

const files = payload.files.map((f) => {
  const safe = f.name.replace(/[/\\]/g, '__');
  const p = path.join(dir, safe);
  return {
    name: f.name,
    content: fs.readFileSync(p, 'utf8'),
    bytes: fs.statSync(p).size,
  };
});

const args = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path || 'index.ts',
  verify_jwt: payload.verify_jwt,
  files: files.map(({ name, content }) => ({ name, content })),
};

const out = path.join(__dirname, '.deploy-temp', `${fn}.deploy-args.json`);
fs.writeFileSync(out, JSON.stringify(args));
console.log(JSON.stringify({ out, bytes: fs.statSync(out).size, files: files.length }));
