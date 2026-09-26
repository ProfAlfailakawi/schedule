/**
 * ── شروط التخرج في المرحلة الانتقالية (2026-09-26) ──────────────────────────
 *
 * صحيفتا تخرج تعملان معاً أربع سنوات أو خمساً: طلبة الصحيفة السابقة على
 * شروطها، وطلبة الجديدة على شروطها. هذا التدقيق يثبت ذلك سلوكياً:
 *  1. اختيار صحيفة الطالب من «الوحدات المطلوبة» في صحيفة تخرجه (دالة نقية).
 *  2. المستودع: أول صحيفة جديدة تنقل قاعدة القسم إلى «الصحيفة السابقة»،
 *     والجديدة تبدأ بلا قاعدة، وتُحفظ قاعدتها واسمها.
 *  3. الخادم: كل مسارات الخريج تمرّ بالدالة الواحدة، والرمز يحمل الصحيفة.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { choosePlanForSheet, sheetTotalEvidence, type PlanRuleCandidate } from "../src/utils/graduationPlan";
import { graduationSheetFacts } from "../src/utils/documentOcr";

const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-curriculum-grad-"));
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

const OLD = { degreeUnits: 130, fieldTrainingRequired: 102, graduateRegularPassed: 107, graduateSummerPassed: 109 };
const NEW = { degreeUnits: 136, fieldTrainingRequired: 108, graduateRegularPassed: 113, graduateSummerPassed: 115 };
const oldPlan: PlanRuleCandidate = { planId: "old", planName: "الصحيفة السابقة", status: "transition", rule: OLD };
const newPlan: PlanRuleCandidate = { planId: "new", planName: "صحيفة 2026", status: "active", rule: NEW };
const pick = (candidates: PlanRuleCandidate[], facts: any) => {
  const choice = choosePlanForSheet(candidates, facts);
  return "error" in choice ? choice.code : choice.candidate.planId || "section";
};

/* ── 1. اختيار الصحيفة ─────────────────────────────────────────────────── */
{
  check(pick([oldPlan, newPlan], { requiredUnits: 130, passedUnits: 110 }) === "old", "طالب مجموعه 130 يُقاس على الصحيفة السابقة");
  check(pick([oldPlan, newPlan], { requiredUnits: 136, passedUnits: 114 }) === "new", "طالب مجموعه 136 يُقاس على الصحيفة الجديدة");
  check(pick([{ ...oldPlan, planId: undefined, status: "section" }], { requiredUnits: 0 }) === "section",
    "قسم بلا صحائف: قاعدة القسم كما كان دائماً، ولو لم يُقرأ المجموع");
  check(pick([oldPlan], { requiredUnits: 999 }) === "old", "صحيفة حيّة واحدة: لا رفض جديد بسبب المجموع");
  check(pick([oldPlan, newPlan], { requiredUnits: 0, passedUnits: 110 }) === "plan-total-unreadable",
    "صحيفتان ولم يُقرأ المجموع: طلب صورة أوضح لا تخمين");
  check(pick([oldPlan, newPlan], { requiredUnits: 140, passedUnits: 110 }) === "plan-total-unknown",
    "مجموع لا يطابق أي صحيفة: رفض بسبب واضح");
  check(pick([oldPlan, { ...newPlan, rule: null }], { requiredUnits: 136, passedUnits: 100 }) === "plan-rule-missing",
    "صحيفة الطالب بلا شروط معتمدة: يُحال إلى القسم ولا يُقاس على شروط غيرها");
  check(pick([oldPlan, { ...newPlan, rule: null }], { requiredUnits: 130, passedUnits: 100 }) === "old",
    "طالب الصحيفة المعتمدة يمرّ ولو لم تُعتمد شروط الأخرى بعد");
  check(pick([{ ...oldPlan, rule: null }, { ...newPlan, rule: null }], { requiredUnits: 130 }) === "no-degree-rule",
    "لا شروط معتمدة لأي صحيفة: الرفض نفسه كما كان");
  check(pick([oldPlan, { ...newPlan, rule: { ...OLD } }], { requiredUnits: 0 }) === "old",
    "صحيفتان بالشروط نفسها: لا حاجة لقراءة المجموع");
  check(pick([oldPlan, { ...newPlan, rule: { ...OLD, graduateRegularPassed: 110 } }], { requiredUnits: 130, passedUnits: 115 }) === "plan-ambiguous",
    "المجموع نفسه بشروط مختلفة: يُحال إلى القسم");
  /* الرقم القريب من «الوحدات المطلوبة» قد يكون الوحدات المجتازة نفسها. */
  check(pick([oldPlan, newPlan], { requiredUnits: 0, requiredUnitCandidates: [130, 136], passedUnits: 130 }) === "new",
    "طالب جديد اجتاز 130 وحدة لا يصير قديماً لأن 130 مجموع الصحيفة السابقة");
  check(sheetTotalEvidence({ requiredUnits: 0, requiredUnitCandidates: [130], passedUnits: 0 })[1].length === 0,
    "الأرقام القريبة لا تُقرأ إن لم تُقرأ الوحدات المجتازة صراحةً");
  const facts = graduationSheetFacts(`الخطة الدراسية\nالاسم: طالب تجريبي 300010100122\nالبرنامج: رياضيات\nالوحدات المطلوبة: 136\nالوحدات المجتازة: 118\n`);
  check(pick([oldPlan, newPlan], { requiredUnits: facts.requiredUnits, requiredUnitCandidates: facts.requiredUnitCandidates, passedUnits: facts.passedUnits }) === "new",
    "صحيفة تخرج نصية حقيقية الشكل تُقرأ صحيفتها الجديدة");
}

