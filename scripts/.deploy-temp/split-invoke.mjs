#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, 'invoke-listings-backfill.json');
const s = fs.readFileSync(p, 'utf8');
const mid = Math.floor(s.length / 2);
let split = s.lastIndexOf('},{"name":', mid);
if (split < 0) split = mid;
const partA = s.slice(0, split);
const partB = s.slice(split + 1);
fs.writeFileSync(path.join(__dirname, 'invoke-partA.txt'), partA);
fs.writeFileSync(path.join(__dirname, 'invoke-partB.txt'), partB);
console.log('split', split, 'A', partA.length, 'B', partB.length);
