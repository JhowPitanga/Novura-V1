#!/usr/bin/env node
/**
 * Deploy payloads via Supabase Management API using token from `supabase projects list`.
 * Run: supabase login && node scripts/deploy-via-mcp-node.mjs
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';

function getCliToken() {
  try {
    const out = execSync('supabase projects list -o json', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    JSON.parse(out);
    // If list works, token is valid — read from credentials file
  } catch {
    /* ignore */
  }
  const home = process.env.USERPROFILE || process.env.HOME;
  const paths = [
    path.join(home, '.supabase', 'access-token'),
    path.join(home, 'AppData', 'Roaming', 'supabase', 'access-token'),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  }
  return process.env.SUPABASE_ACCESS_TOKEN?.trim() || null;
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
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const token = getCliToken();
  if (!token) {
    console.error('Token não encontrado. Execute: supabase login');
    process.exit(1);
  }

  // Validate token
  const who = await fetch('https://api.supabase.com/v1/projects', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!who.ok) {
    console.error('Token inválido (HTTP', who.status, '). Execute: supabase login');
    process.exit(1);
  }

  const dir = path.join(__dirname, 'mcp-payloads');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const results = [];

  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    process.stdout.write(`Deploying ${payload.name}... `);
    try {
      const r = await deploy(payload, token);
      console.log('OK v' + (r.version ?? r.id ?? '?'));
      results.push({ name: payload.name, ok: true });
    } catch (e) {
      console.log('FAIL');
      console.error(' ', e.message);
      results.push({ name: payload.name, ok: false });
    }
  }

  if (results.some((r) => !r.ok)) process.exit(1);
}

main();
