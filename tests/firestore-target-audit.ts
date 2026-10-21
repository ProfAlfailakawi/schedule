/**
 * Firestore target selection audit — offline. It opens no Firestore client and
 * reads no data; it only proves which project/database the server WOULD select.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { assertExplicitProductionTarget, resolveFirestoreTarget } from "../src/server/firestoreTarget";
import { configureRuntimeEnvironment } from "../src/server/runtimeEnv";

const PROJECT = "gen-lang-client-0379571946";
const DATABASE = "ai-studio-schedule-337bbbf5-1098-44cb-aabf-95536daf9106";
const file = { projectId: PROJECT, firestoreDatabaseId: DATABASE };
let checks = 0;
const check = (name: string, fn: () => void) => { fn(); checks++; console.log(`  ✓ ${name}`); };

console.log("resolveFirestoreTarget");
check("Cloud Run: applet config still takes precedence over the environment (unchanged behavior)", () => {
  const t = resolveFirestoreTarget({ env: { FIREBASE_DATABASE_ID: "other-db" }, fileConfig: file, runningOnCloudRun: true });
  assert.equal(t.databaseId, DATABASE);
  assert.equal(t.source, "applet-config");
  assert.equal(t.warnings.length, 1);
});
check("Cloud Run: matching environment raises no warning", () => {
  const t = resolveFirestoreTarget({ env: { FIREBASE_PROJECT_ID: PROJECT, FIREBASE_DATABASE_ID: DATABASE }, fileConfig: file, runningOnCloudRun: true });
  assert.deepEqual([t.projectId, t.databaseId, t.warnings.length], [PROJECT, DATABASE, 0]);
});
check("Cloud Run: environment fills in when the file names no database", () => {
  const t = resolveFirestoreTarget({ env: { FIREBASE_PROJECT_ID: PROJECT, FIREBASE_DATABASE_ID: DATABASE }, fileConfig: { projectId: PROJECT }, runningOnCloudRun: true });
  assert.deepEqual([t.databaseId, t.source], [DATABASE, "environment"]);
});
check("Local: environment wins over the file (unchanged behavior)", () => {
  const t = resolveFirestoreTarget({ env: { FIREBASE_DATABASE_ID: "schedule-drill" }, fileConfig: file, runningOnCloudRun: false });
  assert.equal(t.databaseId, "schedule-drill");
  assert.equal(t.source, "environment");
});
check("Local: file fills in when the environment is empty (unchanged behavior)", () => {
  const t = resolveFirestoreTarget({ env: {}, fileConfig: file, runningOnCloudRun: false });
  assert.deepEqual([t.projectId, t.databaseId, t.source], [PROJECT, DATABASE, "applet-config"]);
});
check("Never invents a database id", () => {
  const t = resolveFirestoreTarget({ env: {}, fileConfig: null, runningOnCloudRun: true });
  assert.equal(t.databaseId, "");
});
check("Opt-in environment source: environment is used when file agrees", () => {
  const env = { FIREBASE_CONFIG_SOURCE: "environment", FIREBASE_PROJECT_ID: PROJECT, FIREBASE_DATABASE_ID: DATABASE };
  assert.equal(resolveFirestoreTarget({ env, fileConfig: file, runningOnCloudRun: true }).source, "environment");
  assert.equal(resolveFirestoreTarget({ env, fileConfig: { projectId: PROJECT }, runningOnCloudRun: true }).databaseId, DATABASE);
});
check("Opt-in environment source: incomplete environment is refused", () => {
  assert.throws(() => resolveFirestoreTarget({ env: { FIREBASE_CONFIG_SOURCE: "environment", FIREBASE_PROJECT_ID: PROJECT }, fileConfig: file, runningOnCloudRun: true }), /requires both/);
});
check("Opt-in environment source: contradicting file is refused", () => {
  const env = { FIREBASE_CONFIG_SOURCE: "environment", FIREBASE_PROJECT_ID: PROJECT, FIREBASE_DATABASE_ID: "other-db" };
  assert.throws(() => resolveFirestoreTarget({ env, fileConfig: file, runningOnCloudRun: true }), /contradicts/);
});
check("FIREBASE_CONFIG_SOURCE is inert outside Cloud Run", () => {
  const t = resolveFirestoreTarget({ env: { FIREBASE_CONFIG_SOURCE: "environment" }, fileConfig: file, runningOnCloudRun: false });
  assert.equal(t.databaseId, DATABASE);
});

console.log("assertExplicitProductionTarget");
check("accepts the production target", () => assertExplicitProductionTarget({ projectId: PROJECT, databaseId: DATABASE }));
check("rejects missing database", () => assert.throws(() => assertExplicitProductionTarget({ projectId: PROJECT, databaseId: "" }), /DATABASE_ID/));
check("rejects (default) database", () => assert.throws(() => assertExplicitProductionTarget({ projectId: PROJECT, databaseId: "(default)" }), /DATABASE_ID/));
check("rejects missing project", () => assert.throws(() => assertExplicitProductionTarget({ projectId: "", databaseId: DATABASE }), /PROJECT_ID/));

console.log("configureRuntimeEnvironment against the repository's real firebase-applet-config.json");
const keys = ["FIREBASE_PROJECT_ID", "FIREBASE_DATABASE_ID", "FIREBASE_CONFIG_SOURCE", "K_SERVICE", "K_REVISION", "K_CONFIGURATION", "APPLET_ID", "SCHEDULE_PRIVATE_DIR", "NODE_ENV", "DATA_MODE", "AUTO_IMPORT_LEGACY_DATA"];
const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
const restore = () => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "firestore-target-"));
try {
  for (const k of keys) delete process.env[k];
  process.env.K_SERVICE = "schedule";
  process.env.SCHEDULE_PRIVATE_DIR = privateDir;
  // A stale or hostile environment value must not redirect the production revision.
  process.env.FIREBASE_DATABASE_ID = "(default)";
  check("Cloud Run revision resolves to the production database, never (default)", () => {
    configureRuntimeEnvironment();
    assert.equal(process.env.FIREBASE_PROJECT_ID, PROJECT);
    assert.equal(process.env.FIREBASE_DATABASE_ID, DATABASE);
    assert.equal(process.env.DATA_MODE, "firestore");
    assert.equal(process.env.AUTO_IMPORT_LEGACY_DATA, "false");
    assertExplicitProductionTarget({ projectId: process.env.FIREBASE_PROJECT_ID, databaseId: process.env.FIREBASE_DATABASE_ID });
  });
  const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
  check("checked-in config still names the production database", () => {
    assert.equal(config.projectId, PROJECT);
    assert.equal(config.firestoreDatabaseId, DATABASE);
  });
} finally {
  restore();
  fs.rmSync(privateDir, { recursive: true, force: true });
}

console.log(`\nfirestore-target audit: ${checks} checks passed`);
