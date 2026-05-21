#!/usr/bin/env node
/** Deploy one function from mcp-payloads via Management API (same as deploy_edge_function MCP). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const fn = process.argv[2];
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!fn || !token) {
  console.error('Usage: SUPABASE_ACCESS_TOKEN=... node deploy-one-api.mjs <function-name>');
  process.exit(1);
}

const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
);

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(payload.name)}`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    slug: payload.name,
    name: payload.name,
    entrypoint_path: payload.entrypoint_path || 'index.ts',
    verify_jwt: !!payload.verify_jwt,
    files: payload.files,
  }),
});

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { raw: text.slice(0, 500) };
}

if (!res.ok) {
  console.error(JSON.stringify({ fn, ok: false, status: res.status, error: body }));
  process.exit(1);
}

const version = body?.version ?? body?.id ?? '?';
const status = body?.status ?? 'ACTIVE';
console.log(JSON.stringify({ fn: payload.name, ok: true, version, status }));
