/**
 * مسار رفع الصحيفة على مستودعٍ حقيقي بالصحيفة الحقيقية (تكنولوجيا التعليم 2026):
 * الحساب الرئيسي وحده، قسمٌ آخر يُرفض قبل أي كتابة، مقررات القسم وحدها برقمها، الاسم يُصحَّح،
 * السعة لا تُمسّ، والرفع المتكرر لا يغيّر شيئاً.
 */
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import type { AddressInfo } from "net";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail ?? ""); }
};

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-sheet-import-"));
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
    users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [],
    colleges: [{ AdCollegeId: 1, AdCollegeCode: "012", AdCollegeName: "كلية التربية الأساسية - بنات" }, { AdCollegeId: 2, AdCollegeCode: "011", AdCollegeName: "كلية التربية الأساسية - بنين" }, { AdCollegeId: 3, AdCollegeCode: "012", AdCollegeName: "كلية التربية الأساسية - بنات - الجهراء" }],
    sections: [
      { AdSectionId: 21, AdCollegeId: 1, AdSectionCode: "09", AdSectionName: "قسم الوسائل التعليمية" },
      { AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "01", AdSectionName: "قسم أصول التربية" },
      { AdSectionId: 13, AdCollegeId: 1, AdSectionCode: "142", AdSectionName: "قسم المواد التأسيسية" },
      { AdSectionId: 14, AdCollegeId: 2, AdSectionCode: "142", AdSectionName: "قسم تكنولوجيا التعليم" },
      { AdSectionId: 51, AdCollegeId: 1, AdSectionCode: "18", AdSectionName: "قسم اللغة الإنجليزية" },
      { AdSectionId: 52, AdCollegeId: 1, AdSectionCode: "21", AdSectionName: "قسم المناهج وطرق التدريس" },
      { AdSectionId: 53, AdCollegeId: 1, AdSectionCode: "09", AdSectionName: "قسم آخر برمز تسعة" },
      { AdSectionId: 61, AdCollegeId: 1, AdSectionCode: "24", AdSectionName: "قسم الحاسوب" },
      { AdSectionId: 71, AdCollegeId: 2, AdSectionCode: "88", AdSectionName: "قسم اسم خطأ" },
      { AdSectionId: 41, AdCollegeId: 1, AdSectionCode: "19", AdSectionName: "قسم التربية الخاصة" },
      { AdSectionId: 31, AdCollegeId: 3, AdSectionCode: "09", AdSectionName: "قسم الوسائل التعليمية" },
      { AdSectionId: 16, AdCollegeId: 2, AdSectionCode: "09", AdSectionName: "قسم تكنولوجيا التعليم" },
      { AdSectionId: 15, AdCollegeId: 2, AdSectionCode: "09", AdSectionName: "قسم تكنولوجيا التعليم" },
    ],
    instructors: [], schedules: [], rooms: [], courseTransitions: [],
    courses: [{ AdCourseId: 301, AdCollegeId: 1, AdSectionId: 21, CourseCode: "105", CourseName: "أسس تكنولوجيا التعلم", CourseCredit: 3, CourseHours: 3, MaxStudent: 60 }],
    curriculumPlans: [{ id: "p15", AdCollegeId: 2, AdSectionId: 15, name: "فعّالة", status: "active", createdAt: "2026-01-01" }], curriculumPlanCourses: [],
  }), { mode: 0o600 });
  process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
  const quiet = console.warn; console.warn = () => {};
  const { Repository, initDatabase } = await import("../src/db/repository");
  const { registerPlanReviewRoutes } = await import("../src/server/planReviewRoutes");
  await initDatabase();
  console.warn = quiet;

  const USERS: Record<string, any> = {
    root: { user: { SystemUserId: 1, Role: "committeeChair", Name: "المدير", IsAdminUser: true }, scopes: [], permissions: [7] },
    other: { user: { SystemUserId: 2, Role: "committeeChair", Name: "مسؤول", IsAdminUser: true }, scopes: [], permissions: [7] },
  };
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { const who = USERS[String(req.headers["x-who"] || "")]; if (who) { req.user = who.user; req.scopes = who.scopes; req.permissions = who.permissions; } next(); });
  registerPlanReviewRoutes(app, {
    requireAuth: (req: any, res, next) => (req.user ? next() : res.status(401).json({ error: "سجّل الدخول" })),
    isScopeAllowed: () => true, isPowerUser: req => Boolean(req.user?.IsAdminUser), isRootAdmin: req => Number(req.user?.SystemUserId) === 1,
    hasPermission: () => true, actorName: req => String(req.user?.Name || ""),
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const pdf = fs.readFileSync("tests/fixtures/plans/tech-edu-2026.pdf");
  const oldPdf = fs.readFileSync("tests/fixtures/plans/tech-edu-2010.pdf");
  const upload = async (who: string, sectionId: number, body: Buffer = pdf, force = false) => {
    const res = await fetch(`${base}/api/plan-review/sheet/import?sectionId=${sectionId}${force ? "&force=1" : ""}`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-who": who }, body });
    return { status: res.status, json: await res.json().catch(() => ({})) as any };
  };
  try {
    const before = JSON.stringify(await Repository.getCourses());
    check((await upload("other", 21)).status === 403, "غير الحساب الرئيسي: ٤٠٣");
    const wrongDept = await upload("root", 11);
    check(wrongDept.status === 422 && wrongDept.json.rejection?.kind === "department", "قسم آخر يُرفض", wrongDept.json);
    const foundations = await upload("root", 13);
    check(foundations.status === 422 && foundations.json.rejection?.kind === "department", "قسم اسمه ورمزه يخالفان الصحيفة يُرفض", foundations.json);
    check((await upload("root", 21, Buffer.from("not a pdf"))).status === 422, "ملفٌ ليس PDF يُرفض");
    check(JSON.stringify(await Repository.getCourses()) === before, "الرفض لم يكتب شيئاً");

    const wrongManualCode = await upload("root", 14);
    check(wrongManualCode.status === 200 && wrongManualCode.json.recoded?.before === "142" && wrongManualCode.json.recoded?.after === "09" && (await Repository.getSections()).find(row => Number(row.AdSectionId) === 14)?.AdSectionCode === "09", "رمزٌ كُتب يدوياً خطأً واسمه يطابق: يُقبل ويُصحَّح إلى رمز الصحيفة", wrongManualCode.json);

    const first = await upload("root", 21);
    check(first.json.sites === 2, "الصحيفة للمسار كله: بنات الرئيسي والجهراء معاً", first.json.sites);
    check(first.status === 200 && first.json.ok === true, "الرفع يُقبل للقسم الصحيح", first.json);
    check(first.json.renamed?.after === "قسم تكنولوجيا التعليم" && (await Repository.getSections()).find(row => Number(row.AdSectionId) === 21)?.AdSectionName === "قسم تكنولوجيا التعليم", "اسم القسم أُخذ من الصحيفة بنمط «قسم …»", first.json.renamed);
    const jahra = (await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 31);
    check(jahra.length === 27 && (await Repository.getCurriculumPlans(31)).some(plan => plan.status === "active") && (await Repository.getSections()).find(row => Number(row.AdSectionId) === 31)?.AdSectionName === "قسم تكنولوجيا التعليم", "موقع الجهراء نال المقررات والصحيفة والتسمية نفسها");
    const courses = (await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 21);
    check(courses.length === 27, `٢٧ مقرراً للقسم (${courses.length})`);
    check(courses.every(row => /^\d{2,3}$/.test(String(row.CourseCode))), "الرموز المحفوظة رقم المقرر وحده");
    const c105 = courses.find(row => row.CourseCode === "105")!;
    check(c105.CourseName !== "أسس تكنولوجيا التعلم" && c105.MaxStudent === 60, `الاسم صُحّح من الصحيفة والسعة بقيت ٦٠ (${c105.CourseName})`);
    check(courses.filter(row => row.CourseCode !== "105").every(row => Number(row.MaxStudent) === 0), "السعة لم تُوضع للجدد");
    check(first.json.created === 53 && first.json.updated === 1, `جديد ٢٦ في الرئيسي و٢٧ في الجهراء، ومصحَّح ١ (${first.json.created}/${first.json.updated})`);
    check(first.json.otherDepartments === 37, `مقررات الأقسام الأخرى لم تُؤخذ (${first.json.otherDepartments})`);
    check(Array.isArray(first.json.noDepartment) && first.json.noDepartment.every((item: string) => /^\d{4}×\d+$/.test(item)), "قسمٌ غير موجود بالنظام يُذكر برمزه في التقرير", first.json.noDepartment);
    const plans = await Repository.getCurriculumPlans(21);
    check(plans.some(plan => plan.status === "active") && plans.some(plan => plan.code === "LEGACY"), "صحيفة فعّالة جديدة و«السابقة» محفوظة");
    const links = (await Repository.getCurriculumPlanCourses(21)).filter(link => link.planId === first.json.planId);
    check(links.length === 27, `٢٧ مقرراً في الصحيفة (${links.length})`);
    const draft = await Repository.getRuleSet(first.json.planId).catch(() => undefined);
    const drafts = await Repository.listRuleDrafts();
    const mine = drafts.find(row => row.planId === first.json.planId);
    check(!!mine && mine.status === "review" && mine.rules.length === 27, `مسوّدة قواعد بـ٢٧ قاعدة للمراجعة (${mine?.rules.length})`);
    void draft;

    const second = await upload("root", 21);
    check(second.status === 200 && second.json.created === 0 && second.json.updated === 0 && second.json.linked === 0 && second.json.planCreated === false && second.json.renamed === null, "الرفع المتكرر لا يغيّر شيئاً", second.json);
    check((await Repository.getCurriculumPlans(21)).length === plans.length, "لا صحيفة جديدة عند التكرار");

    /* ── الصحيفة القديمة: «السابقة» وحدها، لا تمسّ الفعّالة ولا ما صُحِّح من المقررات ── */
    const namesBefore = new Map((await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 21).map(row => [row.AdCourseId, `${row.CourseName}|${row.CourseCredit}|${row.CourseHours}`] as const));
    const activeLinksBefore = (await Repository.getCurriculumPlanCourses(21)).filter(link => link.planId === first.json.planId).length;
    const legacy = await upload("root", 21, oldPdf);
    check(legacy.status === 200 && legacy.json.era === "old" && legacy.json.planName === "الصحيفة السابقة" && legacy.json.planId !== first.json.planId, "القديمة تدخل «الصحيفة السابقة» لا الفعّالة", legacy.json);
    check(legacy.json.updated === 0 && legacy.json.renamed === null && legacy.json.recoded === null, "القديمة لا تعدّل مقرراً قائماً ولا تسمّي القسم");
    const afterCourses = (await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 21);
    check([...namesBefore].every(([id, text]) => { const row = afterCourses.find(item => item.AdCourseId === id)!; return `${row.CourseName}|${row.CourseCredit}|${row.CourseHours}` === text; }), "أسماء ووحدات المقررات القائمة كما صحّحتها الجديدة");
    check((await Repository.getCurriculumPlanCourses(21)).filter(link => link.planId === first.json.planId).length === activeLinksBefore, "الصحيفة الفعّالة لم تتغيّر");
    check((await Repository.getCurriculumPlanCourses(21)).filter(link => link.planId === legacy.json.planId).length >= 29, "مقررات القديمة (٢٩) في «السابقة»");
    /* القديمة تصحّح مقرراً ليس في الفعّالة (اسمه ووحداته)، ولا تنقض ما في الفعّالة */
    const linksNow = await Repository.getCurriculumPlanCourses(21);
    const activeIds = new Set(linksNow.filter(link => link.planId === first.json.planId).map(link => Number(link.AdCourseId)));
    const oldOnly = afterCourses.find(row => !activeIds.has(Number(row.AdCourseId)) && linksNow.some(link => link.planId === legacy.json.planId && Number(link.AdCourseId) === Number(row.AdCourseId)))!;
    const shared = afterCourses.find(row => activeIds.has(Number(row.AdCourseId)))!;
    await Repository.updateCourse(oldOnly.AdCourseId, oldOnly.AdCollegeId, oldOnly.AdSectionId, oldOnly.CourseCode, "اسم خطأ", 1, 1, 33);
    await Repository.updateCourse(shared.AdCourseId, shared.AdCollegeId, shared.AdSectionId, shared.CourseCode, "اسم مختلف", shared.CourseCredit, shared.CourseHours, shared.MaxStudent);
    const legacyAgain = await upload("root", 21, oldPdf);
    const nowCourses = await Repository.getCourses();
    const oldOnlyNow = nowCourses.find(row => row.AdCourseId === oldOnly.AdCourseId)!, sharedNow = nowCourses.find(row => row.AdCourseId === shared.AdCourseId)!;
    check(legacyAgain.status === 200 && oldOnlyNow.CourseName === oldOnly.CourseName && oldOnlyNow.CourseCredit === oldOnly.CourseCredit && oldOnlyNow.MaxStudent === 33 && sharedNow.CourseName === "اسم مختلف", "القديمة تصحّح مقرراً ليس في الفعّالة (والسعة كما هي) ولا تنقض ما في الفعّالة", [oldOnlyNow, sharedNow]);
    await Repository.updateCourse(shared.AdCourseId, shared.AdCollegeId, shared.AdSectionId, shared.CourseCode, shared.CourseName, shared.CourseCredit, shared.CourseHours, shared.MaxStudent);
    const sound = afterCourses.filter(row => row.CourseName === "تكنولوجيا الصوت");
    check(sound.length === 2 && new Set(sound.map(row => row.CourseCode)).size === 2, "المقرر نفسه برقمين (قديم وجديد): سجلان باسمٍ مكرر ورقمين مختلفين، لا دمج بالاسم", sound.map(row => row.CourseCode));
    check(new Set(afterCourses.map(row => Number(row.CourseCode))).size === afterCourses.length, "لا رقمَ يتكرر في القسم");
    /* قسمٌ بلا أي صحيفة (حال بقية الأقسام): القديمة أولاً ثم الجديدة، كلٌّ في صحيفتها */
    const oldFirst = await upload("root", 16, oldPdf);
    check(oldFirst.status === 200 && oldFirst.json.era === "old" && oldFirst.json.planName === "الصحيفة السابقة", "قسم بلا صحائف: القديمة أولاً تدخل «السابقة»", oldFirst.json);
    const newAfter = await upload("root", 16);
    check(newAfter.status === 200 && newAfter.json.era === "new" && newAfter.json.planId !== oldFirst.json.planId && newAfter.json.planCreated === false, "ثم الجديدة تدخل الفعّالة (أُنشئت مع السابقة)", newAfter.json);
    const plans16 = (await Repository.getCurriculumPlans(16)).filter(plan => !plan.virtual);
    check(plans16.length === 2 && plans16.some(plan => plan.status === "active") && plans16.some(plan => plan.status === "transition"), "صحيفتان للقسم: فعّالة وسابقة");
    const orderless = await upload("root", 15, oldPdf);
    check(orderless.status === 422 && orderless.json.rejection?.kind === "order", "قسم فعّالته وحدها: القديمة تُرفض (ارفع القديمة قبل الجديدة)", orderless.json);

    /* بلا قسمٍ مختار: تُوجَّه الصحيفة إلى الأقسام التي يطابق اسمُها قسمَها، ولا قسمَ بالاسم: رفضٌ بلا كتابة */
    const auto = await upload("root", 0, pdf);
    check(auto.status === 200 && auto.json.auto === true && auto.json.tracks >= 2, "رفع تلقائي: الصحيفة تصل أقسامها كلها باسمها", auto.json);
    const beforeMath = JSON.stringify(await Repository.getCourses());
    const mathMissing = await upload("root", 0, fs.readFileSync("tests/fixtures/plans/graduation-2026/ba-0105.pdf"));
    check(mathMissing.status === 422 && mathMissing.json.rejection?.kind === "department" && JSON.stringify(await Repository.getCourses()) === beforeMath, "رفع تلقائي: قسم الرياضيات غير موجود يُرفض بلا كتابة", mathMissing.json);

    /* التربية الخاصة: قسمٌ واحد ومقرراتٌ مشتركة، ولكل مسارٍ صحيفتاه (جديدة وسابقة) بلا إزاحة الثنائية الرئيسية */
    const trackA = await upload("root", 41, fs.readFileSync("tests/fixtures/plans/graduation-old/ba-012102-2010.pdf"));
    check(trackA.status === 200 && /السابقة$/.test(trackA.json.planName) && trackA.json.planName.includes("اعاقة سمعية"), "مسار التربية الخاصة الأول يدخل صحيفته السابقة", trackA.json);
    const trackB = await upload("root", 41, fs.readFileSync("tests/fixtures/plans/graduation-old/ba-012402-2010.pdf"));
    check(trackB.status === 200 && trackB.json.planId !== trackA.json.planId, "المسار الثاني صحيفةٌ أخرى", trackB.json);
    const plans41 = await Repository.getCurriculumPlans(41);
    check(plans41.length === 4 && plans41.every(plan => plan.track) && new Set(plans41.map(plan => plan.track)).size === 2 && plans41.filter(plan => plan.status === "active").length === 2 && plans41.filter(plan => plan.status === "transition").length === 2, "لكل مسارٍ جديدةٌ وسابقة", plans41.map(plan => `${plan.track}/${plan.status}`));
    const courses41 = (await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 41);
    check(new Set(courses41.map(row => Number(row.CourseCode))).size === courses41.length, "مقررات القسم مشتركة بلا تكرار رقم");
    const links41 = await Repository.getCurriculumPlanCourses(41);
    const linked = (planId: string) => links41.filter(link => link.planId === planId).length;
    check(linked(trackA.json.planId) === 17 && linked(trackB.json.planId) === 17 && courses41.length < 34, `مسارٌ بـ١٧ مقرراً ومشتركٌ بينهما (${courses41.length} مقرراً للقسم)`, [linked(trackA.json.planId), linked(trackB.json.planId), courses41.length]);
    await upload("root", 41, fs.readFileSync("tests/fixtures/plans/graduation-old/ba-012102-2010.pdf"));
    check((await Repository.getCurriculumPlans(41)).length === 4, "إعادة رفع المسار لا تنشئ صحائف");
    await Repository.createCurriculumPlan({ collegeId: 1, sectionId: 41, name: "الصحيفة الجديدة", by: "test" });
    const after41 = await Repository.getCurriculumPlans(41);
    check(after41.filter(plan => plan.track).every(plan => plans41.find(old => old.id === plan.id)?.status === plan.status) && after41.filter(plan => !plan.track).length === 2, "صحيفةٌ رئيسية جديدة للقسم لا تزيح المسارات", after41.map(plan => `${plan.track || "-"}/${plan.status}`));

    /* المسبقات: مسبقٌ لمقررِ قسمٍ آخر لم يُرفع بعد يُعدّ ولا يضيع، ثم يُربط حين يوجد المقرر بإعادة الرفع */
    const english = fs.readFileSync("tests/fixtures/plans/graduation-2026/ba-0116.pdf");
    const firstEnglish = await upload("root", 51, english);
    check(firstEnglish.status === 200 && firstEnglish.json.unlinked === 0 && firstEnglish.json.unresolved.length === 0 && firstEnglish.json.prereqLinked === firstEnglish.json.prereqPrinted, "مقررات الأقسام الأخرى المطبوعة تُضاف فتُربط مسبقاتها", firstEnglish.json);
    const depA = (await Repository.getCourses()).find(row => Number(row.AdSectionId) === 52 && String(row.CourseCode) === "322");
    const depB = (await Repository.getCourses()).find(row => Number(row.AdSectionId) === 53 && String(row.CourseCode) === "425");
    check(Boolean(depA && depB) && firstEnglish.json.addedOther > 0, "مقرر القسم الخدمي الناقص أُضيف إلى قسمه من الصحيفة", [depA, depB, firstEnglish.json.addedOther]);
    const secondEnglish = await upload("root", 51, english);
    check(secondEnglish.status === 200 && secondEnglish.json.addedOther === 0 && secondEnglish.json.unlinked === 0 && secondEnglish.json.prereqLinked === secondEnglish.json.prereqPrinted, "الرفع المتكرر لا يُكرّر المضاف", secondEnglish.json);
    await Repository.updateCourse(depA!.AdCourseId, depA!.AdCollegeId, depA!.AdSectionId, depA!.CourseCode, "اسم خطأ", 1, 1, 40);
    const fixedElsewhere = await upload("root", 51, english);
    const depAfter = (await Repository.getCourses()).find(row => Number(row.AdCourseId) === Number(depA!.AdCourseId))!;
    check(fixedElsewhere.json.differsOther.length === 1 && depAfter.CourseName === "اسم خطأ" && depAfter.MaxStudent === 40, "مقرر قسمٍ آخر قائم يخالف الصحيفة: لا يصحّحه غير صحيفة قسمه، ويُذكر الفرق في التقرير", [fixedElsewhere.json.differsOther, depAfter]);
    const englishDraft = (await Repository.listRuleDrafts()).find(row => row.planId === secondEnglish.json.planId);
    const needy = (await Repository.getCourses()).find(row => Number(row.AdSectionId) === 51 && String(row.CourseCode) === "454");
    const rule = englishDraft?.rules.find(item => item.courseId === Number(needy?.AdCourseId));
    check(Boolean(rule?.prereq?.all?.includes(Number(depA?.AdCourseId)) && rule?.prereq?.all?.includes(Number(depB?.AdCourseId))), "المسبقان من القسمين الآخرين يظهران في قاعدة المقرر", rule);

    /* الرفع التلقائي: اسمٌ مختلف («الحاسوب» و«معلم الحاسب») ورمز الهيئة نفسه (0124) يكفي، ويُسمّى القسم من الصحيفة */
    const computer = await upload("root", 0, fs.readFileSync("tests/fixtures/plans/graduation-2026/ba-0136.pdf"));
    check(computer.status === 200 && computer.json.auto === true && (await Repository.getSections()).find(row => Number(row.AdSectionId) === 61)?.AdSectionName === "قسم معلم الحاسب", "تلقائي: اسمٌ مختلف ورمز الهيئة واحد يُقبل ويُسمّى القسم من الصحيفة", computer.json);

    /* اسمٌ ورمزٌ خطأ معاً: يُرفض بالمقارنة، ويُقبل بعد أن يختار المسؤول القسم صراحةً (والكلية تبقى شرطاً) فيُصحَّح اسمه ورمزه */
    const bothWrong = await upload("root", 71);
    check(bothWrong.status === 422 && bothWrong.json.rejection?.kind === "department", "اسمٌ ورمزٌ خطأ معاً: يُرفض ويُعرض الاختلاف", bothWrong.json);
    const forced = await upload("root", 71, pdf, true);
    const fixed = (await Repository.getSections()).find(row => Number(row.AdSectionId) === 71);
    check(forced.status === 200 && fixed?.AdSectionName === "قسم تكنولوجيا التعليم" && fixed?.AdSectionCode === "09", "رفعٌ صريح: الاسم والرمز يُصحَّحان من الصحيفة", forced.json);
    check((await upload("root", 71, fs.readFileSync("tests/fixtures/plans/graduation-2026/ba-0105.pdf"), true)).status === 200, "الرفع الصريح يقبل أي صحيفةٍ للقسم المختار صراحةً (قراره للمسؤول)");
    check((await Repository.getSections()).find(row => Number(row.AdSectionId) === 41)?.AdSectionName === "قسم التربية الخاصة", "التربية الخاصة لا تُسمّى «علم النفس» من ترويسة صحيفتها");

    /* إنهاء الصحيفة السابقة لقسمٍ: الجدول يعرض الجديدة وحدها، والتراجع يعيدها */
    const call = async (who: string, method: string, url: string, body?: unknown) => { const res = await fetch(`${base}${url}`, { method, headers: { "content-type": "application/json", "x-who": who }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
    const listedBefore = await call("root", "GET", "/api/plan-review/previous-plans");
    check(listedBefore.json.rows.find((row: any) => row.sectionId === 21)?.state === "running" && (await call("other", "GET", "/api/plan-review/previous-plans")).status === 403, "قائمة الأقسام: السابقة جارية، وللحساب الرئيسي وحده", listedBefore.json.rows);
    const operationalBefore = await Repository.getOperationalCourseIds(21);
    const ended = await call("root", "POST", "/api/plan-review/previous-plans", { action: "end", sectionIds: [21] });
    const plans21 = await Repository.getCurriculumPlans(21), plans31 = await Repository.getCurriculumPlans(31);
    check(ended.status === 200 && ended.json.changed === 1 && !plans21.some(plan => plan.status === "transition") && !plans31.some(plan => plan.status === "transition") && plans21.some(plan => plan.status === "active"), "«انتهوا» تؤرشف السابقة في المسار كله وتُبقي الفعّالة", ended.json);
    const pickerEnded = await call("root", "GET", "/api/plan-review/previous-ended?sectionId=21");
    const operationalAfter = await Repository.getOperationalCourseIds(21);
    check(pickerEnded.json.ended === true && operationalAfter.size < operationalBefore.size && pickerEnded.json.courseIds.length === operationalAfter.size && (await call("root", "GET", "/api/plan-review/previous-ended?sectionId=11")).json.ended === false, "منتقي الجدول: مقررات الجديدة وحدها لقسمٍ أُنهي، وغيره كما هو", [operationalBefore.size, operationalAfter.size]);
    check((await call("other", "POST", "/api/plan-review/previous-plans", { action: "end", sectionIds: [21] })).status === 403, "الإنهاء للحساب الرئيسي وحده");
    const restored = await call("root", "POST", "/api/plan-review/previous-plans", { action: "restore", sectionIds: [21] });
    check(restored.json.changed === 1 && (await Repository.getCurriculumPlans(21)).some(plan => plan.status === "transition") && (await Repository.getOperationalCourseIds(21)).size === operationalBefore.size && (await call("root", "GET", "/api/plan-review/previous-ended?sectionId=21")).json.ended === false, "«أعد السابقة» تتراجع كلياً", restored.json);

    /* أقسامٌ بلا صحائف: الأشيع من الصحائف الأخرى يصحّح مقرراتها، وما في صحيفةٍ فعّالة لا يُمسّ */
    const reconcileCall = (who: string, courses: unknown[]) => call(who, "POST", "/api/plan-review/sheet/reconcile", { courses });
    const c105Before = (await Repository.getCourses()).find(row => Number(row.AdSectionId) === 21 && row.CourseCode === "105")!;
    const reconciled = await reconcileCall("root", [{ key: "0121322", name: depA!.CourseName, units: depA!.CourseCredit, hours: depA!.CourseHours }, { key: "0109105", name: "اسم آخر", units: 9, hours: 9 }]);
    const depBack = (await Repository.getCourses()).find(row => Number(row.AdCourseId) === Number(depA!.AdCourseId))!, c105After = (await Repository.getCourses()).find(row => row.AdCourseId === c105Before.AdCourseId)!;
    check(reconciled.json.updated === 1 && depBack.CourseName === depA!.CourseName && depBack.CourseCredit === depA!.CourseCredit && depBack.CourseHours === depA!.CourseHours && depBack.MaxStudent === 40, "قسمٌ بلا صحيفة: مقرره يُصحَّح بالأشيع والسعة كما هي", [reconciled.json, depBack]);
    check(c105After.CourseName === c105Before.CourseName && c105After.CourseCredit === c105Before.CourseCredit, "مقررٌ في صحيفة فعّالة (قسمٌ له صحيفة) لا يُمسّه التجميع");
    check((await reconcileCall("other", [])).status === 403, "التجميع للحساب الرئيسي وحده");
    const scanEnglish = await fetch(`${base}/api/plan-review/sheet/scan`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-who": "root" }, body: english }).then(res => res.json()) as any;
    check(Array.isArray(scanEnglish.others) && scanEnglish.others.length > 5 && scanEnglish.others.every((item: any[]) => item.length === 4 && /^\d{7}$/.test(String(item[0]))), "قراءة الترويسة تعيد مقررات الأقسام الأخرى للتجميع", scanEnglish.others?.slice(0, 2));

    /* قراءة الترويسة بلا كتابة (لتصفية الدفعة) */
    const scanOf = async (who: string, body: Buffer) => { const res = await fetch(`${base}/api/plan-review/sheet/scan`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-who": who }, body }); return { status: res.status, json: await res.json().catch(() => ({})) as any }; };
    const scanned = await scanOf("root", oldPdf);
    check(scanned.status === 200 && scanned.json.program === "BA-0115" && scanned.json.year === 2010 && scanned.json.isNew === false && scanned.json.readable === true, "قراءة الترويسة: البرنامج والسنة والجديدة/القديمة", scanned.json);
    check((await scanOf("other", oldPdf)).status === 403 && (await scanOf("root", Buffer.from("x"))).status === 422, "القراءة للحساب الرئيسي وPDF فقط");
    check(Array.isArray(auto.json.sections) && auto.json.sections.length >= 2 && typeof auto.json.nameFixes === "number", "ردّ الرفع التلقائي يحمل أقسامه ليُحرَّر منه التقرير", auto.json);
  } finally { server.close(); }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
