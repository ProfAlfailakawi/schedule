/**
 * ── تدقيق التحمّل: يدٌ واحدة لا فصلٌ كامل (المرحلة ١) ─────────────────────────
 *
 * فحصُ الهوية والإرسال وصفحةُ الحالة كانت تقرأ كل طلبات الكلية في الفصل لتجد
 * طلبَ طالبٍ واحد. هذا التدقيق يثبت أن السؤال صار بالبصمة، وأن النتيجةَ نفسُها
 * (لا تغيّر في السلوك) على آلاف الطلبات.
 */
import fs from "fs";
import path from "path";
import os from "os";

const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-needs-scale-"));
fs.writeFileSync(path.join(privateDir, "db.json"), JSON.stringify({
  schedules: [], colleges: [], sections: [], terms: [], courses: [], instructors: [],
  systemUsers: [], formSecurity: [], adCollegeUserAssigns: [], formNames: [], sessions: [], studentNeeds: [],
}), { mode: 0o600 });
process.env.NODE_ENV = "test";
process.env.DATA_MODE = "demo";
process.env.SCHEDULE_PRIVATE_DIR = privateDir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase();
console.warn = quiet;

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  if (from < 0) return "";
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to < 0 ? undefined : to);
};

/* ── سلوكٌ: ثلاثة آلاف طلبٍ، والبحثُ يرجع طلبَ صاحبه وحده ─────────────────── */
{
  const N = 3000;
  for (let i = 0; i < N; i += 1) {
    await Repository.saveStudentNeed({
      fingerprint: `fp-${i}`, AdCollegeId: 1 + (i % 3), AdSectionId: 10, surveySectionId: 10,
      AdTermId: 5, courseIds: [100 + (i % 7)], requestType: "new-course",
    } as any);
  }
  const t0 = Date.now();
  const mine = await Repository.getStudentNeedsByFingerprint("fp-42", 1, 5);
  check(mine.length === 1 && mine[0].fingerprint === "fp-42", "P1 البحث بالبصمة يرجع طلب صاحبه وحده من بين ٣٠٠٠");
  check((await Repository.getStudentNeedsByFingerprint("fp-42", 2, 5)).length === 0, "P1 كلية غير كليته: لا شيء");
  check((await Repository.getStudentNeedsByFingerprint("fp-42", 1, 6)).length === 0, "P1 فصل غير فصله: لا شيء");
  check((await Repository.getStudentNeedsByFingerprint("", 1, 5)).length === 0, "P1 بصمة فارغة لا تطابق شيئاً");
  check((await Repository.getStudentNeedsByFingerprint("nobody", 1, 5)).length === 0, "P1 بصمة مجهولة: لا شيء");
  check(Date.now() - t0 < 1000, "P1 السؤال سريع على ٣٠٠٠ طلب");

  /* السلوك مطابقٌ للمسح القديم: ما كان getStudentNeeds يجده بالتصفية هو ما يجده البحث. */
  const viaScan = (await Repository.getStudentNeeds(2, 0, 5)).filter(item => item.fingerprint === "fp-1");
  const viaHand = await Repository.getStudentNeedsByFingerprint("fp-1", 2, 5);
  check(JSON.stringify(viaScan) === JSON.stringify(viaHand), "P1 النتيجة مطابقة للمسح القديم بالتصفية");
}

/* ── بنية: لا مسحَ للفصل في مسارات الهوية ──────────────────────────────────── */
{
  const server = read("server.ts");
  const prior = between(server, "const priorNeedForHand=", "\nconst caseRefMatches");
  const verification = between(server, "const reusableGraduateVerification=", "\nconst normalizeStudentIdentityName");
  const identity = between(server, "const reusableStudentIdentity=", "\n/* One numeric alphabet");
  const myCase = between(server, 'app.post("/api/public/survey/:token/my-case"', "const nameOf = new Map");
  for (const [label, body] of [["priorNeedForHand", prior], ["reusableGraduateVerification", verification], ["reusableStudentIdentity", identity], ["my-case", myCase]] as const) {
    check(body.includes("getStudentNeedsByFingerprint("), `P1 ${label} يسأل بالبصمة`);
    check(!/getStudentNeeds\([^)]*,\s*0\s*,/.test(body), `P1 ${label} لا يقرأ الكلية كلها`);
  }
  const repo = read("src/db/repository.ts");
  const method = between(repo, "  getStudentNeedsByFingerprint: async", "\n  },\n");
  check(method.includes('.where("fingerprint", "==", fingerprint)'), "P1 المستودع يستعمل فهرس الحقل المفرد (بلا فهرس مركّب)");
  check(!/FieldPath\.documentId|readStudentNeedsWhere/.test(method), "P1 لا مسح بالصفحات في مسار اليد الواحدة");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
