#!/usr/bin/env node
/**
 * Decode callmcp-args and deploy via Management API.
 * Token: SUPABASE_ACCESS_TOKEN (full PAT 80+ chars) or pass as argv[3].
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'frwnfukydjwilfobxxhw';
const fn = process.argv[2];
const token = (process.argv[3] || process.env.SUPABASE_ACCESS_TOKEN || '').trim();

if (!fn) {
  console.error('Usage: node deploy-from-callmcp-args.mjs <fn> [token]');
  process.exit(1);
}

const args = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'callmcp-args', `${fn}.json`), 'utf8'),
);

async function deploy() {
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
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

if (!token || token.length < 60) {
  console.log(
    JSON.stringify({
      fn,
      ok: false,
      need: 'full_pat',
      tokenLen: token.length,
      hint: 'Use CallMcpTool user-supabase deploy_edge_function',
    }),
  );
  process.exit(0);
}

try {
  const body = await deploy();
  console.log(
    JSON.stringify({
      fn,
      ok: true,
      version: String(body.version ?? body.id ?? '?'),
      status: body.status ?? 'ACTIVE',
    }),
  );
} catch (e) {
  console.log(JSON.stringify({ fn, ok: false, error: e.message }));
  process.exit(1);
}
