import fs from "fs";
import { cachedReference, cachedSchedules, invalidateReference, invalidateSchedules, REFERENCE_KEYS } from "./referenceCache";
import path from "path";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { Firestore, WriteBatch } from "firebase-admin/firestore";
import { defaultPrivateDirectory, isCloudRunRuntime, materializePackagedSnapshotOnce, packagedSnapshotPath, readJsonSnapshot } from "./snapshot";
import {
  SystemUser,
  FormName,
  FormSecurity,
  AdCollegeUserAssign,
  AdTerm,
  AdCollege,
  AdSection,
  AdInstructor,
  AdCourse,
  FSchedule,
  AdRoom,
  AuditLogEntry,
  ScheduleVersion,
  ScheduleDraft,
  ScheduleComment,
  SchedulePublication,
  ScheduleConstraint,
  ScheduleDecisionMemory,
  CampusMobilityProfile,
  ScheduleShareLink,
  VisitingRoster,
} from "../types";

// Runtime state must not live inside the replaceable application release. A number of
// deployment/upload tools synchronize an archive by deleting destination files that are
// absent from the upload. Keep a legacy source path only for the one-time safe migration.
const LEGACY_DB_DIR = path.join(process.cwd(), "database");
let DB_DIR = LEGACY_DB_DIR;
let DB_FILE = path.join(DB_DIR, "db.json");
let DB_BACKUP_FILE = path.join(DB_DIR, "db.json.backup");
let PASSWORD_VAULT_KEY_FILE = path.join(DB_DIR, "legacy-password-vault.key");
const PASSWORD_VAULT_AAD = Buffer.from("SCHEDULE-SystemUserPass-v1", "utf8");

function copyPrivateFileOnce(source: string, destination: string) {
  if (!fs.existsSync(source) || fs.existsSync(destination)) return;
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(destination, 0o600);
}

function configurePrivateDatabasePaths(mode: "demo" | "firestore") {
  const configured = process.env.SCHEDULE_PRIVATE_DIR?.trim();
  const privateDir = path.resolve(configured || defaultPrivateDirectory());
  const relativeToRelease = path.relative(path.resolve(process.cwd()), privateDir);
  const isInsideRelease = relativeToRelease === "" || (!relativeToRelease.startsWith(`..${path.sep}`) && relativeToRelease !== "..");
  if (process.env.NODE_ENV === "production" && isInsideRelease) {
    throw new Error("SCHEDULE_PRIVATE_DIR must be outside the application release directory in production");
  }
  if (isCloudRunRuntime() && mode === "demo") {
    throw new Error("Cloud Run requires DATA_MODE=firestore because its writable filesystem is ephemeral.");
  }

  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  const privateDbFile = path.join(privateDir, "db.json");
  const privateVaultFile = path.join(privateDir, "legacy-password-vault.key");
  if (mode === "demo") materializePackagedSnapshotOnce(privateDbFile);
  copyPrivateFileOnce(path.join(LEGACY_DB_DIR, "legacy-password-vault.key"), privateVaultFile);

  DB_DIR = privateDir;
  DB_FILE = privateDbFile;
  DB_BACKUP_FILE = path.join(privateDir, "db.json.backup");
  PASSWORD_VAULT_KEY_FILE = privateVaultFile;
  if (mode === "demo") copyPrivateFileOnce(DB_FILE, DB_BACKUP_FILE);
}

