import fs from "fs";
import { gunzipSync } from "zlib";
import { createHash, randomBytes, scryptSync } from "crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { DocumentReference, CollectionReference } from "firebase-admin/firestore";

const file = process.argv[2];
const replaceTarget = process.argv.includes("--replace") || process.env.MIGRATION_REPLACE === "true";
if (!file) throw new Error("Usage: tsx scripts/import-legacy-json.ts <legacy-export.json> [--replace]");
import dotenv from "dotenv";
dotenv.config();
if (!getApps().length) initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
const db = process.env.FIREBASE_DATABASE_ID ? getFirestore(getApps()[0], process.env.FIREBASE_DATABASE_ID) : getFirestore();
const rawSource = fs.readFileSync(file);
const source = JSON.parse(file.toLowerCase().endsWith(".gz") ? gunzipSync(rawSource).toString("utf8") : rawSource.toString("utf8"));

function passwordHash(value: string) {
  const salt = randomBytes(16);
  const digest = scryptSync(value, salt, 64);
  return `scrypt$${salt.toString("hex")}$${digest.toString("hex")}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function canonicalDigest(rows: Record<string, unknown>[]) {
  const serialized = rows.map(row => JSON.stringify(canonicalize(row))).sort();
  return createHash("sha256").update(JSON.stringify(serialized)).digest("hex");
}

interface ImportSet {
  collection: string;
  rows: Record<string, unknown>[];
  idOf: (row: Record<string, unknown>) => string;
  transform?: (row: Record<string, unknown>) => Record<string, unknown>;
}

const sets: ImportSet[] = [
  {
    collection: "users",
    rows: source.users || [],
    idOf: row => `user_${row.SystemUserId}`,
    transform: original => {
      const row = { ...original };
      if (typeof row.SystemUserPass === "string" && !row.SystemUserPass.startsWith("scrypt$")) {
        row.SystemUserPass = passwordHash(row.SystemUserPass);
      }
      return row;
    }
  },
  {
    collection: "formNames",
    rows: source.formNames || [],
    idOf: row => `form_${row.FormNameId ?? row.FormName_Id}`,
    transform: original => {
      const row = { ...original };
      const legacyId = row.FormNameId ?? row.FormName_Id;
      const legacyName = row.FormName ?? row.Name;
      row.FormNameId = Number(legacyId);
      row.FormName = String(legacyName ?? "");
      if (row.FormName_Id != null) delete row.FormName_Id;
      if (row.Name != null) delete row.Name;
      return row;
    }
  },
  {
    collection: "formSecurity",
    rows: source.formSecurity || [],
    idOf: row => row.legacyId != null ? `permission_${row.legacyId}` : `user_${row.SystemUserId ?? row.SystemUser_Id}_form_${row.FormNameId ?? row.FormName_Id}`,
    transform: original => {
      const row = { ...original };
      if (row.Id != null) row.legacyId = Number(row.Id);
      row.SystemUserId = Number(row.SystemUserId ?? row.SystemUser_Id);
      row.FormNameId = Number(row.FormNameId ?? row.FormName_Id);
      delete row.Id;
      delete row.SystemUser_Id;
      delete row.FormName_Id;
      return row;
    }
  },
  {
    collection: "userScopes",
    rows: source.collegeUserAssign || [],
    idOf: row => row.legacyId != null ? `scope_${row.legacyId}` : `user_${row.SystemUserId ?? row.SystemUser_Id}_college_${row.AdCollegeId ?? row.AdCollege_Id}_section_${row.AdSectionId ?? row.AdSection_Id}`,
    transform: original => {
      const row = { ...original };
      if (row.Id != null) row.legacyId = Number(row.Id);
      row.SystemUserId = Number(row.SystemUserId ?? row.SystemUser_Id);
      row.AdCollegeId = Number(row.AdCollegeId ?? row.AdCollege_Id);
      row.AdSectionId = Number(row.AdSectionId ?? row.AdSection_Id);
      delete row.Id; delete row.SystemUser_Id; delete row.AdCollege_Id; delete row.AdSection_Id;
      return row;
    }
  },
  { collection: "terms", rows: source.terms || [], idOf: row => `term_${row.AdTermId}` },
  { collection: "colleges", rows: source.colleges || [], idOf: row => `college_${row.AdCollegeId}` },
  { collection: "sections", rows: source.sections || [], idOf: row => `section_${row.AdSectionId}` },
  { collection: "instructors", rows: source.instructors || [], idOf: row => `instructor_${row.AdInstructorId}` },
  { collection: "courses", rows: source.courses || [], idOf: row => `course_${row.AdCourseId}` },
  {
    collection: "schedules",
    rows: source.schedules || [],
    idOf: row => `schedule_${row.id ?? row.ID}`,
    transform: original => {
      const row = { ...original };
      if (row.id == null && row.ID != null) {
        row.id = row.ID;
        delete row.ID;
      }
      return row;
    }
  },
  { collection: "rooms", rows: source.rooms || [], idOf: row => `room_${row.AdRoomId}` }
];

async function deleteDocumentTree(docRef: DocumentReference): Promise<void> {
  const subcollections = await docRef.listCollections();
  for (const subcollection of subcollections) await deleteCollectionTree(subcollection);
  await docRef.delete();
}

async function deleteCollectionTree(collectionRef: CollectionReference): Promise<void> {
  while (true) {
    const snapshot = await collectionRef.limit(200).get();
    if (snapshot.empty) break;
    for (const doc of snapshot.docs) await deleteDocumentTree(doc.ref);
  }
}

if (replaceTarget) {
  console.log("--replace enabled: clearing existing SCHEDULE Firestore collections before import...");
  for (const item of sets) await deleteCollectionTree(db.collection(item.collection));
  await deleteCollectionTree(db.collection("legacyArchive"));
  await db.doc("_meta/counters").delete().catch(() => undefined);
}

// This is intentionally a one-time migration into an empty/new Firestore database.
// Refuse to merge silently into existing business data because that could leave stale documents.
if (!replaceTarget && process.env.MIGRATION_ALLOW_NONEMPTY !== "true") {
  for (const item of sets) {
    const snapshot = await db.collection(item.collection).limit(1).get();
    if (!snapshot.empty) {
      throw new Error(`Firestore collection '${item.collection}' is not empty. Use a clean target or explicitly set MIGRATION_ALLOW_NONEMPTY=true after review.`);
    }
  }
}

const verification: Array<{ collection: string; count: number; sha256: string }> = [];

for (const item of sets) {
  const transformed = item.rows.map(original => item.transform ? item.transform(original) : { ...original });
  let batch = db.batch();
  let pending = 0;
  for (const row of transformed) {
    batch.set(db.collection(item.collection).doc(item.idOf(row)), row, { merge: false });
    pending++;
    if (pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending) await batch.commit();

  const destinationSnapshot = await db.collection(item.collection).get();
  const destinationRows = destinationSnapshot.docs.map(doc => doc.data() as Record<string, unknown>);
  const expectedDigest = canonicalDigest(transformed);
  const actualDigest = canonicalDigest(destinationRows);
  if (destinationRows.length !== transformed.length || expectedDigest !== actualDigest) {
    throw new Error(
      `Migration verification failed for ${item.collection}: source=${transformed.length}, destination=${destinationRows.length}, sourceSha=${expectedDigest}, destinationSha=${actualDigest}`
    );
  }
  verification.push({ collection: item.collection, count: transformed.length, sha256: expectedDigest });
  console.log(`${item.collection}: count=${transformed.length} sha256=${expectedDigest} verified=true`);
}

const counters = {
  users: Math.max(0, ...(source.users || []).map((row: Record<string, unknown>) => Number(row.SystemUserId) || 0)),
  formSecurity: Math.max(0, ...(source.formSecurity || []).map((row: Record<string, unknown>) => Number(row.legacyId ?? row.Id) || 0)),
  userScopes: Math.max(0, ...(source.collegeUserAssign || []).map((row: Record<string, unknown>) => Number(row.legacyId ?? row.Id) || 0)),
  terms: Math.max(0, ...(source.terms || []).map((row: Record<string, unknown>) => Number(row.AdTermId) || 0)),
  colleges: Math.max(0, ...(source.colleges || []).map((row: Record<string, unknown>) => Number(row.AdCollegeId) || 0)),
  sections: Math.max(0, ...(source.sections || []).map((row: Record<string, unknown>) => Number(row.AdSectionId) || 0)),
  instructors: Math.max(0, ...(source.instructors || []).map((row: Record<string, unknown>) => Number(row.AdInstructorId) || 0)),
  courses: Math.max(0, ...(source.courses || []).map((row: Record<string, unknown>) => Number(row.AdCourseId) || 0)),
  schedules: Math.max(0, ...(source.schedules || []).map((row: Record<string, unknown>) => Number(row.id ?? row.ID) || 0))
};
await db.doc("_meta/counters").set(counters, { merge: true });

// Optional preservation of legacy/historical tables that are not used by the active SCHEDULE app.
// Expected JSON shape: { "legacyArchive": { "OriginalTableName": [ { ...row }, ... ] } }
// Rows are preserved verbatim in Firestore subcollections so no historical table needs to be discarded.
const archiveVerification: Array<{ table: string; count: number; sha256: string }> = [];
const legacyArchive = source.legacyArchive && typeof source.legacyArchive === "object" ? source.legacyArchive : {};
for (const [tableName, rawRows] of Object.entries(legacyArchive as Record<string, unknown>)) {
  if (!Array.isArray(rawRows)) throw new Error(`legacyArchive.${tableName} must be an array`);
  const rows = rawRows as Record<string, unknown>[];
  const safeTableId = String(tableName).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120) || "unknown_table";
  const tableRef = db.collection("legacyArchive").doc(safeTableId);
  const existing = await tableRef.collection("rows").limit(1).get();
  if (!existing.empty && !replaceTarget && process.env.MIGRATION_ALLOW_NONEMPTY !== "true") {
    throw new Error(`Legacy archive table '${tableName}' is not empty in Firestore.`);
  }
  let batch = db.batch();
  let pending = 0;
  for (let index = 0; index < rows.length; index++) {
    batch.set(tableRef.collection("rows").doc(`row_${String(index + 1).padStart(9, "0")}`), rows[index], { merge: false });
    pending++;
    if (pending === 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
  if (pending) await batch.commit();
  await tableRef.set({ originalTableName: tableName, rowCount: rows.length }, { merge: false });
  const destination = await tableRef.collection("rows").get();
  const destinationRows = destination.docs.map(doc => doc.data() as Record<string, unknown>);
  const expectedDigest = canonicalDigest(rows);
  const actualDigest = canonicalDigest(destinationRows);
  if (destinationRows.length !== rows.length || expectedDigest !== actualDigest) {
    throw new Error(`Archive verification failed for ${tableName}`);
  }
  archiveVerification.push({ table: tableName, count: rows.length, sha256: expectedDigest });
  console.log(`legacyArchive/${tableName}: count=${rows.length} sha256=${expectedDigest} verified=true`);
}

const verificationFile = `${file}.firestore-verification.json`;
fs.writeFileSync(verificationFile, JSON.stringify({ verification, archiveVerification, counters }, null, 2), "utf8");
console.log(`_meta/counters: ${JSON.stringify(counters)}`);
console.log(`Verification report: ${verificationFile}`);
