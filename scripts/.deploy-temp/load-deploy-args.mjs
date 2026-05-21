#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src =
  process.argv[2] === 'invoke'
    ? path.join(__dirname, 'invoke-listings-backfill.json')
    : path.join(__dirname, 'callmcp-args', 'listings-backfill.json');

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const args = {
  name: raw.name ?? 'listings-backfill',
  entrypoint_path: raw.entrypoint_path ?? 'index.ts',
  verify_jwt: false,
  files: raw.files,
};
process.stdout.write(JSON.stringify(args));