function restoreDatabaseBackupIfNeeded() {
  if (fs.existsSync(DB_FILE) || !fs.existsSync(DB_BACKUP_FILE)) return;
  const backup = fs.readFileSync(DB_BACKUP_FILE, "utf8");
  JSON.parse(backup);
  fs.copyFileSync(DB_BACKUP_FILE, DB_FILE, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(DB_FILE, 0o600);
  console.warn("Local database was missing and has been restored from the protected backup.");
}

function passwordVaultKey(): Buffer | null {
  const env = process.env.PASSWORD_VAULT_KEY?.trim();
  const raw = env || (fs.existsSync(PASSWORD_VAULT_KEY_FILE) ? fs.readFileSync(PASSWORD_VAULT_KEY_FILE, "utf8").trim() : "");
  if (!raw) return null;
  try {
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    return key.length === 32 ? key : null;
  } catch { return null; }
}

function encryptPasswordForVault(password: string): string {
  const key = passwordVaultKey();
  if (!key) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(PASSWORD_VAULT_AAD);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aesgcm$${iv.toString("hex")}$${encrypted.toString("hex")}$${tag.toString("hex")}`;
}

function decryptPasswordFromVault(stored?: string): string {
  const key = passwordVaultKey();
  if (!key || !stored?.startsWith("aesgcm$")) return "";
  try {
    const [, ivHex, cipherHex, tagHex] = stored.split("$");
    if (!ivHex || cipherHex == null || !tagHex) return "";
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAAD(PASSWORD_VAULT_AAD);
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(cipherHex, "hex")), decipher.final()]).toString("utf8");
  } catch { return ""; }
}

// Compatibility hash used only to read the synthetic database created by the first AI Studio build.
// New and migrated passwords use scrypt; production never stores plaintext passwords.
function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) - hash + password.charCodeAt(i)) | 0;
  }
  return "hash_" + Math.abs(hash).toString(16);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  if (typeof stored !== "string" || stored.length === 0) return false;
  if (stored.startsWith("scrypt$")) {
    const [, saltHex, digestHex] = stored.split("$");
    if (!saltHex || !digestHex) return false;
    const expected = Buffer.from(digestHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  return stored === simpleHash(password);
}

interface DBState {
  users: SystemUser[];
  formNames: FormName[];
  formSecurity: FormSecurity[];
  collegeUserAssign: AdCollegeUserAssign[];
  terms: AdTerm[];
  colleges: AdCollege[];
  sections: AdSection[];
  instructors: AdInstructor[];
  courses: AdCourse[];
  schedules: FSchedule[];
  rooms: AdRoom[];
  auditLogs?: AuditLogEntry[];
  scheduleVersions?: ScheduleVersion[];
  scheduleDrafts?: ScheduleDraft[];
  scheduleComments?: ScheduleComment[];
  schedulePublications?: SchedulePublication[];
  scheduleConstraints?: ScheduleConstraint[];
  visitingRosters?: VisitingRoster[];
  scheduleDecisionMemories?: ScheduleDecisionMemory[];
  campusMobilityProfiles?: CampusMobilityProfile[];
  scheduleShareLinks?: ScheduleShareLink[];
}

interface LegacySnapshot extends DBState {
  legacyArchive?: Record<string, Record<string, unknown>[]>;
  migrationMeta?: Record<string, unknown>;
}

let db: DBState = {
  users: [],
  formNames: [],
  formSecurity: [],
  collegeUserAssign: [],
  terms: [],
  colleges: [],
  sections: [],
  instructors: [],
  courses: [],
  schedules: [],
  rooms: [],
  auditLogs: [],
  scheduleVersions: [],
  scheduleDrafts: [],
  scheduleComments: [],
  schedulePublications: [],
  scheduleConstraints: [],
  visitingRosters: [],
  scheduleDecisionMemories: [],
  campusMobilityProfiles: [],
  scheduleShareLinks: []
};

let firestoreDb: Firestore | null = null;


function hydrateCourses(rows: AdCourse[], sections: AdSection[]): AdCourse[] {
  const sectionById = new Map(sections.map(section => [section.AdSectionId, section]));
  return rows.map(course => {
    const section = sectionById.get(course.AdSectionId);
    return section ? { ...course, AdCollegeId: section.AdCollegeId } : { ...course };
  });
}

function hydrateSchedules(rows: FSchedule[], courses: AdCourse[], sections: AdSection[]): FSchedule[] {
  const hydratedCourses = hydrateCourses(courses, sections);
  const courseById = new Map(hydratedCourses.map(course => [course.AdCourseId, course]));
  return rows.map(schedule => {
    const course = courseById.get(schedule.AdCourseId);
    if (!course) return { ...schedule };
    return {
      ...schedule,
      // These three fields are convenience fields in Firestore only. In SQL Server they are
      // derived through FSchedule -> AdCourse -> AdSection. Re-hydrating them on every read
      // preserves the relational semantics if a course moves to another section/college or is renamed.
      AdSectionId: course.AdSectionId,
      AdCollegeId: course.AdCollegeId,
      AdCourseName: course.CourseName
    };
  });
}

const RELATION_CACHE_MS = 5 * 60 * 1000;
let scheduleRelationCache: { expiresAt: number; courses: AdCourse[]; sections: AdSection[] } | null = null;
function invalidateScheduleRelationCache() { scheduleRelationCache = null; }
async function getCachedScheduleRelations(): Promise<{ courses: AdCourse[]; sections: AdSection[] }> {
  if (!firestoreDb) return { courses: db.courses, sections: db.sections };
  if (scheduleRelationCache && scheduleRelationCache.expiresAt > Date.now()) return scheduleRelationCache;
  const [courseSnap, sectionSnap] = await Promise.all([
    firestoreDb.collection("courses").get(),
    firestoreDb.collection("sections").get(),
  ]);
  const value = {
    expiresAt: Date.now() + RELATION_CACHE_MS,
    courses: courseSnap.docs.map(doc => doc.data() as AdCourse),
    sections: sectionSnap.docs.map(doc => doc.data() as AdSection),
  };
  scheduleRelationCache = value;
  return value;
}
function chunks<T>(values: T[], size = 30): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}
async function getFirestoreSchedulesForCourseIds(courseIds: number[], termId = 0): Promise<FSchedule[]> {
  if (!firestoreDb || !courseIds.length) return [];
  const uniqueIds = [...new Set(courseIds.filter(Boolean))];
  // A current-term universe is usually smaller than a many-course historical scan.
  // A section is usually the opposite. Pick the path that minimizes document reads.
  if (termId && uniqueIds.length > 30) {
    const snap = await firestoreDb.collection("schedules").where("AdTermId", "==", termId).get();
    const allowed = new Set(uniqueIds);
    return snap.docs.map(doc => doc.data() as FSchedule).filter(row => allowed.has(Number(row.AdCourseId)));
  }
  const snapshots = await Promise.all(
    chunks(uniqueIds).map(batch => firestoreDb!.collection("schedules").where("AdCourseId", "in", batch).get())
  );
  const rows = new Map<number, FSchedule>();
  for (const snap of snapshots) for (const doc of snap.docs) {
    const row = doc.data() as FSchedule;
    if (!termId || Number(row.AdTermId) === termId) rows.set(row.id, row);
  }
  return [...rows.values()];
}
async function hydrateFirestoreScheduleRows(rows: FSchedule[], preferredCourses?: AdCourse[], preferredSections?: AdSection[]): Promise<FSchedule[]> {
  if (!rows.length) return [];
  if (preferredCourses?.length && preferredSections?.length) return hydrateSchedules(rows, preferredCourses, preferredSections);
  if (!firestoreDb) return hydrateSchedules(rows, preferredCourses || db.courses, preferredSections || db.sections);

  // Conflict/room lookups normally touch only a handful of courses. Resolve just
  // those relations instead of loading the entire academic catalogue on the first
  // keystroke. Large result sets fall back to the short-lived relation cache.
  const courseIds = [...new Set(rows.map(item => Number(item.AdCourseId || 0)).filter(Boolean))];
  if (!preferredCourses?.length && courseIds.length && courseIds.length <= 60) {
    const courseSnaps = await Promise.all(
      chunks(courseIds).map(batch => firestoreDb!.collection("courses").where("AdCourseId", "in", batch).get())
    );
    const courses = courseSnaps.flatMap(snap => snap.docs.map(doc => doc.data() as AdCourse));
    const sectionIds = [...new Set(courses.map(course => Number(course.AdSectionId || 0)).filter(Boolean))];
    const sectionSnaps = sectionIds.length ? await Promise.all(
      chunks(sectionIds).map(batch => firestoreDb!.collection("sections").where("AdSectionId", "in", batch).get())
    ) : [];
    const sections = sectionSnaps.flatMap(snap => snap.docs.map(doc => doc.data() as AdSection));
    return hydrateSchedules(rows, courses, sections);
  }

  const relations = await getCachedScheduleRelations();
  return hydrateSchedules(
    rows,
    preferredCourses?.length ? preferredCourses : relations.courses,
    preferredSections?.length ? preferredSections : relations.sections
  );
}

const FIRESTORE_COUNTER_DOC = "_meta/counters";

type CounterKey = "users" | "formSecurity" | "userScopes" | "terms" | "colleges" | "sections" | "instructors" | "courses" | "schedules";

interface StoredSession {
  sessionId: string;
  userId: number;
  createdAt: number;
  expiresAt: number;
}
const demoSessions = new Map<string, StoredSession>();

async function reserveFirestoreIds(key: CounterKey, count = 1): Promise<number> {
  if (!firestoreDb) throw new Error("Firestore غير مهيأ");
  if (!Number.isInteger(count) || count < 1) throw new Error("عدد المعرفات المطلوب غير صالح");

  const counterRef = firestoreDb.doc(FIRESTORE_COUNTER_DOC);
  return firestoreDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(counterRef);
    const current = Number(snapshot.data()?.[key] ?? 0);
    const firstReserved = current + 1;
    transaction.set(counterRef, { [key]: current + count }, { merge: true });
    return firstReserved;
  });
}

function maxId<T>(rows: T[], pick: (row: T) => number): number {
  return rows.length ? Math.max(...rows.map(pick)) : 0;
}

async function syncFirestoreCounters(fsDb: Firestore, state: DBState) {
  await fsDb.doc(FIRESTORE_COUNTER_DOC).set({
    users: maxId(state.users, row => row.SystemUserId),
    formSecurity: maxId(state.formSecurity, row => row.legacyId ?? 0),
    userScopes: maxId(state.collegeUserAssign, row => row.legacyId ?? 0),
    terms: maxId(state.terms, row => row.AdTermId),
    colleges: maxId(state.colleges, row => row.AdCollegeId),
    sections: maxId(state.sections, row => row.AdSectionId),
    instructors: maxId(state.instructors, row => row.AdInstructorId),
    courses: maxId(state.courses, row => row.AdCourseId),
    schedules: maxId(state.schedules, row => row.id)
  }, { merge: true });
}

// Seed Firestore from the exact local legacy snapshot during the fresh test phase.
// The server awaits this function before accepting login requests.
function loadLocalSnapshot(): LegacySnapshot {
  const source = fs.existsSync(DB_FILE) ? DB_FILE : packagedSnapshotPath();
  if (!source) throw new Error("ملف البيانات المحلية غير موجود (db.json أو db.json.gz)");
  const parsed = readJsonSnapshot<Partial<DBState>>(source);
  const required: (keyof DBState)[] = ["users", "formNames", "formSecurity", "collegeUserAssign", "terms", "colleges", "sections", "instructors", "courses", "schedules", "rooms"];
  for (const key of required) {
    if (!Array.isArray(parsed[key])) throw new Error(`ملف البيانات المحلية ناقص: ${String(key)}`);
  }
  return parsed as LegacySnapshot;
}

async function seedFirestoreFromLocalSnapshotIfNeeded(fsDb: Firestore) {
  const usersSnapshot = await fsDb.collection("users").limit(1).get();
  if (!usersSnapshot.empty) return;

  const initial = loadLocalSnapshot();
  console.log(`Firestore is empty. Importing exact legacy snapshot (${initial.schedules.length} schedule rows)...`);

  const writeBatches = async <T>(rows: T[], writer: (batch: WriteBatch, row: T) => void) => {
    for (let offset = 0; offset < rows.length; offset += 400) {
      const batch = fsDb.batch();
      rows.slice(offset, offset + 400).forEach(row => writer(batch, row));
      await batch.commit();
    }
  };

  await writeBatches(initial.users, (batch, u) => batch.set(fsDb.collection("users").doc(`user_${u.SystemUserId}`), u));
  await writeBatches(initial.formNames, (batch, f) => batch.set(fsDb.collection("formNames").doc(`form_${f.FormNameId}`), f));
  await writeBatches(initial.formSecurity, (batch, item) => {
    if (item.legacyId == null) throw new Error("سجل الصلاحية بلا Legacy Id");
    batch.set(fsDb.collection("formSecurity").doc(`permission_${item.legacyId}`), item);
  });
  await writeBatches(initial.collegeUserAssign, (batch, item) => {
    if (item.legacyId == null) throw new Error("سجل نطاق المستخدم بلا Legacy Id");
    batch.set(fsDb.collection("userScopes").doc(`scope_${item.legacyId}`), item);
  });
  await writeBatches(initial.terms, (batch, t) => batch.set(fsDb.collection("terms").doc(`term_${t.AdTermId}`), t));
  await writeBatches(initial.colleges, (batch, c) => batch.set(fsDb.collection("colleges").doc(`college_${c.AdCollegeId}`), c));
  await writeBatches(initial.sections, (batch, sec) => batch.set(fsDb.collection("sections").doc(`section_${sec.AdSectionId}`), sec));
  await writeBatches(initial.instructors, (batch, i) => batch.set(fsDb.collection("instructors").doc(`instructor_${i.AdInstructorId}`), i));
  await writeBatches(initial.courses, (batch, c) => batch.set(fsDb.collection("courses").doc(`course_${c.AdCourseId}`), c));
  await writeBatches(initial.schedules, (batch, row) => batch.set(fsDb.collection("schedules").doc(`schedule_${row.id}`), row));
  await writeBatches(initial.rooms, (batch, room) => batch.set(fsDb.collection("rooms").doc(`room_${room.AdRoomId}`), room));

  // Preserve every historical/non-active table and raw source row set as an archive.
  // These documents are not used by the app, but they ensure the 2015 SQL backup is not discarded.
  for (const [tableName, rows] of Object.entries(initial.legacyArchive || {})) {
    const safeTableId = tableName.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120) || "unknown_table";
    const tableRef = fsDb.collection("legacyArchive").doc(safeTableId);
    for (let offset = 0; offset < rows.length; offset += 400) {
      const batch = fsDb.batch();
      rows.slice(offset, offset + 400).forEach((row, index) => {
        const absoluteIndex = offset + index + 1;
        batch.set(tableRef.collection("rows").doc(`row_${String(absoluteIndex).padStart(9, "0")}`), row);
      });
      await batch.commit();
    }
    await tableRef.set({ originalTableName: tableName, rowCount: rows.length }, { merge: false });
  }

  await syncFirestoreCounters(fsDb, initial);

  // Do not accept the first login until the initial Firestore copy is demonstrably complete.
  const expectedCounts: Array<[string, number]> = [
    ["users", initial.users.length],
    ["formNames", initial.formNames.length],
    ["formSecurity", initial.formSecurity.length],
    ["userScopes", initial.collegeUserAssign.length],
    ["terms", initial.terms.length],
    ["colleges", initial.colleges.length],
    ["sections", initial.sections.length],
    ["instructors", initial.instructors.length],
    ["courses", initial.courses.length],
    ["schedules", initial.schedules.length],
    ["rooms", initial.rooms.length]
  ];
  for (const [collectionName, expected] of expectedCounts) {
    const actual = (await fsDb.collection(collectionName).count().get()).data().count;
    if (actual !== expected) {
      throw new Error(`فشل التحقق من نقل ${collectionName}: المتوقع ${expected} والموجود ${actual}`);
    }
  }
  for (const [tableName, rows] of Object.entries(initial.legacyArchive || {})) {
    const safeTableId = tableName.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120) || "unknown_table";
    const actual = (await fsDb.collection("legacyArchive").doc(safeTableId).collection("rows").count().get()).data().count;
    if (actual !== rows.length) {
      throw new Error(`فشل التحقق من أرشيف ${tableName}: المتوقع ${rows.length} والموجود ${actual}`);
    }
  }
  await fsDb.doc("_meta/legacyImport").set({
    sourceBackupSha256: String(initial.migrationMeta?.sourceBackupSha256 || ""),
    verifiedAt: new Date().toISOString(),
    activeCounts: Object.fromEntries(expectedCounts),
    archiveTableCount: Object.keys(initial.legacyArchive || {}).length
  }, { merge: false });
  console.log("Legacy Firestore import completed and row counts verified successfully.");
}

/**
 * Which database is actually answering.
 *
 * The mode is decided at startup from environment and connection results, and
 * it is the one fact nobody should have to take on trust: a workspace tool that
 * syncs this project has more than once restored a "helpful" fallback to the
 * packaged demo snapshot, which is indistinguishable from the real thing on
 * screen. Reporting the live answer lets the interface say so out loud instead
 * of quietly showing invented rows.
 */
let runningMode: "demo" | "firestore" | "unknown" = "unknown";
export function activeDataMode() {
  return { mode: runningMode, real: runningMode === "firestore" };
}

export async function initDatabase() {
  /**
   * Real data is the default, and the only silent one.
   *
   * The previous default was the packaged demo snapshot, which meant a missing
   * or mistyped DATA_MODE started the application on invented rows — and, if no
   * local file existed, minted a fresh database with a default administrator.
   * An application that looks healthy while showing the wrong schedule is worse
   * than one that refuses to start, so demo is now something you must ask for
   * out loud, and asking for it is announced in the log every time.
   */
  const requested = (process.env.DATA_MODE || "").trim().toLowerCase();
  if (requested && requested !== "demo" && requested !== "firestore") {
    throw new Error(`DATA_MODE غير مدعوم: ${requested} — القيم المقبولة: firestore أو demo.`);
  }
  const requestedMode: "demo" | "firestore" = requested === "demo" ? "demo" : "firestore";
  // Cloud Run instances are replaceable and their writable filesystem is ephemeral,
  // so a local JSON database there is not storage at all.
  const mode: "demo" | "firestore" = isCloudRunRuntime() ? "firestore" : requestedMode;
  if (mode !== requestedMode) console.log("Cloud Run detected: using Firestore instead of ephemeral local JSON mode.");
  if (mode === "demo") {
    console.warn("=".repeat(72));
    console.warn("DATA_MODE=demo — بيانات تجريبية، ليست بيانات الجامعة الحقيقية.");
    console.warn("للتشغيل على البيانات الحقيقية: احذف DATA_MODE أو اضبطه على firestore.");
    console.warn("=".repeat(72));
  }
  configurePrivateDatabasePaths(mode);
  if (mode === "demo") restoreDatabaseBackupIfNeeded();
  runningMode = mode;
  console.log(`Initializing database in mode: ${mode}`);

  if (mode === "firestore") {
    try {
      if (getApps().length === 0) {
        if (process.env.FIRESTORE_EMULATOR_HOST) {
          console.log(`Connecting to Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
        }
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            initializeApp({
              credential: cert(serviceAccount),
              projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
            });
          } catch (e) {
            console.error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON format.");
            // We intentionally do not exit here so the container can start
            // and the user can see the error in logs instead of failing the deployment loop.
            throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON format.");
          }
        } else if (process.env.FIREBASE_PROJECT_ID) {
          initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
        } else {
          initializeApp();
        }
      }
      if (process.env.FIREBASE_DATABASE_ID) {
        const app = getApps().length > 0 ? getApps()[0] : undefined;
        firestoreDb = getFirestore(app, process.env.FIREBASE_DATABASE_ID);
      } else {
        firestoreDb = getFirestore();
      }
      // getFirestore() only creates a client; force one real read now so a wrong
      // project/database/credential cannot masquerade as a successful connection.
      const projectId = String(getApps()[0]?.options?.projectId || process.env.FIREBASE_PROJECT_ID || "(default)");
      const databaseId = String(process.env.FIREBASE_DATABASE_ID || "(default)");
      const usersProbe = await firestoreDb.collection("users").limit(1).get();
      if (usersProbe.empty) {
        console.warn(`Firestore target ${projectId}/${databaseId} has no users data. Allowing initialization to proceed to seed the database.`);
      } else {
        console.log(`Firebase/Firestore verified successfully: project=${projectId}, database=${databaseId}`);
      }

      // Allow auto-import even in production if the database is explicitly empty
      if (process.env.AUTO_IMPORT_LEGACY_DATA !== "false" || usersProbe.empty) {
        await seedFirestoreFromLocalSnapshotIfNeeded(firestoreDb);
      }
      return;
    } catch (e) {
      firestoreDb = null;
      const message = e instanceof Error ? e.message : String(e);
      /*
       * ── NOTE TO ANY AUTOMATED EDITOR ──────────────────────────────────────
       * Do not add a fallback to the packaged snapshot here, in any
       * environment. It has been added and removed from this file repeatedly.
       * Every time, the result is an application that looks healthy while
       * showing a schedule that is not the university's, and people make real
       * decisions from invented rows.
       *
       * The server does not crash when this throws: it starts, serves the
       * interface, and answers /api with 503 and this message. If the dev
       * server will not start, that is a different bug — fix it there.
       * ──────────────────────────────────────────────────────────────────────
       */
      throw new Error(
        `تعذر الاتصال بقاعدة البيانات الحقيقية (Firestore): ${message}\n` +
        `لم يتم تشغيل البرنامج على بيانات بديلة. تحقق من FIREBASE_PROJECT_ID و FIREBASE_DATABASE_ID وصلاحية الاعتماد.`
      );
    }
  }

  // Reaching here means no Firestore client is serving, whatever was requested.
  runningMode = "demo";
  // Local snapshot mode: uses persistent private state outside the replaceable release.
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      db = JSON.parse(content);
      if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
      if (!Array.isArray(db.scheduleVersions)) db.scheduleVersions = [];
      if (!Array.isArray(db.scheduleDrafts)) db.scheduleDrafts = [];
      if (!Array.isArray(db.scheduleComments)) db.scheduleComments = [];
      if (!Array.isArray(db.schedulePublications)) db.schedulePublications = [];
      if (!Array.isArray(db.scheduleConstraints)) db.scheduleConstraints = [];
      if (!Array.isArray(db.visitingRosters)) db.visitingRosters = [];
      if (!Array.isArray(db.scheduleDecisionMemories)) db.scheduleDecisionMemories = [];
      if (!Array.isArray(db.campusMobilityProfiles)) db.campusMobilityProfiles = [];
      if (!Array.isArray(db.scheduleShareLinks)) db.scheduleShareLinks = [];
    } catch (e) {
      throw new Error(`تعذر قراءة ملف البيانات المحلية؛ تم إيقاف التشغيل لحماية البيانات: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    // If the database file is missing, initialize a fresh state with a default admin user.
    db.users = [{
      SystemUserId: 1,
      Name: "مدير النظام",
      SystemUserLogin: "admin",
      SystemUserPass: hashPassword("admin123"),
      SystemUserPassVault: "",
      IsAdminUser: true,
      IsActive: true,
      IsLocked: false,
      IsDeleted: false
    }];
    saveDatabase();
    console.warn(`Local database was missing. Initialized a fresh database with default admin credentials (admin/admin123).`);
  }
}

export function saveDatabase() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true, mode: 0o700 });
  }
  const serialized = JSON.stringify(db, null, 2);
  const temporaryFile = path.join(DB_DIR, `.db-${process.pid}-${Date.now()}.tmp`);
  const backupTemporaryFile = path.join(DB_DIR, `.db-backup-${process.pid}-${Date.now()}.tmp`);

  // Preserve the last known-good snapshot and replace the live file atomically. A crash
  // can no longer leave a partially written JSON database behind.
  if (fs.existsSync(DB_FILE)) {
    fs.copyFileSync(DB_FILE, backupTemporaryFile, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(backupTemporaryFile, 0o600);
    fs.renameSync(backupTemporaryFile, DB_BACKUP_FILE);
  }
  const descriptor = fs.openSync(temporaryFile, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, serialized, "utf-8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporaryFile, DB_FILE);
  fs.chmodSync(DB_FILE, 0o600);
}

const identityListeners = new Set<() => void>();
/** Fired whenever an account, its permissions or its scopes change. */
function announceIdentityChange() { for (const listener of identityListeners) listener(); }

export const Repository = {
  /** Lets the server drop any cached identity the moment accounts change. */
  onIdentityChanged: (listener: () => void) => { identityListeners.add(listener); },

  // Password helpers
  simpleHash,
  hashPassword,
  verifyPassword,
  encryptPasswordForVault,
  decryptPasswordFromVault,

  // Sessions: Firestore-backed in production so login survives multi-instance/server restarts.
  createSession: async (sessionId: string, userId: number, ttlMs: number): Promise<void> => {
    const now = Date.now();
    const session: StoredSession = { sessionId, userId, createdAt: now, expiresAt: now + ttlMs };
    if (firestoreDb) {
      await firestoreDb.collection("sessions").doc(sessionId).set(session);
      return;
    }
    demoSessions.set(sessionId, session);
  },

  getSession: async (sessionId: string): Promise<StoredSession | undefined> => {
    if (firestoreDb) {
      const ref = firestoreDb.collection("sessions").doc(sessionId);
      const snapshot = await ref.get();
      if (!snapshot.exists) return undefined;
      const session = snapshot.data() as StoredSession;
      if (session.expiresAt <= Date.now()) {
        await ref.delete();
        return undefined;
      }
      return session;
    }
    const session = demoSessions.get(sessionId);
    if (!session) return undefined;
    if (session.expiresAt <= Date.now()) {
      demoSessions.delete(sessionId);
      return undefined;
    }
    return session;
  },

  refreshSession: async (sessionId: string, ttlMs: number): Promise<void> => {
    const expiresAt = Date.now() + ttlMs;
    if (firestoreDb) {
      const ref = firestoreDb.collection("sessions").doc(sessionId);
      await ref.set({ expiresAt }, { merge: true });
      return;
    }
    const session = demoSessions.get(sessionId);
    if (session) demoSessions.set(sessionId, { ...session, expiresAt });
  },

  deleteSession: async (sessionId: string): Promise<void> => {
    announceIdentityChange();
    if (firestoreDb) {
      await firestoreDb.collection("sessions").doc(sessionId).delete();
      return;
    }
    demoSessions.delete(sessionId);
  },

  // Audit log: additive operational history. It is intentionally separate from legacy tables.
  createAuditLog: async (entry: Omit<AuditLogEntry, "id" | "timestamp">): Promise<AuditLogEntry> => {
    const row: AuditLogEntry = { ...entry, id: randomUUID(), timestamp: new Date().toISOString() };
    if (firestoreDb) {
      await firestoreDb.collection("auditLogs").doc(row.id).set(row);
      return row;
    }
    if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
    db.auditLogs.unshift(row);
    if (db.auditLogs.length > 2000) db.auditLogs.length = 2000;
    saveDatabase();
    return row;
  },

  getAuditLogs: async (limit = 250): Promise<AuditLogEntry[]> => {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 250));
    if (firestoreDb) {
      const snap = await firestoreDb.collection("auditLogs").orderBy("timestamp", "desc").limit(safeLimit).get();
      return snap.docs.map(doc => doc.data() as AuditLogEntry);
    }
    return [...(db.auditLogs || [])].sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, safeLimit);
  },

  // Users
  getUsers: async (): Promise<SystemUser[]> => {
    if (firestoreDb) {
      const snapshot = await firestoreDb.collection("users").orderBy("SystemUserId", "asc").get();
      return snapshot.docs.map(doc => doc.data() as SystemUser);
    }
    return db.users;
  },

  getUserById: async (id: number): Promise<SystemUser | undefined> => {
    if (firestoreDb) {
      const doc = await firestoreDb.collection("users").doc(`user_${id}`).get();
      return doc.exists ? (doc.data() as SystemUser) : undefined;
    }
    return db.users.find(u => u.SystemUserId === id);
  },

  getUserByLogin: async (login: string): Promise<SystemUser | undefined> => {
    if (firestoreDb) {
      // Find exact matches first
      const snap = await firestoreDb.collection("users").where("SystemUserLogin", "==", login).get();
      if (!snap.empty) {
        return snap.docs[0].data() as SystemUser;
      }
      // Case-insensitive check fallback
      const allSnap = await firestoreDb.collection("users").get();
      return allSnap.docs
        .map(d => d.data() as SystemUser)
        .find(u => u.SystemUserLogin.toLowerCase() === login.toLowerCase());
    }
    return db.users.find(u => u.SystemUserLogin.toLowerCase() === login.toLowerCase());
  },

  createUser: async (user: Omit<SystemUser, "SystemUserId">): Promise<SystemUser> => {
    announceIdentityChange();
    if (firestoreDb) {
      const nextId = await reserveFirestoreIds("users");
      const newUser = { ...user, IsDeleted: user.IsDeleted ?? false, SystemUserId: nextId };
      await firestoreDb.collection("users").doc(`user_${nextId}`).set(newUser);
      return newUser;
    }
    const nextId = db.users.length > 0 ? Math.max(...db.users.map(u => u.SystemUserId)) + 1 : 1;
    const newUser = { ...user, IsDeleted: user.IsDeleted ?? false, SystemUserId: nextId };
    db.users.push(newUser);
    saveDatabase();
    return newUser;
  },

  updateUser: async (id: number, fields: Partial<SystemUser>): Promise<SystemUser> => {
    announceIdentityChange();
    if (firestoreDb) {
      const docRef = firestoreDb.collection("users").doc(`user_${id}`);
      const doc = await docRef.get();
      if (!doc.exists) throw new Error("المستخدم غير موجود");
      const updated = { ...(doc.data() as SystemUser), ...fields };
      await docRef.set(updated);
      return updated;
    }
    const idx = db.users.findIndex(u => u.SystemUserId === id);
    if (idx === -1) throw new Error("المستخدم غير موجود");
    db.users[idx] = { ...db.users[idx], ...fields };
    saveDatabase();
    return db.users[idx];
  },

  deleteUser: async (id: number): Promise<void> => {
    announceIdentityChange();
    // Legacy SQL has no FK/cascade from FormSecurity or AdCollegeUserAssign to SystemUser.
    // Historical orphan rows in the real database prove user deletion left those records behind.
    if (firestoreDb) {
      await firestoreDb.collection("users").doc(`user_${id}`).delete();
      return;
    }
    db.users = db.users.filter(u => u.SystemUserId !== id);
    saveDatabase();
  },

  // FormSecurity
  getFormSecurity: async (): Promise<FormSecurity[]> => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("formSecurity").get();
      return snap.docs.map(doc => doc.data() as FormSecurity).sort((a,b)=>(a.legacyId ?? 0)-(b.legacyId ?? 0));
    }
    return [...db.formSecurity].sort((a,b)=>(a.legacyId ?? 0)-(b.legacyId ?? 0));
  },

  getSecurityByUser: async (userId: number): Promise<FormSecurity[]> => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("formSecurity").where("SystemUserId", "==", userId).get();
      return snap.docs.map(doc => doc.data() as FormSecurity).sort((a,b)=>(a.legacyId ?? 0)-(b.legacyId ?? 0));
    }
    return db.formSecurity.filter(fs => fs.SystemUserId === userId).sort((a,b)=>(a.legacyId ?? 0)-(b.legacyId ?? 0));
  },

  createSecurity: async (userId: number, formId: number): Promise<FormSecurity> => {
    announceIdentityChange();
    invalidateReference(REFERENCE_KEYS.formNames);
    if (firestoreDb) {
      const legacyId = await reserveFirestoreIds("formSecurity");
      const row: FormSecurity = { legacyId, SystemUserId: userId, FormNameId: formId };
      await firestoreDb.collection("formSecurity").doc(`permission_${legacyId}`).set(row);
      return row;
    }
    const legacyId = maxId(db.formSecurity, row => row.legacyId ?? 0) + 1;
    const row: FormSecurity = { legacyId, SystemUserId: userId, FormNameId: formId };
    db.formSecurity.push(row); saveDatabase(); return row;
  },

  updateSecurity: async (legacyId: number, userId: number, formId: number): Promise<FormSecurity> => {
    announceIdentityChange();
    invalidateReference(REFERENCE_KEYS.formNames);
    if (firestoreDb) {
      const ref = firestoreDb.collection("formSecurity").doc(`permission_${legacyId}`);
      const snap = await ref.get(); if (!snap.exists) throw new Error("الصلاحية غير موجودة");
      const row: FormSecurity = { legacyId, SystemUserId: userId, FormNameId: formId };
      await ref.set(row); return row;
    }
    const idx = db.formSecurity.findIndex(row => row.legacyId === legacyId);
    if (idx < 0) throw new Error("الصلاحية غير موجودة");
    db.formSecurity[idx] = { legacyId, SystemUserId: userId, FormNameId: formId };
    saveDatabase(); return db.formSecurity[idx];
  },

  deleteSecurity: async (legacyId: number): Promise<void> => {
    announceIdentityChange();
    invalidateReference(REFERENCE_KEYS.formNames);
    if (firestoreDb) { await firestoreDb.collection("formSecurity").doc(`permission_${legacyId}`).delete(); return; }
    db.formSecurity = db.formSecurity.filter(row => row.legacyId !== legacyId); saveDatabase();
  },

  // Compatibility helper used by tests/admin internals. It preserves rows that remain and assigns
  // a fresh legacy ID only to newly-added permissions.
  saveSecurityByUser: async (userId: number, formIds: number[]): Promise<void> => {
    announceIdentityChange();
    invalidateReference(REFERENCE_KEYS.formNames);
    const existing = await Repository.getSecurityByUser(userId);
    const wanted = new Set(formIds);
    for (const row of existing) if (!wanted.has(row.FormNameId) && row.legacyId != null) await Repository.deleteSecurity(row.legacyId);
    const existingIds = new Set(existing.map(row => row.FormNameId));
    for (const formId of formIds) if (!existingIds.has(formId)) await Repository.createSecurity(userId, formId);
  },

  // FormNames
  getFormNames: async (): Promise<FormName[]> => cachedReference(REFERENCE_KEYS.formNames, async () => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("formNames").orderBy("FormNameId", "asc").get();
      return snap.docs.map(doc => doc.data() as FormName);
    }
    return db.formNames;
  }),

  // AdCollegeUserAssign
  getCollegeUserAssigns: async (): Promise<AdCollegeUserAssign[]> => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("userScopes").get();
      return snap.docs.map(doc => doc.data() as AdCollegeUserAssign).sort((a,b)=>(a.legacyId ?? 0)-(b.legacyId ?? 0));
    }
    return [...db.collegeUserAssign].sort((a,b)=>(a.legacyId ?? 0)-(b.legacyId ?? 0));
  },

  getUserAssigns: async (userId: number): Promise<AdCollegeUserAssign[]> => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("userScopes").where("SystemUserId", "==", userId).get();
      return snap.docs.map(doc => doc.data() as AdCollegeUserAssign).sort((a,b)=>(a.legacyId ?? 0)-(b.legacyId ?? 0));
    }
    return db.collegeUserAssign.filter(c => c.SystemUserId === userId).sort((a,b)=>(a.legacyId ?? 0)-(b.legacyId ?? 0));
  },

  createUserAssign: async (userId:number, collegeId:number, sectionId:number): Promise<AdCollegeUserAssign> => {
    announceIdentityChange();
    if (firestoreDb) {
      const legacyId = await reserveFirestoreIds("userScopes");
      const row: AdCollegeUserAssign = { legacyId, SystemUserId:userId, AdCollegeId:collegeId, AdSectionId:sectionId };
      await firestoreDb.collection("userScopes").doc(`scope_${legacyId}`).set(row); return row;
    }
    const legacyId = maxId(db.collegeUserAssign, row => row.legacyId ?? 0) + 1;
    const row: AdCollegeUserAssign = { legacyId, SystemUserId:userId, AdCollegeId:collegeId, AdSectionId:sectionId };
    db.collegeUserAssign.push(row); saveDatabase(); return row;
  },

  updateUserAssign: async (legacyId:number, userId:number, collegeId:number, sectionId:number): Promise<AdCollegeUserAssign> => {
    announceIdentityChange();
    if (firestoreDb) {
      const ref=firestoreDb.collection("userScopes").doc(`scope_${legacyId}`); const snap=await ref.get();
      if(!snap.exists) throw new Error("صلاحية الكلية والقسم العلمي غير موجودة");
      const row:AdCollegeUserAssign={legacyId,SystemUserId:userId,AdCollegeId:collegeId,AdSectionId:sectionId}; await ref.set(row); return row;
    }
    const idx=db.collegeUserAssign.findIndex(row=>row.legacyId===legacyId); if(idx<0) throw new Error("صلاحية الكلية والقسم العلمي غير موجودة");
    db.collegeUserAssign[idx]={legacyId,SystemUserId:userId,AdCollegeId:collegeId,AdSectionId:sectionId}; saveDatabase(); return db.collegeUserAssign[idx];
  },

  deleteUserAssign: async (legacyId:number): Promise<void> => {
    announceIdentityChange();
    if(firestoreDb){await firestoreDb.collection("userScopes").doc(`scope_${legacyId}`).delete();return;}
    db.collegeUserAssign=db.collegeUserAssign.filter(row=>row.legacyId!==legacyId); saveDatabase();
  },

  saveUserAssigns: async (userId: number, assigns: { AdCollegeId: number; AdSectionId: number }[]): Promise<void> => {
    announceIdentityChange();
    const existing = await Repository.getUserAssigns(userId);
    const targetCounts = new Map<string, number>();
    for (const a of assigns) { const k=`${a.AdCollegeId}:${a.AdSectionId}`; targetCounts.set(k,(targetCounts.get(k)||0)+1); }
    const used = new Map<string, number>();
    for (const row of existing) {
      const k=`${row.AdCollegeId}:${row.AdSectionId}`; const n=(used.get(k)||0)+1; used.set(k,n);
      if(n>(targetCounts.get(k)||0) && row.legacyId!=null) await Repository.deleteUserAssign(row.legacyId);
    }
    const existingCounts = new Map<string, number>();
    for (const row of existing) { const k=`${row.AdCollegeId}:${row.AdSectionId}`; existingCounts.set(k,(existingCounts.get(k)||0)+1); }
    for (const a of assigns) {
      const k=`${a.AdCollegeId}:${a.AdSectionId}`; const remaining=existingCounts.get(k)||0;
      if(remaining>0) existingCounts.set(k,remaining-1); else await Repository.createUserAssign(userId,a.AdCollegeId,a.AdSectionId);
    }
  },

  // Terms
  getTerms: async (): Promise<AdTerm[]> => cachedReference(REFERENCE_KEYS.terms, async () => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("terms").orderBy("AdTermId", "asc").get();
      return snap.docs.map(doc => doc.data() as AdTerm);
    }
    return db.terms;
  }),

  getTermById: async (id: number): Promise<AdTerm | undefined> => {
    if (firestoreDb) {
      const doc = await firestoreDb.collection("terms").doc(`term_${id}`).get();
      return doc.exists ? (doc.data() as AdTerm) : undefined;
    }
    return db.terms.find(t => t.AdTermId === id);
  },

  createTerm: async (name: string): Promise<AdTerm> => {
    invalidateReference(REFERENCE_KEYS.terms);
    if (firestoreDb) {
      const nextId = await reserveFirestoreIds("terms");
      const newTerm = { AdTermId: nextId, AdTermName: name };
      await firestoreDb.collection("terms").doc(`term_${nextId}`).set(newTerm);
      return newTerm;
    }
    const nextId = db.terms.length > 0 ? Math.max(...db.terms.map(t => t.AdTermId)) + 1 : 1;
    const newTerm = { AdTermId: nextId, AdTermName: name };
    db.terms.push(newTerm);
    saveDatabase();
    return newTerm;
  },

  updateTerm: async (id: number, name: string): Promise<AdTerm> => {
    invalidateReference(REFERENCE_KEYS.terms);
    if (firestoreDb) {
      const docRef = firestoreDb.collection("terms").doc(`term_${id}`);
      const doc = await docRef.get();
      if (!doc.exists) throw new Error("الفصل الدراسي غير موجود");
      const updated = { AdTermId: id, AdTermName: name };
      await docRef.set(updated);
      return updated;
    }
    const idx = db.terms.findIndex(t => t.AdTermId === id);
    if (idx === -1) throw new Error("الفصل الدراسي غير موجود");
    db.terms[idx].AdTermName = name;
    saveDatabase();
    return db.terms[idx];
  },

  deleteTerm: async (id: number): Promise<void> => {
    invalidateReference(REFERENCE_KEYS.terms);
    if (firestoreDb) {
      await firestoreDb.collection("terms").doc(`term_${id}`).delete();
      return;
    }
    db.terms = db.terms.filter(t => t.AdTermId !== id);
    saveDatabase();
  },

  // Colleges
  getColleges: async (): Promise<AdCollege[]> => cachedReference(REFERENCE_KEYS.colleges, async () => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("colleges").orderBy("AdCollegeId", "asc").get();
      return snap.docs.map(doc => doc.data() as AdCollege);
    }
    return db.colleges;
  }),

  getCollegeById: async (id: number): Promise<AdCollege | undefined> => {
    if (firestoreDb) {
      const doc = await firestoreDb.collection("colleges").doc(`college_${id}`).get();
      return doc.exists ? (doc.data() as AdCollege) : undefined;
    }
    return db.colleges.find(c => c.AdCollegeId === id);
  },

  createCollege: async (code: string, name: string): Promise<AdCollege> => {
    invalidateReference(REFERENCE_KEYS.colleges);
    if (firestoreDb) {
      const nextId = await reserveFirestoreIds("colleges");
      const newColl = { AdCollegeId: nextId, AdCollegeCode: code, AdCollegeName: name };
      await firestoreDb.collection("colleges").doc(`college_${nextId}`).set(newColl);
      return newColl;
    }
    const nextId = db.colleges.length > 0 ? Math.max(...db.colleges.map(c => c.AdCollegeId)) + 1 : 1;
    const newColl = { AdCollegeId: nextId, AdCollegeCode: code, AdCollegeName: name };
    db.colleges.push(newColl);
    saveDatabase();
    return newColl;
  },

  updateCollege: async (id: number, code: string, name: string): Promise<AdCollege> => {
    invalidateReference(REFERENCE_KEYS.colleges);
    if (firestoreDb) {
      const docRef = firestoreDb.collection("colleges").doc(`college_${id}`);
      const doc = await docRef.get();
      if (!doc.exists) throw new Error("الكلية غير موجودة");
      const updated = { AdCollegeId: id, AdCollegeCode: code, AdCollegeName: name };
      await docRef.set(updated);
      return updated;
    }
    const idx = db.colleges.findIndex(c => c.AdCollegeId === id);
    if (idx === -1) throw new Error("الكلية غير موجودة");
    db.colleges[idx].AdCollegeCode = code;
    db.colleges[idx].AdCollegeName = name;
    saveDatabase();
    return db.colleges[idx];
  },

  deleteCollege: async (id: number): Promise<void> => {
    invalidateReference(REFERENCE_KEYS.colleges);
    if (firestoreDb) {
      await firestoreDb.collection("colleges").doc(`college_${id}`).delete();
      return;
    }
    db.colleges = db.colleges.filter(c => c.AdCollegeId !== id);
    saveDatabase();
  },

  // Sections
  getSections: async (): Promise<AdSection[]> => cachedReference(REFERENCE_KEYS.sections, async () => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("sections").orderBy("AdSectionId", "asc").get();
      return snap.docs.map(doc => doc.data() as AdSection);
    }
    return db.sections;
  }),

  getSectionById: async (id: number): Promise<AdSection | undefined> => {
    if (firestoreDb) {
      const doc = await firestoreDb.collection("sections").doc(`section_${id}`).get();
      return doc.exists ? (doc.data() as AdSection) : undefined;
    }
    return db.sections.find(s => s.AdSectionId === id);
  },

  getSectionsByCollege: async (collegeId: number): Promise<AdSection[]> => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("sections").where("AdCollegeId", "==", collegeId).get();
      return snap.docs.map(doc => doc.data() as AdSection);
    }
    return db.sections.filter(s => s.AdCollegeId === collegeId);
  },

  createSection: async (collegeId: number, code: string, name: string): Promise<AdSection> => {
    invalidateReference(REFERENCE_KEYS.sections);
    if (firestoreDb) {
      const nextId = await reserveFirestoreIds("sections");
      const newSec = { AdSectionId: nextId, AdCollegeId: collegeId, AdSectionCode: code, AdSectionName: name };
      await firestoreDb.collection("sections").doc(`section_${nextId}`).set(newSec);
      invalidateScheduleRelationCache();
      return newSec;
    }
    const nextId = db.sections.length > 0 ? Math.max(...db.sections.map(s => s.AdSectionId)) + 1 : 1;
    const newSec = { AdSectionId: nextId, AdCollegeId: collegeId, AdSectionCode: code, AdSectionName: name };
    db.sections.push(newSec);
    saveDatabase();
    return newSec;
  },

  updateSection: async (id: number, collegeId: number, code: string, name: string): Promise<AdSection> => {
    invalidateReference(REFERENCE_KEYS.sections);
    if (firestoreDb) {
      const docRef = firestoreDb.collection("sections").doc(`section_${id}`);
      const doc = await docRef.get();
      if (!doc.exists) throw new Error("القسم غير موجود");
      const updated = { AdSectionId: id, AdCollegeId: collegeId, AdSectionCode: code, AdSectionName: name };
      await docRef.set(updated);
      invalidateScheduleRelationCache();
      return updated;
    }
    const idx = db.sections.findIndex(s => s.AdSectionId === id);
    if (idx === -1) throw new Error("القسم غير موجود");
    db.sections[idx] = { AdSectionId: id, AdCollegeId: collegeId, AdSectionCode: code, AdSectionName: name };
    saveDatabase();
    return db.sections[idx];
  },

  deleteSection: async (id: number): Promise<void> => {
    invalidateReference(REFERENCE_KEYS.sections);
    if (firestoreDb) {
      await firestoreDb.collection("sections").doc(`section_${id}`).delete();
      invalidateScheduleRelationCache();
      return;
    }
    db.sections = db.sections.filter(s => s.AdSectionId !== id);
    saveDatabase();
  },

  // Instructors
  getInstructors: async (): Promise<AdInstructor[]> => cachedReference(REFERENCE_KEYS.instructors, async () => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("instructors").orderBy("AdInstructorId", "asc").get();
      return snap.docs.map(doc => doc.data() as AdInstructor);
    }
    return db.instructors;
  }),

  getInstructorById: async (id: number): Promise<AdInstructor | undefined> => {
    if (firestoreDb) {
      const doc = await firestoreDb.collection("instructors").doc(`instructor_${id}`).get();
      return doc.exists ? (doc.data() as AdInstructor) : undefined;
    }
    return db.instructors.find(i => i.AdInstructorId === id);
  },

  getInstructorByCivil: async (civil: string): Promise<AdInstructor | undefined> => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("instructors").where("AdInstructorCivil", "==", civil).get();
      return snap.empty ? undefined : (snap.docs[0].data() as AdInstructor);
    }
    return db.instructors.find(i => i.AdInstructorCivil === civil);
  },

  createInstructor: async (civil: string, name: string, mobile: string): Promise<AdInstructor> => {
    invalidateReference(REFERENCE_KEYS.instructors);
    if (firestoreDb) {
      const nextId = await reserveFirestoreIds("instructors");
      const newIns = { AdInstructorId: nextId, AdInstructorCivil: civil, AdInstructorName: name, AdInstructorMobile: mobile };
      await firestoreDb.collection("instructors").doc(`instructor_${nextId}`).set(newIns);
      return newIns;
    }
    const nextId = db.instructors.length > 0 ? Math.max(...db.instructors.map(i => i.AdInstructorId)) + 1 : 1;
    const newIns = { AdInstructorId: nextId, AdInstructorCivil: civil, AdInstructorName: name, AdInstructorMobile: mobile };
    db.instructors.push(newIns);
    saveDatabase();
    return newIns;
  },

  updateInstructor: async (id: number, civil: string, name: string, mobile: string): Promise<AdInstructor> => {
    invalidateReference(REFERENCE_KEYS.instructors);
    if (firestoreDb) {
      const docRef = firestoreDb.collection("instructors").doc(`instructor_${id}`);
      const doc = await docRef.get();
      if (!doc.exists) throw new Error("الأستاذ غير موجود");
      const updated = { AdInstructorId: id, AdInstructorCivil: civil, AdInstructorName: name, AdInstructorMobile: mobile };
      await docRef.set(updated);
      return updated;
    }
    const idx = db.instructors.findIndex(i => i.AdInstructorId === id);
    if (idx === -1) throw new Error("الأستاذ غير موجود");
    db.instructors[idx] = { AdInstructorId: id, AdInstructorCivil: civil, AdInstructorName: name, AdInstructorMobile: mobile };
    saveDatabase();
    return db.instructors[idx];
  },

  deleteInstructor: async (id: number): Promise<void> => {
    invalidateReference(REFERENCE_KEYS.instructors);
    if (firestoreDb) {
      await firestoreDb.collection("instructors").doc(`instructor_${id}`).delete();
      return;
    }
    db.instructors = db.instructors.filter(i => i.AdInstructorId !== id);
    saveDatabase();
  },

  // Courses
  getCourses: async (): Promise<AdCourse[]> => cachedReference(REFERENCE_KEYS.courses, async () => {
    if (firestoreDb) {
      const [courseSnap, sectionSnap] = await Promise.all([
        firestoreDb.collection("courses").orderBy("AdCourseId", "asc").get(),
        firestoreDb.collection("sections").get()
      ]);
      return hydrateCourses(
        courseSnap.docs.map(doc => doc.data() as AdCourse),
        sectionSnap.docs.map(doc => doc.data() as AdSection)
      );
    }
    return hydrateCourses(db.courses, db.sections);
  }),

  getCourseById: async (id: number): Promise<AdCourse | undefined> => {
    if (firestoreDb) {
      const doc = await firestoreDb.collection("courses").doc(`course_${id}`).get();
      if (!doc.exists) return undefined;
      const course = doc.data() as AdCourse;
      const sectionDoc = await firestoreDb.collection("sections").doc(`section_${course.AdSectionId}`).get();
      return hydrateCourses([course], sectionDoc.exists ? [sectionDoc.data() as AdSection] : [])[0];
    }
    const course = db.courses.find(c => c.AdCourseId === id);
    return course ? hydrateCourses([course], db.sections)[0] : undefined;
  },

  getCoursesBySection: async (sectionId: number): Promise<AdCourse[]> => cachedReference(`courses:${sectionId}`, async () => {
    if (firestoreDb) {
      const [snap, sectionDoc] = await Promise.all([
        firestoreDb.collection("courses").where("AdSectionId", "==", sectionId).get(),
        firestoreDb.collection("sections").doc(`section_${sectionId}`).get()
      ]);
      return hydrateCourses(
        snap.docs.map(doc => doc.data() as AdCourse),
        sectionDoc.exists ? [sectionDoc.data() as AdSection] : []
      );
    }
    return hydrateCourses(db.courses.filter(c => c.AdSectionId === sectionId), db.sections);
  }),

  createCourse: async (
    collegeId: number,
    sectionId: number,
    code: string,
    name: string,
    credit: number,
    hours: number,
    maxStudent: number
  ): Promise<AdCourse> => {
    invalidateReference(REFERENCE_KEYS.courses);
    if (firestoreDb) {
      const nextId = await reserveFirestoreIds("courses");
      const newCourse: AdCourse = {
        AdCourseId: nextId,
        AdCollegeId: collegeId,
        AdSectionId: sectionId,
        CourseCode: code,
        CourseName: name,
        CourseCredit: credit,
        CourseHours: hours,
        MaxStudent: maxStudent
      };
      await firestoreDb.collection("courses").doc(`course_${nextId}`).set(newCourse);
      invalidateScheduleRelationCache();
      return newCourse;
    }
    const nextId = db.courses.length > 0 ? Math.max(...db.courses.map(c => c.AdCourseId)) + 1 : 1;
    const newCourse = {
      AdCourseId: nextId,
      AdCollegeId: collegeId,
      AdSectionId: sectionId,
      CourseCode: code,
      CourseName: name,
      CourseCredit: credit,
      CourseHours: hours,
      MaxStudent: maxStudent
    };
    db.courses.push(newCourse);
    saveDatabase();
    return newCourse;
  },

  updateCourse: async (
    id: number,
    collegeId: number,
    sectionId: number,
    code: string,
    name: string,
    credit: number,
    hours: number,
    maxStudent: number
  ): Promise<AdCourse> => {
    invalidateReference(REFERENCE_KEYS.courses);
    if (firestoreDb) {
      const docRef = firestoreDb.collection("courses").doc(`course_${id}`);
      const doc = await docRef.get();
      if (!doc.exists) throw new Error("المقرر غير موجود");
      const updated: AdCourse = {
        AdCourseId: id,
        AdCollegeId: collegeId,
        AdSectionId: sectionId,
        CourseCode: code,
        CourseName: name,
        CourseCredit: credit,
        CourseHours: hours,
        MaxStudent: maxStudent
      };
      await docRef.set(updated);
      invalidateScheduleRelationCache();
      return updated;
    }
    const idx = db.courses.findIndex(c => c.AdCourseId === id);
    if (idx === -1) throw new Error("المقرر غير موجود");
    db.courses[idx] = {
      AdCourseId: id,
      AdCollegeId: collegeId,
      AdSectionId: sectionId,
      CourseCode: code,
      CourseName: name,
      CourseCredit: credit,
      CourseHours: hours,
      MaxStudent: maxStudent
    };
    saveDatabase();
    return db.courses[idx];
  },

  deleteCourse: async (id: number): Promise<void> => {
    invalidateReference(REFERENCE_KEYS.courses);
    if (firestoreDb) {
      await firestoreDb.collection("courses").doc(`course_${id}`).delete();
      invalidateScheduleRelationCache();
      return;
    }
    db.courses = db.courses.filter(c => c.AdCourseId !== id);
    saveDatabase();
  },

  // Schedules
  // Scoped reads are the normal path for the operational workspace.  The legacy
  // getSchedules() method is retained for maintenance/export jobs, but interactive
  // screens should not pull ten years of timetable rows just to display one term.
  getSchedulesByScope: async (filters: { collegeId?: number; sectionId?: number; termId?: number } = {}): Promise<FSchedule[]> => {
    const collegeId = Number(filters.collegeId || 0);
    const sectionId = Number(filters.sectionId || 0);
    const termId = Number(filters.termId || 0);
    return cachedSchedules(`${collegeId}:${sectionId}:${termId}`, async () => {
      if (firestoreDb) {
        // The legacy SQL relationship is FSchedule -> AdCourse -> AdSection. Older
        // imported schedule rows therefore cannot be trusted to contain denormalized
        // AdCollegeId/AdSectionId fields. Resolve the academic hierarchy first, then
        // fetch only schedule rows belonging to that course universe/current term.
        if (sectionId) {
          const [sectionDoc, courseSnap] = await Promise.all([
            firestoreDb.collection("sections").doc(`section_${sectionId}`).get(),
            firestoreDb.collection("courses").where("AdSectionId", "==", sectionId).get()
          ]);
          if (!sectionDoc.exists) return [];
          const section = sectionDoc.data() as AdSection;
          if (collegeId && Number(section.AdCollegeId) !== collegeId) return [];
          const courses = courseSnap.docs.map(doc => doc.data() as AdCourse);
          const rows = await getFirestoreSchedulesForCourseIds(courses.map(course => course.AdCourseId), termId);
          return hydrateSchedules(rows, courses, [section]).sort((a,b)=>a.id-b.id);
        }

        if (collegeId) {
          const sectionSnap = await firestoreDb.collection("sections").where("AdCollegeId", "==", collegeId).get();
          const sections = sectionSnap.docs.map(doc => doc.data() as AdSection);
          if (!sections.length) return [];
          const sectionIds = sections.map(section => section.AdSectionId);
          const courseSnaps = await Promise.all(
            chunks(sectionIds).map(batch => firestoreDb!.collection("courses").where("AdSectionId", "in", batch).get())
          );
          const courseMap = new Map<number, AdCourse>();
          for (const snap of courseSnaps) for (const doc of snap.docs) {
            const course = doc.data() as AdCourse;
            courseMap.set(course.AdCourseId, course);
          }
          const courses = [...courseMap.values()];
          const rows = await getFirestoreSchedulesForCourseIds(courses.map(course => course.AdCourseId), termId);
          return hydrateSchedules(rows, courses, sections).sort((a,b)=>a.id-b.id);
        }

        if (termId) {
          const snap = await firestoreDb.collection("schedules").where("AdTermId", "==", termId).get();
          const rows = snap.docs.map(doc => doc.data() as FSchedule);
          return (await hydrateFirestoreScheduleRows(rows)).sort((a,b)=>a.id-b.id);
        }

        // Deliberately retain the all-history path only for explicit maintenance jobs.
        // Interactive API routes resolve the latest term before calling this method.
        return Repository.getSchedules();
      }
      return hydrateSchedules(db.schedules, db.courses, db.sections)
        .filter(row => (!collegeId || row.AdCollegeId === collegeId) && (!sectionId || row.AdSectionId === sectionId) && (!termId || row.AdTermId === termId))
        .sort((a,b)=>a.id-b.id);
    });
  },

  getScheduleConflictCandidates: async (row: Partial<FSchedule>): Promise<FSchedule[]> => {
    const termId = Number(row.AdTermId || 0);
    const instructorId = Number(row.AdInstructorId || 0);
    const courseId = Number(row.AdCourseId || 0);
    const roomCode = String(row.AdRoomCode || "").trim();
    if (!termId) return [];
    if (firestoreDb) {
      const collection = firestoreDb.collection("schedules");
      const queries: Promise<any>[] = [];
      // Single-field indexed lookups keep live validation responsive; hydrate the
      // resulting handful of rows through Course -> Section before scope checks.
      if (instructorId) queries.push(collection.where("AdInstructorId", "==", instructorId).get());
      if (roomCode) queries.push(collection.where("AdRoomCode", "==", roomCode).get());
      if (courseId) queries.push(collection.where("AdCourseId", "==", courseId).get());
      if (!queries.length) return [];
      const snapshots = await Promise.all(queries);
      const unique = new Map<number, FSchedule>();
      for (const snap of snapshots) for (const doc of snap.docs) {
        const item = doc.data() as FSchedule;
        if (Number(item.AdTermId) === termId) unique.set(item.id, item);
      }
      return (await hydrateFirestoreScheduleRows([...unique.values()])).sort((a,b)=>a.id-b.id);
    }
    return hydrateSchedules(db.schedules, db.courses, db.sections)
      .filter(item => item.AdTermId === termId && (
        (instructorId && item.AdInstructorId === instructorId) ||
        (roomCode && String(item.AdRoomCode || "").trim() === roomCode) ||
        (courseId && item.AdCourseId === courseId)
      ))
      .sort((a,b)=>a.id-b.id);
  },

  /**
   * Everything a set of courses has ever been, across every term on record.
   *
   * The regulation says how a course *should* be split into meetings; ten years
   * of this department's own timetables say how it *is* taught, including the
   * single-day three, four and five hour blocks that the articles never spell
   * out. Reading the history lets the product expect what the department
   * actually does and reserve its warnings for genuine departures.
   */
  getScheduleHistoryForCourses: async (courseIds: number[]): Promise<FSchedule[]> => {
    const ids = [...new Set(courseIds.map(Number).filter(Boolean))];
    if (!ids.length) return [];
    return cachedReference(`history:${ids.slice(0, 60).join(",")}`, async () => {
      if (firestoreDb) {
        const snapshots = await Promise.all(
          chunks(ids).map(batch => firestoreDb!.collection("schedules").where("AdCourseId", "in", batch).get())
        );
        const rows = new Map<number, FSchedule>();
        for (const snap of snapshots) for (const doc of snap.docs) {
          const row = doc.data() as FSchedule;
          rows.set(row.id, row);
        }
        return [...rows.values()];
      }
      const wanted = new Set(ids);
      return db.schedules.filter(row => wanted.has(Number(row.AdCourseId)));
    });
  },

  getSchedulesByRoom: async (roomCode: string, roomHall = ""): Promise<FSchedule[]> => {
    const code = String(roomCode || "").trim();
    const hall = String(roomHall || "").trim();
    if (!code) return [];
    if (firestoreDb) {
      const snap = await firestoreDb.collection("schedules").where("AdRoomCode", "==", code).get();
      const rows = snap.docs.map(doc => doc.data() as FSchedule)
        .filter(row => !hall || String(row.AdRoomHall || "").trim() === hall);
      return (await hydrateFirestoreScheduleRows(rows)).sort((a,b)=>a.id-b.id);
    }
    return hydrateSchedules(db.schedules, db.courses, db.sections)
      .filter(row => String(row.AdRoomCode || "").trim() === code && (!hall || String(row.AdRoomHall || "").trim() === hall))
      .sort((a,b)=>a.id-b.id);
  },

  countSchedules: async (): Promise<number> => cachedReference(REFERENCE_KEYS.scheduleCount, async () => {
    if (firestoreDb) {
      const aggregate = await firestoreDb.collection("schedules").count().get();
      return Number(aggregate.data().count || 0);
    }
    return db.schedules.length;
  }),

  hasSchedulesForCourse: async (courseId: number): Promise<boolean> => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("schedules").where("AdCourseId", "==", courseId).limit(1).get();
      return !snap.empty;
    }
    return db.schedules.some(row => row.AdCourseId === courseId);
  },

  getSchedules: async (): Promise<FSchedule[]> => {
    if (firestoreDb) {
      const [scheduleSnap, courseSnap, sectionSnap] = await Promise.all([
        firestoreDb.collection("schedules").orderBy("id", "asc").get(),
        firestoreDb.collection("courses").get(),
        firestoreDb.collection("sections").get()
      ]);
      return hydrateSchedules(
        scheduleSnap.docs.map(doc => doc.data() as FSchedule),
        courseSnap.docs.map(doc => doc.data() as AdCourse),
        sectionSnap.docs.map(doc => doc.data() as AdSection)
      );
    }
    return hydrateSchedules(db.schedules, db.courses, db.sections);
  },

  getScheduleById: async (id: number): Promise<FSchedule | undefined> => {
    if (firestoreDb) {
      const doc = await firestoreDb.collection("schedules").doc(`schedule_${id}`).get();
      if (!doc.exists) return undefined;
      const schedule = doc.data() as FSchedule;
      const courseDoc = await firestoreDb.collection("courses").doc(`course_${schedule.AdCourseId}`).get();
      if (!courseDoc.exists) return { ...schedule };
      const course = courseDoc.data() as AdCourse;
      const sectionDoc = await firestoreDb.collection("sections").doc(`section_${course.AdSectionId}`).get();
      return hydrateSchedules([schedule], [course], sectionDoc.exists ? [sectionDoc.data() as AdSection] : [])[0];
    }
    const schedule = db.schedules.find(row => row.id === id);
    return schedule ? hydrateSchedules([schedule], db.courses, db.sections)[0] : undefined;
  },

  createSchedule: async (schedule: Omit<FSchedule, "id">): Promise<FSchedule> => {
    invalidateSchedules();
    invalidateReference(REFERENCE_KEYS.scheduleCount);
    if (firestoreDb) {
      const nextId = await reserveFirestoreIds("schedules");
      const newSched = { ...schedule, id: nextId };
      await firestoreDb.collection("schedules").doc(`schedule_${nextId}`).set(newSched);
      return newSched;
    }
    const nextId = db.schedules.length > 0 ? Math.max(...db.schedules.map(s => s.id)) + 1 : 1;
    const newSched = { ...schedule, id: nextId };
    db.schedules.push(newSched);
    saveDatabase();
    return newSched;
  },

  updateSchedule: async (id: number, fields: Partial<FSchedule>): Promise<FSchedule> => {
    invalidateSchedules();
    invalidateReference(REFERENCE_KEYS.scheduleCount);
    if (firestoreDb) {
      const docRef = firestoreDb.collection("schedules").doc(`schedule_${id}`);
      const doc = await docRef.get();
      if (!doc.exists) throw new Error("الجدول غير موجود");
      const updated = { ...(doc.data() as FSchedule), ...fields };
      await docRef.set(updated);
      return updated;
    }
    const idx = db.schedules.findIndex(s => s.id === id);
    if (idx === -1) throw new Error("الجدول غير موجود");
    db.schedules[idx] = { ...db.schedules[idx], ...fields };
    saveDatabase();
    return db.schedules[idx];
  },

  deleteSchedule: async (id: number): Promise<void> => {
    invalidateSchedules();
    invalidateReference(REFERENCE_KEYS.scheduleCount);
    if (firestoreDb) {
      await firestoreDb.collection("schedules").doc(`schedule_${id}`).delete();
      return;
    }
    db.schedules = db.schedules.filter(s => s.id !== id);
    saveDatabase();
  },

  // Copy Schedule (atomic transaction / batch write)
  copySchedule: async (collegeId: number, sectionId: number, fromTermId: number, toTermId: number): Promise<number> => {
    invalidateSchedules();
    if (firestoreDb) {
      // FSchedule has no Section/College FK in legacy SQL. Resolve those values through
      // the current Course -> Section relationship before filtering/copying.
      const [source, target] = await Promise.all([
        Repository.getSchedulesByScope({ collegeId, sectionId, termId: fromTermId }),
        Repository.getSchedulesByScope({ collegeId, sectionId, termId: toTermId })
      ]);
      if (target.length) return -1;
      if (source.length === 0) return 0;

      // Keep the legacy transfer all-or-nothing. A single Firestore batch supports 500 writes.
      if (source.length > 500) throw new Error("تعذر نسخ الجدول دفعة واحدة");
      const firstId = await reserveFirestoreIds("schedules", source.length);
      const batch = firestoreDb.batch();
      source.forEach((row, index) => {
        const nextId = firstId + index;
        batch.set(firestoreDb!.collection("schedules").doc(`schedule_${nextId}`), {
          ...row,
          id: nextId,
          AdTermId: toTermId
        });
      });
      await batch.commit();
      return source.length;
    }

    const hydrated = hydrateSchedules(db.schedules, db.courses, db.sections);
    const targetExists = hydrated.some(row => row.AdSectionId === sectionId && row.AdTermId === toTermId);
    if (targetExists) return -1;

    const source = hydrated.filter(
      row => row.AdCollegeId === collegeId && row.AdSectionId === sectionId && row.AdTermId === fromTermId
    );
    if (source.length === 0) return 0;

    let nextId = db.schedules.length > 0 ? Math.max(...db.schedules.map(row => row.id)) + 1 : 1;
    for (const row of source) db.schedules.push({ ...row, id: nextId++, AdTermId: toTermId });
    saveDatabase();
    return source.length;
  },

  // Smart workspace: additive versions, drafts, comments and publication state.
  createScheduleVersion: async (entry: Omit<ScheduleVersion, "id" | "createdAt" | "scopeKey">): Promise<ScheduleVersion> => {
    const row: ScheduleVersion = {
      ...entry,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      scopeKey: `${entry.AdCollegeId}:${entry.AdSectionId}:${entry.AdTermId}`,
      rows: entry.rows.map(item => ({ ...item }))
    };
    if (firestoreDb) {
      await firestoreDb.collection("scheduleVersions").doc(row.id).set(row);
      return row;
    }
    if (!Array.isArray(db.scheduleVersions)) db.scheduleVersions = [];
    db.scheduleVersions.unshift(row);
    if (db.scheduleVersions.length > 500) db.scheduleVersions.length = 500;
    saveDatabase();
    return row;
  },

  getScheduleVersions: async (collegeId: number, sectionId: number, termId: number, limit = 60): Promise<ScheduleVersion[]> => {
    const scopeKey = `${collegeId}:${sectionId}:${termId}`;
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 60));
    if (firestoreDb) {
      const snap = await firestoreDb.collection("scheduleVersions").where("scopeKey", "==", scopeKey).limit(200).get();
      return snap.docs.map(doc => doc.data() as ScheduleVersion).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,safeLimit);
    }
    return (db.scheduleVersions || []).filter(row => row.scopeKey === scopeKey).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,safeLimit);
  },

  getScheduleVersionById: async (id: string): Promise<ScheduleVersion | undefined> => {
    if (firestoreDb) {
      const doc = await firestoreDb.collection("scheduleVersions").doc(id).get();
      return doc.exists ? doc.data() as ScheduleVersion : undefined;
    }
    return (db.scheduleVersions || []).find(row => row.id === id);
  },

  createScheduleDraft: async (entry: Omit<ScheduleDraft, "id" | "createdAt" | "updatedAt" | "scopeKey" | "status"> & { status?: ScheduleDraft["status"] }): Promise<ScheduleDraft> => {
    const now = new Date().toISOString();
    const row: ScheduleDraft = {
      ...entry,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      scopeKey: `${entry.AdCollegeId}:${entry.AdSectionId}:${entry.AdTermId}`,
      status: entry.status || "draft",
      rows: entry.rows.map(item => ({ ...item }))
    };
    if (firestoreDb) {
      await firestoreDb.collection("scheduleDrafts").doc(row.id).set(row);
      return row;
    }
    if (!Array.isArray(db.scheduleDrafts)) db.scheduleDrafts = [];
    db.scheduleDrafts.unshift(row);
    if (db.scheduleDrafts.length > 250) db.scheduleDrafts.length = 250;
    saveDatabase();
    return row;
  },

  updateScheduleDraft: async (id: string, fields: Partial<Pick<ScheduleDraft, "name" | "status" | "rows" | "publishedAt">>): Promise<ScheduleDraft> => {
    const updatedAt = new Date().toISOString();
    if (firestoreDb) {
      const ref = firestoreDb.collection("scheduleDrafts").doc(id);
      const doc = await ref.get();
      if (!doc.exists) throw new Error("المسودة غير موجودة");
      const current = doc.data() as ScheduleDraft;
      const next: ScheduleDraft = { ...current, ...fields, updatedAt, rows: fields.rows ? fields.rows.map(item=>({...item})) : current.rows };
      await ref.set(next);
      return next;
    }
    if (!Array.isArray(db.scheduleDrafts)) db.scheduleDrafts = [];
    const index = db.scheduleDrafts.findIndex(row => row.id === id);
    if (index < 0) throw new Error("المسودة غير موجودة");
    db.scheduleDrafts[index] = { ...db.scheduleDrafts[index], ...fields, updatedAt, rows: fields.rows ? fields.rows.map(item=>({...item})) : db.scheduleDrafts[index].rows };
    saveDatabase();
    return db.scheduleDrafts[index];
  },

  getScheduleDrafts: async (collegeId: number, sectionId: number, termId: number): Promise<ScheduleDraft[]> => {
    const scopeKey = `${collegeId}:${sectionId}:${termId}`;
    if (firestoreDb) {
      const snap = await firestoreDb.collection("scheduleDrafts").where("scopeKey", "==", scopeKey).limit(100).get();
      return snap.docs.map(doc=>doc.data() as ScheduleDraft).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    }
    return (db.scheduleDrafts || []).filter(row=>row.scopeKey===scopeKey).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  },

  getScheduleDraftById: async (id: string): Promise<ScheduleDraft | undefined> => {
    if (firestoreDb) {
      const doc = await firestoreDb.collection("scheduleDrafts").doc(id).get();
      return doc.exists ? doc.data() as ScheduleDraft : undefined;
    }
    return (db.scheduleDrafts || []).find(row => row.id === id);
  },

  // --- Read-only share links -------------------------------------------------

  createShareLink: async (entry: Omit<ScheduleShareLink, "id" | "scopeKey" | "createdAt" | "views">): Promise<ScheduleShareLink> => {
    const row: ScheduleShareLink = {
      ...entry,
      id: randomBytes(24).toString("base64url"),
      scopeKey: `${entry.AdCollegeId}:${entry.AdSectionId}:${entry.AdTermId}`,
      createdAt: new Date().toISOString(),
      views: 0
    };
    if (firestoreDb) {
      await firestoreDb.collection("scheduleShareLinks").doc(row.id).set(row);
      return row;
    }
    if (!Array.isArray(db.scheduleShareLinks)) db.scheduleShareLinks = [];
    db.scheduleShareLinks.unshift(row);
    if (db.scheduleShareLinks.length > 500) db.scheduleShareLinks.length = 500;
    saveDatabase();
    return row;
  },

  getShareLinks: async (collegeId: number, sectionId: number, termId: number): Promise<ScheduleShareLink[]> => {
    const scopeKey = `${collegeId}:${sectionId}:${termId}`;
    if (firestoreDb) {
      const snap = await firestoreDb.collection("scheduleShareLinks").where("scopeKey", "==", scopeKey).limit(50).get();
      return snap.docs.map(doc => doc.data() as ScheduleShareLink).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return (db.scheduleShareLinks || []).filter(row => row.scopeKey === scopeKey).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getShareLink: async (id: string): Promise<ScheduleShareLink | undefined> => {
    if (firestoreDb) {
      const doc = await firestoreDb.collection("scheduleShareLinks").doc(id).get();
      return doc.exists ? doc.data() as ScheduleShareLink : undefined;
    }
    return (db.scheduleShareLinks || []).find(row => row.id === id);
  },

  revokeShareLink: async (id: string): Promise<void> => {
    if (firestoreDb) {
      await firestoreDb.collection("scheduleShareLinks").doc(id).set({ revoked: true }, { merge: true });
      return;
    }
    const row = (db.scheduleShareLinks || []).find(item => item.id === id);
    if (!row) throw new Error("الرابط غير موجود");
    row.revoked = true;
    saveDatabase();
  },

  // Read counters are best-effort telemetry; a failed write must never block a reader.
  touchShareLink: async (id: string): Promise<void> => {
    const lastViewedAt = new Date().toISOString();
    if (firestoreDb) {
      await firestoreDb.collection("scheduleShareLinks").doc(id)
        .set({ lastViewedAt, views: FieldValue.increment(1) }, { merge: true });
      return;
    }
    const row = (db.scheduleShareLinks || []).find(item => item.id === id);
    if (!row) return;
    row.views = Number(row.views || 0) + 1;
    row.lastViewedAt = lastViewedAt;
    saveDatabase();
  },

  createScheduleComment: async (entry: Omit<ScheduleComment, "id" | "createdAt" | "resolved"> & { resolved?: boolean }): Promise<ScheduleComment> => {
    const row: ScheduleComment = { ...entry, id: randomUUID(), createdAt: new Date().toISOString(), resolved: Boolean(entry.resolved) };
    if (firestoreDb) {
      await firestoreDb.collection("scheduleComments").doc(row.id).set(row);
      return row;
    }
    if (!Array.isArray(db.scheduleComments)) db.scheduleComments = [];
    db.scheduleComments.unshift(row);
    if (db.scheduleComments.length > 2000) db.scheduleComments.length = 2000;
    saveDatabase();
    return row;
  },

  getScheduleComments: async (scheduleId: number): Promise<ScheduleComment[]> => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("scheduleComments").where("scheduleId", "==", scheduleId).limit(100).get();
      return snap.docs.map(doc=>doc.data() as ScheduleComment).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    }
    return (db.scheduleComments || []).filter(row=>row.scheduleId===scheduleId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  },

  setScheduleCommentResolved: async (id: string, resolved: boolean): Promise<void> => {
    if (firestoreDb) {
      const ref=firestoreDb.collection("scheduleComments").doc(id); const doc=await ref.get();
      if (!doc.exists) throw new Error("التعليق غير موجود");
      await ref.set({ ...(doc.data() as ScheduleComment), resolved }, { merge: false });
      return;
    }
    if (!Array.isArray(db.scheduleComments)) db.scheduleComments=[];
    const row=db.scheduleComments.find(item=>item.id===id); if(!row) throw new Error("التعليق غير موجود");
    row.resolved=resolved; saveDatabase();
  },

  /** The seconded staff a department is using this term. */
  getVisitingRoster: async (collegeId: number, sectionId: number, termId: number): Promise<number[]> => {
    const scopeKey = `${collegeId}:${sectionId}:${termId}`;
    if (firestoreDb) {
      const snap = await firestoreDb.collection("visitingRosters").where("scopeKey", "==", scopeKey).limit(1).get();
      return snap.empty ? [] : ((snap.docs[0].data() as VisitingRoster).instructorIds || []);
    }
    return (db.visitingRosters || []).find(row => row.scopeKey === scopeKey)?.instructorIds || [];
  },

  saveVisitingRoster: async (collegeId: number, sectionId: number, termId: number, instructorIds: number[]): Promise<number[]> => {
    const scopeKey = `${collegeId}:${sectionId}:${termId}`;
    const unique = [...new Set(instructorIds.map(Number).filter(Boolean))];
    const row: VisitingRoster = {
      id: scopeKey, scopeKey, collegeId, sectionId, termId,
      instructorIds: unique, updatedAt: new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection("visitingRosters").doc(scopeKey.replace(/:/g, "_")).set(row, { merge: false });
      return unique;
    }
    db.visitingRosters = [...(db.visitingRosters || []).filter(item => item.scopeKey !== scopeKey), row];
    saveDatabase();
    return unique;
  },

  getScheduleConstraints: async (collegeId: number, sectionId: number, termId: number): Promise<ScheduleConstraint[]> => {
    const scopeKey = `${collegeId}:${sectionId}:${termId}`;
    if (firestoreDb) {
      const snap = await firestoreDb.collection("scheduleConstraints").where("scopeKey", "==", scopeKey).limit(100).get();
      return snap.docs.map(doc=>doc.data() as ScheduleConstraint).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    }
    return (db.scheduleConstraints || []).filter(row=>row.scopeKey===scopeKey).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  },

  createScheduleConstraint: async (entry: Omit<ScheduleConstraint, "id" | "scopeKey" | "createdAt" | "updatedAt">): Promise<ScheduleConstraint> => {
    const now = new Date().toISOString();
    const row: ScheduleConstraint = {
      ...entry, id: randomUUID(), createdAt: now, updatedAt: now,
      scopeKey: `${entry.AdCollegeId}:${entry.AdSectionId}:${entry.AdTermId}`
    };
    if (firestoreDb) {
      await firestoreDb.collection("scheduleConstraints").doc(row.id).set(row);
      return row;
    }
    if (!Array.isArray(db.scheduleConstraints)) db.scheduleConstraints = [];
    db.scheduleConstraints.unshift(row);
    if (db.scheduleConstraints.length > 1000) db.scheduleConstraints.length = 1000;
    saveDatabase();
    return row;
  },

  updateScheduleConstraint: async (id: string, fields: Partial<Pick<ScheduleConstraint, "label" | "enabled" | "time" | "maxMinutes" | "roomCode" | "roomHall" | "day">>): Promise<ScheduleConstraint> => {
    const updatedAt = new Date().toISOString();
    if (firestoreDb) {
      const ref = firestoreDb.collection("scheduleConstraints").doc(id);
      const doc = await ref.get();
      if (!doc.exists) throw new Error("القاعدة غير موجودة");
      const next = { ...(doc.data() as ScheduleConstraint), ...fields, updatedAt } as ScheduleConstraint;
      await ref.set(next);
      return next;
    }
    if (!Array.isArray(db.scheduleConstraints)) db.scheduleConstraints = [];
    const index = db.scheduleConstraints.findIndex(row=>row.id===id);
    if (index < 0) throw new Error("القاعدة غير موجودة");
    db.scheduleConstraints[index] = { ...db.scheduleConstraints[index], ...fields, updatedAt };
    saveDatabase();
    return db.scheduleConstraints[index];
  },

  deleteScheduleConstraint: async (id: string): Promise<void> => {
    if (firestoreDb) { await firestoreDb.collection("scheduleConstraints").doc(id).delete(); return; }
    if (!Array.isArray(db.scheduleConstraints)) db.scheduleConstraints = [];
    db.scheduleConstraints = db.scheduleConstraints.filter(row=>row.id!==id);
    saveDatabase();
  },

  createScheduleDecisionMemory: async (entry: Omit<ScheduleDecisionMemory, "id" | "createdAt">): Promise<ScheduleDecisionMemory> => {
    const row: ScheduleDecisionMemory = { ...entry, id: randomUUID(), createdAt: new Date().toISOString() };
    if (firestoreDb) {
      await firestoreDb.collection("scheduleDecisionMemories").doc(row.id).set(row);
      return row;
    }
    if (!Array.isArray(db.scheduleDecisionMemories)) db.scheduleDecisionMemories = [];
    db.scheduleDecisionMemories.unshift(row);
    if (db.scheduleDecisionMemories.length > 2500) db.scheduleDecisionMemories.length = 2500;
    saveDatabase();
    return row;
  },

  getScheduleDecisionMemories: async (collegeId:number, sectionId:number, limit=250): Promise<ScheduleDecisionMemory[]> => {
    const safeLimit=Math.max(1,Math.min(500,Number(limit)||250));
    if (firestoreDb) {
      const snap=await firestoreDb.collection("scheduleDecisionMemories").where("AdCollegeId","==",collegeId).where("AdSectionId","==",sectionId).limit(500).get();
      return snap.docs.map(doc=>doc.data() as ScheduleDecisionMemory).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,safeLimit);
    }
    return (db.scheduleDecisionMemories||[]).filter(row=>row.AdCollegeId===collegeId&&row.AdSectionId===sectionId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,safeLimit);
  },

  getSchedulePublication: async (collegeId:number, sectionId:number, termId:number): Promise<SchedulePublication | undefined> => {
    const scopeKey=`${collegeId}:${sectionId}:${termId}`;
    if (firestoreDb) {
      const doc=await firestoreDb.collection("schedulePublications").doc(scopeKey).get();
      return doc.exists ? doc.data() as SchedulePublication : undefined;
    }
    return (db.schedulePublications || []).find(row=>row.scopeKey===scopeKey);
  },

  upsertSchedulePublication: async (entry: Omit<SchedulePublication,"id"|"scopeKey"|"publishedAt">): Promise<SchedulePublication> => {
    const scopeKey=`${entry.AdCollegeId}:${entry.AdSectionId}:${entry.AdTermId}`;
    const row:SchedulePublication={...entry,id:scopeKey,scopeKey,publishedAt:new Date().toISOString()};
    if (firestoreDb) {
      await firestoreDb.collection("schedulePublications").doc(scopeKey).set(row);
      return row;
    }
    if(!Array.isArray(db.schedulePublications))db.schedulePublications=[];
    const index=db.schedulePublications.findIndex(item=>item.scopeKey===scopeKey);
    if(index>=0)db.schedulePublications[index]=row;else db.schedulePublications.unshift(row);
    saveDatabase(); return row;
  },

  replaceScheduleScope: async (collegeId:number, sectionId:number, termId:number, rows:FSchedule[]): Promise<FSchedule[]> => {
    const normalizedInput = rows.map(row => ({ ...row, AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId }));
    if (firestoreDb) {
      const current = await Repository.getSchedulesByScope({ collegeId, sectionId, termId });
      const currentIds = new Set(current.map(row=>row.id));
      const needsId = normalizedInput.filter(row=>!Number.isInteger(row.id)||row.id<=0||!currentIds.has(row.id));
      const firstNewId = needsId.length ? await reserveFirestoreIds("schedules", needsId.length) : 0;
      let cursor=0;
      const normalized = normalizedInput.map(row=>currentIds.has(row.id)&&row.id>0 ? row : ({...row,id:firstNewId+cursor++}));
      if (current.length + normalized.length > 480) throw new Error("حجم الجدول كبير جداً للاستبدال الآمن دفعة واحدة");
      const batch=firestoreDb.batch();
      current.forEach(row=>batch.delete(firestoreDb!.collection("schedules").doc(`schedule_${row.id}`)));
      normalized.forEach(row=>batch.set(firestoreDb!.collection("schedules").doc(`schedule_${row.id}`),row));
      await batch.commit();
      return normalized;
    }
    const hydrated=hydrateSchedules(db.schedules,db.courses,db.sections);
    const current=hydrated.filter(row=>row.AdCollegeId===collegeId&&row.AdSectionId===sectionId&&row.AdTermId===termId);
    const currentIds=new Set(current.map(row=>row.id));
    let nextId=db.schedules.length?Math.max(...db.schedules.map(row=>row.id))+1:1;
    const normalized=normalizedInput.map(row=>currentIds.has(row.id)&&row.id>0?row:{...row,id:nextId++});
    const idsToRemove=new Set(current.map(row=>row.id));
    db.schedules=db.schedules.filter(row=>!idsToRemove.has(row.id));
    db.schedules.push(...normalized.map(row=>({...row})));
    saveDatabase();
    return normalized;
  },

  // Campus mobility (additive metadata; does not mutate legacy college/room schemas)
  getCampusMobilityProfile: async (collegeId: number): Promise<CampusMobilityProfile> => {
    if (firestoreDb) {
      const doc = await firestoreDb.collection("campusMobilityProfiles").doc(`college_${collegeId}`).get();
      if (doc.exists) return doc.data() as CampusMobilityProfile;
    } else {
      const found = (db.campusMobilityProfiles || []).find(row => row.AdCollegeId === collegeId);
      if (found) return found;
    }
    return { AdCollegeId: collegeId, defaultTravelMinutes: 15, sameBuildingMinutes: 3, pairs: [] };
  },

  upsertCampusMobilityProfile: async (profile: CampusMobilityProfile): Promise<CampusMobilityProfile> => {
    const normalized: CampusMobilityProfile = {
      AdCollegeId: Number(profile.AdCollegeId),
      defaultTravelMinutes: Math.max(1, Math.min(120, Number(profile.defaultTravelMinutes) || 15)),
      sameBuildingMinutes: Math.max(0, Math.min(30, Number(profile.sameBuildingMinutes) || 3)),
      pairs: Array.isArray(profile.pairs) ? profile.pairs.map(pair => ({
        fromBuilding: String(pair.fromBuilding || "").trim().slice(0, 40),
        toBuilding: String(pair.toBuilding || "").trim().slice(0, 40),
        minutes: Math.max(1, Math.min(120, Number(pair.minutes) || 1)),
      })).filter(pair => pair.fromBuilding && pair.toBuilding && pair.fromBuilding !== pair.toBuilding).slice(0, 120) : [],
      updatedAt: profile.updatedAt || new Date().toISOString(),
      updatedBy: String(profile.updatedBy || "").slice(0, 120),
    };
    if (firestoreDb) {
      await firestoreDb.collection("campusMobilityProfiles").doc(`college_${normalized.AdCollegeId}`).set(normalized);
      return normalized;
    }
    if (!Array.isArray(db.campusMobilityProfiles)) db.campusMobilityProfiles = [];
    const index = db.campusMobilityProfiles.findIndex(row => row.AdCollegeId === normalized.AdCollegeId);
    if (index >= 0) db.campusMobilityProfiles[index] = normalized;
    else db.campusMobilityProfiles.push(normalized);
    saveDatabase();
    return normalized;
  },

  // Rooms
  getRooms: async (): Promise<AdRoom[]> => {
    if (firestoreDb) {
      const snap = await firestoreDb.collection("rooms").orderBy("AdRoomId", "asc").get();
      return snap.docs.map(doc => doc.data() as AdRoom);
    }
    return db.rooms;
  }
};
