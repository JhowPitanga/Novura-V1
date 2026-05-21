#!/usr/bin/env node
/**
 * Deploy one function: reads scripts/mcp-payloads/{fn}.json and prints deploy result JSON.
 * Used with: node scripts/.deploy-temp/deploy-one-from-args.mjs <fn>
 * The parent agent calls CallMcpTool deploy_edge_function with the same args object.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node deploy-one-from-args.mjs <function-name>');
  process.exit(1);
}

const payloadPath = path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`);
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

const args = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path || 'index.ts',
  verify_jwt: payload.verify_jwt,
  files: payload.files,
};

// Write args for optional external MCP callers
const outPath = path.join(__dirname, 'mcp-call-args', `${fn}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(args));

console.log(
  JSON.stringify({
    fn,
    name: args.name,
    verify_jwt: args.verify_jwt,
    file_count: args.files.length,
    args_path: outPath,
    bytes: fs.statSync(outPath).size,
  }),
);
