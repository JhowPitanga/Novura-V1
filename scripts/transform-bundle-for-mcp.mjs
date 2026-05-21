#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
const verifyJwt = process.argv[3] !== 'false';

const bundle = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'deploy-bundles', `${fn}.json`), 'utf8'),
);

/** Flat MCP layout: index.ts at root + _shared/* — fix ../_shared imports. */
function fixImports(content) {
  return content.replace(/from\s+["']\.\.\/_shared\//g, 'from "./_shared/');
}

const files = bundle.files.map((f) => {
  const name = f.name.replace(`${fn}/`, '');
  return { name, content: fixImports(f.content) };
});

const payload = {
  name: fn,
  entrypoint_path: 'index.ts',
  verify_jwt: verifyJwt,
  files,
};

const out = path.join(__dirname, 'mcp-payloads', `${fn}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(payload));
console.log(out, files.length, 'files', fs.statSync(out).size, 'bytes');
