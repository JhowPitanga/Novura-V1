#!/usr/bin/env node
/** Builds deploy_edge_function args from invoke-listings-backfill.json (UTF-8). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const invokePath = path.join(__dirname, 'invoke-listings-backfill.json');
const outPath = path.join(__dirname, 'CALLMCP-LB-DEPLOY-ARGS.json');

const raw = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
const args = {
  name: raw.name ?? 'listings-backfill',
  entrypoint_path: raw.entrypoint_path ?? 'index.ts',
  verify_jwt: false,
  files: raw.files,
};

fs.writeFileSync(outPath, JSON.stringify(args), 'utf8');
console.log(
  JSON.stringify({
    outPath,
    bytes: Buffer.byteLength(JSON.stringify(args), 'utf8'),
    file_count: args.files.length,
    names: args.files.map((f) => f.name),
  }),
);
