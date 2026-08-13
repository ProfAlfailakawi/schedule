import fs from "fs";
import { setReferenceCacheEnabled } from "../src/db/referenceCache";
import path from "path";
import os from "os";
import { gunzipSync } from "zlib";
import { validateCivilId, generateSyntheticCivilId } from "../src/utils/civilId";
import { clusterSqueezed, courseHue, COURSE_HUES, dayLoad, pickLive } from "../src/utils/weekVisual";
import { Repository, initDatabase } from "../src/db/repository";

const originalLog = console.log;
const originalError = console.error;
console.log = () => {};
console.error = () => {};

let passed = 0;
let failed = 0;
function assert(condition: boolean, testName: string) {
  if (condition) { passed++; originalLog(`\x1b[32m✓ PASS: ${testName}\x1b[0m`); }
  else { failed++; originalLog(`\x1b[31m✗ FAIL: ${testName}\x1b[0m`); }
}

const fixtureDir = path.join(process.cwd(), "database");
const fixtureDbPath = path.join(fixtureDir, "db.json");
const gzipPath = path.join(fixtureDir, "db.json.gz");

let originalDb: Buffer | null = null;
if (fs.existsSync(fixtureDbPath)) {
  originalDb = fs.readFileSync(fixtureDbPath);
} else if (fs.existsSync(gzipPath)) {
  originalDb = gunzipSync(fs.readFileSync(gzipPath));
}

const testPrivateDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-tests-"));
const dbPath = path.join(testPrivateDir, "db.json");
if (originalDb) {
  fs.writeFileSync(dbPath, originalDb, { mode: 0o600 });
} else {
  // Provide empty DB so the process doesn't fail if initialized elsewhere
  fs.writeFileSync(dbPath, JSON.stringify({}), { mode: 0o600 });
}
function cleanupTestState() { fs.rmSync(testPrivateDir, { recursive: true, force: true }); }

