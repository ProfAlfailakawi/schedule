import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";

export const PACKAGED_DATABASE_DIR = path.join(process.cwd(), "database");
export const PACKAGED_DB_JSON = path.join(PACKAGED_DATABASE_DIR, "db.json");
export const PACKAGED_DB_GZIP = path.join(PACKAGED_DATABASE_DIR, "db.json.gz");

export function isCloudRunRuntime(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  if (process.env.APPLET_ID) return false;
  
  const hasCloudRunEnv = Boolean(process.env.K_SERVICE || process.env.K_REVISION || process.env.K_CONFIGURATION);
  if (!hasCloudRunEnv) return false;

  // If DATA_MODE is explicitly set to firestore, always treat as Cloud Run runtime.
  if (process.env.DATA_MODE?.toLowerCase() === "firestore") return true;

  // Otherwise, only treat as Cloud Run runtime if Firebase/Firestore is actually configured via the applet config.
  // This prevents crashing on startup when sharing or deploying the app before Firebase is set up.
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf8").trim();
      if (content.length > 0) {
        const parsed = JSON.parse(content);
        if (parsed.projectId || parsed.firebaseProjectId) return true;
      }
    }
  } catch {
    // Ignore read/parse errors
  }

  return false;
}

export function defaultPrivateDirectory(): string {
  if (isCloudRunRuntime()) return path.join(process.env.TMPDIR?.trim() || "/tmp", "schedule-private");
  return path.resolve(process.cwd(), "..", "schedule-private");
}

export function packagedSnapshotPath(): string | null {
  if (fs.existsSync(PACKAGED_DB_JSON)) return PACKAGED_DB_JSON;
  if (fs.existsSync(PACKAGED_DB_GZIP)) return PACKAGED_DB_GZIP;
  return null;
}

export function readJsonSnapshot<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath);
  const text = filePath.toLowerCase().endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  return JSON.parse(text) as T;
}

export function materializePackagedSnapshotOnce(destination: string): void {
  if (fs.existsSync(destination)) return;
  const source = packagedSnapshotPath();
  if (!source) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  const payload = source.toLowerCase().endsWith(".gz") ? gunzipSync(fs.readFileSync(source)) : fs.readFileSync(source);
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(descriptor, payload); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, destination);
  fs.chmodSync(destination, 0o600);
}
