#!/usr/bin/env node
/** Rebuild DEPLOY-LB-ARGS.json with fixed ./_shared imports for MCP flat layout. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

execFileSync(process.execPath, [path.join(root, 'scripts', 'bundle-edge-function-files.mjs'), 'listings-backfill', '--write'], {
  stdio: 'inherit',
  maxBuffer: 50 * 1024 * 1024,
});

execFileSync(
  process.execPath,
  [path.join(root, 'scripts', 'transform-bundle-for-mcp.mjs'), 'listings-backfill', 'false'],
  { stdio: 'inherit' },
);

const payload = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts', 'mcp-payloads', 'listings-backfill.json'), 'utf8'),
);

// Slim database.types stub
const stub = `/** Slim deploy stub — regenerate full types after deploy. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
`;

const dbIdx = payload.files.findIndex((f) => f.name === '_shared/database.types.ts');
if (dbIdx >= 0) payload.files[dbIdx].content = stub;

const outPath = path.join(__dirname, 'DEPLOY-LB-ARGS.json');
fs.writeFileSync(outPath, JSON.stringify(payload));

// file-chunks for agent / scripts
const chunkDir = path.join(__dirname, 'file-chunks', 'listings-backfill');
fs.mkdirSync(chunkDir, { recursive: true });
payload.files.forEach((f, i) => {
  fs.writeFileSync(path.join(chunkDir, `f${i}.json`), JSON.stringify(f));
});
fs.writeFileSync(
  path.join(chunkDir, 'meta.json'),
  JSON.stringify({
    name: payload.name,
    entrypoint_path: payload.entrypoint_path,
    verify_jwt: payload.verify_jwt,
    count: payload.files.length,
  }),
);

const idx = payload.files.find((f) => f.name === 'index.ts');
console.log(
  JSON.stringify({
    outPath,
    bytes: JSON.stringify(payload).length,
    files: payload.files.length,
    importFixed: idx?.content?.includes('from "./_shared/'),
    hasForce: idx?.content?.includes('force: true'),
  }),
);
