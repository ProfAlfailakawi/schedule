import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const gzipPath = path.join(root, "database", "db.json.gz");
const plainPath = path.join(root, "database", "db.json");
const ignorePath = path.join(root, ".gcloudignore");
const errors = [];
const warnings = [];

if (!fs.existsSync(gzipPath)) errors.push("database/db.json.gz is missing");
if (!fs.existsSync(plainPath)) warnings.push("database/db.json is absent from the editable workspace; AI Studio may show it as a deletion when replacing an existing project.");
if (fs.existsSync(path.join(root, "node_modules"))) errors.push("node_modules must not be inside the upload ZIP");

let ignore = "";
if (fs.existsSync(ignorePath)) ignore = fs.readFileSync(ignorePath, "utf8");
for (const required of ["database/db.json", "dist/"]) {
  if (!ignore.split(/\r?\n/).some((line) => line.trim() === required)) {
    errors.push(`.gcloudignore must contain ${required} so Cloud Run source deployment stays compact`);
  }
}

if (fs.existsSync(gzipPath)) {
  try {
    const parsed = JSON.parse(zlib.gunzipSync(fs.readFileSync(gzipPath)).toString("utf8"));
    if (!Array.isArray(parsed.schedules) || parsed.schedules.length !== 15430) {
      errors.push("compressed snapshot count check failed");
    }
  } catch (e) {
    errors.push(`compressed snapshot cannot be read: ${e.message}`);
  }
}

if (fs.existsSync(plainPath) && fs.existsSync(gzipPath)) {
  try {
    const plain = fs.readFileSync(plainPath);
    const zipped = zlib.gunzipSync(fs.readFileSync(gzipPath));
    if (!plain.equals(zipped)) errors.push("database/db.json and database/db.json.gz do not contain identical data");
  } catch (e) {
    errors.push(`database snapshot parity check failed: ${e.message}`);
  }
}

const size = (p) => fs.existsSync(p) ? fs.statSync(p).size : 0;
console.log(JSON.stringify({
  workspaceMode: "AI Studio merge-safe",
  plainJsonBytes: size(plainPath),
  gzipBytes: size(gzipPath),
  distPreserved: fs.existsSync(path.join(root, "dist", "index.html")),
  cloudIgnoreProtectsUpload: errors.every((e) => !e.startsWith(".gcloudignore")),
  warnings,
  errors
}, null, 2));
if (errors.length) process.exit(1);
