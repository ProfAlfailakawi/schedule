/**
 * ── تجهيز برنامج كليةٍ صديقة: صحيفة DP-0405 وحسابات الأدوار ───────────────────────
 *
 *   V1 المرجع: وحدات كل مجموعة تطابق المطبوع، والمتطلبات كلها داخل الصحيفة، والمجموع 75.
 *   V2 المعاينة: لا تكتب شيئاً، وتشرح الناقص (قسمٌ بلا اسم لا يُخمَّن، كليةٌ ملتبسة لا تُختار).
 *   V3 التنفيذ: أقسامٌ ومقرراتٌ وصحيفة واحدة (السابقة الفارغة تُؤرشف) وقواعدٌ قيد المراجعة بمسبقاتها.
 *   V4 الحسابات: كل الأدوار، موقوفة وبلا كلمة سر، على كلية البنين وحدها.
 *   V5 الإعادة: لا تكرار ولا مساس بما أُنشئ، وما عُدّل يدوياً يبقى.
 *   V6 الخريطة: بعد الاعتماد تُبنى خريطةُ القسم بأسهم المسبقات، وتُذكر المتطلباتُ العابرة للأقسام ملاحظات.
 */
import fs from "fs";
import os from "os";
import path from "path";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};

const { MARINE_MECHANICAL_DIPLOMA: REF } = await import("../src/data/marineMechanicalDiploma");

/* V1 */
{
  const codes = new Set(REF.groups.flatMap(group => group.courses.map(course => course.code)));
  const fixed = REF.groups.filter(group => !group.elective);
  check(fixed.every(group => group.courses.reduce((sum, course) => sum + course.credit, 0) === group.requiredUnits), "V1 وحدات كل مجموعة إجبارية تطابق المطبوع (6 و42 و18)");
  check(REF.groups.reduce((sum, group) => sum + group.requiredUnits, 0) === REF.degreeUnits && REF.degreeUnits === 75, "V1 مجموع الوحدات المطلوبة 75");
  check(REF.groups.every(group => group.courses.every(course => course.prerequisites.every(code => codes.has(code)))), "V1 كل متطلبٍ مطبوع موجودٌ في الصحيفة");
  check(codes.size === 58 && [...codes].every(code => /^04\d{5}$/.test(code)), "V1 58 مقرراً برمز كلية 04 من سبعة أرقام", codes.size);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "program-provision-"));
const mkSection = (id: number, college: number, code: string, name: string) => ({ AdSectionId: id, AdCollegeId: college, AdSectionCode: code, AdSectionName: name });
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
  users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [],
  colleges: [
    { AdCollegeId: 1, AdCollegeCode: "TB", AdCollegeName: "كلية الدراسات التكنولوجية - بنين" },
    { AdCollegeId: 2, AdCollegeCode: "TG", AdCollegeName: "كلية الدراسات التكنولوجية - بنات" },
    { AdCollegeId: 3, AdCollegeCode: "SC", AdCollegeName: "كلية العلوم" },
  ],
  sections: [mkSection(10, 1, "30", "اللغة الإنجليزية"), mkSection(11, 1, "56", "الفيزياء"), mkSection(12, 1, "76", "الرياضيات"), mkSection(20, 2, "51", "هندسة ميكانيكية - بحرية (بنات)")],
  instructors: [], courses: [], schedules: [], rooms: [], studentNeeds: [], curriculumPlans: [], curriculumPlanCourses: [],
}), { mode: 0o600 });
process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
const { provisionProgram, ROLE_LOGIN_SUFFIX } = await import("../scripts/lib/programProvision");
const { ACADEMIC_ROLES } = await import("../src/utils/academicRoles");
const { buildSheetModel } = await import("../src/server/planSheetRoutes");
await initDatabase(); console.warn = quiet;

const names: Record<string, string> = { "01": "الدراسات الإسلامية", "03": "قسم 03", "07": "قسم 07", "08": "قسم 08", "10": "قسم 10", "13": "قسم 13", "15": "قسم 15", "18": "قسم 18", "21": "قسم 21", "22": "قسم 22", "25": "قسم 25", "57": "قسم 57", "60": "قسم 60", "64": "قسم 64", "65": "قسم 65", "66": "قسم 66", "79": "قسم 79", "51": "هندسة ميكانيكية - بحرية" };
const snapshot = async () => JSON.stringify([(await Repository.getSections()).length, (await Repository.getCourses()).length, (await Repository.getUsers()).length, (await Repository.listRuleDrafts()).length]);

