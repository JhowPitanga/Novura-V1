#!/usr/bin/env node
/**
 * Reads invoke-listings-backfill.json and prints deploy args path for CallMcpTool.
 * Agent must call: CallMcpTool user-supabase deploy_edge_function with JSON.parse(fs.readFileSync(stdout))
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const invokePath = path.join(__dirname, 'invoke-listings-backfill.json');
const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
const idx = args.files?.find((f) => f.name === 'index.ts');
const out = {
  ok: true,
  invokePath,
  bytes: JSON.stringify(args).length,
  file_count: args.files?.length,
  index_has_backfill: idx?.content?.includes('listings-backfill') ?? false,
  index_has_placeholder: idx?.content?.includes('PLACEHOLDER') ?? false,
};
// Write args for MCP (same shape as deploy_edge_function expects)
const argsPath = path.join(__dirname, '_mcp-deploy-args-utf8.json');
fs.writeFileSync(argsPath, JSON.stringify(args), 'utf8');
console.log(JSON.stringify({ ...out, argsPath }));
