/**
 * ── تدقيق رحلة الطالب (مراجعة الأدوار الستة، 2026-09-25) ────────────────────
 *
 * كل قسمٍ هنا يقابل ملاحظةً من قائمة «الطالب» (S1…S22). الفحوص إمّا سلوكية
 * (تستدعي الدالة المصدّرة نفسها) وإمّا بنيوية (تثبت أن القاعدة مكتوبة في
 * مكانٍ واحد وأن كلّ مستدعٍ يمرّ بها).
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";
import { validateCivilId } from "../src/utils/civilId";
import { suggestedDegreeRule } from "../src/utils/degreeRules";
import { applyStudentCaseDecision, isCaseLevelNeed, studentCaseRefusal, studentCaseStatus } from "../src/utils/studentCaseDecision";

/* مخزنٌ محليٌّ معزول لكل تشغيل: لا يلمس بيانات أحد. */
const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-student-journey-"));
fs.writeFileSync(path.join(privateDir, "db.json"), JSON.stringify({
  schedules: [], colleges: [], sections: [], terms: [], courses: [], instructors: [],
  systemUsers: [], formSecurity: [], adCollegeUserAssigns: [], formNames: [], sessions: [], studentNeeds: [],
}), { mode: 0o600 });
process.env.NODE_ENV = "test";
process.env.DATA_MODE = "demo";
process.env.SCHEDULE_PRIVATE_DIR = privateDir;
const quiet = console.warn; console.warn = () => {};
const repositoryModule = await import("../src/db/repository");
const { Repository, initDatabase, StudentCourseStateConflict } = repositoryModule;
await initDatabase();
console.warn = quiet;

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const server = read("server.ts");
const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  if (from < 0) return "";
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to < 0 ? undefined : to);
};

const surveyPageSource = between(server, "function studentCaseSurveyPage", "</script></body></html>`;");

/* ── S1 الخصوصية: لا بيانات طالبٍ حقيقي في المستودع ─────────────────────── */
{
  const jpg = fs.readFileSync(path.join(ROOT, "public/graduation-sheet-example.jpg"));
  check(jpg[0] === 0xff && jpg[1] === 0xd8, "S1 نموذج صحيفة التخرج صورة JPEG صالحة");
  check(!jpg.includes(Buffer.from("Exif")), "S1 النموذج بلا بيانات EXIF (ليس لقطة شاشة من جهاز)");
  const generator = read("scripts/make-graduation-sheet-example.mjs");
  check(generator.includes("طالب تجريبي") && generator.includes("بيانات وهمية"),
    "S1 النموذج يُولَّد برمجياً ببيانات وهمية معلنة");
  const synthetic = new Set(["300010100122", "300123100006"]);
  const tracked = execSync("git ls-files server.ts src tests scripts public", { cwd: ROOT }).toString().trim().split("\n")
    .filter(file => /\.(ts|tsx|js|mjs|cjs|py|html|json)$/.test(file))
    /* The generated location registry holds 12-digit building/hall keys, not people. */
    .filter(file => !file.startsWith("src/generated/"));
  const leaks: string[] = [];
  for (const file of tracked) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const match of text.matchAll(/(?<![\d_])[23]\d{11}(?!\d)/g)) {
      const value = match[0];
      if (synthetic.has(value) || !validateCivilId(value).isValid) continue;
      leaks.push(`${file}:${value.slice(0, 2)}…`);
    }
    for (const match of text.matchAll(/(?<!\d)([23]\d{3})[ .-](\d{4})[ .-](\d{4})(?!\d)/g)) {
      const value = match[1] + match[2] + match[3];
      if (synthetic.has(value) || !validateCivilId(value).isValid) continue;
      leaks.push(`${file}:${value.slice(0, 2)}… (مجزّأ)`);
    }
  }
  check(leaks.length === 0, `S1 لا رقم مدني صالح غير وهمي في الشيفرة أو الاختبارات${leaks.length ? " — " + leaks.join(", ") : ""}`);
}

