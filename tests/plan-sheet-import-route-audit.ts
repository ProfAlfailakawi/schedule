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
    colleges: [{ AdCollegeId: 1, AdCollegeCode: "012", AdCollegeName: "كلية التربية الأساسية - بنات" }],
    sections: [
      { AdSectionId: 21, AdCollegeId: 1, AdSectionCode: "09", AdSectionName: "قسم الوسائل التعليمية" },
      { AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "01", AdSectionName: "قسم أصول التربية" },
      { AdSectionId: 13, AdCollegeId: 1, AdSectionCode: "142", AdSectionName: "قسم المواد التأسيسية" },
      { AdSectionId: 14, AdCollegeId: 1, AdSectionCode: "142", AdSectionName: "قسم تكنولوجيا التعليم" },
      { AdSectionId: 15, AdCollegeId: 1, AdSectionCode: "09", AdSectionName: "قسم تكنولوجيا التعليم" },
    ],
    instructors: [], schedules: [], rooms: [], courseTransitions: [],
    courses: [{ AdCourseId: 301, AdCollegeId: 1, AdSectionId: 21, CourseCode: "105", CourseName: "أسس تكنولوجيا التعلم", CourseCredit: 3, CourseHours: 3, MaxStudent: 60 }],
    curriculumPlans: [{ id: "p15", AdCollegeId: 1, AdSectionId: 15, name: "فعّالة", status: "active", createdAt: "2026-01-01" }], curriculumPlanCourses: [],
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
  const upload = async (who: string, sectionId: number, body: Buffer = pdf) => {
    const res = await fetch(`${base}/api/plan-review/sheet/import?sectionId=${sectionId}`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-who": who }, body });
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
    check(first.status === 200 && first.json.ok === true, "الرفع يُقبل للقسم الصحيح", first.json);
    check(first.json.renamed?.after === "قسم تكنولوجيا التعليم" && (await Repository.getSections()).find(row => Number(row.AdSectionId) === 21)?.AdSectionName === "قسم تكنولوجيا التعليم", "اسم القسم أُخذ من الصحيفة بنمط «قسم …»", first.json.renamed);
    const courses = (await Repository.getCourses()).filter(row => Number(row.AdSectionId) === 21);
    check(courses.length === 27, `٢٧ مقرراً للقسم (${courses.length})`);
    check(courses.every(row => /^\d{2,3}$/.test(String(row.CourseCode))), "الرموز المحفوظة رقم المقرر وحده");
    const c105 = courses.find(row => row.CourseCode === "105")!;
    check(c105.CourseName !== "أسس تكنولوجيا التعلم" && c105.MaxStudent === 60, `الاسم صُحّح من الصحيفة والسعة بقيت ٦٠ (${c105.CourseName})`);
    check(courses.filter(row => row.CourseCode !== "105").every(row => Number(row.MaxStudent) === 0), "السعة لم تُوضع للجدد");
    check(first.json.created === 26 && first.json.updated === 1, `جديد ٢٦ ومصحَّح ١ (${first.json.created}/${first.json.updated})`);
    check(first.json.otherDepartments === 37, `مقررات الأقسام الأخرى لم تُؤخذ (${first.json.otherDepartments})`);
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
    const orderless = await upload("root", 15, oldPdf);
    check(orderless.status === 422 && orderless.json.rejection?.kind === "order", "قسم فعّالته وحدها: القديمة تُرفض (ارفع القديمة قبل الجديدة)", orderless.json);
  } finally { server.close(); }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