/* V2 */
{
  const before = await snapshot();
  const missing = await provisionProgram(Repository, REF, { apply: false, prefix: "tsb" });
  check(!missing.ok && missing.sectionsMissingName.length >= 10 && /لا يُخمَّن/.test(missing.error || ""), "V2 قسمٌ غائب بلا اسم: يتوقف ولا يُخمَّن", missing.sectionsMissingName);
  const ambiguous = await provisionProgram(Repository, REF, { apply: false, prefix: "tsb", collegeMatch: ["الدراسات التكنولوجية"], deptNames: names });
  check(!ambiguous.ok && /التبس/.test(ambiguous.error || ""), "V2 كليةٌ ملتبسة (بنين وبنات): لا تُختار تلقائياً");
  const none = await provisionProgram(Repository, REF, { apply: false, prefix: "tsb", collegeMatch: ["كلية غير موجودة"], deptNames: names });
  check(!none.ok && /لا كلية/.test(none.error || ""), "V2 كليةٌ غير مسجلة: لا تُنشأ");
  const preview = await provisionProgram(Repository, REF, { apply: false, prefix: "tsb", deptNames: names });
  check(preview.ok && preview.college?.id === 1 && preview.accounts.length === ACADEMIC_ROLES.length && preview.accounts.every(row => row.status === "will-create"), "V2 المعاينة تختار كلية البنين وتعدّ حساباً لكل صفة", preview.accounts.length);
  check((await snapshot()) === before, "V2 المعاينة لا تكتب شيئاً");
}

/* V3 + V4 */
{
  const run = await provisionProgram(Repository, REF, { apply: true, prefix: "tsb", deptNames: names });
  check(run.ok && run.wrote && run.planStatus === "created" && run.draftStatus === "written", "V3 التنفيذ ينجح", run.error);
  const sections = ((await Repository.getSections()) as any[]).filter(row => Number(row.AdCollegeId) === 1);
  const own = sections.find(row => String(row.AdSectionCode) === "51");
  check(Boolean(own) && own.AdSectionName === "هندسة ميكانيكية - بحرية" && sections.length === 21, "V3 قسم البرنامج وأقسام المساندة (21 مع الثلاثة القائمة) في كلية البنين وحدها", sections.length);
  const girlsSection = ((await Repository.getSections()) as any[]).filter(row => Number(row.AdCollegeId) === 2);
  check(girlsSection.length === 1, "V3 كلية البنات لم تُمسّ");
  const courses = ((await Repository.getCourses()) as any[]).filter(row => Number(row.AdCollegeId) === 1);
  check(courses.length === 58, "V3 58 مقرراً في كلية البنين", courses.length);
  const plans = ((await Repository.getCurriculumPlans(Number(own.AdSectionId))) as any[]);
  const live = plans.filter(row => row.status !== "archived");
  check(live.length === 1 && live[0].status === "active" && live[0].code === "DP-0405-2023" && plans.some(row => row.code === "LEGACY" && row.status === "archived"), "V3 صحيفةٌ حيّة واحدة (السابقةُ الفارغة مؤرشفة)", plans.map(row => [row.code, row.status]));
  const members = ((await Repository.getCurriculumPlanCourses(Number(own.AdSectionId))) as any[]).filter(row => row.planId === live[0].id);
  check(members.length === 32, "V3 الصحيفة مربوطة بمقررات قسمها وحدها (32)", members.length);
  const draft = await Repository.getRuleDraft(live[0].id);
  check(draft?.status === "review" && draft.rules.length === 32 && draft.externals.length === 26 && draft.groups.length === 2, "V3 القواعد قيد المراجعة: 32 قاعدة و26 متطلباً عاماً ومجموعتا اختيار", { s: draft?.status, r: draft?.rules.length, e: draft?.externals.length, g: draft?.groups.length });
  const idOf = (code: string) => courses.find(row => row.AdSectionId === sections.find(s => s.AdSectionCode === code.slice(2, 4))!.AdSectionId && row.CourseCode === code.slice(-3))!.AdCourseId;
  const rule = (code: string) => draft.rules.find((row: any) => row.courseId === idOf(code));
  check(rule("0451101")?.prereq?.all?.includes(idOf("0456113")), "V3 ميكانيكا الموائع تتطلب فيزياء عامة (متطلبٌ من قسمٍ آخر)");
  check(rule("0451257")?.prereq?.all?.join() === String(idOf("0451250")) && rule("0451253")?.prereq?.all?.join() === String(idOf("0451233")), "V3 التحكم الآلي ← منظومات الدفع، والمحاكي ← محطات الديزل (1)");
  check(rule("0451399")?.prereq?.all?.join() === String(idOf("0430162")), "V3 التدريب الميداني يتطلب كتابة تقارير فنية");
  const electiveGroup = draft.groups.find((group: any) => /ثقافية/.test(group.name));
  check(electiveGroup?.courseIds.length === 19 && electiveGroup.minUnits === 3, "V3 اختياري الثقافة العامة: 19 مقرراً (بينها لأقسامٍ أخرى) وحدُّه 3 وحدات", electiveGroup?.courseIds.length);

  const users = ((await Repository.getUsers()) as any[]).filter(row => String(row.SystemUserLogin).startsWith("tsb"));
  check(users.length === ACADEMIC_ROLES.length && users.every(row => row.IsActive === false && String(row.SystemUserPass || "") === ""), "V4 حسابٌ لكل صفة، موقوفٌ وبلا كلمة سر", users.length);
  const assigns = (await Repository.getCollegeUserAssigns()) as any[];
  const scopes = users.flatMap(row => assigns.filter(item => Number(item.SystemUserId) === Number(row.SystemUserId)).map(item => ({ login: row.SystemUserLogin, c: item.AdCollegeId, s: item.AdSectionId })));
  check(scopes.length === users.length && scopes.every(item => item.c === 1), "V4 نطاق كل الحسابات كلية البنين وحدها (لا كليةَ أخرى ولا «كل الكليات»)", scopes);
  const bySuffix = (suffix: string) => scopes.find(item => item.login === `tsb${suffix}`);
  check(bySuffix("dept")?.s === Number(own.AdSectionId) && bySuffix("head")?.s === Number(own.AdSectionId) && bySuffix("advisor")?.s === Number(own.AdSectionId) && bySuffix("dean")?.s === 0 && bySuffix("registrarhead")?.s === 0, "V4 رئيس اللجنة والقسم والمرشد على قسم البرنامج، والباقي على الكلية");
  check(Object.keys(ROLE_LOGIN_SUFFIX).length === ACADEMIC_ROLES.length, "V4 كل صفةٍ في النظام لها لاحقةُ دخول");
}

