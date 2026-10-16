/**
 * تطبيق صحيفة تكنولوجيا التعليم المرجعية على كتالوج موقع: ما يُصحَّح وما يُضاف وما يُربط وما يُستبعد
 * بحسب الفرع (بنون 011 / بنات 012)، والقواعد المشتقّة (المستوى والنوع والمسبقات والمجموعات الاختيارية).
 * الدالة نقية؛ تُغذّى بالمقارنة نفسها التي تعرضها الشاشة.
 */
import { TECHNOLOGY_EDUCATION_CURRICULA } from "../src/data/technologyEducationCurricula";
import { compareCurriculumReference, referenceCodeKey } from "../src/utils/curriculumReference";
import { audienceOf, branchAudience, buildReferenceRules, planReferenceApplication, splitFrozenUpdates, type ComparedGroup, type PlannedUpdate } from "../src/utils/referenceApply";
import type { AdCourse } from "../src/types";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const OLD = TECHNOLOGY_EDUCATION_CURRICULA.find(row => row.id === "old")!, NEW = TECHNOLOGY_EDUCATION_CURRICULA.find(row => row.id === "new")!;
const SECTION = 9, COLLEGE = 5;
/** قسم التقنية رمزه 09 في الكلية؛ أي رمزٍ قسمُه غيرُه يملكه قسمٌ آخر (رقمه = رمز القسم). */
const ownerOf = (code: string) => Number(code.slice(2, 4));

function compare(reference: typeof OLD, catalog: AdCourse[], members: Set<number>): ComparedGroup[] {
  return compareCurriculumReference(reference, catalog, members, SECTION).map(group => ({
    ...group,
    courses: group.courses.map(course => {
      const matched = course.current && catalog.find(row => row.AdCourseId === course.current!.id);
      return { ...course, current: course.current && { id: course.current.id, code: course.current.code, name: course.current.name, credit: course.current.credit, hours: course.current.hours }, ownerSectionId: matched?.AdSectionId || ownerOf(course.code) } as any;
    }),
  }));
}
/** كتالوج الموقع: يحوي كل مقررات الصحيفة صحيحةً (بالرمز الطويل) إلا ما نحدّده. */
function catalogOf(reference: typeof OLD, tweak: (course: { code: string; name: string; credit: number; hours: number }, id: number) => AdCourse | null): AdCourse[] {
  let id = 1;
  return reference.groups.flatMap(group => group.courses).map(course => tweak(course, id++)).filter(Boolean) as AdCourse[];
}
const plain = (course: { code: string; name: string; credit: number; hours: number }, id: number): AdCourse =>
  ({ AdCourseId: id, AdCollegeId: COLLEGE, AdSectionId: ownerOf(course.code), CourseCode: course.code, CourseName: course.name, CourseCredit: course.credit, CourseHours: course.hours, MaxStudent: 0 });

/* ── الفرع والجمهور ── */
check(branchAudience("012") === "girls" && branchAudience("011") === "boys", "الفرع 012 بنات و011 بنون");
check(audienceOf(OLD, { code: "0111148", name: "أشغال إبرة (للبنات فقط)" }) === "girls", "«للبنات فقط» المطبوعة ⇦ بنات (القديمة)");
check(audienceOf(OLD, { code: "0106148", name: "نشاط زراعي (1)" }) === "boys", "نشاط زراعي ⇦ بنين (استنتاج)");
check(audienceOf(NEW, { code: "0111148", name: "أشغال إبرة (للبنات فقط)" }) === null, "الصحيفة الجديدة للجميع بلا تمييز");

