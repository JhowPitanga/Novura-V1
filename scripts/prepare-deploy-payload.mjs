import fs from "fs";

const payload = {
  name: "oauth-start-auth",
  entrypoint_path: "oauth-start-auth/index.ts",
  verify_jwt: true,
  files: JSON.parse(fs.readFileSync("edge-oauth-start-auth.json", "utf8")),
};

fs.writeFileSync("edge-deploy-payload.json", JSON.stringify(payload));
console.log("payload ready", payload.files.length, "files");
