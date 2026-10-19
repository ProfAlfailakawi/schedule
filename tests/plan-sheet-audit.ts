/**
 * ── الصحيفة العامة: مولّدُ الصفحة، والنشرُ، والصفحاتُ بلا حساب ───────────────
 *
 *   S1  المولّد: أعمدةُ مستوياتٍ، بلا شعار، وQR بالدومين الرسمي، وملاحظاتُ المتطلبات الخارجية، والتخطيط بالعرض.
 *   S2  النشر: لا يُنشر إلا ما اعتُمد وللآدمن وحده، ورئيس اللجنة يقرأ قسمه دون نشر.
 *   S3  الصفحات العامة: فهرسٌ، وقسمٌ، وصحيفةٌ، وما أُوقف نشره يختفي، والمجلداتُ الثابتة تمرّ.
 *   S4  الواجهة: بطاقةٌ في مركز الذكاء، وكلُّ زرٍّ موثَّقٌ للمرشد.
 */
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import type { AddressInfo } from "net";
import { buildPlanSheet } from "../src/server/planSheetPage";
import type { SheetModel } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const template = read("public/plans/_template/sheet.html");

/* ── S1: المولّد ──────────────────────────────────────────────────────────── */
const OFFICIAL = "https://schedule-kw.com/plans/s9/p1/";
const model: SheetModel = {
  title: "قسم تجريبي", planLabel: "2026/2027", url: OFFICIAL,
  courses: [
    { code: "0109105", name: "أسس التعلم", credit: 3, level: 100 }, { code: "0109121", name: "نظريات التعلم", credit: 3, level: 100 },
    { code: "0109220", name: "تكنولوجيا الصوت", credit: 3, level: 200 }, { code: "0109343", name: "تصميم الوسائط", credit: 3, level: 300 },
    { code: "0109455", name: "التدريب الميداني (1) في المدارس الحكومية", credit: 4, level: 400 },
  ],
  groups: [{ title: "اختياري تخصصي", pick: 2, courses: [{ code: "0109226", name: "التفكير الحاسوبي", credit: 3 }, { code: "0109401", name: "الذكاء الاصطناعي", credit: 3 }] }],
  edges: [["0109105", "0109121"], ["0109105", "0109220"], ["0109220", "0109343"], ["0109105", "0109343"], ["0109343", "0109455"], ["0109105", "0109226"]],
  notes: ["المقرر 343 يتطلب أيضاً المقرر 150 «مقدمة في التربية الخاصة» من قسم آخر."],
};
{
  const html = buildPlanSheet(model, { template });
  check(!/<image\b|logo/i.test(html), "S1 بلا شعارٍ في الصفحة (لا <image> ولا logo)");
  const referenceHtml = read("public/plans/educational-technology/index.html");
  const sharedTemplate = read("public/plans/_template/sheet.html");
  const animatedEdge = '.edge.on path[marker-end]{stroke-width:3.4;stroke-dasharray:9 6;animation:flow .9s linear infinite}';
  check(referenceHtml.includes(animatedEdge) && sharedTemplate.includes(animatedEdge)
    && html.includes(animatedEdge) && html.includes('@keyframes flow{to{stroke-dashoffset:-15}}')
    && html.includes("g.classList.toggle('on',on)") && html.includes('prefers-reduced-motion:reduce'),
    "S1 الأسهم الملونة المتحركة عند اختيار المقرر تطابق مرجع تكنولوجيا التعليم وتحترم تقليل الحركة");
  check(html.includes('html.student #plan .edge.on{opacity:1}')
    && html.includes('marker-end="url(#m') && html.includes('data-s="101"') === false,
    "S1 الصحائف المولّدة تُظهر الأسهم المختارة بوضوح حتى في وضع الطالب، مع حفظ اتجاه المسبقات");
  check((html.match(/<a href="([^"]+)" aria-label="رمز QR/) || [])[1] === "https://schedule-kw.com/plans/s9/p1/" && !html.includes("dr-alfailakawi"), "S1 رمزُ QR يحمل الدومين الرسمي وحده");
  check(["المستوى 100", "المستوى 200", "المستوى 300", "المستوى 400"].every(label => html.includes(label)) && !html.includes("السنة الأولى") && !html.includes("فصل 1"), "S1 الأعمدةُ مستوياتٌ لا سنواتٌ ولا فصول");
  check((html.match(/class="card"/g) || []).length === 7, "S1 بطاقةٌ لكل مقررٍ (٥ في الخريطة + ٢ اختياري)");
  check((html.match(/class="edge"/g) || []).length === 6, "S1 سهمٌ لكل مسبق (٥ في الخريطة وواحدٌ للاختياري)");
  check(html.includes("اختياري تخصصي - اختر مقررين") && html.includes("ملاحظات") && html.includes("من قسم آخر"), "S1 شريطُ الاختياري بعنوانه، وملاحظةُ المتطلب الخارجي لا بطاقةً ولا سهماً");
  check(!html.includes('data-c="150"') && !html.includes('data-s="150"'), "S1 المقررُ الخارجي لا بطاقةَ له ولا سهم");
  check(html.includes("{{") === false && html.includes("const D=") && html.includes('"LV"'), "S1 القالبُ مملوءٌ بلا علاماتٍ متروكة، وبيانات التفاعل مضمّنة");
  check(html.includes('id="stbtn"') && html.includes("planPassed:") && html.includes("المتاح لك الآن") && html.includes("@media print") && /#stbtn,#stbar/.test(html), "S1 وضعُ الطالب: يعلّم ما اجتازه على جهازه ويضيء المتاح، ولا يُطبع");
  check(html.includes("تحميل PDF") && html.includes("window.print()") && html.includes("@page{size:420mm 297mm"), "S1 زرُّ PDF (طباعة A3) موجود");
  const arabicLabel = buildPlanSheet({ ...model, planLabel: "الصحيفة السابقة" }, { template });
  const labelTag = arabicLabel.match(/<text[^>]*>الصحيفة السابقة<\/text>/)?.[0] || "";
  check(labelTag.includes('direction="rtl"') && labelTag.includes('text-anchor="start"') && !labelTag.includes("letter-spacing"), "S1 عنوانُ الصحيفة العربي: اتجاهٌ يمينيّ ومرساةٌ عند الحافة اليمنى (لا يُقطع) وبلا تباعد حروف", labelTag);
  check(/direction="ltr"[^>]*letter-spacing="1"[^>]*>|letter-spacing="1"[^>]*>2026\/2027/.test(html.match(/<text[^>]*>2026\/2027<\/text>/)?.[0] || ""), "S1 الرقمي (2026/2027) يبقى يساريّاً بتباعده");
  check(buildPlanSheet({ ...model, title: "قسم <x>&" }, { template }).includes("قسم &lt;x&gt;&amp;") && !buildPlanSheet({ ...model, title: "</script><b>" }, { template }).includes("</script><b>"), "S1 النصوصُ تُهرَّب في الصفحة والبيانات");
  const wide = buildPlanSheet({ ...model, edges: [], groups: [], notes: [], layout: "wide", courses: model.courses.map(c => ({ ...c, category: c.level < 300 ? "ثقافة عامة" : "مهنية" })) }, { template });
  check(wide.includes("ثقافة عامة") && wide.includes("مهنية") && !wide.includes("السهم يبدأ من المتطلب"), "S1 القسمُ المساند بلا أسهم: أشرطةٌ بالعرض بحسب التصنيف، بلا مفتاح الأسهم");
  const many = buildPlanSheet({ ...model, courses: Array.from({ length: 30 }, (_, i) => ({ code: `01090${String(i + 100).padStart(2, "0")}`, name: `مقرر ${i}`, credit: 3, level: 100 + (i % 5) * 0 })), groups: [], edges: [], notes: [], layout: "levels" }, { template });
  check(many.includes('viewBox="0 0 1754'), "S1 ثلاثون مقرراً في مستوىً واحدٍ لا تكسر الرسم");
  const alt = buildPlanSheet({ ...model, anyOf: [["0109343", ["0109220", "0109105"]]], minUnits: { "0109455": 60 }, otherUnits: 9, groups: [{ ...model.groups[0], minUnits: 9 }] }, { template });
  check((alt.match(/stroke-dasharray="6 4" stroke-linecap/g) || []).length === 2 && alt.includes('"OR":[["343",["220","105"]]]') && alt.includes('"U":{"455":60}'), "S1 «أحدها يكفي» أسهمٌ متقطعة ومجموعةٌ في البيانات، والحدُّ بالوحدات محفوظ");
  check(alt.includes("(9 وحدات على الأقل)") && />34<\/text><text[^>]*>وحدة</.test(alt), "S1 حدُّ وحدات المجموعة الاختيارية يُكتب، ووحداتُ المقررات غير المرسومة في المجموع (16 + 9 للاختياري بحدّه + 9 = 34)");
}