/* ── S2 طلبُ الخريج يُجاب: قرارٌ في الحالة كلها ──────────────────────────── */
{
  check(isCaseLevelNeed({ requestType: "graduate", courseIds: [] }), "S2 طلب الخريج بلا مقرّرات يُقرَّر على مستوى الحالة");
  check(!isCaseLevelNeed({ requestType: "new-course", courseIds: [5] }), "S2 طلب المقرّر يبقى قراراً لكل مقرّر");
  check(studentCaseStatus(undefined) === "pending", "S2 بلا قرار: بانتظار اللجنة");
  const approved = { state: "approved" as const, at: "2026-09-25T08:00:00.000Z" };
  check(studentCaseRefusal(undefined, "registrar", approved) !== null, "S2 التسجيل لا يقرّر قبل موافقة اللجنة");
  const afterCommittee = applyStudentCaseDecision(undefined, "committee", approved);
  check(studentCaseStatus(afterCommittee) === "approved", "S2 بعد موافقة اللجنة: بانتظار التسجيل");
  check(studentCaseRefusal(afterCommittee, "registrar", approved) === null, "S2 وبعدها يقرّر التسجيل");
  const done = applyStudentCaseDecision(afterCommittee, "registrar", approved);
  check(studentCaseStatus(done) === "registered", "S2 نفّذه التسجيل");
  check(studentCaseRefusal(done, "committee", { ...approved, state: "rejected" }) !== null, "S2 اللجنة لا تنقض قرار التسجيل");
  check(studentCaseStatus(applyStudentCaseDecision(done, "registrar", null)) === "approved", "S2 سحبُ قرار التسجيل يعيده للانتظار");

  const need = await Repository.saveStudentNeed({
    fingerprint: "fp-graduate-1", AdCollegeId: 1, AdSectionId: 2, studentSectionId: 2, surveySectionId: 2,
    AdTermId: 9, courseIds: [], requestType: "graduate", graduateReason: "field-conflict", details: "ملاحظة تجريبية",
    passedUnits: 112, requiredUnits: 111, degreeUnits: 134, eligibility: "eligible",
  } as any);
  let refused = false;
  try { await Repository.setStudentCaseDecision(need.id, "registrar", approved); }
  catch (error) { refused = error instanceof StudentCourseStateConflict; }
  check(refused, "S2 المخزن يرفض قرار التسجيل قبل اللجنة داخل الكتابة نفسها");
  const committeeSaved = await Repository.setStudentCaseDecision(need.id, "committee",
    { state: "rejected", reasonCode: "not-eligible", note: "راجع القسم", at: approved.at });
  check(committeeSaved?.caseState?.committee?.reasonCode === "not-eligible" && committeeSaved?.caseState?.committee?.note === "راجع القسم",
    "S2 عدم موافقة اللجنة يُحفظ بسببه وسطره للطالب");
  await Repository.setStudentCaseDecision(need.id, "committee", approved);
  const registrarSaved = await Repository.setStudentCaseDecision(need.id, "registrar", approved);
  check(studentCaseStatus(registrarSaved?.caseState) === "registered", "S2 اللجنة ثم التسجيل على المخزن المحلي");
  check((await Repository.getStudentNeedById(need.id))?.caseState?.registrar?.state === "approved", "S2 القرار يُقرأ من المخزن");

  const list = between(server, 'app.get("/api/student-registration"', 'app.post("/api/student-registration/:id/course-state"');
  const caseAt = list.indexOf("isCaseLevelNeed(need)"), dropAt = list.indexOf("if (!visibleCourseIds.length) return null;");
  check(caseAt > 0 && dropAt > caseAt, "S2 الكشف يعرض حالة الخريج قبل أن يُسقط ما لا مقرّرات فيه");
  check(/graduate:\s*\{[\s\S]*passedUnits[\s\S]*requiredUnits/.test(list) && list.includes("details:"),
    "S2 الكشف يحمل حقائق التحقق وملاحظات الطالب");
  const caseRoute = between(server, 'app.post("/api/student-registration/:id/case-state"', "/** The department's tray.");
  check(caseRoute.includes("canWriteRegistration(") && caseRoute.includes("owningSectionsInScopeFor(") && caseRoute.includes("registrarBlockReason(")
    && caseRoute.includes("STUDENT_COMMITTEE_REASONS") && caseRoute.includes("STUDENT_REJECT_REASONS")
    && caseRoute.includes("Repository.setStudentCaseDecision("), "S2 مسار قرار الحالة يمرّ بالحراس والأسباب نفسها");
  const myCase = between(server, 'app.post("/api/public/survey/:token/my-case"', "function studentCaseStatusPage");
  check(myCase.includes("caseDecision") && myCase.includes("studentCaseStatus("), "S2 صفحة الحالة تعيد قرار الحالة للطالب");
  const statusPage = between(server, "function studentCaseStatusPage", 'app.get("/m/:token"');
  check(statusPage.includes("caseLine(d)") && statusPage.includes("TYPE[d.requestType]"), "S2 صفحة الحالة تعرض نوع الطلب وقرار الحالة");
  const sheet = read("src/components/StudentRegistration.tsx");
  check(sheet.includes("/case-state") && sheet.includes("row.caseLevel") && sheet.includes('setCaseState(row, "registrar"'),
    "S2 الكشف يعرض أزرار قرار الحالة للجنة ثم للتسجيل");
}

/* ── S6 «حالة طلبي» تتحقق من الرقم فعلاً وتقبل الأرقام العربية والفارسية ──── */
{
  const myCase = between(server, 'app.post("/api/public/survey/:token/my-case"', "function studentCaseStatusPage");
  check(myCase.includes("validateCivilId(civil).isValid"), "S6 my-case يقرأ .isValid لا الكائن نفسه");
  check(myCase.includes("toEnglishDigits(req.body?.civil)"), "S6 my-case يحوّل الأرقام العربية/الفارسية بالمحوّل المشترك");
  const objectTests = [...server.matchAll(/!\s*validateCivilId\([^()]*\)(?!\.isValid)/g)].map(match => match[0]);
  check(objectTests.length === 0, `S6 لا اختبار لكائن التحقق بدل .isValid في الخادم${objectTests.length ? " — " + objectTests.join(" | ") : ""}`);
  check(server.includes("const asciiDigits = toEnglishDigits;"), "S6 asciiDigits هو المحوّل المشترك لا نسخةٌ ثانية منه");
  const surveyPage = surveyPageSource;
  const digitsSource = (surveyPage.match(/function digits\(v\)\{[^\n]*?\}function section/) || [""])[0].replace(/function section$/, "");
  let pageDigits: ((v: string) => string) | null = null;
  try { pageDigits = new Function(`${digitsSource.replace(/\\\\/g, "\\")};return digits;`)(); } catch { pageDigits = null; }
  check(Boolean(pageDigits) && pageDigits!("٣٠٠٠١٠١٠٠١٢٢") === "300010100122" && pageDigits!("۳۰۰۰۱۰۱۰۰۱۲۲") === "300010100122",
    "S6 صفحة الاستبيان تقبل ٠-٩ و۰-۹");
}

/* ── S7 قواعد التخرج: الاقتراح لا يُعرض قاعدةً، والتحقق يسأل عنها قبل القراءة ── */
{
  const rulesRoute = between(server, 'app.get("/api/degree-rules"', 'app.put("/api/degree-rules/:sectionId"');
  check(rulesRoute.includes("reviewed:Boolean(saved)") && rulesRoute.includes("suggested:!saved"), "S7 الاقتراح غير المحفوظ لا يُعلَّم reviewed");
  check(!/reviewed:true/.test(rulesRoute), "S7 لا reviewed:true ثابتة في مسار القواعد");
  check(between(server, "const degreeRuleForSection=", "const storedDegreeRuleForSection=").includes("reviewed:false"),
    "S7 degreeRuleForSection لا تدّعي المراجعة لقاعدةٍ غير محفوظة");
  const sections = read("src/components/Sections.tsx");
  check(sections.includes("اقتراح غير محفوظ — احفظه ليعمل تحقق الخريجين") && sections.includes("rule.suggested"),
    "S7 شاشة الأقسام تقول إن القيمة اقتراحٌ غير محفوظ");
  const guessPattern = /\/فرنسي\/\.test\(/;
  const copies = ["server.ts", "src/components/Sections.tsx", "src/utils/degreeRules.ts"].filter(file => guessPattern.test(read(file)));
  check(copies.length === 1 && copies[0] === "src/utils/degreeRules.ts", `S7 تخمين القاعدة من اسم القسم في مكانٍ واحد (${copies.join(", ")})`);
  check(server.includes("const degreeRuleFromName=suggestedDegreeRule;") && sections.includes("suggestedDegreeRule("), "S7 الخادم والشاشة يقرآن التخمين نفسه");
  check(suggestedDegreeRule("اللغة الفرنسية").degreeUnits === 132 && suggestedDegreeRule("تربية خاصة").degreeUnits === 134
    && suggestedDegreeRule("قسم آخر").degreeUnits === 130, "S7 الاقتراح نفسه قيمةً");
  const proof = between(server, 'app.post("/api/public/survey/:token/proof"', 'app.post("/api/public/survey/:token", async');
  const ruleAt = proof.indexOf("storedDegreeRuleForSection(sectionId)"), ocrAt = proof.indexOf("ocrGraduationSheetDocument(");
  check(ruleAt > 0 && ocrAt > ruleAt, "S7 التحقق يسأل عن القاعدة المحفوظة قبل قراءة الصحيفة");
  check((proof.match(/storedDegreeRuleForSection\(/g) || []).length === 1, "S7 والسؤال مرّة واحدة في مسار التحقق");
  const surveyGet = between(server, 'app.get("/api/public/survey/:token"', 'app.post("/api/public/survey/:token/identity-status"');
  check(surveyGet.includes("graduateRule") && surveyGet.includes("storedDegreeRuleForSection(sid)") && surveyGet.includes("threshold:graduateThreshold("),
    "S7 الاستبيان يخبر الصفحة لكل قسم إن كانت له قاعدةٌ محفوظة وحدّها");
  check(surveyPageSource.includes("rule.saved===false"), "S7 الصفحة لا تطلب الرفع لقسمٍ بلا قاعدة محفوظة");
  check(between(server, 'app.put("/api/degree-rules/:sectionId"', "const surveyPayloadCache").includes("surveyPayloadCache.clear()"),
    "S7 حفظ القاعدة يُسقط نسخة الاستبيان المؤقتة");
}

/* ── S3 الحالة لا تموت مع رابط الاستبيان ─────────────────────────────────── */
{
  const helper = between(server, "async function resolveSurveyStatusToken", "\n}\n");
  check(helper.includes("termWindow(") && helper.includes("SURVEY_STATUS_GRACE_MS") && helper.includes("link.revoked"),
    "S3 مهلة القراءة: نهاية الفصل + 30 يوماً، للرابط الموقوف أو المنتهي");
  check(server.includes("const SURVEY_STATUS_GRACE_MS = 30 * 86400000;"), "S3 المهلة ثلاثون يوماً");
  const myCase = between(server, 'app.post("/api/public/survey/:token/my-case"', "function studentCaseStatusPage");
  const statusRoute = between(server, 'app.get("/m/:token"', 'app.get("/q/:token"');
  check(myCase.includes("resolveSurveyStatusToken(token)") && !myCase.includes("resolveShareToken("), "S3 my-case يقرأ بمهلة الحالة");
  check(statusRoute.includes("resolveSurveyStatusToken(") && !statusRoute.includes("resolveShareToken("), "S3 /m/ يفتح بمهلة الحالة");
  const submit = between(server, 'app.post("/api/public/survey/:token", async', "/** What the students said");
  check(submit.includes("resolveShareToken(token)") && !submit.includes("resolveSurveyStatusToken"), "S3 الإرسال يبقى مغلقاً بإغلاق الرابط");
  const workspace = read("src/components/IntelligenceWorkspace.tsx");
  check(workspace.includes("حتى 30 يوماً بعد نهاية الفصل") && !workspace.includes("سيتوقف الرابط فوراً ولن يفتح لأي طالب بعد الآن"),
    "S3 تحذير «أوقف الرابط» يقول الحقيقة: تتوقف الطلبات وتبقى المتابعة");
}

/* ── S4 إعادة الإرسال تُحدِّث في مكانها وتُبقي القرارات ─────────────────────── */
{
  const base = { fingerprint: "fp-resubmit", AdCollegeId: 1, AdSectionId: 3, studentSectionId: 3, surveySectionId: 3, AdTermId: 9, requestType: "new-course" } as any;
  const first = await Repository.saveStudentNeed({ ...base, courseIds: [11, 12] });
  await Repository.setStudentCourseState(first.id, { courseId: 11, state: "registered", by: "registration", at: "2026-09-25T09:00:00.000Z" });
  await Repository.setStudentCourseState(first.id, { courseId: 12, state: "awaiting-registration", by: "department", at: "2026-09-25T09:01:00.000Z" });
  const second = await Repository.saveStudentNeed({ ...base, courseIds: [12, 13] });
  check(second.id === first.id && second.caseRef === first.caseRef && second.createdAt === first.createdAt, "S4 يبقى المعرّف ورقم الحالة وتاريخ أول إرسال");
  check(Boolean(second.updatedAt), "S4 ويُسجَّل وقت آخر تعديل");
  const kept = (second.courseStates || []).find(state => state.courseId === 12);
  check(kept?.state === "awaiting-registration" && !kept?.droppedByStudent, "S4 قرارُ المقرّر الباقي يبقى");
  const dropped = (second.courseStates || []).find(state => state.courseId === 11);
  check(dropped?.state === "registered" && dropped?.droppedByStudent === true, "S4 المقرّر المسجَّل الذي حذفه الطالب يبقى معلَّماً droppedByStudent");
  const all = (await Repository.getStudentNeeds(1, 0, 9)).filter((need: any) => need.fingerprint === "fp-resubmit");
  check(all.length === 1, "S4 سجلٌّ واحد لليد الواحدة، لا حذف ثم إنشاء");
  const third = await Repository.saveStudentNeed({ ...base, courseIds: [11, 12, 13] });
  check(!(third.courseStates || []).find(state => state.courseId === 11)?.droppedByStudent, "S4 إعادة المقرّر تُزيل علامة الإلغاء");
  const merge = read("src/utils/studentNeedMerge.ts");
  check(merge.includes("ألغاه الطالب بعد التسجيل"), "S4 النصّ «ألغاه الطالب بعد التسجيل»");
  const repo = read("src/db/repository.ts");
  const save = between(repo, "  saveStudentNeed: async", "  setStudentCaseDecision: async");
  check(save.includes("runTransaction") && save.includes("mergeStudentResubmission(") && !save.includes("batch.delete"),
    "S4 مسار Firestore يدمج داخل معاملة ولا يحذف ثم يُنشئ");
  const list = between(server, 'app.get("/api/student-registration"', 'app.post("/api/student-registration/:id/course-state"');
  check(list.includes("droppedByStudent") && list.includes("droppedCourseLabel("), "S4 الكشف يعرض المقرّر الذي ألغاه الطالب");
  const myCase = between(server, 'app.post("/api/public/survey/:token/my-case"', "function studentCaseStatusPage");
  check(myCase.includes("droppedCourseLabel("), "S4 وصفحة الطالب تقول له إنه ألغاه");
}

export function finish() {
  fs.rmSync(privateDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
finish();
