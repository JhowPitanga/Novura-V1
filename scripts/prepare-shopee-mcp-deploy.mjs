import fs from "fs";

const slim = JSON.parse(fs.readFileSync("shopee-mcp-deploy-slim.json", "utf8"));
const files = slim.files.map((f) => ({
  name: f.name.replace(/^shopee-start-auth\//, ""),
  content: f.content,
}));

const payload = {
  name: "shopee-start-auth",
  entrypoint_path: "index.ts",
  verify_jwt: true,
  files,
};

fs.writeFileSync("shopee-mcp-ready.json", JSON.stringify(payload));
console.log("ready", files.length, "files", files.map((f) => f.name).join(", "));
