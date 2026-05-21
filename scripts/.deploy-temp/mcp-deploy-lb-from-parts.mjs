#!/usr/bin/env node
/**
 * Loads deploy args from invoke (3-part concat) and prints path for agent.
 * Agent must CallMcpTool deploy_edge_function with JSON.parse(fs.readFileSync(path)).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const invokePath = path.join(__dirname, 'invoke-listings-backfill.json');
const partsDir = path.join(__dirname, 'callmcp-args-parts-lb');
const outPath = path.join(__dirname, 'CALLMCP-LB-PAYLOAD.json');

let raw;
if (fs.existsSync(invokePath)) {
  raw = fs.readFileSync(invokePath, 'utf8');
} else {
  let s = '';
  for (let i = 0; i < 3; i++) {
    s += fs.readFileSync(path.join(partsDir, `part-${i}.txt`), 'utf8');
  }
  raw = s;
}

const j = JSON.parse(raw);
const args = {
  name: j.name ?? 'listings-backfill',
  entrypoint_path: j.entrypoint_path ?? 'index.ts',
  verify_jwt: false,
  files: j.files,
};
fs.writeFileSync(outPath, JSON.stringify(args), 'utf8');
console.log(
  JSON.stringify({
    path: outPath,
    bytes: fs.statSync(outPath).size,
    file_count: args.files.length,
    source: fs.existsSync(invokePath) ? 'invoke-listings-backfill.json' : 'parts',
  }),
);
