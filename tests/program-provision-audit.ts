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

/* V2ب: إنشاء الكلية صريحٌ فقط، ومعاينته لا تكتب. */
{
  const before = await snapshot();
  const colleges = ((await Repository.getColleges()) as any[]).length;
  const allNames = Object.fromEntries([...new Set(REF.groups.flatMap(group => group.courses.map(course => course.code.slice(2, 4))))].map(code => [code, `قسم ${code}`]));
  const usedCode = String(((await Repository.getColleges()) as any[])[0].AdCollegeCode);
  const opts = { prefix: "tsn", collegeMatch: ["كلية جديدة تماماً"], deptNames: allNames, createCollege: { code: "77", name: "كلية جديدة تماماً - بنين" } };
  const preview = await provisionProgram(Repository, REF, { ...opts, apply: false });
  check(preview.ok && preview.collegeToCreate?.code === "77" && preview.coursesToCreate === 58 && preview.accounts.every(row => row.status === "will-create"), "V2ب معاينة الكلية الجديدة: تُعدّ الكلية وكل المقررات (58) والحسابات جديدة", [preview.error, preview.coursesToCreate]);
  check((await snapshot()) === before && ((await Repository.getColleges()) as any[]).length === colleges, "V2ب المعاينة لا تُنشئ الكلية");
  const clash = await provisionProgram(Repository, REF, { ...opts, apply: false, createCollege: { code: usedCode, name: "كلية جديدة تماماً - بنين" } });
  check(!clash.ok && /مستخدم/.test(clash.error || ""), "V2ب رمز كليةٍ مستخدم: يتوقف");
  const made = await provisionProgram(Repository, REF, { ...opts, apply: true, approve: true });
  check(made.ok && made.wrote && made.college!.id > 0 && ((await Repository.getColleges()) as any[]).length === colleges + 1, "V2ب التنفيذ ينشئ الكلية ثم أقسامها ومقرراتها", made.error);
  const newOwn = ((await Repository.getSections()) as any[]).find(row => Number(row.AdCollegeId) === made.college!.id && String(row.AdSectionCode) === "51");
  const newPlan = ((await Repository.getCurriculumPlans(Number(newOwn.AdSectionId))) as any[]).find(row => row.code === "DP-0405-2023");
  const liveRules = await Repository.getRuleSet(newPlan.id);
  check(made.draftStatus === "approved" && liveRules?.rules?.length === 32 && liveRules.version === 1, "V2ب --approve: القواعد معتمدة (32 قاعدة، نسخة 1)", [made.draftStatus, liveRules?.rules?.length]);
  const again = await provisionProgram(Repository, REF, { ...opts, apply: true, approve: true });
  check(again.draftStatus === "approved" && !again.approveBlocked, "V2ب الإعادة تُبلغ أن القواعد معتمدة (لا «قيد المراجعة»)", again.draftStatus);
  check(again.ok && !again.collegeToCreate && ((await Repository.getColleges()) as any[]).length === colleges + 1 && again.coursesToCreate === 0, "V2ب الإعادة لا تكرر الكلية");
}

/* V2ج: --approve لا يعتمد قواعد فيها مانع، ولا يمسّ تعديلاً لاحقاً على صحيفةٍ معتمدة سابقاً. */
{
  const blockedNames = Object.fromEntries([...new Set(REF.groups.flatMap(group => group.courses.map(course => course.code.slice(2, 4))))].map(code => [code, `قسم ${code}`]));
  const o = { prefix: "tsq", collegeMatch: ["كلية الاختبار ج"], deptNames: blockedNames, createCollege: { code: "78", name: "كلية الاختبار ج - بنين" } };
  const first = await provisionProgram(Repository, REF, { ...o, apply: true });
  const sec = ((await Repository.getSections()) as any[]).find(row => Number(row.AdCollegeId) === first.college!.id && String(row.AdSectionCode) === "51");
  const plan = ((await Repository.getCurriculumPlans(Number(sec.AdSectionId))) as any[]).find(row => row.code === "DP-0405-2023");
  const draft = await Repository.getRuleDraft(plan.id);
  const broken = draft.rules.map((rule: any, index: number) => index === 0 ? { ...rule, prereq: { all: [rule.courseId], anyOf: [] } } : rule);
  await Repository.updateRuleDraft(plan.id, (current: any) => ({ ...current, rules: broken, updatedAt: new Date().toISOString() }));
  const blocked = await provisionProgram(Repository, REF, { ...o, apply: true, approve: true });
  check(Boolean(blocked.approveBlocked) && !(await Repository.getRuleSet(plan.id)) && blocked.draftStatus !== "approved", "V2ج مانعٌ في القواعد: لا اعتماد وتبقى قيد المراجعة", blocked.approveBlocked);
  await Repository.updateRuleDraft(plan.id, (current: any) => ({ ...current, rules: draft.rules, updatedAt: new Date().toISOString() }));
  const ok = await provisionProgram(Repository, REF, { ...o, apply: true, approve: true });
  check(ok.draftStatus === "approved" && (await Repository.getRuleSet(plan.id))?.version === 1, "V2ج بعد زوال المانع: تُعتمد", ok.approveBlocked);
  const liveBefore = JSON.stringify(await Repository.getRuleSet(plan.id));
  await Repository.updateRuleDraft(plan.id, (current: any) => ({ ...current, status: "review", rules: current.rules, updatedAt: new Date().toISOString() }));
  await provisionProgram(Repository, REF, { ...o, apply: true, approve: true });
  check(JSON.stringify(await Repository.getRuleSet(plan.id)) === liveBefore && (await Repository.getRuleDraft(plan.id))?.status === "review", "V2ج تعديلٌ لاحقٌ على صحيفةٍ معتمدة يبقى لرئيس اللجنة");
}

