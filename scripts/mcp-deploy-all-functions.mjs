#!/usr/bin/env node
/**
 * Deploy all listing edge functions by reading mcp-payloads and calling
 * Supabase Management API. Requires valid token (supabase login or PAT).
 *
 * If this fails with 401, deploy via Cursor MCP tool deploy_edge_function instead:
 *   node scripts/deploy-via-mcp-stdin.mjs <fn>
 * then use user-supabase MCP with scripts/.deploy-temp/<fn>.mcp-args.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  const env = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (env && env.length > 50) return env;
  const home = process.env.USERPROFILE || process.env.HOME;
  for (const rel of ['.supabase/access-token', 'AppData/Roaming/supabase/access-token']) {
    const p = path.join(home, ...rel.split('/'));
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, 'utf8').trim();
      if (t.length > 50) return t;
    }
  }
  return env || null;
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
      verify_jwt: payload.verify_jwt,
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
  const onlyFn = process.argv[2];
  const token = getToken();
  if (!token) {
    console.error('Token ausente. Execute: supabase login');
    console.error('Ou defina SUPABASE_ACCESS_TOKEN (PAT com escopo functions)');
    process.exit(1);
  }

  const check = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!check.ok) {
    console.error('Token inválido HTTP', check.status);
    console.error('Gere PAT: https://supabase.com/dashboard/account/tokens');
    process.exit(1);
  }

  const list = onlyFn
    ? ORDER.filter(([n]) => n === onlyFn)
    : ORDER;
  if (onlyFn && !list.length) {
    console.error('Função desconhecida:', onlyFn);
    process.exit(1);
  }

  const results = [];
  for (const [fn, verifyJwt] of list) {
    const filePath = path.join(__dirname, 'mcp-payloads', `${fn}.json`);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    payload.verify_jwt = verifyJwt;
    process.stdout.write(`→ ${fn} ... `);
    try {
      const r = await deploy(payload, token);
      const v = r?.version ?? r?.id ?? '?';
      console.log(`OK v${v}`);
      results.push({ fn, ok: true, version: v });
    } catch (e) {
      console.log('FALHOU');
      console.error('  ', e.message);
      results.push({ fn, ok: false, error: e.message });
    }
  }

  console.log('\n---');
  for (const r of results) {
    console.log(r.ok ? '✓' : '✗', r.fn, r.version || r.error);
  }
  if (results.some((r) => !r.ok)) process.exit(1);
}

main();
