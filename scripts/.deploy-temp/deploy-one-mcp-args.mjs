#!/usr/bin/env node
/** Copy invoke-{fn}.json → mcp-invoke-ready/{fn}.json for callmcp-deploy-fn.mjs */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node deploy-one-mcp-args.mjs <function-name>');
  process.exit(1);
}
const src = path.join(__dirname, `invoke-${fn}.json`);
const destDir = path.join(__dirname, 'mcp-invoke-ready');
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, `${fn}.json`));
console.log('copied', src);
