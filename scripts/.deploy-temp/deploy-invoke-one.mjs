#!/usr/bin/env node
/** Deploy one function from invoke-{fn}.json via Management API. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const fn = process.argv[2] || 'listings-backfill';

function getToken() {
  const env = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (env && env.length >= 60) return env;
  const home = process.env.USERPROFILE || process.env.HOME;
  for (const rel of ['.supabase/access-token', 'AppData/Roaming/supabase/access-token']) {
    const p = path.join(home, ...rel.split('/'));
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, 'utf8').trim();
      if (t.length >= 60) return t;
    }
  }
  return null;
}

const invokePath = path.join(__dirname, `invoke-${fn}.json`);
const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
args.verify_jwt = false;

const token = getToken();
if (!token) {
  console.log(JSON.stringify({ ok: false, error: 'NO_TOKEN_USE_CALLMCP' }));
  process.exit(2);
}

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
  console.log(JSON.stringify({ ok: false, status: res.status, error: body?.message ?? body }));
  process.exit(1);
}
console.log(
  JSON.stringify({
    ok: true,
    function: fn,
    version: String(body?.version ?? body?.id ?? '?'),
    status: body?.status ?? 'ACTIVE',
    body,
  }),
);
