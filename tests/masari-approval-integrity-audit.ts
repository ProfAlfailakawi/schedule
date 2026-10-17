/**
 * ── سلامة الطريق من «مساري» واستبيان الأستاذ إلى الكشف والجدول ───────────────
 *
 *  1. طلباتُ الطالب من «مساري» في الفصل والقسم نفسيهما لا يمحو أحدُها الآخر:
 *     فتحُ مقرّر، وتعارض، وحالةُ خريج، وجوابُ «بعد التسجيل» — كلٌّ سجلٌّ مستقلّ.
 *     وإعادةُ إرسال النوع نفسه تُحدّث سجلّه ولا تكرّره.
 *  2. قرارُ القسم على بند استبيان الأستاذ لا يقع مرّتين على بندٍ ثُبّت، ولا يُثبَّت
 *     بندٌ بأوقاتٍ مختلفة بوقت أوّلها، ولا يبقى صفٌّ يتيمٌ إن رُفض تسجيلُ القرار.
 */
import fs from "fs";
import path from "path";
import os from "os";

const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-masari-integrity-"));
fs.writeFileSync(path.join(privateDir, "db.json"), JSON.stringify({
  schedules: [], colleges: [], sections: [], terms: [], courses: [], instructors: [],
  systemUsers: [], formSecurity: [], adCollegeUserAssigns: [], formNames: [], sessions: [], studentNeeds: [],
}), { mode: 0o600 });
process.env.NODE_ENV = "test";
process.env.DATA_MODE = "demo";
process.env.SCHEDULE_PRIVATE_DIR = privateDir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase, studentNeedKind } = await import("../src/db/repository");
await initDatabase();
console.warn = quiet;

let passed = 0, failed = 0;
function check(condition: boolean, name: string, info?: unknown) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, info ?? ""); }
}
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── 1. مساري ───────────────────────────────────────────────────────────── */
const base = { fingerprint: "fp-masari", AdCollegeId: 1, AdSectionId: 10, surveySectionId: 10, studentSectionId: 10, AdTermId: 7 };
const course = await Repository.saveStudentNeed({ ...base, courseIds: [101], requestType: "new-course", details: "لم يُفتح" } as any, { byKind: true });
const conflict = await Repository.saveStudentNeed({ ...base, courseIds: [102], requestType: "course-conflict", details: "تعارض" } as any, { byKind: true });
const graduate = await Repository.saveStudentNeed({ ...base, courseIds: [], requestType: "graduate", graduateReason: "last-term", passedUnits: 120, details: "خريج" } as any, { byKind: true });
const after = await Repository.saveStudentNeed({ ...base, courseIds: [103], requestType: "new-course", details: "من «مساري» بعد التسجيل — مقرر: امتلأت الشعب" } as any, { byKind: true });
const mine = await Repository.getStudentNeedsByFingerprint("fp-masari", 1, 7);
check(new Set([course.id, conflict.id, graduate.id, after.id]).size === 4, "M1 أربعة أنواع طلبات = أربع حالات مستقلة بأرقامها");
check(mine.length === 4, "M1 الكشف يقرأ الحالات الأربع كلها", mine.map(n => [n.requestType, n.courseIds]));
check(mine.find(n => n.id === course.id)?.courseIds?.join() === "101", "M1 طلب فتح المقرر لم يمحه طلب التعارض");
check(Number(mine.find(n => n.id === graduate.id)?.passedUnits) === 120, "M1 حالة الخريج لم يمحها جواب «بعد التسجيل»");
const again = await Repository.saveStudentNeed({ ...base, courseIds: [101, 104], requestType: "new-course", details: "تحديث" } as any, { byKind: true });
check(again.id === course.id && (await Repository.getStudentNeedsByFingerprint("fp-masari", 1, 7)).length === 4, "M1 إعادة إرسال النوع نفسه تحدّث سجله ولا تكرره");
check(studentNeedKind({ requestType: undefined }) === "course", "M1 طلب الاستبيان القديم بلا نوع يعامل طلبَ مقرر");
const sb = { ...base, fingerprint: "fp-survey" };
const s1 = await Repository.saveStudentNeed({ ...sb, courseIds: [101], requestType: "new-course" } as any);
const s2 = await Repository.saveStudentNeed({ ...sb, courseIds: [], requestType: "graduate" } as any);
check(s1.id === s2.id, "M1 الاستبيان العام يبقى حالةً واحدة برقم واحد (تحقق رقم الحالة فيه)");
check(/requestType === "graduate" && Number\(need\.surveySectionId/.test(read("src/server/studentDoorRoutes.ts")), "M1 حارس «حالة تخرج موثقة» يبحث عن حالة الخريج تحديداً");

/* ── 2. استبيان الأستاذ ← الجدول ───────────────────────────────────────── */
const server = read("server.ts");
const decideRoute = server.slice(server.indexOf('app.post("/api/instructor-requests/:id/decide"'), server.indexOf('app.post("/api/instructor-requests/:id/reply"'));
check(/item\.decision\?\.state === "fixed"[\s\S]{0,200}already-fixed/.test(decideRoute), "I1 الخادم يرفض إعادة الفصل في بند ثُبّت");
check(decideRoute.includes("mixed-times"), "I2 الخادم يرفض تثبيت بند بأوقات مختلفة بوقت واحد");
const inbox = read("src/components/InstructorInbox.tsx");
check(/decision\?\.state === "fixed"\) return true/.test(inbox), "I1 الشاشة لا تعيد كتابة بند ثُبّت (لا صف مكرر)");
check(/const refused = Boolean\(response && response\.status >= 400 && response\.status < 500/.test(inbox), "I3 صف الإضافة يُسحب فقط إن رفض الخادم القرار صراحة (لا عند ردٍّ ضائع)");
check(/Number\(draft\.courseId\) !== expectedCourse/.test(inbox), "I3 لا يُنشأ صف لمقرر غير مقرر البند");
check(/if \(currentRows\.has\(Number\(item\.rowId\)\)\) await request\(`\/api\/schedules\/\$\{item\.rowId\}`, \{ method: "DELETE" \}\)/.test(inbox), "I4 إعادة تسجيل قرار حذفٍ وقع لا تتعثر");
check(/لم يُكتب شيء/.test(inbox), "I5 سلسلة البنود المترابطة تُفحص قبل أي كتابة");

console.log(`\n${failed ? "\x1b[31m" : "\x1b[32m"}${passed} نجح، ${failed} فشل\x1b[0m`);
fs.rmSync(privateDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
