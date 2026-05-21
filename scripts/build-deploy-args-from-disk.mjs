#!/usr/bin/env node
/** Build deploy_edge_function args from mcp-payload metadata + supabase/functions on disk. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node build-deploy-args-from-disk.mjs <function-name>');
  process.exit(1);
}

const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'mcp-payloads', `${fn}.json`), 'utf8'),
);
const fnRoot = path.join(__dirname, '..', 'supabase', 'functions');

const files = payload.files.map((f) => {
  const candidates = [
    path.join(fnRoot, f.name),
    path.join(fnRoot, fn, f.name),
  ];
  const diskPath = candidates.find((p) => fs.existsSync(p));
  if (!diskPath) {
    throw new Error(`Missing on disk: ${f.name}`);
  }
  return {
    name: f.name,
    content: fs.readFileSync(diskPath, 'utf8'),
  };
});

const args = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path,
  verify_jwt: payload.verify_jwt,
  files,
};

const outPath = path.join(__dirname, '.deploy-temp', `${fn}.args.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(args));
console.log(outPath, fs.statSync(outPath).size);
