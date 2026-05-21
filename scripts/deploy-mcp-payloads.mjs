#!/usr/bin/env node
/**
 * Deploy edge functions from scripts/mcp-payloads/*.json via Supabase Management API.
 * Token: SUPABASE_ACCESS_TOKEN env, or ~/.supabase/access-token from `supabase login`.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'frwnfukydjwilfobxxhw';

function readToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const candidates = [
    path.join(os.homedir(), '.supabase', 'access-token'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'supabase', 'access-token'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  }
  return null;
}

async function deployPayload(payload) {
  const token = readToken();
  if (!token) throw new Error('No Supabase access token. Run: supabase login');

  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(payload.name)}`;
  const body = {
    slug: payload.name,
    name: payload.name,
    entrypoint_path: payload.entrypoint_path || 'index.ts',
    verify_jwt: payload.verify_jwt,
    files: payload.files,
  };

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
    json = { raw: text.slice(0, 500) };
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  const only = process.argv[2];
  const dir = path.join(__dirname, 'mcp-payloads');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !only || f.replace('.json', '') === only)
    .sort();

  if (!files.length) {
    console.error('No payloads in', dir);
    process.exit(1);
  }

  console.log('Project:', PROJECT_REF, '| payloads:', files.length);
  const results = [];

  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    process.stdout.write(`Deploying ${payload.name} (${payload.files.length} files)... `);
    try {
      const r = await deployPayload(payload);
      const ver = r?.version ?? r?.id ?? 'ok';
      console.log('OK', ver);
      results.push({ name: payload.name, ok: true, version: ver });
    } catch (e) {
      console.log('FAIL');
      console.error(' ', e.message);
      results.push({ name: payload.name, ok: false, error: e.message });
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- Summary ---');
  for (const r of results) {
    console.log(r.ok ? 'OK ' : 'FAIL', r.name, r.version || r.error || '');
  }
  if (failed.length) process.exit(1);
}

main();
