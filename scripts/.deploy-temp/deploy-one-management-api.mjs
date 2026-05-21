#!/usr/bin/env node
/** Deploy one function via Management API using callmcp-args JSON. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const fn = process.argv[2];
const token =
  process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
  (() => {
    for (const p of [
      path.join(process.env.APPDATA || '', 'supabase', 'access-token'),
      path.join(process.env.USERPROFILE || '', '.supabase', 'access-token'),
    ]) {
      try {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
      } catch {
        /* ignore */
      }
    }
    return '';
  })();

if (!fn) {
  console.error('Usage: node deploy-one-management-api.mjs <function-name>');
  process.exit(1);
}

if (!token || token.length < 60) {
  console.error(
    JSON.stringify({
      ok: false,
      error: `Token length ${token.length}; need full PAT (80+ chars)`,
    }),
  );
  process.exit(1);
}

const argsPath = path.join(__dirname, 'callmcp-args', `${fn}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(args.name)}`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    slug: args.name,
    name: args.name,
    entrypoint_path: args.entrypoint_path || 'index.ts',
    verify_jwt: args.verify_jwt,
    files: args.files,
  }),
});

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { raw: text.slice(0, 800) };
}

if (!res.ok) {
  console.log(
    JSON.stringify({ fn, ok: false, status: res.status, error: body?.message ?? body }),
  );
  process.exit(1);
}

const version = String(body?.version ?? body?.id ?? '?');
const status = body?.status ?? 'ACTIVE';
console.log(JSON.stringify({ fn, ok: true, version, status }));