/* ── S2/S3: النشر والصفحات على مستودعٍ حقيقي ──────────────────────────────── */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-plan-sheet-"));
  const mk = (id: number, section: number, code: string, name: string) => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: section, CourseCode: code, CourseName: name, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 });
  const courses = [mk(301, 21, "0121101", "مدخل"), mk(302, 22, "0121101", "مدخل"), mk(303, 23, "0121101", "مدخل"), mk(304, 24, "0121101", "مدخل"), mk(305, 25, "0121101", "مدخل التمريض"), mk(101, 11, "0111101", "أصول"), mk(102, 11, "0111201", "فقه"), mk(103, 11, "0111301", "تفسير"), mk(900, 12, "0112150", "مقرر قسم آخر"), mk(201, 12, "0112101", "نحو")];
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
    users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [],
    colleges: [{ AdCollegeId: 1, AdCollegeCode: "EDU", AdCollegeName: "كلية" }, { AdCollegeId: 2, AdCollegeCode: "G", AdCollegeName: "كلية التربية الأساسية - بنات" }, { AdCollegeId: 3, AdCollegeCode: "J", AdCollegeName: "كلية التربية الأساسية - بنات - الجهراء" }, { AdCollegeId: 4, AdCollegeCode: "F", AdCollegeName: "كلية التربية الأساسية - بنات - الفحيحيل" }, { AdCollegeId: 5, AdCollegeCode: "B", AdCollegeName: "كلية التربية الأساسية - بنين" }, { AdCollegeId: 6, AdCollegeCode: "N", AdCollegeName: "كلية التمريض - بنات" }],
    sections: [{ AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "11", AdSectionName: "قسم الشريعة" }, { AdSectionId: 12, AdCollegeId: 1, AdSectionCode: "12", AdSectionName: "قسم اللغة" }, ...[[21, 2], [22, 3], [23, 4], [24, 5], [25, 6]].map(([id, college]) => ({ AdSectionId: id, AdCollegeId: college, AdSectionCode: "21", AdSectionName: "قسم المناهج" }))],
    instructors: [], courses, schedules: [], rooms: [], courseTransitions: [],
    curriculumPlans: [
      { id: "p11", AdCollegeId: 1, AdSectionId: 11, name: "خطة 2026/2027", status: "active", createdAt: "2026-01-01" },
      { id: "p12", AdCollegeId: 1, AdSectionId: 12, name: "خطة اللغة", status: "active", createdAt: "2026-01-01" },
      { id: "p12b", AdCollegeId: 1, AdSectionId: 12, name: "خطة اللغة (قديمة)", status: "transition", createdAt: "2026-01-01" },
      { id: "p21", AdCollegeId: 2, AdSectionId: 21, name: "صحيفة 2026", status: "active", createdAt: "2026-01-01" },
      { id: "p22", AdCollegeId: 3, AdSectionId: 22, name: "BA-0115 2026/2027", status: "active", createdAt: "2026-01-01" },
      { id: "p24", AdCollegeId: 5, AdSectionId: 24, name: "صحيفة 2026", status: "active", createdAt: "2026-01-01" },
      { id: "p25", AdCollegeId: 6, AdSectionId: 25, name: "صحيفة 2026", status: "active", createdAt: "2026-01-01" },
    ],
    curriculumPlanCourses: [
      ...[101, 102, 103, 900].map(id => ({ id: `a${id}`, planId: "p11", AdCollegeId: 1, AdSectionId: 11, AdCourseId: id, createdAt: "2026-01-01" })),
      { id: "b201", planId: "p12", AdCollegeId: 1, AdSectionId: 12, AdCourseId: 201, createdAt: "2026-01-01" },
      { id: "c201", planId: "p12b", AdCollegeId: 1, AdSectionId: 12, AdCourseId: 201, createdAt: "2026-01-01" },
      ...[["p21", 21, 2, 301], ["p22", 22, 3, 302], ["p24", 24, 5, 304], ["p25", 25, 6, 305]].map(([planId, sectionId, collegeId, courseId]) => ({ id: `m${courseId}`, planId, AdCollegeId: collegeId, AdSectionId: sectionId, AdCourseId: courseId, createdAt: "2026-01-01" })),
    ],
  }), { mode: 0o600 });
  process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
  const quiet = console.warn; console.warn = () => {};
  const { Repository, initDatabase } = await import("../src/db/repository");
  const { registerPlanSheetRoutes } = await import("../src/server/planSheetRoutes");
  await initDatabase();
  console.warn = quiet;

  const USERS: Record<string, any> = {
    chair11: { user: { Role: "committeeChair", Name: "رئيس لجنة الشريعة" }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }] },
    head11: { user: { Role: "departmentHead", Name: "رئيس قسم الشريعة" }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }] },
    chair12: { user: { Role: "committeeChair", Name: "رئيس لجنة اللغة" }, scopes: [{ AdCollegeId: 1, AdSectionId: 12 }] },
    admin: { user: { SystemUserId: 1, Role: "committeeChair", Name: "المدير", IsAdminUser: true }, scopes: [] },
  };
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { const who = USERS[String(req.headers["x-who"] || "")]; if (who) { req.user = who.user; req.scopes = who.scopes; } next(); });
  registerPlanSheetRoutes(app, {
    requireAuth: (req: any, res, next) => (req.user ? next() : res.status(401).json({ error: "سجّل الدخول" })),
    isScopeAllowed: (req, collegeId, sectionId) => Boolean(req.user?.IsAdminUser) || (req.scopes || []).some((s: any) => s.AdCollegeId === collegeId && (s.AdSectionId === sectionId || s.AdSectionId === 0)),
    isPowerUser: req => Boolean(req.user?.IsAdminUser),
    actorName: req => String(req.user?.Name || ""),
    template,
  });
  app.use((_req, res) => res.status(404).send("static-fallthrough"));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (who: string, method: string, url: string, body?: unknown) => {
    const res = await fetch(base + url, { method, redirect: "manual", headers: { "content-type": "application/json", "x-who": who }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any = {}; try { json = JSON.parse(text); } catch { /* صفحة */ }
    return { status: res.status, json, text, location: res.headers.get("location") || "" };
  };
  const approve = async (planId: string, sectionId: number, rules: any[], groups: any[] = []) => {
    const draft = await Repository.updateRuleDraft(planId, () => ({
      id: planId, planId, AdCollegeId: 1, AdSectionId: sectionId, rules, groups, version: 0, status: "review", updatedAt: new Date().toISOString(), updatedBy: "t",
    } as any));
    await Repository.approveRuleDraft(planId, draft!.updatedAt, "اختبار");
  };
  try {
    check((await call("", "GET", "/api/plan-sheets")).status === 401, "S2 بلا دخول: ٤٠١");
    check((await call("chair11", "GET", "/api/plan-sheets")).json.sections.length === 0, "S2 لا صحيفةَ معتمدة: لا شيء يُنشر");
    check((await call("chair11", "POST", "/api/plan-sheets/publish", { planId: "p11", sectionId: 11 })).status === 403, "S2 النشر ممنوع على رئيس اللجنة حتى في قسمه");
    check((await call("admin", "POST", "/api/plan-sheets/publish", { planId: "p11", sectionId: 11 })).status === 409, "S2 لا تُنشر صحيفةٌ غير معتمدة حتى من الآدمن");

    await approve("p11", 11, [
      { courseId: 101, level: 100 }, { courseId: 102, level: 200, prereq: { all: [101, 900], anyOf: [] } }, { courseId: 103, level: 300, prereq: { all: [], anyOf: [[102, 900]], minUnits: 30 } },
    ]);
    const listed = (await call("chair11", "GET", "/api/plan-sheets")).json;
    check(listed.sections.length === 1 && listed.sections[0].sectionId === 11 && listed.sections[0].sheets[0].published === false, "S2 رئيس اللجنة يرى صحيفته المعتمدة وحدها، وغير منشورة");
    check((await call("head11", "POST", "/api/plan-sheets/publish", { planId: "p11", sectionId: 11 })).status === 403, "S2 رئيس القسم لا ينشر");
    check((await call("chair12", "POST", "/api/plan-sheets/publish", { planId: "p11", sectionId: 11 })).status === 403, "S2 رئيس لجنةٍ في قسمٍ آخر لا ينشر");
    check((await call("head11", "GET", "/api/plan-sheets")).json.sections.length === 0, "S2 رئيس القسم لا يرى شاشة النشر");
    const done = await call("admin", "POST", "/api/plan-sheets/publish", { planId: "p11", sectionId: 11 });
    check(done.status === 200 && done.json.published[0].url === "https://schedule-kw.com/plans/s11/p11/", "S2 النشر يعطي الرابط الرسمي", done.json);

    const stored = await Repository.getPublishedSheet("p11");
    check(stored?.model.courses.length === 3 && stored.model.edges.length === 2 && stored.model.notes.length === 3 && stored.model.notes[0].includes("0112150".slice(-3)) && stored.model.notes[0].includes("مقرر قسم آخر") && stored.model.notes[0].includes("من قسم اللغة"),
      "S2 المقرر الخارجي ملاحظةٌ باسمه وقسمه، لا بطاقةٌ ولا سهم", stored?.model);
    check(!stored?.model.courses.some(c => c.code === "0112150"), "S2 اللقطة بمقررات القسم وحدها");
    check(JSON.stringify(stored?.model.anyOf) === '[["0111301",["0111201"]]]' && stored?.model.notes[1].includes("يتطلب أحد المقررات") && stored?.model.notes[1].includes("201") && stored?.model.notes[1].includes("150"), "S2 «أحدها» ببديلٍ داخلي وآخر خارجي: يبقى «أحدها» لا سهماً إلزامياً", stored?.model);
    check(stored?.model.minUnits?.["0111301"] === 30 && stored?.model.notes[2].includes("30 وحدة") && stored?.model.otherUnits === 3, "S2 المسبقُ بالوحدات محفوظ، ووحداتُ المقرر الخارجي في مجموع التخرج", stored?.model);

    const page = await call("", "GET", "/plans/s11/p11/");
    check(page.status === 200 && page.text.includes("قسم الشريعة") && page.text.includes("المستوى 300") && !/<image\b/.test(page.text), "S3 الصحيفةُ تُفتح بلا حسابٍ، بمستوياتها وبلا شعار");
    check(page.text.includes('href="https://schedule-kw.com/plans/s11/p11/"'), "S3 رمزُ الصفحة يحمل رابطها الرسمي");
    const dept = await call("", "GET", "/plans/s11/");
    check(dept.status === 302 && dept.location === "/plans/s11/p11/", "S3 قسمٌ بصحيفةٍ واحدة: رابطُه يفتحها مباشرة");
    const index = await call("", "GET", "/plans/");
    check(index.status === 200 && index.text.includes('href="/plans/s11/"') && index.text.includes("قسم الشريعة") && index.text.includes("/plans/educational-technology/"), "S3 الفهرس يضم القسم المنشور، وصفحةُ تكنولوجيا التعليم الأولى باقية");
    check((await call("", "GET", "/plans/educational-technology/")).text === "static-fallthrough" && (await call("", "GET", "/plans/fonts/x.woff2")).text === "static-fallthrough", "S3 المجلداتُ الثابتة تمرّ إلى الملفات ولا تُحجب");
    check((await call("", "GET", "/plans/s11/zzz/")).status === 404 && (await call("", "GET", "/plans/s99/")).status === 404 && (await call("", "GET", "/plans/s12/p11/")).status === 404, "S3 صحيفةٌ غير منشورة أو قسمٌ غير مطابق: ٤٠٤");

    /* قسمٌ بأكثر من صحيفة: صفحةُ اختيارٍ، ونشرُ القسم كلِّه دفعة. */
    await approve("p12", 12, [{ courseId: 201, level: 100 }]);
    await approve("p12b", 12, [{ courseId: 201, level: 100 }]);
    const both = await call("admin", "POST", "/api/plan-sheets/publish", { sectionId: 12 });
    check(both.status === 200 && both.json.published.length === 2, "S2 نشرُ كل صحائف القسم دفعةً واحدة", both.json);
    const multi = await call("", "GET", "/plans/s12/");
    check(multi.status === 200 && multi.text.includes("خطة اللغة (قديمة)") && multi.text.includes('href="/plans/s12/p12/"') && multi.text.includes('href="/plans/s12/p12b/"'), "S3 قسمٌ بأكثر من صحيفة: صفحةُ اختيارٍ بصحائفه");
    check((await call("chair12", "POST", "/api/plan-sheets/publish", {})).status === 403 && (await call("chair11", "POST", "/api/plan-sheets/publish", {})).status === 403, "S2 نشر جميع الصحائف ممنوع لأي رئيس لجنة");
    check((await call("admin", "POST", "/api/plan-sheets/publish", {})).json.published.length === 3, "S2 إدارة النظام وحدها تنشر كل الصحائف المعتمدة");
    check((await call("chair12", "GET", "/plans/s12/p12/")).text.includes("قسم اللغة") && (await call("", "GET", "/plans/s12/p12/")).text.includes('"E":[]'), "S3 صحيفةٌ بلا مسبقاتٍ ترتسم (بالعرض) بلا أخطاء");

    /* اللقطةُ مستقلةٌ عن الخطة: مسحُ الخطة لا يُسقطها، وإعادةُ اعتماد القواعد تُعلَّم «تغيّرت بعد النشر». */
    await approve("p11", 11, [{ courseId: 101, level: 100 }, { courseId: 102, level: 200 }, { courseId: 103, level: 300 }]);
    const stale = (await call("chair11", "GET", "/api/plan-sheets")).json.sections[0].sheets[0];
    check(stale.published && stale.stale, "S2 اعتمادُ قواعد جديدة بعد النشر يُعلَّم «أعد النشر»", stale);
    check((await call("", "GET", "/plans/s11/p11/")).status === 200 && (await Repository.getPublishedSheet("p11"))?.model.edges.length === 2, "S2 الصفحةُ المنشورة لقطةٌ ثابتة حتى إعادة النشر");
    const { republishIfPublished } = await import("../src/server/planSheetRoutes");
    check(await republishIfPublished("p11", "اختبار") && (await Repository.getPublishedSheet("p11"))?.model.edges.length === 0 && !(await call("chair11", "GET", "/api/plan-sheets")).json.sections[0].sheets[0].stale, "S2 الاعتمادُ يعيد نشر الصحيفة المنشورة تلقائياً بقواعدها الجديدة");
    check(!(await republishIfPublished("p12-none", "اختبار")), "S2 ولا يُنشر بالاعتماد ما لم يكن منشوراً");

    check((await call("head11", "POST", "/api/plan-sheets/unpublish", { planId: "p11" })).status === 403 && (await call("chair12", "POST", "/api/plan-sheets/unpublish", { planId: "p11" })).status === 403, "S2 إيقافُ النشر لرئيس اللجنة وحده ضمن نطاقه");
    check((await call("chair11", "POST", "/api/plan-sheets/unpublish", { planId: "p11" })).status === 403, "S2 رئيس لجنة الجدول لا يوقف نشر الصحيفة");
    check((await call("admin", "POST", "/api/plan-sheets/unpublish", { planId: "p11" })).status === 200 && (await call("", "GET", "/plans/s11/p11/")).status === 404 && (await call("admin", "POST", "/api/plan-sheets/unpublish", { planId: "p11" })).status === 404, "S2/S3 الآدمن وحده يوقف النشر، والصفحة تختفي");
    check(!(await call("", "GET", "/plans/")).text.includes('href="/plans/s11/"'), "S3 القسم الموقوف يغيب من الفهرس");
    check((await call("admin", "GET", "/api/plan-sheets")).json.sections.length === 2, "S2 إدارةُ النظام ترى كل الأقسام");

    /* S5: بناتُ القسم صحيفةٌ واحدة تُنسخ إلى الجهراء والفحيحيل، وللبنين مسارُهم. */
    await approve("p21", 21, [{ courseId: 301, level: 100 }]);
    await approve("p24", 24, [{ courseId: 304, level: 100 }]);
    const tracks = (await call("admin", "GET", "/api/plan-sheets")).json.sections.filter((row: any) => row.sectionName === "قسم المناهج");
    check(tracks.length === 2 && tracks.map((row: any) => row.trackLabel).sort().join() === "بنات,بنين", "S5 للقسم مساران فقط: بنات وبنين (لا صفّ للجهراء ولا الفحيحيل)", tracks.map((row: any) => row.trackLabel));
    /* قسمٌ نفسُه في كلية التمريض: صحيفتُه مستقلة، لا نسخةً من صحيفة التربية الأساسية، ويتميّز بالكلية في الاسم. */
    await approve("p25", 25, [{ courseId: 305, level: 100 }]);
    const withNursing = (await call("admin", "GET", "/api/plan-sheets")).json.sections.filter((row: any) => row.sectionName === "قسم المناهج");
    const nursing = withNursing.find((row: any) => row.sectionId === 25), basicGirls = withNursing.find((row: any) => row.sectionId === 21);
    check(withNursing.length === 3 && nursing?.members.join() === "25" && basicGirls?.members.join() === "21,22,23", "S5 التمريض مسارٌ مستقل: لا يُدمج مع بنات التربية الأساسية ولا يُنسخ إليه", withNursing.map((row: any) => [row.sectionId, row.members]));
    check(/التمريض/.test(nursing.label) && /التربية الأساسية/.test(basicGirls.label) && nursing.label !== basicGirls.label, "S5 الاسمُ يميّز الكلية حين يوجد القسمُ في أكثر من عائلة", [nursing.label, basicGirls.label]);
    const girlsRow = tracks.find((row: any) => row.track === "girls");
    check(girlsRow.sectionId === 21 && girlsRow.members.join() === "21,22,23" && girlsRow.campuses === 2, "S5 مسارُ البنات أصلُه التربية الأساسية بنات ومعه الموقعان الفرعيان", girlsRow);
    const pub = (await call("admin", "POST", "/api/plan-sheets/publish", { planId: "p21", sectionId: 21 })).json;
    check(pub.copiedToCampuses === 1 && pub.unmatchedCampuses?.length === 1 && /الفحيحيل/.test(pub.unmatchedCampuses[0]), "S5 النشرُ ينسخ إلى الجهراء (بمطابقة السنة) ويُبلغ بما لم يُطابَق (الفحيحيل)", pub);
    const copy = await Repository.getPublishedSheet("p22");
    check(copy?.mirrorOf === "p21" && copy.AdSectionId === 22 && copy.model.url.includes("/plans/s22/p22/") && JSON.stringify({ ...copy.model, url: "" }) === JSON.stringify({ ...(await Repository.getPublishedSheet("p21"))!.model, url: "" }), "S5 النسخةُ مطابقةٌ للأصل بالضبط ولها رابطُ موقعها");
    check((await call("", "GET", "/plans/s22/p22/")).status === 200, "S5 صفحةُ الجهراء تُفتح برابطها");
    await call("admin", "POST", "/api/plan-sheets/publish", { planId: "p24", sectionId: 24 });
    const publicIndex = (await call("", "GET", "/plans/")).text;
    check(publicIndex.includes("قسم المناهج — بنات") && publicIndex.includes("قسم المناهج — بنين") && !publicIndex.includes('href="/plans/s22/"'), "S5 الفهرس العام: بطاقةٌ للبنات وأخرى للبنين، بلا تكرار للجهراء", publicIndex.match(/قسم المناهج[^<]*/g));
    await call("admin", "POST", "/api/plan-sheets/publish", { planId: "p25", sectionId: 25 });
    const familyIndex = (await call("", "GET", "/plans/")).text;
    check(familyIndex.includes("قسم المناهج — التمريض — بنات") && familyIndex.includes("قسم المناهج — التربية الأساسية — بنات") && familyIndex.includes("قسم المناهج — التربية الأساسية — بنين"), "S5 الفهرس العام: صحيفةُ التمريض بطاقةٌ مستقلة باسم كليتها", familyIndex.match(/قسم المناهج[^<]*/g));
    check((await call("admin", "POST", "/api/plan-sheets/unpublish", { planId: "p21" })).status === 200 && !(await Repository.getPublishedSheet("p22")), "S5 إيقاف الأصل يوقف نسخَه");
  } finally { server.close(); }
}

/* ── S4: الواجهة ─────────────────────────────────────────────────────────── */
{
  const work = read("src/components/IntelligenceWorkspace.tsx"), pub = read("src/components/PlanSheetPublisher.tsx"), server = read("server.ts");
  check(work.includes('"sheet"') && work.includes("canPublishSheets") && work.includes("<Workflow />") && work.includes("<PlanSheetPublisher"), "S4 بطاقة «الصحيفة» في مركز الذكاء بأيقونةٍ جديدة");
  check(/canPublishSheets = isPowerAdmin;/.test(work) && work.includes('canReadDepartmentSheet = roleDefinition((user as any)?.Role).id === "committeeChair"') && work.includes('canOpenSheetReading && activeInsightKey === "sheet"'), "S4 خريطة القسم لرئيس اللجنة والنشر للآدمن وحده");
  const buttons = pub.match(/<(?:PrimaryButton|SecondaryButton|button)\b(?:=>|[^>])*>/g) || [];
  const undocumented = buttons.filter(tag => !/data-guide-ignore|aria-label|className="psh-link"/.test(tag) || (/psh-link/.test(tag) && !/data-guide-ignore/.test(tag)));
  check(undocumented.length === 0, "S4 كلُّ زرٍّ في لوحة النشر موثَّقٌ للمرشد أو معنون", undocumented.slice(0, 3));
  check(!/canPublishSheets\s*&&\s*sheetSummary\?\.total/.test(work) && work.includes("تظهر بعد اعتماد الصحيفة"), "S4 البطاقةُ تظهر لمن ينشر دائماً، وتقول إنها تنتظر الاعتماد إن لم توجد صحيفةٌ معتمدة");
  check(work.includes("focusSectionId={Number(sectionId) || 0}") && pub.includes("psh-focus") && pub.includes("focus.deptUrl"), "S4 قسمُ نطاق القرار المختار يظهر رمزُ QR لصفحته في أعلى اللوحة");
  check(work.includes("readOnly={!isPowerAdmin}") && pub.includes("if (readOnly)") && pub.includes("focus?.sheets.filter(sheet => sheet.published)") && pub.includes("خريطة القسم"), "S4 رئيس لجنة الجدول يقرأ صحيفة قسمه المنشورة فقط ولا يرى أزرار النشر");
  check(pub.includes("printPoster") && pub.includes("اطبع ملصقاً") && pub.includes("@page{size:A4"), "S4 ملصقُ QR بحجم A4 للقسم أو الصحيفة");
  check(read("src/server/planReviewRoutes.ts").includes("republishIfPublished(ctx.plan.id"), "S4 مسارُ الاعتماد يستدعي إعادة النشر");
  check(server.includes("registerPlanSheetRoutes(app") && server.includes('"plans", "_template", "sheet.html"'), "S4 المسارات مسجّلةٌ في الخادم والقالبُ يُقرأ عند الإقلاع");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
