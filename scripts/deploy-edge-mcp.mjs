#!/usr/bin/env node
/**
 * Deploy edge functions using Supabase Management API.
 * Usage:
 *   $env:SUPABASE_ACCESS_TOKEN = "<pat from https://supabase.com/dashboard/account/tokens>"
 *   node scripts/deploy-edge-mcp.mjs
 *
 * Or after: supabase login  (refresh token in ~/.supabase/access-token)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'frwnfukydjwilfobxxhw';

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  for (const rel of ['.supabase/access-token', 'AppData/Roaming/supabase/access-token']) {
    const p = path.join(home, ...rel.split('/'));
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, 'utf8').trim();
      if (t) return t;
    }
  }
  return null;
}

async function deploy(payload, token) {
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
    body = { raw: text.slice(0, 400) };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const token = getToken();
  if (!token) {
    console.error(
      'Token ausente. Defina SUPABASE_ACCESS_TOKEN ou execute: supabase login\n' +
        'PAT: https://supabase.com/dashboard/account/tokens',
    );
    process.exit(1);
  }

  const check = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!check.ok) {
    console.error('Token inválido para o projeto', PROJECT_REF, 'HTTP', check.status);
    console.error('Gere um novo PAT em https://supabase.com/dashboard/account/tokens');
    process.exit(1);
  }

  const dir = path.join(__dirname, 'mcp-payloads');
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const results = [];

  for (const file of names) {
    const payload = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    process.stdout.write(`→ ${payload.name} (${payload.files.length} arquivos)... `);
    try {
      const r = await deploy(payload, token);
      const v = r?.version ?? r?.id ?? 'ok';
      console.log(`OK (v${v})`);
      results.push({ name: payload.name, ok: true, version: v });
    } catch (e) {
      console.log('FALHOU');
      console.error(`  ${e.message}`);
      results.push({ name: payload.name, ok: false, error: e.message });
    }
  }

  console.log('\n========== RESUMO ==========');
  for (const r of results) {
    console.log(r.ok ? '✓' : '✗', r.name, r.version || r.error || '');
  }

  if (results.some((r) => !r.ok)) process.exit(1);
  console.log('\nDeploy concluído:', results.length, 'functions');
}

main();