/* ── 2. المستودع ──────────────────────────────────────────────────────── */
{
  const college = await Repository.createCollege("01", "كلية تجريبية");
  const section = await Repository.createSection(college.AdCollegeId, "01", "قسم الرياضيات");
  const sid = section.AdSectionId;
  await Repository.createCourse(college.AdCollegeId, sid, "0101101", "مقرر قديم أول", 3, 3, 40);
  await Repository.createCourse(college.AdCollegeId, sid, "0101102", "مقرر قديم ثانٍ", 3, 3, 40);
  await Repository.saveDegreeRule({ AdSectionId: sid, ...OLD, updatedAt: new Date().toISOString(), updatedBy: "اختبار" });

  const created = await Repository.createCurriculumPlan({ collegeId: college.AdCollegeId, sectionId: sid, name: "صحيفة 2026", by: "اختبار" });
  const plans = await Repository.getCurriculumPlans(sid);
  const legacy = plans.find(plan => plan.status === "transition");
  check(Boolean(legacy) && legacy!.degreeRule?.degreeUnits === 130 && legacy!.degreeRule?.graduateSummerPassed === 109,
    "أول صحيفة جديدة تنقل قاعدة القسم إلى «الصحيفة السابقة»");
  check(created.status === "active" && !created.degreeRule, "الصحيفة الجديدة تبدأ بلا شروط تخرج فتُطلب صراحةً");
  const legacyCourses = (await Repository.getCurriculumPlanCourses(sid)).filter(row => row.planId === legacy!.id);
  check(legacyCourses.length === 2, "مقررات القسم الحالية كلها في الصحيفة السابقة");

  const updated = await Repository.updateCurriculumPlan(created.id, sid, { name: "صحيفة 2026 المعتمدة", degreeRule: { ...NEW, updatedAt: new Date().toISOString() } });
  check(updated.name === "صحيفة 2026 المعتمدة" && updated.degreeRule?.degreeUnits === 136 && updated.status === "active",
    "تحديث الصحيفة يحفظ الاسم والشروط ولا يغيّر حالتها");
  const renamedLegacy = await Repository.updateCurriculumPlan(legacy!.id, sid, { name: "صحيفة 2016" });
  check(renamedLegacy.name === "صحيفة 2016" && renamedLegacy.degreeRule?.degreeUnits === 130, "إعادة تسمية السابقة لا تمسّ شروطها");
  await Repository.archiveCurriculumPlan(legacy!.id, sid, "اختبار");
  let refused = false;
  try { await Repository.updateCurriculumPlan(legacy!.id, sid, { name: "تغيير" }); } catch { refused = true; }
  check(refused, "الصحيفة المؤرشفة لا تُعدّل");
}

