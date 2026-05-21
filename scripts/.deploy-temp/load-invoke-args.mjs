#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
const verifyJwt = process.argv[3] === 'true';
const invokePath = path.join(__dirname, `invoke-${fn}.json`);
if (!fs.existsSync(invokePath)) {
  console.error('Missing', invokePath, '- run: node write-invoke.mjs', fn);
  process.exit(1);
}
const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
args.verify_jwt = verifyJwt;
process.stdout.write(JSON.stringify(args));