async function runTests() {
  originalLog("\n=================================");
  originalLog(" SCHEDULE LEGACY-PARITY TESTS ");
  originalLog("=================================\n");
  process.env.NODE_ENV = "test";
  process.env.DATA_MODE = "demo"; // demo = exact local legacy snapshot in this build
  // Every case must observe exactly the rows it just wrote, with no reference
  // cache standing between the write and the next read.
  setReferenceCacheEnabled(false);
  // Tests intentionally operate on the bundled fixture, never the persistent production state.
  process.env.SCHEDULE_PRIVATE_DIR = testPrivateDir;
  
  originalLog("--- 1. Kuwaiti Civil ID legacy checksum ---");
  for (let n = 0; n < 1000; n++) {
    const valid = generateSyntheticCivilId();
    assert(validateCivilId(valid).isValid, `synthetic valid civil ID ${n + 1}`);
    const last = Number(valid[11]);
    const corrupted = valid.slice(0, 11) + ((last + 1) % 10);
    assert(!validateCivilId(corrupted).isValid, `single-digit corruption rejected ${n + 1}`);
  }
  assert(!validateCivilId("12345678901").isValid, "11-digit Civil ID rejected");
  assert(!validateCivilId("1234567890123").isValid, "13-digit Civil ID rejected");
  assert(!validateCivilId("١٢٣٤٥٦٧٨٩٠١٢").isValid, "Arabic-Indic digits rejected");
  assert(!validateCivilId("12345a789012").isValid, "letters rejected");

  originalLog("\n--- 1b. Week visual arithmetic (pure) ---");
  {
    // Colour: deterministic, in-palette, and spread for this department's
    // real numeric codes — the exact monochrome regression that shipped once.
    assert(courseHue("112", "ورشة إنتاج مواد تعليمية") === courseHue("112", "ورشة إنتاج مواد تعليمية"), "hue is deterministic");
    assert(COURSE_HUES.includes(courseHue("491", "الوسائط")), "hue stays inside the palette");
    const spread = new Set([
      courseHue("112", "ورشة إنتاج مواد تعليمية"),
      courseHue("112", "الحاسوب التعليمي"),
      courseHue("113", "مشروع التخرج"),
      courseHue("491", "تصميم وإنتاج الأفلام"),
      courseHue("491", "الوسائط المتعددة"),
    ]);
    assert(spread.size >= 3, "numeric codes 112/113/491 no longer collapse to one hue family");
    assert(courseHue("112", "الحاسوب التعليمي") !== courseHue("112", "ورشة إنتاج مواد تعليمية"), "same code, different course name → different hue");

    // Clustering: the chain-tail exemption and the five-member floor.
    const squeeze = (id: number, top: number, height: number, lanes: number, span: number) => ({ id, top, height, lanes, span });
    const peak = [1, 2, 3, 4, 5].map(n => squeeze(n, 100, 90, 5, 1));
    const tail = squeeze(9, 260, 90, 5, 5); // full-span solitary tail of the same chain
    const bundled = clusterSqueezed([...peak, tail]);
    assert(bundled.length === 1, "five squeezed cards form exactly one bundle");
    assert(bundled[0].ids.length === 5 && !bundled[0].ids.includes(9), "full-span chain tail stays out of the weave");
    assert(bundled[0].top === 100 && bundled[0].bottom === 190, "bundle bounds hug its members");
    assert(clusterSqueezed(peak.slice(0, 4)).length === 0, "four squeezed cards stay ordinary cards");
    const twoGroups = clusterSqueezed([
      ...[1, 2, 3, 4, 5].map(n => squeeze(n, 0, 60, 5, 1)),
      ...[6, 7, 8, 9, 10].map(n => squeeze(n, 300, 60, 5, 1)),
    ]);
    assert(twoGroups.length === 2, "separated crushes become separate bundles");
    assert(clusterSqueezed([...Array(12)].map((_, i) => squeeze(i + 1, 50, 80, 12, 1)))[0]?.ids.length === 12, "twelve concurrent lectures weave as one");

    // Day load: minutes, not counts.
    const lecture = (day: string, from: string, to: string) => ({ [day]: true, fstarttime: from, fendtime: to });
    const load = dayLoad([
      lecture("fsunday", "08:00", "09:00"),
      lecture("fmonday", "08:00", "12:00"),
      lecture("fmonday", "12:00", "14:00"),
    ]);
    assert(load.share.fmonday === 100, "heaviest day reads 100");
    assert(load.share.fsunday === 17, "one hour against six reads 17");
    assert(load.minutesByDay.ftuesday === 0 && load.share.ftuesday === 0, "an empty day reads zero");
    assert(dayLoad([lecture("fsunday", "10:00", "09:00")]).minutesByDay.fsunday === 0, "a lecture ending before it starts counts nothing");

    // Running/next: inclusive start, exclusive end, weekend silence.
    const rows = [
      { id: 1, fsunday: true, fstarttime: "08:00", fendtime: "09:30" },
      { id: 2, fsunday: true, fstarttime: "11:00", fendtime: "12:00" },
      { id: 3, fsunday: true, fstarttime: "10:00", fendtime: "10:30" },
    ] as any;
    assert(pickLive(rows, "fsunday", 8 * 60).running.has(1), "a lecture is running at its first minute");
    assert(!pickLive(rows, "fsunday", 9 * 60 + 30).running.has(1), "a lecture is over at its last minute");
    assert(pickLive(rows, "fsunday", 9 * 60 + 45).next === 3, "the nearest coming lecture is the next, not the first listed");
    assert(pickLive(rows, null, 9 * 60).running.size === 0 && pickLive(rows, null, 9 * 60).next === null, "a weekend has no running and no next");
  }

  if (!originalDb) {
    originalLog("\n[!] No legacy parity snapshot found in database/. Skipping DB parity tests in CI.");
    originalLog("\n=================================");
    originalLog(`Total Passed: ${passed}`);
    originalLog(`Total Failed: ${failed}`);
    originalLog("=================================");
    cleanupTestState();
    if (failed) process.exitCode = 1;
    return;
  }

  await initDatabase();

  originalLog("\n--- 2. Real migrated authentication snapshot ---");
  const admin = await Repository.getUserByLogin("admin");
  assert(admin?.SystemUserId === 1, "legacy admin account exists with SystemUserId=1");
  assert(admin?.IsAdminUser === true && admin?.IsActive === true && admin?.IsLocked === false && !admin?.IsDeleted, "legacy admin status preserved");
  assert(!!admin && Repository.verifyPassword("a7424400", admin.SystemUserPass), "legacy admin password authenticates after scrypt migration");
  assert(!!admin && Repository.decryptPasswordFromVault(admin.SystemUserPassVault) === "a7424400", "legacy admin password view/edit value survives AES-GCM compatibility migration");
  assert(!!admin && !Repository.verifyPassword("password123", admin.SystemUserPass), "obsolete AI Studio demo password is rejected");
  const secureHash = Repository.hashPassword("new-password");
  assert(secureHash.startsWith("scrypt$") && Repository.verifyPassword("new-password", secureHash), "new passwords use scrypt");
  await Repository.createSession("test_session", 1, 60_000);
  assert((await Repository.getSession("test_session"))?.userId === 1, "session persists authenticated user");
  await Repository.deleteSession("test_session");
  assert((await Repository.getSession("test_session")) === undefined, "session deletion works");

  originalLog("\n--- 3. Exact legacy data counts ---");
  assert((await Repository.getUsers()).length === 29, "29 SystemUser rows");
  assert((await Repository.getFormNames()).length === 18, "18 FormName rows");
  assert((await Repository.getFormSecurity()).length === 219, "219 FormSecurity rows");
  assert((await Repository.getCollegeUserAssigns()).length === 189, "189 AdCollegeUserAssign rows");
  assert((await Repository.getTerms()).length === 31, "31 AdTerm rows");
  assert((await Repository.getColleges()).length === 13, "13 AdCollege rows");
  assert((await Repository.getSections()).length === 87, "87 AdSection rows");
  assert((await Repository.getInstructors()).length === 743, "743 AdInstructor rows");
  assert((await Repository.getCourses()).length === 1404, "1404 AdCourse rows");
  assert((await Repository.getSchedules()).length === 15430, "15430 FSchedule rows");
  const realSchedules = await Repository.getSchedules();
  const dayKeys = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
  assert(realSchedules.every(row => row.fdetail === dayKeys.map((key, index) => row[key] ? String(index + 1) : "").filter(Boolean).join(",")), "all 15,430 legacy fdetail values match numeric weekday encoding 1..5");

  originalLog("\n--- 4. Legacy permission/scope row identity ---");
  const permissions = await Repository.getFormSecurity();
  assert(permissions.every(row => Number.isInteger(row.legacyId)), "every imported FormSecurity row preserves legacy Id");
  const scopes = await Repository.getCollegeUserAssigns();
  assert(scopes.every(row => Number.isInteger(row.legacyId)), "every imported AdCollegeUserAssign row preserves legacy Id");
  const duplicateScope = scopes.find((row, idx) => scopes.some((other, j) => j !== idx && other.SystemUserId === row.SystemUserId && other.AdCollegeId === row.AdCollegeId && other.AdSectionId === row.AdSectionId));
  assert(!!duplicateScope, "historical duplicate scope rows are preserved rather than silently de-duplicated");

  const permissionProbe = await Repository.createSecurity(1, 2);
  assert(Number.isInteger(permissionProbe.legacyId), "new permission receives a stable row Id");
  const permissionUpdated = await Repository.updateSecurity(permissionProbe.legacyId!, 1, 3);
  assert(permissionUpdated.FormNameId === 3, "permission edit targets the exact legacy row Id");
  await Repository.deleteSecurity(permissionProbe.legacyId!);
  assert(!(await Repository.getFormSecurity()).some(row => row.legacyId === permissionProbe.legacyId), "permission delete targets one row");

  const scopeProbe = await Repository.createUserAssign(1, (await Repository.getColleges())[0].AdCollegeId, (await Repository.getSections())[0].AdSectionId);
  assert(Number.isInteger(scopeProbe.legacyId), "new user scope receives a stable row Id");
  await Repository.deleteUserAssign(scopeProbe.legacyId!);
  assert(!(await Repository.getCollegeUserAssigns()).some(row => row.legacyId === scopeProbe.legacyId), "scope delete targets one row even when tuple duplicates exist");

  originalLog("\n--- 5. CRUD + decimal CourseHours parity ---");
  const newColl = await Repository.createCollege("ZZT", "كلية اختبار مؤقتة");
  const newSection = await Repository.createSection(newColl.AdCollegeId, "ZZT", "قسم اختبار مؤقت");
  const newCourse = await Repository.createCourse(newColl.AdCollegeId, newSection.AdSectionId, "990001", "مقرر اختبار", 3, 1.5, 30);
  assert(newCourse.CourseHours === 1.5, "CourseHours preserves SQL float decimal 1.5");
  const updatedCourse = await Repository.updateCourse(newCourse.AdCourseId, newColl.AdCollegeId, newSection.AdSectionId, "990002", "مقرر اختبار معدل", 3, 2.5, 35);
  assert(updatedCourse.CourseHours === 2.5, "editing CourseHours preserves decimal values");

  originalLog("\n--- 5b. Relational semantics over Firestore denormalization ---");
  const relationTerm = await Repository.createTerm("فصل اختبار العلاقات");
  const relationInstructor = await Repository.createInstructor(generateSyntheticCivilId(), "أستاذ اختبار العلاقات", "00000000");
  const relationSchedule = await Repository.createSchedule({
    AdCollegeId:newColl.AdCollegeId, AdSectionId:newSection.AdSectionId, AdTermId:relationTerm.AdTermId,
    AdCourseId:newCourse.AdCourseId, AdCourseName:newCourse.CourseName, SCode:"1", AdInstructorId:relationInstructor.AdInstructorId,
    fsunday:true, fmonday:false, ftuesday:false, fwednesday:false, fthursday:false,
    fstarttime:"08:00", fendtime:"09:00", AdRoomCode:"T", AdRoomHall:"1", fdetail:"1"
  });
  const secondCollege = await Repository.createCollege("ZZ2", "كلية اختبار العلاقات الثانية");
  await Repository.updateSection(newSection.AdSectionId, secondCollege.AdCollegeId, newSection.AdSectionCode, newSection.AdSectionName);
  const afterSectionMove = await Repository.getScheduleById(relationSchedule.id);
  assert(afterSectionMove?.AdCollegeId === secondCollege.AdCollegeId, "schedule college follows current Section relationship exactly like SQL navigation");
  const secondSection = await Repository.createSection(secondCollege.AdCollegeId, "ZZ2", "قسم اختبار العلاقات الثاني");
  await Repository.updateCourse(newCourse.AdCourseId, secondCollege.AdCollegeId, secondSection.AdSectionId, "990003", "مقرر منتقل", 3, 2.5, 35);
  const afterCourseMove = await Repository.getScheduleById(relationSchedule.id);
  assert(afterCourseMove?.AdSectionId === secondSection.AdSectionId && afterCourseMove?.AdCollegeId === secondCollege.AdCollegeId, "schedule section/college follow current Course->Section relationship");
  assert(afterCourseMove?.AdCourseName === "مقرر منتقل", "schedule course display name follows current Course name");

  originalLog("\n--- 6. Exact CopySchedule semantics ---");
  const schedules = await Repository.getSchedules();
  const source = schedules.find(row => schedules.filter(r => r.AdCollegeId === row.AdCollegeId && r.AdSectionId === row.AdSectionId && r.AdTermId === row.AdTermId).length > 0)!;
  assert(!!source, "a real legacy source schedule exists");
  const tempTarget = await Repository.createTerm("فصل اختبار النسخ المؤقت");
  const sourceCount = schedules.filter(r => r.AdCollegeId === source.AdCollegeId && r.AdSectionId === source.AdSectionId && r.AdTermId === source.AdTermId).length;
  const copiedCount = await Repository.copySchedule(source.AdCollegeId, source.AdSectionId, source.AdTermId, tempTarget.AdTermId);
  assert(copiedCount === sourceCount, "first copy transfers every source row to an empty target term");
  const secondCopy = await Repository.copySchedule(source.AdCollegeId, source.AdSectionId, source.AdTermId, tempTarget.AdTermId);
  assert(secondCopy === -1, "second copy is rejected when destination section+term already contains any rows");

  originalLog("\n=================================");
  originalLog(`Total Passed: ${passed}`);
  originalLog(`Total Failed: ${failed}`);
  originalLog("=================================");
  cleanupTestState();
  if (failed) process.exitCode = 1;
}

runTests().catch(err => {
  cleanupTestState();
  originalError("Fatal error during test run:", err);
  process.exitCode = 1;
});