/* V5 */
{
  const before = await snapshot();
  const sectionsBefore = ((await Repository.getSections()) as any[]).length;
  const again = await provisionProgram(Repository, REF, { apply: true, prefix: "tsb", deptNames: names });
  check(again.ok && again.coursesToCreate === 0 && again.planStatus === "exists" && again.draftStatus === "kept" && again.accounts.every(row => row.status === "exists"), "V5 الإعادة: لا مقررات ولا صحيفة ولا قواعد ولا حسابات جديدة", again);
  check((await snapshot()) === before && ((await Repository.getSections()) as any[]).length === sectionsBefore, "V5 لا شيء تغيّر");
}

/* V5ب: تشغيلٌ سابقٌ انقطع بعد إنشاء الحساب وقبل صلاحياته ونطاقه: يُكمل الناقص ولا يمسّ غيره. */
{
  const head = ((await Repository.getUsers()) as any[]).find(row => row.SystemUserLogin === "tsbhead");
  await Repository.saveSecurityByUser(Number(head.SystemUserId), []);
  await Repository.saveUserAssigns(Number(head.SystemUserId), []);
  const resumed = await provisionProgram(Repository, REF, { apply: true, prefix: "tsb", deptNames: names });
  check(resumed.accounts.find(row => row.login === "tsbhead")?.status === "completed" && resumed.accounts.filter(row => row.status === "completed").length === 1, "V5ب الحساب المبتور يُكمل وحده", resumed.accounts.map(row => `${row.login}:${row.status}`));
  check((await Repository.getSecurityByUser(Number(head.SystemUserId))).length > 0 && (await Repository.getUserAssigns(Number(head.SystemUserId))).length === 1, "V5ب عادت صلاحياته ونطاقه (نطاقٌ واحد)");
}

/* V6 */
{
  const own = ((await Repository.getSections()) as any[]).find(row => Number(row.AdCollegeId) === 1 && String(row.AdSectionCode) === "51");
  const plan = ((await Repository.getCurriculumPlans(Number(own.AdSectionId))) as any[]).find(row => row.code === "DP-0405-2023");
  const draft = await Repository.getRuleDraft(plan.id);
  const approved = await Repository.approveRuleDraft(plan.id, draft.updatedAt, "اختبار");
  const { model } = await buildSheetModel(plan, approved);
  const mapCodes = model.courses.map(course => course.code), grouped = model.groups.flatMap(group => group.courses.map(course => course.code));
  check(mapCodes.length === 19 && grouped.length === 13 && new Set([...mapCodes, ...grouped]).size === 32, "V6 الخريطةُ لمقررات قسم البرنامج وحدها: 19 على المستويات و13 في مجموعتي الاختيار", [mapCodes.length, grouped.length]);
  check(model.otherUnits === 20, "V6 وحدات الأقسام الأخرى 20 (الثقافة الإسلامية 2 + المساندة 18) لا 57: خيارات المجموعات لا تُجمع كلُّها", model.otherUnits);
  check(model.courses.every(course => course.level > 0) && new Set(model.courses.map(course => course.level)).size === 3, "V6 المستويات 100 و200 و300", [...new Set(model.courses.map(course => course.level))]);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
