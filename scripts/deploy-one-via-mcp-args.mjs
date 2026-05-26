#!/usr/bin/env node
/**
 * Prints deploy_edge_function args as JSON to stdout (for agent MCP CallMcpTool).
 * Usage: node scripts/deploy-one-via-mcp-args.mjs listings-sync-one > deploy-out.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node deploy-one-via-mcp-args.mjs <function-name>');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_MAP = {
  'listings-sync-one': true,
  'listings-backfill': false,
};

const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'mcp-payloads', `${fn}.json`), 'utf8'),
);

const args = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path || 'index.ts',
  verify_jwt: JWT_MAP[fn] ?? payload.verify_jwt ?? false,
  files: payload.files,
};

process.stdout.write(JSON.stringify(args));
