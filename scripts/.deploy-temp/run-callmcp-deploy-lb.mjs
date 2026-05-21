#!/usr/bin/env node
/**
 * Reads assembled deploy args and prints a single-line instruction payload.
 * Agent: pass JSON.parse(stdout) to CallMcpTool deploy_edge_function arguments.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, 'assembled-out.json');
if (!fs.existsSync(outPath)) {
  execFileSync(process.execPath, [path.join(__dirname, 'assemble-deploy-args.mjs'), 'listings-backfill'], {
    stdio: ['inherit', 'pipe', 'inherit'],
    maxBuffer: 50 * 1024 * 1024,
  });
  // assemble writes to stdout only; regenerate
}
const args = JSON.parse(
  execFileSync(process.execPath, [path.join(__dirname, 'assemble-deploy-args.mjs'), 'listings-backfill'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  }),
);
const summary = {
  name: args.name,
  entrypoint_path: args.entrypoint_path,
  verify_jwt: args.verify_jwt,
  file_count: args.files.length,
  bytes: JSON.stringify(args).length,
  file_names: args.files.map((f) => f.name),
};
console.log(JSON.stringify({ summary, deploy_args: args }));
