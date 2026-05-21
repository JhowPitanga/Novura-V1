#!/usr/bin/env node
/**
 * Writes deploy args JSON (utf8) for one function.
 * Agent: read with fs in CallMcpTool flow, or pipe to MCP.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const fn = process.argv[2];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'mcp-payloads', `${fn}.json`), 'utf8'),
);
const args = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path || 'index.ts',
  verify_jwt: payload.verify_jwt,
  files: payload.files,
};
const out = path.join(__dirname, '.deploy-temp', `${fn}.mcp-args.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(args), 'utf8');
console.log(out, fs.statSync(out).size);
