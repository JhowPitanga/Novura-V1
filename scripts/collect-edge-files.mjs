import fs from "fs";
import path from "path";

const root = "supabase/functions";
const entry = process.argv[2] || "oauth-start-auth/index.ts";
const visited = new Set();
const files = [];

function addFile(rel) {
  rel = rel.replace(/\\/g, "/");
  if (visited.has(rel)) return;
  visited.add(rel);
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.error("MISSING", full);
    return;
  }
  const content = fs.readFileSync(full, "utf8");
  files.push({ name: rel, content });
  const dir = path.dirname(rel);
  for (const m of content.matchAll(/from ["'](\.\.\/[^"']+|\.\/[^"']+)["']/g)) {
    let imp = m[1];
    if (!imp.endsWith(".ts")) imp += ".ts";
    addFile(path.normalize(path.join(dir, imp)).replace(/\\/g, "/"));
  }
}

addFile(entry);
const out = process.argv[3] || "edge-deploy-files.json";
fs.writeFileSync(out, JSON.stringify(files));
console.log(`Wrote ${files.length} files to ${out}`);
