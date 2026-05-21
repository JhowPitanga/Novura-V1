#!/usr/bin/env node
/**
 * Deploy all functions in scripts/mcp-payloads via user-supabase MCP.
 * Requires: Cursor agent runs this and calls deploy_edge_function per function,
 * OR set SUPABASE_ACCESS_TOKEN after `supabase login`.
 *
 * This script prints one JSON line per function for agent/MCP consumption.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'mcp-payloads');

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const payload = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  console.log(JSON.stringify({
    step: 'deploy_edge_function',
    name: payload.name,
    entrypoint_path: payload.entrypoint_path || 'index.ts',
    verify_jwt: payload.verify_jwt,
    file_count: payload.files.length,
    payload_path: path.join(dir, file),
  }));
}
