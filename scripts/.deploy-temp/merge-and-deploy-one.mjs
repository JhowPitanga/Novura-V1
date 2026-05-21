#!/usr/bin/env node
/**
 * Merges split args JSON and writes merged deploy args.
 * Agent: CallMcpTool deploy_edge_function with JSON.parse(fs.readFileSync('merged.json'))
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2] || 'listings-sync-one';

const src = path.join(__dirname, 'callmcp-args', `${fn}.json`);
const out = path.join(__dirname, 'merged-deploy-args.json');

if (!fs.existsSync(src)) {
  console.error('Missing', src);
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(src, 'utf8'));
fs.writeFileSync(out, JSON.stringify(args));
console.log(
  JSON.stringify({
    fn,
    out,
    bytes: fs.statSync(out).size,
    file_count: args.files.length,
    verify_jwt: args.verify_jwt,
  }),
);
