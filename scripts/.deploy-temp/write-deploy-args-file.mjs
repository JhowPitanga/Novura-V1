#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, 'invoke-listings-backfill.json');
const out = path.join(__dirname, '_mcp-deploy-args-utf8.json');
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const args = {
  name: raw.name ?? 'listings-backfill',
  entrypoint_path: raw.entrypoint_path ?? 'index.ts',
  verify_jwt: false,
  files: raw.files,
};
fs.writeFileSync(out, JSON.stringify(args), 'utf8');
console.log(JSON.stringify({ out, bytes: fs.statSync(out).size, files: args.files.length }));
