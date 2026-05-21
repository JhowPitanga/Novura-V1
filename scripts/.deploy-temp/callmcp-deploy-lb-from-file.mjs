#!/usr/bin/env node
/** Prints deploy_edge_function args JSON path for agent CallMcpTool (reads DEPLOY-LB-ARGS.json). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argsPath = path.join(__dirname, 'DEPLOY-LB-ARGS.json');
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
console.log(JSON.stringify({
  instruction: 'CallMcpTool user-supabase deploy_edge_function with arguments from DEPLOY-LB-ARGS.json',
  argsPath,
  bytes: JSON.stringify(args).length,
  file_count: args.files.length,
  index_has_force: args.files.find((f) => f.name === 'index.ts')?.content?.includes('force: true'),
}));
