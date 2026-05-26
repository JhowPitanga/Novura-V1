#!/usr/bin/env node
/** Print deploy_edge_function arguments JSON to stdout for MCP. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node export-mcp-deploy-args.mjs <function-name>');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'mcp-payloads', `${fn}.json`), 'utf8'),
);

process.stdout.write(
  JSON.stringify({
    name: payload.name,
    entrypoint_path: payload.entrypoint_path || 'index.ts',
    verify_jwt: payload.verify_jwt,
    files: payload.files,
  }),
);
