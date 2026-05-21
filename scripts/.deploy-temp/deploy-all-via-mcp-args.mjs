#!/usr/bin/env node
/**
 * Deploy all 10 listing functions using Management API.
 * Requires valid token: supabase login OR SUPABASE_ACCESS_TOKEN (full PAT from dashboard).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';

const ORDER = [
  ['listings-sync-one', true],
  ['listings-backfill', false],
  ['mercado-livre-sync-items', false],
  ['shopee-sync-items', false],
  ['mercado-livre-update-metrics', false],
  ['mercado-livre-update-quality', false],
  ['mercado-livre-update-reviews', false],
  ['mercado-livre-sync-prices', false],
  ['mercado-livre-sync-stock-distribution', false],
  ['shopee-webhook-items', false],
];

function getToken() {
  const t = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (t && t.length > 80) return t;
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  for (const rel of ['.supabase/access-token', 'AppData/Roaming/supabase/access-token']) {
    const p = path.join(home, ...rel.split('/'));
    if (fs.existsSync(p)) {
      const file = fs.readFileSync(p, 'utf8').trim();
      if (file.length > 80) return file;
    }
  }
  return null;
}

function loadArgs(fn, verifyJwt) {
  const invokePath = path.join(__dirname, `invoke-${fn}.json`);
  if (!fs.existsSync(invokePath)) {
    execFileSync(process.execPath, [path.join(__dirname, 'write-invoke.mjs'), fn], {
      stdio: 'inherit',
      maxBuffer: 50 * 1024 * 1024,
    });
  }
  const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
  args.verify_jwt = verifyJwt;
  return args;
}

async function deploy(args, token) {
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
      verify_jwt: !!args.verify_jwt,
      files: args.files,
    }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const token = getToken();
if (!token) {
  console.error('Token ausente ou truncado. Use: supabase login');
  console.error('Ou: $env:SUPABASE_ACCESS_TOKEN = "<PAT completo de https://supabase.com/dashboard/account/tokens>"');
  process.exit(1);
}

const results = [];
for (const [fn, verifyJwt] of ORDER) {
  const args = loadArgs(fn, verifyJwt);
  process.stderr.write(`→ ${fn} (${args.files.length} files, verify_jwt=${args.verify_jwt})... `);
  try {
    const r = await deploy(args, token);
    const version = r?.version ?? r?.id ?? '?';
    const status = r?.status ?? 'ACTIVE';
    results.push({ function: fn, version: String(version), success: true, status });
    console.log(`OK v${version} ${status}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ function: fn, version: msg, success: false });
    console.log(`FAIL: ${msg.slice(0, 120)}`);
  }
}

fs.writeFileSync(path.join(__dirname, 'deploy-results.json'), JSON.stringify(results, null, 2));
console.log('\n========== RESUMO ==========');
for (const r of results) {
  console.log(r.success ? '✓' : '✗', r.function, r.version);
}
if (results.some((r) => !r.success)) process.exit(1);
