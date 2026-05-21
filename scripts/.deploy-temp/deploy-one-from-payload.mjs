#!/usr/bin/env node
/** Deploy one edge function via Management API (full bundle from mcp-payloads). */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'frwnfukydjwilfobxxhw';
const fn = process.argv[2];

if (!fn) {
  console.error('Usage: node deploy-one-from-payload.mjs <function-name>');
  process.exit(1);
}

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  for (const rel of ['.supabase/access-token', 'AppData/Roaming/supabase/access-token']) {
    const p = path.join(home, ...rel.split('/'));
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, 'utf8').trim();
      if (t.length > 50) return t;
    }
  }
  return null;
}

const token = getToken();
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN required');
  process.exit(1);
}

const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`), 'utf8'),
);

const body = {
  slug: payload.name,
  name: payload.name,
  entrypoint_path: payload.entrypoint_path || 'index.ts',
  verify_jwt: !!payload.verify_jwt,
  files: payload.files,
};

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(payload.name)}`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text.slice(0, 400) };
}

if (!res.ok) {
  console.log(JSON.stringify({ fn, success: false, version: `HTTP ${res.status}`, status: json }));
  process.exit(1);
}

const version = json.version ?? json.id ?? '?';
const status = json.status ?? 'ACTIVE';
console.log(JSON.stringify({ fn, success: true, version: String(version), status }));
