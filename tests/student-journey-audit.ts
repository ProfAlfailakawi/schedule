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
import { graduationProgrammeText, graduationSheetFacts } from "../src/utils/documentOcr";
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

/* ── S5 الرقم المدني وحده لا يكشف الاسم ولا يُعدِّل طلب غيره ───────────────── */
{
  const identityRoute = between(server, 'app.post("/api/public/survey/:token/identity-status"', 'app.post("/api/public/survey/:token/proof-status"');
  const beforeProof = identityRoute.slice(0, identityRoute.indexOf("if(!caseRefMatches(priorNeed,suppliedRef))"));
  check(beforeProof.includes("res.json({exists:true,verified:false,initial})") && !/name:|sectionName:|openStudentIdentity/.test(beforeProof.replace("maskedInitial(String(prior?.name", "")),
    "S5 بلا رقم الحالة: «يوجد طلب» وحرفٌ مقنّع فقط، لا اسم ولا قسم");
  check(identityRoute.indexOf("caseRefMatches(priorNeed,suppliedRef)") < identityRoute.indexOf("name:String(prior?.name"),
    "S5 الاسم والقسم وملخّص الطلب بعد إثبات رقم الحالة فقط");
  const submitRoute = between(server, 'app.post("/api/public/survey/:token", async', "/** What the students said");
  check(submitRoute.includes('if(priorNeed&&!caseRefMatches(priorNeed,body.caseRef))') && submitRoute.includes('code:"case-ref-required"'),
    "S5 استبدال طلبٍ قائم يتطلب رقم الحالة");
  check(submitRoute.indexOf("caseRefMatches(priorNeed,body.caseRef)") < submitRoute.indexOf("Repository.saveStudentNeed("),
    "S5 والفحص قبل الكتابة");
  check(server.includes("فقدت الرقم؟ راجع القسم"), "S5 «فقدت الرقم؟ راجع القسم»");
  const reuse = between(server, "const reusableGraduateVerification=", "const normalizeStudentIdentityName=");
  check(reuse.includes("caseRefMatches(await priorNeedForHand(link,civil),caseRef)"), "S5 إعادة استعمال صحيفة التخرج تتطلب رقم الحالة");
  check((server.match(/reusableGraduateVerification\(resolved\.link,civil,sectionId,(?:\(req\.body\|\|\{\}\)|body)\.caseRef\)/g) || []).length === 2
    && (server.match(/reusableGraduateVerification\(/g) || []).length === 2,
    "S5 كلا مستدعيي إعادة الاستعمال يمرّران رقم الحالة");
  const myCase = between(server, 'app.post("/api/public/survey/:token/my-case"', "function studentCaseStatusPage");
  check(myCase.includes("caseRefMatches(need, req.body?.caseRef)"), "S5 «حالة طلبي» بالرقم المدني ورقم الحالة معاً");
  const statusPage = between(server, "function studentCaseStatusPage", 'app.get("/m/:token"');
  check(statusPage.includes('id="ref"') && statusPage.includes("caseRef:ref") && statusPage.includes("location.hash"), "S5 صفحة الحالة تطلب رقم الحالة (ويملؤه رابط الإرسال بعد #)");
  check(surveyPageSource.includes("caseRefStep()") && surveyPageSource.includes("caseRef:caseRef") && surveyPageSource.includes("priorSummaryHtml()")
    && surveyPageSource.includes("replaceNote()"), "S5/S4 الصفحة تطلب رقم الحالة وتعرض الطلب القائم وتنبّه قبل استبداله");
}

/* ── S8 الفصل المنتهي لا يستقبل طلبات ───────────────────────────────────── */
{
  check(server.includes("const surveyTermEnded = (term: any): boolean => Boolean(term) && (term.AdTermClosed === true || termHasEnded(term));"),
    "S8 قاعدة واحدة: انتهاء التاريخ أو إعلان الانتهاء");
  const share = between(server, 'app.post("/api/share"', 'app.delete("/api/share/:id"');
  check(share.includes('kind === "survey" && surveyTermEnded('), "S8 لا يُصدَر رابط استبيان لفصلٍ منتهٍ (فرع الاستبيان وحده)");
  const get = between(server, 'app.get("/api/public/survey/:token"', 'app.post("/api/public/survey/:token/identity-status"');
  check(get.indexOf("surveyTermEnded(linkTerm)") > 0 && get.indexOf("surveyTermEnded(linkTerm)") < get.indexOf("surveyPayloadCache.get(cacheKey)"),
    "S8 القراءة تقول «انتهى هذا الفصل» قبل النسخة المؤقتة");
  const post = between(server, 'app.post("/api/public/survey/:token", async', "/** What the students said");
  check(post.includes('code: "term-ended"') && post.indexOf("surveyTermEnded(") < post.indexOf("Repository.saveStudentNeed("), "S8 الإرسال بعد نهاية الفصل يُرفض");
  const proof = between(server, 'app.post("/api/public/survey/:token/proof"', 'app.post("/api/public/survey/:token", async');
  check(proof.indexOf("surveyTermEnded(") > 0 && proof.indexOf("surveyTermEnded(") < proof.indexOf("ocrGraduationSheetDocument("), "S8 ولا تُقرأ صحيفة لفصلٍ منتهٍ");
  check(surveyPageSource.includes("x.d.termEnded") && surveyPageSource.includes("انتهى هذا الفصل"), "S8 الصفحة تعرض «انتهى هذا الفصل»");
}

/* ── S9 مجموعة المقررات الفعّالة واحدة للقراءة والإرسال والقراءة عند القسم ── */
{
  const get = between(server, 'app.get("/api/public/survey/:token"', 'app.post("/api/public/survey/:token/identity-status"');
  const post = between(server, 'app.post("/api/public/survey/:token", async', "/** What the students said");
  const demand = between(server, 'app.get("/api/schedules/demand"', "كشفُ التسجيل — الطرفان على ورقةٍ واحدة");
  check(get.includes("surveyActiveCourseIds(sid)") && !get.includes("curriculumOverview("), "S9 صفحة الاستبيان تعرض المجموعة الفعّالة نفسها");
  check((post.match(/surveyActiveCourseIds\(/g) || []).length === 2 && !post.includes("getOperationalCourseIds("), "S9 والإرسال يتحقق بها");
  check(demand.includes("surveyActiveCourseIds(sectionId)") && !demand.includes("getOperationalCourseIds("), "S9 وقراءة القسم تعدّ بها");
}

/* ── S10 مهلة العشرين دقيقة لا تُسقط الطالب ─────────────────────────────── */
{
  const post = between(server, 'app.post("/api/public/survey/:token", async', "/** What the students said");
  check(post.includes('code:"proof-expired"') && post.includes("studentProofExpired("), "S10 الخادم يميّز انتهاء مهلة الإثبات برمز خاص");
  check(server.includes("const STUDENT_PROOF_TTL_MS=20*60_000;") && server.includes("exp:Date.now()+STUDENT_PROOF_TTL_MS"), "S10 المهلة ثابتٌ واحد");
  check(surveyPageSource.includes("PROOF_TTL") && surveyPageSource.includes("proofAt=proofToken?Date.now():0"), "S10 الصفحة تعرف متى تنتهي المهلة");
  check(/x\.d\.code==="proof-expired"[\s\S]{0,120}showProofUpload\(x\.d\.error\)/.test(surveyPageSource),
    "S10 رمز الخادم يعيد فتح الرفع (والملاحظات باقية)");
  const showUpload = (surveyPageSource.match(/function showProofUpload\(message\)\{[^\n]*/) || [""])[0];
  check(showUpload.length > 0 && !showUpload.includes("graduateDetails") && !showUpload.includes("graduateOptions"), "S10 إعادة فتح الرفع لا تمسح الملاحظات ولا نوع الطلب");
}

/* ── S11 الملف الكبير يُردّ بسببٍ واضح ────────────────────────────────── */
{
  check(server.includes('app.post("/api/public/survey/:token/proof", readStudentProofBody,'), "S11 مسار الإثبات يقرأ جسمه بحارسٍ خاص");
  const guard = between(server, "const readStudentProofBody=", "app.post(\"/api/public/survey/:token/proof\"");
  check(guard.includes("res.status(413)") && guard.includes('error.type==="entity.too.large"') && guard.includes("content-length"), "S11 413 برسالة عربية قبل القراءة وعند تجاوز الحدّ");
  check(server.includes("const STUDENT_PROOF_MAX_BYTES=14*1024*1024;") && surveyPageSource.includes("MAX_PROOF_BYTES=14*1024*1024"), "S11 حدٌّ واحد: 14 ميغابايت في الخادم والصفحة");
  check(surveyPageSource.includes("if(sent>MAX_PROOF_BYTES)"), "S11 الصفحة تفحص الحجم قبل الرفع");
}

/* ── S12 التخصص يُقرأ من سطر البرنامج وحده ──────────────────────────────── */
{
  const sheet = [
    "الهيئة العامة للتعليم التطبيقي والتدريب",
    "الخطة الدراسية · مقررات قسم التربية الإسلامية المساندة",
    "طالب تجريبي 3000 1010 0122",
    "البرنامج رياضيات",
    "الوحدات المطلوبة 130",
    "الوحدات المجتازة 110",
  ].join("\n");
  check(graduationProgrammeText(sheet) === "رياضيات", "S12 البرنامج من سطره وحده، لا من كلمات الصفحة");
  check(graduationSheetFacts(sheet).programmeText === "رياضيات", "S12 الحقائق تحمل نص البرنامج");
  check(graduationProgrammeText("البرنامج: لغة انجليزية الوحدات المطلوبة 134") === "لغه انجليزيه", "S12 يقف عند الحقل التالي في السطر نفسه");
  check(graduationProgrammeText("الخطة الدراسية\nالتربية الإسلامية\nالوحدات المجتازة 114") === "", "S12 بلا سطر برنامج: فارغ (يفشل مغلقاً)");
  const proof = between(server, 'app.post("/api/public/survey/:token/proof"', 'app.post("/api/public/survey/:token", async');
  check(proof.includes("academicSectionNameMatches(programmeText,") && !proof.includes("academicSectionNameMatches(facts.normalizedText"),
    "S12 مطابقة القسم على سطر البرنامج لا على النص كله");
  check(proof.includes('code:"programme-unreadable"'), "S12 سطر برنامج غير مقروء يُرفض بسببه");
}

/* ── S13 القسم يرى رقم الحالة الذي يحمله الطالب ─────────────────────────── */
{
  const demand = between(server, 'app.get("/api/schedules/demand"', "كشفُ التسجيل — الطرفان على ورقةٍ واحدة");
  check(demand.includes("caseRef:caseRefFor(need)"), "S13 قراءة القسم تحمل رقم الحالة");
  const workspace = read("src/components/IntelligenceWorkspace.tsx");
  check(!/slice\(0,\s*8\)\.toUpperCase\(\)/.test(workspace) && (workspace.match(/item\.caseRef\s*\|\|\s*"—"/g) || []).length === 2,
    "S13 الجدول والطباعة يعرضان رقم الحالة، لا بادئة المعرّف");
  const derivations = ["server.ts", "src/db/repository.ts", "src/utils/studentNeedMerge.ts", "src/components/IntelligenceWorkspace.tsx", "src/components/StudentRegistration.tsx"]
    .filter(file => /slice\(0,\s*8\)\.toUpperCase\(\)/.test(read(file)));
  check(derivations.length === 1 && derivations[0] === "src/utils/studentNeedMerge.ts", `S13 اشتقاق رقم الحالة في مكانٍ واحد (${derivations.join(", ")})`);
}

/* ── S14 مقرّر القسم الآخر في «تعارض مقررين» يُقرَّر في كشف قسمه ─────────── */
{
  const owns = between(server, "const sectionOwnsNeed = ", "const STUDENT_COURSE_STATES");
  check(/if \(declared\) return declared === sectionId \|\| courses\.some\(row => Number\(row\.AdSectionId\) === sectionId/.test(owns),
    "S14 القسم المالك لمقرّرٍ في الطلب يراه (لا قسم الاستبيان وحده)");
  const list = between(server, 'app.get("/api/student-registration"', 'app.post("/api/student-registration/:id/course-state"');
  check(list.includes("readOnly: !decidedHere(id)") && list.includes("decidedBySectionName"), "S14 مقرّر القسم الآخر يظهر في كشف الاستبيان للقراءة");
  check(list.includes("if (!decidedHere(id) && !filedHere) return false;"), "S14 وكشف القسم المالك لا يعرض إلا مقرّره");
  check(list.includes("row.courses.filter((course: any) => !course.readOnly)"), "S14 الأعداد لا تحسب ما يقرّره قسمٌ آخر");
  const write = between(server, 'app.post("/api/student-registration/:id/course-state"', 'app.post("/api/student-registration/:id/case-state"');
  check(write.includes("هذا المقرّر لقسمٍ آخر؛ تقرّر فيه لجنةُ ذلك القسم."), "S14 ولجنة قسم الاستبيان لا تقرّر في مقرّر غيرها");
  const sheet = read("src/components/StudentRegistration.tsx");
  check(sheet.includes("يقرّره قسم {course.decidedBySectionName") && sheet.includes("committeeActs && !course.readOnly"), "S14 الكشف يكتب «يقرّره قسم …» ولا يعرض أزراراً عليه");
}

/* ── S15 «سلّمته للتسجيل» لا يُقال قبل التوقيعين ─────────────────────────── */
{
  const myCase = between(server, 'app.post("/api/public/survey/:token/my-case"', "function studentCaseStatusPage");
  check(myCase.includes("isFullySigned(await readApproval(") && myCase.includes('"awaiting-signatures"'),
    "S15 الموافقة قبل اكتمال توقيع جدول القسم تُعرض «بانتظار اكتمال الاعتماد»");
  check(/state\?\.state === "awaiting-registration"[\s\S]{0,80}handedButUnsigned\(Number\(id\)\)/.test(myCase)
    && myCase.includes('caseStatus === "approved" && await handedButUnsigned(null)'), "S15 للمقرّرات ولحالة الخريج معاً");
  const page = between(server, "function studentCaseStatusPage", 'app.get("/m/:token"');
  check(page.includes('"awaiting-signatures":"وافقت عليه لجنة القسم · بانتظار اكتمال اعتماد جدول القسم"'), "S15 النصّ الصادق في صفحة الطالب");
}

/* ── S16 الكشف يعرض نوع الطلب والملاحظات والمقرّر الشريك ─────────────────── */
{
  const list = between(server, 'app.get("/api/student-registration"', 'app.post("/api/student-registration/:id/course-state"');
  check(list.includes("partnerCourses:") && (list.match(/details: String\(need\.details \|\| ""\)/g) || []).length === 2, "S16 الخادم يرسل الملاحظات والمقرّر الشريك");
  const sheet = read("src/components/StudentRegistration.tsx");
  check(sheet.includes("REQUEST_TYPE_LABEL[row.requestType]") && sheet.includes("row.partnerCourses") && sheet.includes("ملاحظات الطالب: {row.details}"),
    "S16 الكشف يعرض نوع الطلب والملاحظات و«يتعارض مع»");
  check(sheet.includes('"نوع الطلب"') && sheet.includes('"ملاحظات الطالب"'), "S16 والتصدير يحملها");
}

/* ── S17 لا بيانات طالب في المتصفح، ولا جدول قسم برابط الطلبة ─────────────── */
{
  check(!surveyPageSource.includes("localStorage") && !between(server, "function studentCaseStatusPage", 'app.get("/m/:token"').includes("localStorage"),
    "S17 صفحتا الطالب لا تحفظان الرقم المدني ولا الاسم في المتصفح");
  const sw = read("public/sw.js");
  const swHead = sw.slice(0, sw.indexOf("const isHashedAsset="));
  const isCacheableApi = new Function(`${swHead};return isCacheableApi;`)() as (path: string) => boolean;
  check(!isCacheableApi("/api/schedules/demand") && !isCacheableApi("/api/schedules/demand?sectionId=1") && !isCacheableApi("/api/student-registration"),
    "S17 عامل الخدمة لا يخزّن طلبات الطلبة");
  check(isCacheableApi("/api/schedules") && isCacheableApi("/api/terms"), "S17 وطبقة السرعة للبيانات الأخرى باقية");
  const schedule = between(server, 'app.get("/api/public/schedule/:token"', "const TERM_WEEKS");
  check(schedule.includes('resolved.link.kind === "survey"'), "S17 رابط الاستبيان لا يعيد جدول القسم");
  const ics = between(server, 'app.get("/api/public/ics/:token"', 'app.get("/api/public/ics/:token/:key"');
  check(ics.includes('resolved.link.kind === "survey"'), "S17 ولا تقويمه");
  const share = between(server, 'app.get("/s/:token"', "buildSharePayload(resolved.link)");
  check(/kind === "survey"\)\s*\{\s*res\.redirect\(302, `\/q\//.test(share), "S17 و/s/ لرابط الاستبيان يحوّل إلى الاستبيان");
}

/* ── S18 إتاحة صفحتي الطالب ────────────────────────────────────────────── */
{
  const unlabeled = [...surveyPageSource.matchAll(/<label(?![^>]*\bfor=)(?![^>]*class="reason")[^>]*>/g)].map(match => match[0]);
  check(unlabeled.length === 0, `S18 كل label مربوطٌ بحقله (${unlabeled.join(" ")})`);
  check(surveyPageSource.includes('aria-pressed="') && surveyPageSource.includes('function press(el,on){el.classList.toggle("on",on);el.setAttribute("aria-pressed"')
    && !/classList\.toggle\("on",(?:Number\(other|picked\.indexOf)/.test(surveyPageSource), "S18 أزرار اختيار المقررات تعلن حالتها aria-pressed");
  check(!surveyPageSource.includes('<div id="err"></div>'), "S18 كل رسائل الخطأ role=alert aria-live");
  check(surveyPageSource.includes('<input id="civil" dir="ltr" inputmode="numeric"'), "S18 حقل الرقم المدني numeric");
  const privacy = (surveyPageSource.match(/\.privacy\{[^}]*\}/) || [""])[0];
  const size = Number((privacy.match(/font-size:([\d.]+)px/) || [])[1] || 0);
  const hex = (name: string) => (surveyPageSource.match(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`)) || [])[1] || "";
  const lum = (color: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const muted = hex("muted"), bg = hex("bg");
  const ratio = muted && bg ? (lum(muted) + 0.05) / (lum(bg) + 0.05) : 0;
  check(size >= 12 && privacy.includes("color:var(--muted)") && ratio >= 4.5, `S18 نص الخصوصية ≥12px وتباينه ≥4.5:1 (${size}px, ${ratio.toFixed(2)}:1)`);
  const status = between(server, "function studentCaseStatusPage", 'app.get("/m/:token"');
  check(status.includes('<label for="civil">') && status.includes('<label for="ref"') && status.includes('inputmode="numeric"')
    && status.includes('<div id="out" aria-live="polite">') && status.includes('class="err" role="alert"'), "S18 صفحة الحالة: labels وaria-live وnumeric");
}

export function finish() {
  fs.rmSync(privateDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
finish();
