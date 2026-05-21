#!/usr/bin/env node
/** Slim deploy args: stub database.types.ts to fit MCP message limits. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2] || 'listings-backfill';
const src = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'callmcp-args', `${fn}.json`), 'utf8'),
);

const stubTypes = `/** Slim deploy stub — regenerate full types after deploy. */
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

const files = src.files.map((f) =>
  f.name === '_shared/database.types.ts' ? { ...f, content: stubTypes } : f,
);

const args = {
  name: src.name,
  entrypoint_path: src.entrypoint_path || 'index.ts',
  verify_jwt: src.verify_jwt ?? false,
  files,
};

const out = path.join(__dirname, 'callmcp-args', `${fn}-slim.json`);
fs.writeFileSync(out, JSON.stringify(args));
console.log(
  JSON.stringify({
    out,
    bytes: Buffer.byteLength(JSON.stringify(args)),
    file_count: files.length,
  }),
);
