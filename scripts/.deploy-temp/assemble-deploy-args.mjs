#!/usr/bin/env node
/** Assemble deploy_edge_function args from mcp-call-args or file-chunks. Writes to stdout. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fn = process.argv[2];
if (!fn) {
  console.error('Usage: node assemble-deploy-args.mjs <function-name>');
  process.exit(1);
}

const argsPath = path.join(__dirname, 'mcp-call-args', `${fn}.json`);
const payloadPath = path.join(__dirname, '..', 'mcp-payloads', `${fn}.json`);

let args;
if (fs.existsSync(argsPath)) {
  args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
} else if (fs.existsSync(payloadPath)) {
  const p = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  args = {
    name: p.name,
    entrypoint_path: p.entrypoint_path || 'index.ts',
    verify_jwt: p.verify_jwt,
    files: p.files,
  };
} else {
  const chunkDir = path.join(__dirname, 'file-chunks', fn);
  const metaPath = path.join(chunkDir, 'meta.json');
  const chunksDir = path.join(__dirname, 'chunks', fn);
  const metaFile = path.join(chunksDir, '_meta.json');

  if (fs.existsSync(chunkDir) && fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const files = [];
    for (let i = 0; i < meta.count; i++) {
      files.push(JSON.parse(fs.readFileSync(path.join(chunkDir, `f${i}.json`), 'utf8')));
    }
    args = {
      name: meta.name,
      entrypoint_path: meta.entrypoint_path || 'index.ts',
      verify_jwt: meta.verify_jwt,
      files,
    };
  } else if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const files = meta.files.map((f) => ({
      name: f.name,
      content: fs.readFileSync(path.join(chunksDir, f.chunk), 'utf8'),
    }));
    args = {
      name: meta.name,
      entrypoint_path: meta.entrypoint_path || 'index.ts',
      verify_jwt: meta.verify_jwt,
      files,
    };
  } else {
    console.error('No payload found for', fn);
    process.exit(1);
  }
}

process.stdout.write(JSON.stringify(args));
