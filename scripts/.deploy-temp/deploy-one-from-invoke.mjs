#!/usr/bin/env node
/**
 * Prints deploy_edge_function args JSON to stdout for a single function.
 * Agent: pipe to CallMcpTool or use invoke-{fn}.json directly.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
const verifyJwt = process.argv[3] === 'true';

const invokePath = path.join(__dirname, `invoke-${fn}.json`);
if (!fs.existsSync(invokePath)) {
  execFileSync(process.execPath, [path.join(__dirname, 'write-invoke.mjs'), fn], {
    stdio: 'inherit',
    maxBuffer: 50 * 1024 * 1024,
  });
}

const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
args.verify_jwt = verifyJwt;

// Write compact args for MCP (same as mcp-call-args)
const outPath = path.join(__dirname, 'mcp-call-args', `${fn}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(args));

console.log(JSON.stringify({
  tool: 'deploy_edge_function',
  server: 'user-supabase',
  arguments: args,
}));
