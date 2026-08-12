import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, "database");
const privateDir = path.resolve(process.env.SCHEDULE_PRIVATE_DIR?.trim() || path.join(projectRoot, "..", "schedule-private"));
const backupDir = path.join(privateDir, "backups");

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function copyOnce(source, destination, required = true) {
  if (fs.existsSync(destination)) {
    if (fs.existsSync(source) && digest(source) !== digest(destination)) {
      console.log(`Persistent file is newer/different and was kept unchanged: ${destination}`);
    } else {
      console.log(`Protected already: ${destination}`);
    }
    return;
  }
  if (!fs.existsSync(source)) {
    if (required) throw new Error(`Required source file is missing: ${source}`);
    console.log(`Optional file not present: ${source}`);
    return;
  }
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(destination, 0o600);
  console.log(`Protected: ${source} -> ${destination}`);
}

fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });

const sourceDb = path.join(sourceDir, "db.json");
const sourceDbGzip = path.join(sourceDir, "db.json.gz");
const persistentDbTarget = path.join(privateDir, "db.json");
if (!fs.existsSync(persistentDbTarget)) {
  if (fs.existsSync(sourceDb)) copyOnce(sourceDb, persistentDbTarget);
  else if (fs.existsSync(sourceDbGzip)) {
    const temporary = `${persistentDbTarget}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, zlib.gunzipSync(fs.readFileSync(sourceDbGzip)), { mode: 0o600 });
    fs.renameSync(temporary, persistentDbTarget);
    console.log(`Protected compressed snapshot: ${sourceDbGzip} -> ${persistentDbTarget}`);
  } else throw new Error(`Required source snapshot is missing: ${sourceDb} or ${sourceDbGzip}`);
}
copyOnce(path.join(sourceDir, "legacy-password-vault.key"), path.join(privateDir, "legacy-password-vault.key"));
copyOnce(path.join(projectRoot, ".env"), path.join(privateDir, ".env"));

const persistentDb = path.join(privateDir, "db.json");
copyOnce(persistentDb, path.join(privateDir, "db.json.backup"));
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const immutableBackup = path.join(backupDir, `db-${timestamp}.json`);
fs.copyFileSync(persistentDb, immutableBackup, fs.constants.COPYFILE_EXCL);
fs.chmodSync(immutableBackup, 0o600);

const manifest = {
  protectedAt: new Date().toISOString(),
  privateDir,
  database: { file: persistentDb, sha256: digest(persistentDb) },
  backup: { file: immutableBackup, sha256: digest(immutableBackup) }
};
fs.writeFileSync(path.join(privateDir, "protection-manifest.json"), JSON.stringify(manifest, null, 2), { encoding: "utf8", mode: 0o600 });

console.log("Private runtime state is now outside the replaceable project directory.");
console.log(`Set SCHEDULE_PRIVATE_DIR=${privateDir} in the hosting environment before the next upload.`);
