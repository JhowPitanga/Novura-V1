#!/usr/bin/env node
/** Emit deploy_edge_function args JSON to stdout (for piping). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node emit-mcp-args-stdout.mjs <function-name>');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
);

const args = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path || 'index.ts',
  verify_jwt: payload.verify_jwt,
  files: payload.files,
};

process.stdout.write(JSON.stringify(args));
