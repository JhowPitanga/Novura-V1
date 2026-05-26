#!/usr/bin/env node
/**
 * Bundles edge function + local ../_shared imports for MCP deploy_edge_function.
 * Usage: node scripts/bundle-edge-function-files.mjs <function-name>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'supabase', 'functions');

const IMPORT_RE = /from\s+["'](\.\.?\/[^"']+)["']/g;

function resolveImport(fromFile, spec) {
  let p = path.normalize(path.join(path.dirname(fromFile), spec));
  if (!p.endsWith('.ts')) p += '.ts';
  return p;
}

function collect(filePath, seen = new Set()) {
  const abs = path.resolve(filePath);
  if (!abs.startsWith(root) || seen.has(abs)) return seen;
  if (!fs.existsSync(abs)) return seen;
  seen.add(abs);
  const text = fs.readFileSync(abs, 'utf8');
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(text)) !== null) {
    collect(resolveImport(abs, m[1]), seen);
  }
  return seen;
}

const fnName = process.argv[2];
if (!fnName) {
  console.error('Usage: node bundle-edge-function-files.mjs <function-name>');
  process.exit(1);
}

const entry = path.join(root, fnName, 'index.ts');
if (!fs.existsSync(entry)) {
  console.error('Missing', entry);
  process.exit(1);
}

const files = [...collect(entry)].sort();
const bundle = files.map((abs) => {
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  return { name: rel, content: fs.readFileSync(abs, 'utf8') };
});

const out = { functionName: fnName, entrypoint: `${fnName}/index.ts`, files: bundle };
if (process.argv.includes('--write')) {
  const outPath = path.join(__dirname, 'deploy-bundles', `${fnName}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log('wrote', outPath, bundle.length, 'files');
} else {
  process.stdout.write(JSON.stringify(out));
}
