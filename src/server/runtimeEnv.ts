import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * Loads runtime configuration without depending on a writable application directory.
 * On Cloud Run the only fallback write location is /tmp; durable business data remains
 * in Firestore. On classic hosting a sibling private directory survives release swaps.
 */
export function configureRuntimeEnvironment(): string {
  const projectEnvFile = path.join(process.cwd(), ".env");
  const runningOnCloudRun = Boolean(process.env.K_SERVICE || process.env.K_REVISION || process.env.K_CONFIGURATION) && !process.env.APPLET_ID;
  const defaultPrivateDir = runningOnCloudRun
    ? path.join(process.env.TMPDIR?.trim() || "/tmp", "schedule-private")
    : path.resolve(process.cwd(), "..", "schedule-private");
  const initialPrivateDir = path.resolve(process.env.SCHEDULE_PRIVATE_DIR?.trim() || defaultPrivateDir);
  const initialPrivateEnv = path.join(initialPrivateDir, ".env");

  if (fs.existsSync(initialPrivateEnv)) {
    dotenv.config({ path: initialPrivateEnv });
  } else {
    dotenv.config({ path: projectEnvFile });
    const configuredPrivateDir = path.resolve(process.env.SCHEDULE_PRIVATE_DIR?.trim() || defaultPrivateDir);
    const configuredPrivateEnv = path.join(configuredPrivateDir, ".env");
    if (fs.existsSync(projectEnvFile) && !fs.existsSync(configuredPrivateEnv)) {
      fs.mkdirSync(configuredPrivateDir, { recursive: true, mode: 0o700 });
      fs.copyFileSync(projectEnvFile, configuredPrivateEnv, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(configuredPrivateEnv, 0o600);
    }
    if (fs.existsSync(configuredPrivateEnv)) dotenv.config({ path: configuredPrivateEnv, override: true });
    process.env.SCHEDULE_PRIVATE_DIR = configuredPrivateDir;
  }
  if (!process.env.SCHEDULE_PRIVATE_DIR) process.env.SCHEDULE_PRIVATE_DIR = initialPrivateDir;
  // Cloud Run must serve the compiled release, never Vite development middleware.
  // Keep local development convenient while making source deployments production-safe.
  if (runningOnCloudRun) process.env.NODE_ENV = "production";

  // Auto-inject Firebase configuration if present
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    try {
      const fbConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
      if (fbConfig.projectId && !process.env.FIREBASE_PROJECT_ID) {
        process.env.FIREBASE_PROJECT_ID = fbConfig.projectId;
      }
      if (fbConfig.firestoreDatabaseId && !process.env.FIREBASE_DATABASE_ID) {
        process.env.FIREBASE_DATABASE_ID = fbConfig.firestoreDatabaseId;
      }
    } catch(e) {
      console.error("Failed to parse firebase-applet-config.json", e);
    }
  }

  return process.env.SCHEDULE_PRIVATE_DIR;
}
