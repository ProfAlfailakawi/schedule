/**
 * Decides which Firestore project/database the server connects to.
 *
 * Pure functions only: no I/O, no Firestore client. The caller supplies the
 * environment and the parsed firebase-applet-config.json so every rule here can
 * be tested without touching a real database.
 *
 * Precedence (unchanged from the previous inline logic in runtimeEnv.ts):
 *  - Cloud Run, default: the applet config file wins, the environment fills gaps.
 *  - Elsewhere (local/dev): explicit environment variables win, the file fills gaps.
 *  - Cloud Run with FIREBASE_CONFIG_SOURCE=environment (opt-in, off by default):
 *    the environment is the single source and must be complete; the file may not
 *    contradict it.
 */

export type FirestoreConfigSource = "applet-config" | "environment";

export interface AppletFirebaseConfig {
  projectId?: unknown;
  firestoreDatabaseId?: unknown;
}

export interface FirestoreTargetInput {
  env: Record<string, string | undefined>;
  fileConfig: AppletFirebaseConfig | null;
  runningOnCloudRun: boolean;
}

export interface FirestoreTarget {
  projectId: string;
  databaseId: string;
  source: FirestoreConfigSource;
  warnings: string[];
}

const DEFAULT_DATABASE_ID = "(default)";

function clean(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

export function resolveFirestoreTarget({ env, fileConfig, runningOnCloudRun }: FirestoreTargetInput): FirestoreTarget {
  const envProject = clean(env.FIREBASE_PROJECT_ID);
  const envDatabase = clean(env.FIREBASE_DATABASE_ID);
  const fileProject = clean(fileConfig?.projectId);
  const fileDatabase = clean(fileConfig?.firestoreDatabaseId);
  const warnings: string[] = [];

  if (runningOnCloudRun && clean(env.FIREBASE_CONFIG_SOURCE).toLowerCase() === "environment") {
    if (!envProject || !envDatabase) {
      throw new Error("FIREBASE_CONFIG_SOURCE=environment requires both FIREBASE_PROJECT_ID and FIREBASE_DATABASE_ID to be set explicitly.");
    }
    if (fileProject && fileProject !== envProject) {
      throw new Error(`FIREBASE_PROJECT_ID (${envProject}) contradicts firebase-applet-config.json (${fileProject}); refusing to choose silently.`);
    }
    if (fileDatabase && fileDatabase !== envDatabase) {
      throw new Error(`FIREBASE_DATABASE_ID (${envDatabase}) contradicts firebase-applet-config.json (${fileDatabase}); refusing to choose silently.`);
    }
    return { projectId: envProject, databaseId: envDatabase, source: "environment", warnings };
  }

  if (runningOnCloudRun) {
    if (envProject && fileProject && envProject !== fileProject) {
      warnings.push(`Cloud Run FIREBASE_PROJECT_ID (${envProject}) is ignored: firebase-applet-config.json (${fileProject}) takes precedence.`);
    }
    if (envDatabase && fileDatabase && envDatabase !== fileDatabase) {
      warnings.push(`Cloud Run FIREBASE_DATABASE_ID (${envDatabase}) is ignored: firebase-applet-config.json (${fileDatabase}) takes precedence.`);
    }
    return {
      projectId: fileProject || envProject,
      databaseId: fileDatabase || envDatabase,
      source: fileDatabase ? "applet-config" : "environment",
      warnings,
    };
  }

  return {
    projectId: envProject || fileProject,
    databaseId: envDatabase || fileDatabase,
    source: envDatabase || !fileDatabase ? "environment" : "applet-config",
    warnings,
  };
}

/**
 * Production must name its database explicitly. A missing or "(default)" id would
 * make the client connect to a different database than the one holding the
 * university's records, and an empty one looks healthy.
 */
export function assertExplicitProductionTarget(target: { projectId?: string; databaseId?: string }): void {
  const projectId = clean(target.projectId);
  const databaseId = clean(target.databaseId);
  if (!projectId) throw new Error("Refusing to start on Cloud Run: FIREBASE_PROJECT_ID is not set.");
  if (!databaseId || databaseId.toLowerCase() === DEFAULT_DATABASE_ID) {
    throw new Error("Refusing to start on Cloud Run: FIREBASE_DATABASE_ID must name the production database explicitly (missing or \"(default)\").");
  }
}
