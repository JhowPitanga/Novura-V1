#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
const out = path.join(__dirname, `invoke-${fn}.json`);
const json = execFileSync(process.execPath, [path.join(__dirname, 'assemble-deploy-args.mjs'), fn], {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});
fs.writeFileSync(out, json);
console.log('wrote', out, json.length);