/* ── موقع بنات: الصحيفة القديمة، ولا مقرر ناقص إلا ما حذفناه ── */
const girlsCatalog = catalogOf(OLD, (course, id) => course.code === "0109114" ? { ...plain(course, id), CourseName: "اسم خاطئ", CourseCredit: 1 } : course.code === "0109125" ? null : plain(course, id));
const girls = planReferenceApplication(OLD, compare(OLD, girlsCatalog, new Set()), "012", new Set(), SECTION);
check(girls.skipped.some(item => item.code === "0106148") && girls.skipped.some(item => item.code === "0165198") && girls.skipped.length === 6, `موقع البنات: 6 مقررات بنين مستبعدة (${girls.skipped.length})`);
check(!girls.skipped.some(item => item.code === "0111148"), "موقع البنات: «للبنات فقط» تدخل");
check(girls.updates.length === 1 && girls.updates[0].code === "0109114" && girls.updates[0].after.name === "تكنولوجيا الأجهزة التعليمية" && girls.updates[0].after.credit === 2, "اسمٌ/وحداتٌ مخالفة ⇦ تصحيحٌ إلى الصحيفة");
check(girls.creates.length === 1 && girls.creates[0].code === "0109125" && girls.creates[0].sectionId === 9, "المقرر الناقص يُنشأ في القسم المالك");
check(girls.links.every(link => (girlsCatalog.find(row => row.AdCourseId === link.courseId)?.AdSectionId) === SECTION) && girls.links.length > 20, "الربط لمقررات قسم الصحيفة وحدها");
check(girls.courseCount === 73 - 6 - 0, `عدد مقررات الصحيفة في موقع البنات ${girls.courseCount} = 67`);

/* ── موقع بنين: عكس ذلك ── */
const boys = planReferenceApplication(OLD, compare(OLD, catalogOf(OLD, plain), new Set()), "011", new Set(), SECTION);
check(boys.skipped.length === 2 && boys.skipped.every(item => /للبنات فقط/.test(item.reason)), "موقع البنين: مقرران للبنات فقط مستبعدان");
check(boys.notes.filter(note => /بالاستنتاج/.test(note)).length === 6, "مقررات البنين المستنتجة موسومة للمراجعة");
check(boys.courseCount === 71, `مقررات الصحيفة في موقع البنين ${boys.courseCount} = 71`);

/* ── الصحيفة الجديدة: للجميع، والتطبيق متكرر الأثر ── */
const newOk = planReferenceApplication(NEW, compare(NEW, catalogOf(NEW, plain), new Set(catalogOf(NEW, plain).filter(c => c.AdSectionId === SECTION).map(c => c.AdCourseId))), "012", new Set(catalogOf(NEW, plain).filter(c => c.AdSectionId === SECTION).map(c => c.AdCourseId)), SECTION);
check(newOk.updates.length === 0 && newOk.creates.length === 0 && newOk.links.length === 0 && newOk.skipped.length === 0, "كتالوج مطابق ومربوط ⇦ لا شيء يُغيَّر (متكرر الأثر)");
check(newOk.courseCount === 64, "الجديدة: 64 مقرراً في كل موقع");

/* ── مقرر قسمٍ آخر باسمٍ خطأ يُصحَّح في كتالوجه ولا يُربط ── */
const foreign = catalogOf(NEW, (course, id) => course.code === "0102114" ? { ...plain(course, id), CourseName: "اسم قديم" } : plain(course, id));
const fx = planReferenceApplication(NEW, compare(NEW, foreign, new Set()), "012", new Set(), SECTION);
const fixed = fx.updates.find(item => item.code === "0102114");
check(!!fixed && fixed.ownerSectionId === 2 && !fx.links.some(link => link.code === "0102114"), "مقرر قسم آخر: تصحيح الاسم بلا ربطٍ بالصحيفة");

/* ── الرمز القصير لمقررات القسم نفسه ── */
const short = catalogOf(NEW, (course, id) => course.code.startsWith("0109") ? { ...plain(course, id), CourseCode: String(Number(course.code.slice(-3))) } : plain(course, id));
const sx = planReferenceApplication(NEW, compare(NEW, short, new Set()), "012", new Set(), SECTION);
check(sx.creates.length === 0 && sx.links.length > 20, "رمزٌ قصير لمقرر القسم يُطابَق ولا يُكرَّر");

/* ── الاسم المجمَّد: لا يُغيَّر إلا بتأكيد، والوحدات تُطبَّق ── */
{
  const base: PlannedUpdate = { courseId: 1, code: "0109114", ownerSectionId: 9, identityChange: true, frozen: true, before: { name: "قديم", credit: 1, hours: 2 }, after: { name: "جديد", credit: 2, hours: 3 } };
  const hold = splitFrozenUpdates([base], false);
  check(hold.held.length === 1 && hold.apply.length === 1 && hold.apply[0].after.name === "قديم" && hold.apply[0].after.credit === 2, "الاسم المجمَّد يُحبس بلا تأكيد وتُطبَّق الوحدات");
  const confirmed = splitFrozenUpdates([base], true);
  check(confirmed.held.length === 0 && confirmed.apply[0].after.name === "جديد", "بالتأكيد الصريح يُغيَّر الاسم");
  const free = splitFrozenUpdates([{ ...base, frozen: false }], false);
  check(free.held.length === 0 && free.apply[0].after.name === "جديد", "غير المجمَّد يُطبَّق مباشرة");
}