/* ── 3. الخادم: قاعدة واحدة لكل مسارات الخريج ─────────────────────────── */
{
  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  const between = (start: string, end: string) => { const from = server.indexOf(start); const to = server.indexOf(end, from + start.length); return from < 0 ? "" : server.slice(from, to < 0 ? undefined : to); };
  const proof = between('app.post("/api/public/survey/:token/proof"', 'app.post("/api/public/survey/:token", async');
  check(proof.includes("choosePlanForSheet(ruleCandidates") && proof.includes("curriculumPlanId,nameMatched"),
    "التحقق يختار صحيفة الطالب ويضعها في رمز التحقق");
  check(proof.indexOf("choosePlanForSheet(") < proof.indexOf("resolvePassedUnits=()"),
    "الصحيفة تُختار قبل قراءة الوحدات المجتازة، فيُقرأ المجتاز بمجموع صحيفته");
  const submit = between('app.post("/api/public/survey/:token", async', "/** What the students said");
  check(submit.includes("graduationRuleFor(ruleCandidates,proof.curriculumPlanId)"), "الإرسال يعيد قراءة شروط صحيفة الطالب الآن، لا من الرمز");
  check(submit.includes("let curriculumPlanId:string|undefined=provenPlanId;"), "صحيفة الطالب المثبتة تُحفظ مع طلبه");
  const reuse = between("const reusableGraduateVerification=", "const normalizeStudentIdentityName=");
  check(reuse.includes("graduationRuleFor(await graduationCandidatesForSection(sectionId),prior.curriculumPlanId)"),
    "إعادة استعمال صحيفة سابقة تقيس على شروط صحيفتها هي");
  check(!/storedDegreeRuleForSection\(sectionId\)/.test(proof + submit + reuse), "لا مسار خريج يقرأ قاعدة القسم وحدها بعد الآن");
  check(server.includes('app.put("/api/curriculum/plans/:planId"') && server.includes("readDegreeRuleInput(req.body.degreeRule"),
    "شروط الصحيفة تُحفظ بالتحقق نفسه الذي لقواعد القسم");
  check((server.match(/const readDegreeRuleInput=/g) || []).length === 1 && !server.includes('const read=(key:string)=>Math.round(Number(asciiDigits((req.body||{})[key])));'),
    "حدود قواعد التخرج مكتوبة في مكان واحد");
  const planPut = between('app.put("/api/curriculum/plans/:planId"', 'app.post("/api/curriculum/plans/:planId/courses"');
  check(!planPut.includes("patch.code="), "رمز «LEGACY» لا يُعدَّل من الواجهة، فلا تنتقل القاعدة الموروثة إلى صحيفة أخرى");
  const sectionPut = between('app.put("/api/degree-rules/:sectionId"', "const surveyPayloadCache");
  check(sectionPut.includes('code:"rules-per-plan"') && sectionPut.indexOf('code:"rules-per-plan"') < sectionPut.indexOf("Repository.saveDegreeRule("),
    "قسم في مرحلة انتقالية لا يحفظ رقماً واحداً للقسم لا يقرؤه أحد");
  const screen = fs.readFileSync(path.join(process.cwd(), "src/components/CurriculumPlans.tsx"), "utf8");
  check(screen.includes("Number(sid) === Number(currentSection.current)") && !/setData\(body\.overview\)/.test(screen),
    "ردّ قسمٍ سابق لا يُعرض تحت القسم المختار الآن");
  check(server.includes("curriculum:curriculumOf(need)") && server.includes("curriculum: curriculumOf(need)"),
    "سجل الحالات وكشف التسجيل يعرضان صحيفة الطالب");
}

console.log(`\nCurriculum graduation audit: ${passed} passed, ${failed} failed`);
fs.rmSync(privateDir, { recursive: true, force: true });
if (failed) process.exit(1);
