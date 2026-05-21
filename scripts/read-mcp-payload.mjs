#!/usr/bin/env node
/** Reads one MCP deploy payload and prints it to stdout (for agent MCP calls). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error('Usage: node read-mcp-payload.mjs <function-name>');
  process.exit(1);
}

const filePath = path.join(__dirname, 'mcp-payloads', `${name}.json`);
const raw = fs.readFileSync(filePath, 'utf8');
const payload = JSON.parse(raw);

const out = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path,
  verify_jwt: payload.verify_jwt,
  files: payload.files,
};
process.stdout.write(JSON.stringify(out));
