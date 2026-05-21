#!/usr/bin/env node
/** Prints deploy payload for a single function (for MCP deploy_edge_function). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
const verifyJwt = process.argv[3] !== 'false';

const bundlePath = path.join(__dirname, 'deploy-bundles', `${fn}.json`);
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));

const payload = {
  name: fn,
  entrypoint_path: 'index.ts',
  verify_jwt: verifyJwt,
  files: bundle.files.map((f) => ({
    name: f.name.includes('/') ? f.name : `${fn}/${f.name}`,
  })),
};

// Fix paths: MCP expects paths relative to function root
payload.files = bundle.files.map((f) => {
  const rel = f.name.replace(/^[^/]+\//, '').startsWith('_shared')
    ? f.name
    : f.name.startsWith('_shared')
      ? f.name
      : f.name.replace(`${fn}/`, '');
  // Keep full path from functions root as Supabase CLI uses
  return { name: f.name, content: f.content };
});

// entrypoint should be function/index.ts style
const entryRel = bundle.entrypoint || `${fn}/index.ts`;
payload.entrypoint_path = entryRel.includes('/') ? entryRel.split('/').pop() : 'index.ts';

// Supabase upload uses paths like listings-sync-one/index.ts and _shared/...
payload.files = bundle.files.map((f) => ({
  name: f.name,
  content: f.content,
}));

process.stdout.write(JSON.stringify(payload));
