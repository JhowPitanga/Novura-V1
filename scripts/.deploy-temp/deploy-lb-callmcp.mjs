#!/usr/bin/env node
/**
 * Reads DEPLOY-LB-ARGS.json and writes deploy request for agent CallMcpTool.
 * Agent must: CallMcpTool user-supabase deploy_edge_function with JSON.parse(fs.readFileSync(outPath))
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = JSON.parse(fs.readFileSync(path.join(__dirname, 'DEPLOY-LB-ARGS.json'), 'utf8'));
const outPath = path.join(__dirname, 'CALLMCP-DEPLOY-LB-NOW.json');
fs.writeFileSync(outPath, JSON.stringify(args));
console.log(JSON.stringify({ outPath, bytes: JSON.stringify(args).length, files: args.files.length }));