/* ── القواعد المشتقّة ── */
const own = catalogOf(NEW, plain).filter(c => c.AdSectionId === SECTION);
const memberIdByCode = new Map(own.map(c => [referenceCodeKey(c.CourseCode), c.AdCourseId])), knownIdByCode = new Map(catalogOf(NEW, plain).map(c => [referenceCodeKey(c.CourseCode), c.AdCourseId]));
const built = buildReferenceRules(NEW, memberIdByCode, knownIdByCode, new Set());
const ruleOf = (code: string) => built.rules.find(rule => rule.courseId === memberIdByCode.get(code));
check(built.rules.length === own.length, `قاعدةٌ لكل مقرر قسم (${built.rules.length}/${own.length})`);
check(ruleOf("0109105")?.level === 100 && ruleOf("0109322")?.level === 300, "المستوى من رقم المقرر");
check(JSON.stringify(ruleOf("0109322")?.prereq?.all.length) === "3", "0109322 ثلاثة مسبقات كلها لازمة");
check(ruleOf("0109105")?.kind === "compulsory", "إجباري تخصصي");
const electiveGroup = built.groups.find(group => group.id === "new-major-elective");
check(!!electiveGroup && electiveGroup.minUnits === 6 && electiveGroup.courseIds.every(id => own.some(c => c.AdCourseId === id)), `المجموعة الاختيارية التخصصية: ${electiveGroup?.minUnits} وحدة، أعضاؤها من القسم`);
const pen = buildReferenceRules(OLD, new Map(catalogOf(OLD, plain).map(c => [referenceCodeKey(c.CourseCode), c.AdCourseId])), new Map(catalogOf(OLD, plain).map(c => [referenceCodeKey(c.CourseCode), c.AdCourseId])), new Set());
const english1 = pen.rules.find(rule => rule.courseId === catalogOf(OLD, plain).find(c => c.CourseCode === "0130161")!.AdCourseId);
check(english1 && !english1.prereq, "«0130099 أو PEN»: لا يُقيَّد المقرر بالمسبق");



