#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '_mcp-deploy-args-utf8.json');
process.stdout.write(fs.readFileSync(src, 'utf8'));