/* V2د: --own-only: القسم وحده. */
{
  const o = { prefix: "tso", collegeMatch: ["كلية الاختبار د"], createCollege: { code: "79", name: "كلية الاختبار د - بنين" }, ownOnly: true as const };
  const sectionsBefore = ((await Repository.getSections()) as any[]).length;
  const preview = await provisionProgram(Repository, REF, { ...o, apply: false });
  check(preview.ok && preview.notes.length > 0 && preview.sectionsToCreate.length === 1 && preview.coursesToCreate === 32, "V2د معاينة القسم وحده: قسمٌ واحد و32 مقرراً ومسبقات خارجية مهملة تُذكر", [preview.error, preview.sectionsToCreate.length, preview.coursesToCreate, preview.notes.length]);
  check(((await Repository.getSections()) as any[]).length === sectionsBefore, "V2د المعاينة لا تكتب");
  check(/20 وحدة/.test(preview.ownOnlyWarning || "") && /يظهر 55 بدل 75/.test(preview.ownOnlyWarning || ""), "V2د التنبيه يعلن ما يفقده القسم الواحد: 20 وحدة، ويظهر 55 بدل 75", preview.ownOnlyWarning);
  const made = await provisionProgram(Repository, REF, { ...o, apply: true, approve: true, password: "12345678" });
  check(made.ok && made.wrote && made.draftStatus === "approved", "V2د التنفيذ ينجح ويعتمد", made.error || made.approveBlocked);
  const cid = made.college!.id;
  const secs = ((await Repository.getSections()) as any[]).filter(row => Number(row.AdCollegeId) === cid);
  const courses = ((await Repository.getCourses()) as any[]).filter(row => Number(row.AdCollegeId) === cid);
  check(secs.length === 1 && String(secs[0].AdSectionCode) === "51" && courses.length === 32, "V2د الكلية فيها قسم البرنامج وحده ومقرراته (32) بلا أقسام ولا مقررات أخرى", [secs.length, courses.length]);
  const planRow = ((await Repository.getCurriculumPlans(Number(secs[0].AdSectionId))) as any[]).find(row => row.code === "DP-0405-2023");
  const live = await Repository.getRuleSet(planRow.id);
  const ids = new Set(courses.map(row => Number(row.AdCourseId)));
  check(live?.rules?.length === 32 && live.rules.every((rule: any) => (rule.prereq?.all || []).every((id: number) => ids.has(id))) && (live.externals || []).length === 0 && live.groups.length === 2, "V2د القواعد 32 ومسبقاتها من داخل القسم وحده ومجموعتا اختيار (فيهما مقرراتُ القسم وحدها) بلا متطلبات خارجية", [live?.rules?.length, live?.groups?.length]);
  const users = ((await Repository.getUsers()) as any[]).filter(row => /^tso/.test(row.SystemUserLogin));
  check(users.length === 9 && users.every(row => row.IsActive === true), "V2د الحسابات التسعة فعّالة", users.length);
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

/* V5ج: كلمة سرٍّ افتراضية: تُفعَّل بها حساباتُ الأداة وحدها ويُترك غيرُها. */
{
  const users0 = (await Repository.getUsers()) as any[];
  const admin = users0.find(row => row.IsAdminUser);
  const adminBefore = JSON.stringify(admin);
  await Repository.updateUser(Number(users0.find(row => row.SystemUserLogin === "tsbdean").SystemUserId), { SystemUserPass: Repository.hashPassword("بدّلها-المدير"), IsActive: false });
  const dean0 = JSON.stringify((await Repository.getUsers() as any[]).find(row => row.SystemUserLogin === "tsbdean"));
  const done = await provisionProgram(Repository, REF, { apply: true, prefix: "tsb", deptNames: names, password: "12345668" });
  const users1 = (await Repository.getUsers()) as any[];
  const ok = (login: string) => { const u = users1.find(row => row.SystemUserLogin === login); return u.IsActive === true && Repository.verifyPassword("12345668", u.SystemUserPass) === true && String(u.SystemUserPass).startsWith("scrypt$") && (!Repository.encryptPasswordForVault("x") || Boolean(u.SystemUserPassVault)); };
  const mine = users1.filter(row => /^tsb/.test(row.SystemUserLogin) && row.SystemUserLogin !== "tsbdean");
  check(done.ok && mine.length === 8 && mine.every(row => ok(row.SystemUserLogin)), "V5ج حسابات الأداة فعّالة بكلمة سرٍّ مُجزّأة ومحفوظة في الخزنة", done.accounts.map(row => `${row.login}:${row.status}`));
  check(JSON.stringify(users1.find(row => row.SystemUserLogin === "tsbdean")) === dean0, "V5ج حسابٌ له كلمة سرٍّ يُترك كما هو");
  check(JSON.stringify(users1.find(row => row.IsAdminUser)) === adminBefore, "V5ج الأدمن لم يُمسّ");
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