/* ── خادمٌ حقيقي (تجربة): موقعان، معاينة ثم تطبيق ثم إعادة التطبيق ── */
const BASE = "http://localhost:3000";
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reference-apply-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (await up()) console.log("   (تخطّي الجزء الحيّ: المنفذ مشغول بخادمٍ آخر)");
  else {
    child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
    let ready = false;
    for (let i = 0; i < 120 && !ready; i += 1) { ready = await up(); if (!ready) await new Promise(r => setTimeout(r, 1000)); }
    if (!ready) throw new Error("الخادم لم يبدأ");
    const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
    const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
    const call = async (method: string, url: string, body?: unknown) => {
      const response = await fetch(BASE + url, { method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) as any };
    };
    const boysCollege = (await call("POST", "/api/colleges", { AdCollegeCode: "BOYS", AdCollegeName: "كلية التربية الأساسية - بنين" })).body;
    const girlsCollege = (await call("POST", "/api/colleges", { AdCollegeCode: "GIRLS", AdCollegeName: "كلية التربية الأساسية - بنات" })).body;
    /* لكل موقع قسمٌ لكل رمز قسمٍ تذكره الصحيفتان (09 هو تكنولوجيا التعليم). */
    const deptCodes = [...new Set(TECHNOLOGY_EDUCATION_CURRICULA.flatMap(r => r.groups.flatMap(g => g.courses.map(c => c.code.slice(2, 4)))))];
    const techOf = new Map<number, number>(), sectionOf = new Map<string, number>();
    for (const college of [boysCollege, girlsCollege]) {
      for (const code of deptCodes) {
        const made = (await call("POST", "/api/sections", { AdCollegeId: college.AdCollegeId, AdSectionCode: code, AdSectionName: code === "09" ? "تكنولوجيا التعليم" : `قسم ${code}` })).body;
        sectionOf.set(`${college.AdCollegeId}:${code}`, made.AdSectionId);
        if (code === "09") techOf.set(college.AdCollegeId, made.AdSectionId);
      }
    }
    check(techOf.size === 2 && sectionOf.size === deptCodes.length * 2, `H0 موقعان بأقسامٍ لكل رمز (${deptCodes.length} قسماً لكل موقع)`);
    const sectionIds = [...techOf.values()];

    const preview = await call("POST", "/api/plan-review/reference/apply", { referenceId: "old", sectionIds, dryRun: true });
    check(preview.status === 200 && preview.body?.dryRun === true && preview.body.sites.length === 2, "H1 المعاينة تعمل للحساب الرئيسي", preview);
    const boysSite0 = preview.body?.sites?.find((row: any) => row.collegeId === boysCollege.AdCollegeId), girlsSite0 = preview.body?.sites?.find((row: any) => row.collegeId === girlsCollege.AdCollegeId);
    check(boysSite0?.branch === "011" && girlsSite0?.branch === "012", "H2 الفرع من اسم الكلية: 011 بنين و012 بنات", { b: boysSite0?.branch, g: girlsSite0?.branch });
    check(boysSite0.skipped.length === 2 && girlsSite0.skipped.length === 6, `H3 الاستبعاد بحسب الفرع (بنين ${boysSite0?.skipped.length}، بنات ${girlsSite0?.skipped.length})`);
    check(boysSite0.creates.length === 71 && girlsSite0.creates.length === 67, `H4 المعاينة: ناقصٌ كله يُنشأ في أقسامه (بنين ${boysSite0?.creates.length}، بنات ${girlsSite0?.creates.length})`);
    const rowsNow = async () => (await call("GET", "/api/courses")).body as any[];
    check((await rowsNow()).every(course => course.AdCollegeId !== girlsCollege.AdCollegeId), "H5 المعاينة لا تكتب شيئاً");

    const applied = await call("POST", "/api/plan-review/reference/apply", { referenceId: "old", sectionIds, dryRun: false });
    check(applied.status === 200 && applied.body?.sites?.every((row: any) => row.applied), "H6 التطبيق نجح في الموقعين", applied.body && { s: applied.status, e: applied.body.error, p: applied.body.sites?.map((x: any) => x.planNote) });
    let courses = await rowsNow();
    const mine = (college: any, code: string) => courses.find(course => course.AdCollegeId === college.AdCollegeId && (course.CourseCode === code || course.CourseCode === String(Number(code.slice(-3)))) && course.AdSectionId === sectionOf.get(`${college.AdCollegeId}:${code.slice(2, 4)}`));
    check(mine(girlsCollege, "0111148")?.CourseName === "أشغال إبرة (للبنات فقط)" && !mine(boysCollege, "0111148"), "H7 «للبنات فقط» في كتالوج البنات وحده");
    check(!!mine(boysCollege, "0106148") && !mine(girlsCollege, "0106148"), "H8 نشاط زراعي (بنين) في كتالوج البنين وحده");
    const t = mine(girlsCollege, "0109114");
    check(t?.CourseName === "تكنولوجيا الأجهزة التعليمية" && t.CourseCredit === 2 && t.CourseHours === 3, "H9 المقرر أُنشئ بالاسم والوحدات والساعات المطبوعة", t);
    const foreign = mine(girlsCollege, "0102102");
    check(foreign?.AdSectionId === sectionOf.get(`${girlsCollege.AdCollegeId}:02`), "H10 مقرر قسمٍ آخر أُنشئ في كتالوج قسمه لا في قسم التقنية");

    /* خطأٌ لاحقٌ في الوحدات (يصحّحه قسمٌ بالمحرر المسموح): تُعيدها إعادة التطبيق إلى الصحيفة. */
    const girlsTech = techOf.get(girlsCollege.AdCollegeId)!;
    const legacyPlan = ((await call("GET", `/api/curriculum/sections/${girlsTech}`)).body?.plans || []).find((plan: any) => plan.status === "transition");
    const tweak = await call("PUT", "/api/plan-review/course-details", { planId: legacyPlan?.id, sectionId: girlsTech, courseId: mine(girlsCollege, "0109114").AdCourseId, credit: 1, hours: 1, capacity: 25 });
    check(tweak.status === 200, "H11 تعديل الوحدات بالمحرر المسموح", tweak);
    const fixPreview = await call("POST", "/api/plan-review/reference/apply", { referenceId: "old", sectionIds: [girlsTech], dryRun: true });
    const planned = fixPreview.body?.sites?.[0]?.updates || [];
    check(planned.length === 1 && planned[0].code === "0109114" && planned[0].after.credit === 2 && planned[0].identityChange === false, "H12 المعاينة تُظهر تصحيح الوحدات وحده", planned);
    await call("POST", "/api/plan-review/reference/apply", { referenceId: "old", sectionIds: [girlsTech], dryRun: false });
    courses = await rowsNow();
    check(mine(girlsCollege, "0109114")?.CourseCredit === 2 && mine(girlsCollege, "0109114")?.CourseHours === 3 && mine(girlsCollege, "0109114")?.MaxStudent === 25, "H12b الوحدات والساعات عادت إلى الصحيفة والسعة محفوظة");

    const plans = (await call("GET", `/api/curriculum/sections/${girlsTech}`)).body;
    const legacy = plans?.plans?.find((plan: any) => plan.status === "transition");
    check(!!legacy && plans.plans.some((plan: any) => plan.status === "active"), "H13 لكل موقع صحيفتان: السابقة (انتقال) والجديدة", plans?.plans?.map((p: any) => p.status));
    const review = await call("GET", `/api/plan-review/plan?planId=${legacy?.id}&sectionId=${girlsTech}`);
    check(review.status === 200 && review.body.rules.length >= 25 && review.body.state.status === "review", "H14 مسوّدة قواعد قيد المراجعة (لا اعتماد تلقائي)", review.body && { s: review.status, n: review.body.rules?.length, st: review.body.state?.status });
    check(review.body?.blockers === 0, "H15 لا موانع تمنع اعتماد المسوّدة", review.body?.issues?.filter((x: any) => x.severity === "block").slice(0, 3));
    const activePlan = plans?.plans?.find((plan: any) => plan.status === "active");
    const activeMembers = (plans?.memberships || []).filter((row: any) => row.planId === activePlan?.id).length;
    check(activeMembers === 0, "H15b الصحيفة الجديدة الفعالة لا تتلقى مقررات «القديمة» تلقائياً عند الإنشاء", activeMembers);
    const artsSection = sectionOf.get(`${girlsCollege.AdCollegeId}:02`)!;
    const artsOverview = (await call("GET", `/api/curriculum/sections/${artsSection}`)).body;
    check(!(artsOverview?.memberships || []).filter((row: any) => !String(row.planId).startsWith("virtual:")).length, "H15c مقرر قسمٍ آخر أُضيف للكتالوج ولم يُربط بأي صحيفة", artsOverview?.memberships?.length);
    check(!review.body?.courses?.some((c: any) => c.ownerSectionId !== girlsTech), "H16 مقررات الصحيفة من قسمها وحده");

    const again = await call("POST", "/api/plan-review/reference/apply", { referenceId: "old", sectionIds, dryRun: false });
    check(again.status === 200 && again.body.sites.every((row: any) => row.updates.length === 0 && row.creates.length === 0 && row.links.length === 0), "H17 إعادة التطبيق لا تغيّر شيئاً", again.body?.sites?.map((x: any) => [x.updates.length, x.creates.length, x.links.length]));
    const brand = await call("POST", "/api/plan-review/reference/apply", { referenceId: "new", sectionIds, dryRun: false });
    check(brand.status === 200 && brand.body.sites.every((row: any) => row.applied && row.skipped.length === 0), "H18 الصحيفة الجديدة للجميع: لا استبعاد في أي موقع", brand.body?.sites?.map((x: any) => x.skipped.length));

    const denied = await fetch(BASE + "/api/plan-review/reference/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referenceId: "old" }) });
    check(denied.status === 401 || denied.status === 403, "H19 بلا دخول مرفوض");
  }
} finally {
  if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* ended */ } }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
