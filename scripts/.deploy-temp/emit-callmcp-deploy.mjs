#!/usr/bin/env node
/** Emit deploy args path for agent CallMcpTool (stdout = absolute path). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node emit-callmcp-deploy.mjs <function-name>');
  process.exit(1);
}
const p = path.join(__dirname, 'callmcp-args', `${fn}.json`);
if (!fs.existsSync(p)) {
  console.error('Missing', p);
  process.exit(1);
}
const args = JSON.parse(fs.readFileSync(p, 'utf8'));
console.log(JSON.stringify(args));
