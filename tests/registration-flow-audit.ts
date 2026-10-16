/**
 * ── رادارُ التسجيل: المسار الكامل داخل العملية (المرحلة ٦) ─────────────────────
 *
 * مستودعٌ حقيقيّ بملفٍّ مؤقّت، ومسارا الباب والرادار على Express محلّي: طلبةٌ ينشئون
 * ملفّاتهم ويكتبون رغباتهم عبر الباب، وإدارةُ النظام تشغّل الرادار، ثم تُقرأ التذاكر.
 *
 *   F1 التشغيل: لإدارة النظام وحدها، ولا يتزاحم.
 *   F2 التذكرة: ثلاثُ خطط، ونافذة، والمسبقُ يمنع، والمعتمَدُ من القواعد وحده يُعتدّ به.
 *   F3 الظهور: لا موعدَ ولا شعبةَ قبل توقيع جدول القسم، وبعده تظهر.
 *   F4 النطاق: القسمُ يرى مقرراتِه في الملخّص، والإدارةُ ترى الكلّ، ولا أسماء في أيٍّ منهما.
 *   F5 الأمان: التذكرةُ لصاحبها وحده، وتتقادم إن عُدّل الملفّ بعد آخر تحديث للرادار.
 */
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import { createHmac, createHash } from "crypto";
import type { AddressInfo } from "net";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const W = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const usedCivil = new Set<string>();
const civil = (seed: number) => {
  for (let n = seed; ; n += 1) {
    const body = "3050612" + String(n).padStart(4, "0");
    const sum = body.split("").reduce((s, d, i) => s + Number(d) * W[i], 0);
    const c = 11 - (sum % 11);
    if (c <= 9 && !usedCivil.has(body)) { usedCivil.add(body); return body.slice(0, 11) + c; }
  }
};
const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-reg-flow-"));
const courses: any[] = [], links: any[] = [], schedules: any[] = [];
let id = 100, row = 1;
const defs: Array<[string, number, string[]]> = [["ISL", 11, ["أصول", "فقه", "قرآن", "سيرة", "عقيدة", "حديث"]], ["ARB", 12, ["نحو", "صرف", "بلاغة"]]];
for (const [code, sid, list] of defs) list.forEach((name, i) => {
  id += 1;
  courses.push({ AdCourseId: id, AdCollegeId: 1, AdSectionId: sid, CourseCode: `${code}${100 + i}`, CourseName: name, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 });
  links.push({ id: `l${id}`, planId: `p${sid}`, AdCollegeId: 1, AdSectionId: sid, AdCourseId: id, createdAt: "2026-01-01" });
  for (const s of ["01", "02"]) schedules.push({
    id: row++, AdCollegeId: 1, AdSectionId: sid, AdTermId: 1, AdCourseId: id, AdCourseName: name, SCode: s, AdInstructorId: 1,
    fsunday: i % 2 === 0, fmonday: false, ftuesday: i % 2 === 0, fwednesday: i % 2 === 1, fthursday: i % 2 === 1,
    fstarttime: s === "01" ? `${8 + (i % 3) * 2}:00` : `${14 + (i % 3) * 2}:00`, fendtime: s === "01" ? `${9 + (i % 3) * 2}:30` : `${15 + (i % 3) * 2}:30`, AdRoomCode: "", AdRoomHall: "",
  });
});
const MARK = `الفصل الأول 2026/2027 · ${Math.random().toString(16).slice(2, 8)}`;
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
  users: [], formNames: [], formSecurity: [], collegeUserAssign: [],
  terms: [{ AdTermId: 1, AdTermName: MARK, AdTermStart: "2026-09-13", AdTermWeeks: 14, AdTermClosed: false,
    AdTermStudentPhases: { wishesOpen: add(today, -3), wishesClose: add(today, 10), rounds: [{ id: "r1", name: "مبكر", start: add(today, 16), end: add(today, 22) }, { id: "r2", name: "عادي", start: add(today, 30), end: add(today, 36) }], requestsClose: add(today, 60) } }],
  colleges: [{ AdCollegeId: 1, AdCollegeCode: "EDU", AdCollegeName: "كلية" }],
  sections: [{ AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "ISL", AdSectionName: "قسم التربية الإسلامية" }, { AdSectionId: 12, AdCollegeId: 1, AdSectionCode: "ARB", AdSectionName: "قسم اللغة العربية" }],
  instructors: [{ AdInstructorId: 1, AdInstructorName: "د", AdInstructorCivil: "", AdInstructorMobile: "" }],
  courses, curriculumPlans: [
    { id: "p11", AdCollegeId: 1, AdSectionId: 11, name: "الجديدة", status: "active", createdAt: "2026-02-01" },
    { id: "p12", AdCollegeId: 1, AdSectionId: 12, name: "الجديدة", status: "active", createdAt: "2026-02-01" }],
  curriculumPlanCourses: links, courseTransitions: [], schedules, rooms: [], studentNeeds: [], studentProfiles: [],
}), { mode: 0o600 });
process.env.STUDENT_DOOR_WRITES_PER_MINUTE = "100000"; process.env.STUDENT_DOOR_IDENTITY_MAX = "100000";
process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
const { registerStudentDoorRoutes } = await import("../src/server/studentDoorRoutes");
const { registerSimulationRoutes } = await import("../src/server/simulationRoutes");
const { resetTicketContext } = await import("../src/server/simulationData");
await initDatabase();
console.warn = quiet;

/* قواعدُ معتمدة للصحيفة ١١: ١٠٢ يتطلّب ١٠١، و١٠٣ يتطلّب ١٠٢؛ و١٠٥/١٠٦ مجموعةٌ يُختار منها واحد. */
await Repository.updateRuleDraft("p11", () => ({
  id: "p11", planId: "p11", AdCollegeId: 1, AdSectionId: 11, version: 0, status: "review", basedOnVersion: 0, updatedAt: new Date().toISOString(),
  rules: [{ courseId: 101, level: 1, kind: "compulsory" }, { courseId: 102, level: 2, kind: "compulsory", prereq: { all: [101], anyOf: [] } },
    { courseId: 103, level: 3, kind: "compulsory", prereq: { all: [102], anyOf: [] } }, { courseId: 104, level: 1, kind: "compulsory" },
    { courseId: 105, kind: "elective", groupId: "g" }, { courseId: 106, kind: "elective", groupId: "g" }],
  groups: [{ id: "g", name: "اختياري", minCourses: 1, minUnits: 3, courseIds: [105, 106] }],
}));
const draft = (await Repository.getRuleDraft("p11"))!;
await Repository.approveRuleDraft("p11", draft.updatedAt, "اختبار");

const USERS: Record<string, any> = {
  admin: { user: { Role: "committeeChair", Name: "المدير", IsAdminUser: true }, scopes: [] },
  chair11: { user: { Role: "committeeChair", Name: "رئيس لجنة" }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }] },
  chair12: { user: { Role: "committeeChair", Name: "رئيس لجنة ٢" }, scopes: [{ AdCollegeId: 1, AdSectionId: 12 }] },
};
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => { const who = USERS[String(req.headers["x-who"] || "")]; if (who) { req.user = who.user; req.scopes = who.scopes; } next(); });
const identityKey = createHmac("sha256", "test-secret").update("identity").digest();
registerStudentDoorRoutes(app, {
  surveyFingerprint: async civilId => createHash("sha256").update("fp|" + civilId).digest("hex").slice(0, 32),
  sealIdentity: async value => "sealed:" + Buffer.from(value).toString("base64url"),
  openIdentity: async cipher => Buffer.from(cipher.replace("sealed:", ""), "base64url").toString(),
  identityKey: async () => identityKey,
  isProduction: () => false,
});
registerSimulationRoutes(app, {
  requireAuth: (req: any, res, next) => (req.user ? next() : res.status(401).json({ error: "سجّل الدخول" })),
  isScopeAllowed: (req, collegeId, sectionId) => Boolean(req.user?.IsAdminUser) || (req.scopes || []).some((s: any) => s.AdCollegeId === collegeId && s.AdSectionId === sectionId),
  isPowerUser: req => Boolean(req.user?.IsAdminUser),
  actorName: req => String(req.user?.Name || ""),
});
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function http(method: string, url: string, opts: { body?: unknown; cookie?: string; who?: string } = {}) {
  const res = await fetch(base + url, { method, headers: { "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}), ...(opts.who ? { "x-who": opts.who } : {}) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await res.text(); let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  const set = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() as string[] : [];
  return { status: res.status, json, cookie: (set[0] || "").split(";")[0] };
}
async function student(seed: number, passedCodes: number[], wishes?: { targetUnits: number; courseIds?: number[]; constraints?: any }, sectionId = 11, planId = "p11") {
  const ID = civil(seed);
  const made = await http("POST", "/api/public/me/enter", { body: { civil: ID, code: "135790", create: true, agree: true, name: "طالب تجريبي اختباري" } });
  const cookie = made.cookie;
  await http("PUT", "/api/public/me/profile", { cookie, body: { sectionId, curriculumPlanId: planId, passedCourseIds: passedCodes } });
  if (wishes) await http("PUT", "/api/public/me/wishes", { cookie, body: { targetUnits: wishes.targetUnits, courseIds: wishes.courseIds || [], constraints: wishes.constraints || {} } });
  return { cookie, ID };
}

try {
  /* ٤٠ طالباً في الإسلامية بإنجازاتٍ مختلفة، و٥ في العربية. */
  const rookies: Array<{ cookie: string; ID: string }> = [];
  for (let i = 0; i < 20; i++) rookies.push(await student(10 + i, [], { targetUnits: 15 }));
  const mid = await student(40, [101], { targetUnits: 12, constraints: { noMorning: true } });
  const nearGrad = await student(41, [101, 102, 104, 105], { targetUnits: 12 });
  const noWishes = await student(42, []);
  const arb = await student(43, [], { targetUnits: 12 }, 12, "p12");

  check((await http("GET", "/api/public/me/ticket", { cookie: rookies[0].cookie })).json.reason === "no-run", "F0 قبل الرادار: «لم تُجرَ بعد»");
  check((await http("GET", "/api/public/me/ticket")).status === 401, "F0 بلا جلسة: ٤٠١");

  const offered = (await http("GET", "/api/public/me/offered", { cookie: rookies[0].cookie })).json;
  const o102 = offered.courses.find((c: any) => c.id === 102), o101 = offered.courses.find((c: any) => c.id === 101);
  check(offered.ready === true && o102.needs.join() === "أصول" && o101.needs.length === 0, "F0 «المطروح لي» يقول ما يلزم أولاً من قواعد الصحيفة المعتمدة", [o101?.needs, o102?.needs]);
  const offeredMid = (await http("GET", "/api/public/me/offered", { cookie: mid.cookie })).json;
  check(offeredMid.courses.every((c: any) => c.id !== 101) && offeredMid.courses.find((c: any) => c.id === 102).needs.length === 0, "F0 ومن اجتاز المسبق لا يُقال له شيء");

  /* F1 */
  check((await http("POST", "/api/simulation/run")).status === 401, "F1 بلا دخول: ٤٠١");
  check((await http("POST", "/api/simulation/run", { who: "chair11" })).status === 403, "F1 رئيسُ لجنةٍ لا يشغّل (يحسب لكل الطلبة)");
  const first = await http("POST", "/api/simulation/run", { who: "admin" });
  const again = await http("POST", "/api/simulation/run", { who: "admin" });
  check(first.status === 200 && again.status === 200 && first.json.students === 23, "F1 التشغيلُ يحتسب أصحاب رغبات الفصل وحدهم (٢٣)", [first.json, again.json]);
  const routeSrc = fs.readFileSync(path.join(process.cwd(), "src/server/simulationRoutes.ts"), "utf8");
  const lease1 = await Repository.acquireRegistrationRunLease(1, "a"), lease2 = await Repository.acquireRegistrationRunLease(1, "b");
  await Repository.releaseRegistrationRunLease(1, "b");
  const lease3 = await Repository.acquireRegistrationRunLease(1, "c");
  await Repository.releaseRegistrationRunLease(1, "a");
  const lease4 = await Repository.acquireRegistrationRunLease(1, "d");
  await Repository.releaseRegistrationRunLease(1, "d");
  check(lease1 === true && lease2 === false && lease3 === false && lease4 === true, "F1 قفلٌ في قاعدة البيانات: واحدٌ يأخذه، ومن ليس صاحبَه لا يفكّه", [lease1, lease2, lease3, lease4]);
  check(routeSrc.indexOf("running = true;") > 0 && routeSrc.indexOf("running = true;") < routeSrc.indexOf("await Repository.getTerms()", routeSrc.indexOf('app.post("/api/simulation/run"')), "F1 علَمُ «يعمل» يُرفع قبل أيّ انتظار: لا يمرّ تشغيلان معاً");

  /* F2 */
  const t = (await http("GET", "/api/public/me/ticket", { cookie: rookies[0].cookie })).json;
  check(t.ready === true && t.plans.length === 3 && t.plans.map((p: any) => p.label).join("") === "ABC", "F2 ثلاثُ خطط", t);
  check(t.window.n >= 1 && t.window.of === 2, "F2 نافذةٌ من جولتين");
  const mine = (j: any, label = "A") => j.plans.find((p: any) => p.label === label).items.map((i: any) => i.courseId);
  check(!mine(t).includes(102) && !mine(t).includes(103), "F2 بلا مسبقٍ لا ١٠٢ ولا ١٠٣ (قواعدُ الصحيفة المعتمدة)", mine(t));
  check(t.unmet.some((u: any) => u.courseId === 102 && u.reason === "prereq"), "F2 والسببُ يُقال للطالب");
  check(mine(t).filter((c: number) => c === 105 || c === 106).length === 1, "F2 المجموعةُ الاختيارية بحدّها: واحد");
  const tm = (await http("GET", "/api/public/me/ticket", { cookie: mid.cookie })).json;
  check(mine(tm).includes(102), "F2 اجتاز ١٠١ فتُفتح ١٠٢");
  const byId = new Map(schedules.map(s => [`${s.AdCourseId}|${s.SCode}`, s]));
  void byId;
  const tn = (await http("GET", "/api/public/me/ticket", { cookie: nearGrad.cookie })).json;
  check(tn.window.n === 1, "F2 الأوشكُ على التخرّج: النافذة الأولى", tn.window);
  const td = (await http("GET", "/api/public/me/ticket", { cookie: noWishes.cookie })).json;
  check(td.ready === false && td.reason === "no-run", "F2 غير المشارك لا تُنشأ له تذكرة رغبات افتراضية");
  check(JSON.stringify(t).indexOf(rookies[0].ID) < 0 && !("fp" in t) && !("fingerprint" in t), "F5 التذكرةُ لا تحمل الرقمَ المدني ولا البصمة");

  /* F3 */
  check(t.plans.every((p: any) => p.items.every((i: any) => i.timesVisible === false && i.section === "" && i.slots.length === 0)), "F3 قبل التوقيع: لا شعبةَ ولا موعد");
  await Repository.saveScheduleApproval({
    id: "ap1", scopeKey: "1:11:1", AdCollegeId: 1, AdSectionId: 11, AdTermId: 1, status: "head", signatures: [], rounds: [], currentRound: 1, pendingAdditions: [],
  } as any);
  resetTicketContext();
  const signed = (await http("GET", "/api/public/me/ticket", { cookie: rookies[0].cookie })).json;
  const shown = signed.plans[0].items.filter((i: any) => i.timesVisible);
  check(shown.length === signed.plans[0].items.length && shown.every((i: any) => /^0[12]$/.test(i.section) && i.slots.length > 0), "F3 بعد توقيع جدول القسم: الشعبةُ وموعدُها", signed.plans[0]);
  const arbTicket = (await http("GET", "/api/public/me/ticket", { cookie: arb.cookie })).json;
  check(arbTicket.plans[0].items.every((i: any) => i.timesVisible === false), "F3 قسمٌ لم يوقّع بعد: يبقى بلا مواعيد (التوقيعُ لكل قسمٍ على حدة)");
  const tmm = (await http("GET", "/api/public/me/ticket", { cookie: mid.cookie })).json;
  const after = tmm.plans[0].items.every((i: any) => i.slots.every((s: any) => s.start >= 12 * 60));
  check(after, "F3 قيدُ «لا صباح» محفوظٌ في خطّة أ", tmm.plans[0]);

  /* F4 */
  const adminSum = (await http("GET", "/api/simulation/summary", { who: "admin" })).json;
  const chairSum = (await http("GET", "/api/simulation/summary", { who: "chair11" })).json;
  check(adminSum.canRun === true && chairSum.canRun === false, "F4 التشغيلُ ظاهرٌ للإدارة وحدها");
  check(adminSum.run.students === 23 && adminSum.run.population === 24 && adminSum.run.defaulted === 1 && adminSum.run.projected.students === 1 && adminSum.run.windows.reduce((a: number, b: number) => a + b, 0) === 23, "F4 يفصل الرغبات الفعلية عن غير المشاركين والتوقع", adminSum.run);
  check(adminSum.courses.length === 9 && chairSum.courses.length === 6 && chairSum.courses.every((c: any) => c.sectionId === 11), "F4 القسمُ يرى مقرراتِه الستة، والإدارةُ التسعة", [adminSum.courses.length, chairSum.courses.length]);
  check(chairSum.run.students < adminSum.run.students && chairSum.run.population < adminSum.run.population && Object.values(chairSum.run.capacity).reduce((sum: number, n: any) => sum + Number(n), 0) === chairSum.run.students, "F4 أعداد الطلبة وفئات القدرة محصورة بقسم الحساب لا الجامعة كلها", chairSum.run);
  check(chairSum.run.scoped === true && adminSum.run.scoped === false, "F4 الملخّصُ يقول إن عرضه محدودٌ بالنطاق");
  const dump = JSON.stringify(adminSum);
  check(!/fingerprint|"fp"|civil|codeHash/.test(dump) && !rookies.some(r => dump.includes(r.ID)), "F4 لا أسماءَ ولا بصماتٍ ولا أرقامَ مدنية في الملخّص");
  const c101 = adminSum.courses.find((c: any) => c.code === "ISL100");
  check(c101.capacity === 60 && c101.taken <= c101.capacity && c101.wanted > 0 && c101.sections === 2, "F4 المقرر: سعةٌ ٦٠ (شعبتان × ٣٠) وطلبٌ وأخذٌ منها", c101);

  /* F5 */
  check((await http("GET", "/api/simulation/summary")).status === 401, "F5 الملخّصُ بدخولٍ فقط");
  await Repository.updateStudentProfile((await Repository.listStudentProfiles())[0].id, current => (current ? { ...current, wishes: { ...(current.wishes || { termId: 1, targetUnits: 15, courseIds: [], constraints: {} }), targetUnits: 12, updatedAt: new Date().toISOString() }, updatedAt: new Date(Date.now() + 60_000).toISOString() } : undefined));
  const staleSeen = await Promise.all(rookies.slice(0, 3).map(async r => (await http("GET", "/api/public/me/ticket", { cookie: r.cookie })).json.stale));
  check(staleSeen.some(Boolean), "F5 ملفٌّ عُدّل بعد آخر تحديث للرادار: تذكرتُه «قديمة»", staleSeen);
  check((await http("GET", "/api/simulation/summary", { who: "admin" })).json.run.stale === true, "F5 تعديل رغبات طالب يجعل ملخص الرادار قديماً");

  /* ── G: «هل سجلت؟» بعد بدء الجولة ── */
  const r1 = (await http("GET", "/api/public/me/report", { cookie: rookies[1].cookie })).json;
  check(r1.ready === true && r1.canReport === false && r1.courses.length > 0, "G1 قبل الجولة: السؤال ظاهرٌ لكن مقفل", r1);
  check((await http("POST", "/api/public/me/report", { cookie: rookies[1].cookie, body: { answers: [{ courseId: 101, state: "registered" }] } })).json.code === "report-closed", "G1 الإرسالُ قبل الجولة مرفوض");
  await Repository.setTermStudentPhases(1, { wishesOpen: add(today, -20), wishesClose: add(today, -10), rounds: [{ id: "r1", name: "مبكر", start: add(today, -1), end: add(today, 5) }, { id: "r2", name: "عادي", start: add(today, 10), end: add(today, 15) }], requestsClose: add(today, 40) });
  const open = (await http("GET", "/api/public/me/report", { cookie: rookies[1].cookie })).json;
  check(open.canReport === true, "G2 الجولة جارية: السؤال مفتوح");
  const cs = open.courses.map((c: any) => c.courseId);
  const bad = await http("POST", "/api/public/me/report", { cookie: rookies[1].cookie, body: { answers: [{ courseId: 999999, state: "registered" }] } });
  check(bad.status === 400 && bad.json.code === "empty", "G2 مقررٌ ليس له: لا يُقبل");
  const hidden = [101, 102, 103, 104, 105, 106].find(id => !cs.includes(id));
  if (hidden) check((await http("POST", "/api/public/me/report", { cookie: rookies[1].cookie, body: { answers: [{ courseId: hidden, state: "stuck", reason: "full" }] } })).json.code === "empty", "G2 مقررٌ لم يُعرض عليه لا يُقبل ولو كان من صحيفته (تُفرض مجموعةُ الواجهة نفسُها)", { hidden, cs });
  const stuckId = cs[0], okId = cs[1];
  const noHelp = await http("POST", "/api/public/me/report", { cookie: rookies[1].cookie, body: { answers: [{ courseId: okId, state: "registered" }, { courseId: stuckId, state: "stuck", reason: "full" }] } });
  check(noHelp.status === 200 && noHelp.json.registered === 1 && noHelp.json.stuck === 1 && noHelp.json.cases.length === 0, "G3 تعثّرٌ بلا طلب مساعدة: يُحصى ولا يُنشأ طلب", noHelp.json);
  const outcome1 = (await http("GET", "/api/simulation/outcome", { who: "admin" })).json;
  check(outcome1.answered === 1 && outcome1.courses.find((c: any) => c.courseId === stuckId)?.full === 1 && outcome1.courses.find((c: any) => c.courseId === okId)?.registered === 1, "G3 العدّاداتُ تحسب الجواب", outcome1);
  /* الاسمُ والرقمُ مختومان منذ الإنشاء: لا يُسألان ثانيةً ولا يُقبل رقمٌ مدنيٌّ يُرسَل معهما */
  const helped = await http("POST", "/api/public/me/report", { cookie: rookies[1].cookie, body: { answers: [{ courseId: okId, state: "registered" }, { courseId: stuckId, state: "stuck", reason: "prereq" }], help: true } });
  check(helped.status === 200 && helped.json.cases.length === 1 && /^[A-Z0-9-]{4,}$/i.test(helped.json.cases[0].caseRef), "G5 طلبُ المساعدة بالمختوم من الملف: لا اسمَ ولا رقماً يُعاد إدخالهما", helped.json);
  const fp1 = (await Repository.listStudentProfiles()).find(p => p.registration)!.fingerprint;
  const needs = await Repository.getStudentNeedsByFingerprint(fp1, 1, 1);
  check(needs.length === 1 && needs[0].nameCipher?.startsWith("sealed:") && needs[0].civilCipher?.startsWith("sealed:") && needs[0].surveySectionId === 11 && !JSON.stringify(needs[0]).includes(rookies[1].ID), "G5 الاسمُ والرقمُ مختومان، والحالةُ لقسم المقرر");
  const prof = (await Repository.listStudentProfiles()).find(p => p.fingerprint === fp1)!;
  check(Boolean(prof.nameCipher && prof.civilCipher) && !JSON.stringify(prof).includes(rookies[1].ID) && !JSON.stringify(prof).includes("طالب تجريبي"), "G5 الملفُّ يحمل المختوم فقط: لا اسمَ ولا رقماً مكشوفين");
  const mePlain = JSON.stringify((await http("GET", "/api/public/me/profile", { cookie: rookies[1].cookie })).json);
  check(mePlain.includes('"hasIdentity":true') && !mePlain.includes("Cipher") && !mePlain.includes("sealed:"), "G5 الطالبُ يعرف أنّ اسمه محفوظ ولا يُعاد إليه المختوم");
  /* الطالبُ يرى اسمَه ورقمَه مقنَّعاً ليتأكّد، ويصحّح الاسم */
  const me = (await http("GET", "/api/public/me/profile", { cookie: rookies[1].cookie })).json;
  check(me.identity?.name === "طالب تجريبي اختباري" && /^•{9}\d{3}$/.test(me.identity.civilMasked) && !JSON.stringify(me).includes(rookies[1].ID), "G5 «أهلاً، اسمي»: الاسمُ كاملاً والرقمُ المدني آخرُ ثلاثةِ أرقامٍ فقط", me.identity);
  check((await http("PUT", "/api/public/me/name", { cookie: rookies[1].cookie, body: { name: "س" } })).json.code === "bad-name", "G5 تصحيحُ الاسم: اسمٌ غير صالح مرفوض");
  const renamed = (await http("PUT", "/api/public/me/name", { cookie: rookies[1].cookie, body: { name: "عبدالله محمد الصباح" } })).json;
  check(renamed.identity?.name === "عبدالله محمد الصباح" && (await http("PUT", "/api/public/me/name", { body: { name: "عبدالله محمد الصباح" } })).status === 401, "G5 تصحيحُ الاسم يُحفظ مختوماً، وبلا جلسةٍ ٤٠١");
  /* ملفٌّ قديم بلا مختوم: يُسأل مرةً، ورقمُه يجب أن يطابق ملفَّه، ثم يُحفظ */
  await Repository.updateStudentProfile(fp1, cur => (cur ? { ...cur, nameCipher: undefined, civilCipher: undefined } : undefined));
  const legacyBad = await http("POST", "/api/public/me/report", { cookie: rookies[1].cookie, body: { answers: [{ courseId: stuckId, state: "stuck" }], help: { name: "عبدالله محمد العلي", civil: rookies[2].ID } } });
  check(legacyBad.status === 403 && legacyBad.json.code === "civil-mismatch", "G4 ملفٌّ قديم: رقمٌ مدنيٌّ لغير صاحبه ٤٠٣ (لا يُنتحل طالب)");
  const legacyNoName = await http("POST", "/api/public/me/report", { cookie: rookies[1].cookie, body: { answers: [{ courseId: stuckId, state: "stuck" }], help: { name: "س", civil: rookies[1].ID } } });
  check(legacyNoName.json.code === "bad-name", "G4 اسمٌ غير صالح");
  const legacyOk = await http("POST", "/api/public/me/report", { cookie: rookies[1].cookie, body: { answers: [{ courseId: stuckId, state: "stuck", reason: "prereq" }], help: { name: "عبدالله محمد العلي", civil: rookies[1].ID } } });
  const prof2 = (await Repository.listStudentProfiles()).find(p => p.fingerprint === fp1)!;
  check(legacyOk.status === 200 && Boolean(prof2.nameCipher && prof2.civilCipher), "G4 ملفٌّ قديم: يُسأل مرةً ويُحفظ مختوماً للمرة القادمة", legacyOk.json);
  const noName = await http("POST", "/api/public/me/enter", { body: { civil: civil(900), code: "135790", create: true, agree: true } });
  check(noName.status === 400 && noName.json.code === "bad-name", "G0 إنشاءُ ملفٍّ بلا اسمٍ صالح مرفوض");
  const outcome2 = (await http("GET", "/api/simulation/outcome", { who: "admin" })).json;
  check(outcome2.answered === 1 && outcome2.courses.find((c: any) => c.courseId === stuckId)?.stuck === 1 && outcome2.courses.find((c: any) => c.courseId === stuckId)?.full === 0 && outcome2.courses.find((c: any) => c.courseId === stuckId)?.prereq === 1, "G6 إعادةُ الجواب تطرح القديم وتضيف الجديد: لا عدّ مزدوج", outcome2);
  const chairOut = (await http("GET", "/api/simulation/outcome", { who: "chair11" })).json;
  check(chairOut.scoped === true && chairOut.courses.every((c: any) => c.code.startsWith("ISL")), "G6 القسمُ يرى مقرراتِه وحدها");
  check(chairOut.answered === null && chairOut.answers > 0 && outcome2.answered === 1, "G6 عددُ المجيبين الكلّيُّ للإدارة وحدها؛ والقسمُ يُقال له عددُ الأجوبة عن مقرراتِه", [chairOut.answered, chairOut.answers]);
  const arbOut = (await http("GET", "/api/simulation/outcome", { who: "chair12" })).json;
  check(arbOut.courses.length === 0, "G6 قسمٌ آخر: لا شيء من مقررات غيره");
  check((await http("GET", "/api/simulation/outcome")).status === 401, "G6 بدخولٍ فقط");

  /* ── H: الإشعاراتُ مربوطةٌ بالحال ── */
  const nt = (await http("GET", "/api/public/me/notices", { cookie: rookies[1].cookie })).json.notices as Array<{ id: string; tone: string; title: string; detail?: string }>;
  check(nt.some(n => n.id === "report-done") && nt.some(n => n.id.startsWith("ticket-ready:")), "H1 «ما الجديد؟»: أجاب وتذكرتُه جاهزة", nt.map(n => n.id));
  check(nt.some(n => n.id.startsWith("case:") && n.id.endsWith(":pending")), "H1 وطلبُه في القسم ينتظر القرار");
  const myNeed = (await Repository.getStudentNeedsByFingerprint(fp1, 0, 1))[0];
  await Repository.setStudentCourseState(myNeed.id, { courseId: myNeed.courseIds[0], state: "committee-rejected", reasonCode: "prerequisite", by: "department", at: new Date().toISOString() } as any);
  const nt2 = (await http("GET", "/api/public/me/notices", { cookie: rookies[1].cookie })).json.notices as Array<{ id: string; tone: string; title: string; detail?: string }>;
  const rej = nt2.find(n => n.id.endsWith(":committee-rejected"));
  check(Boolean(rej) && rej!.tone === "alert" && rej!.detail === "متطلّبٌ سابق لم يُستوفَ" && nt2[0].tone !== "done", "H1 قرارُ القسم يصل الطالبَ بسببه ويتصدّر القائمة", nt2);
  const fresh = (await http("GET", "/api/public/me/notices", { cookie: rookies[5].cookie })).json.notices as Array<{ id: string }>;
  check(fresh.some(n => n.id.startsWith("ticket-ready:")) && !fresh.some(n => n.id === "report-done"), "H1 طالبٌ لم يُجب: تذكرتُه جاهزة و«أخبرنا» ظاهرة", fresh);
  check((await http("GET", "/api/public/me/notices")).status === 401, "H1 بلا جلسة: ٤٠١");

  /* العاملون: صحائفُ قيد المراجعة ورادارٌ وتعثّر بحدود النطاق */
  const { pendingPlanReviews } = await import("../src/server/planReviewRoutes");
  const { radarNoticeFor } = await import("../src/server/simulationRoutes");
  await Repository.updateRuleDraft("p12", () => ({ id: "p12", planId: "p12", AdCollegeId: 1, AdSectionId: 12, version: 0, status: "review", basedOnVersion: 0, updatedAt: new Date().toISOString(), rules: [{ courseId: 201, level: 1, kind: "compulsory" }], groups: [] } as any));
  const scopeDeps = {
    isScopeAllowed: (req: any, c: number, sec: number) => Boolean(req.user?.IsAdminUser) || (req.scopes || []).some((x: any) => x.AdCollegeId === c && x.AdSectionId === sec),
    isPowerUser: (req: any) => Boolean(req.user?.IsAdminUser),
  };
  const asReq = (who: string) => ({ user: USERS[who].user, scopes: USERS[who].scopes });
  const rv12 = await pendingPlanReviews(asReq("chair12"), scopeDeps), rv11 = await pendingPlanReviews(asReq("chair11"), scopeDeps), rvAdmin = await pendingPlanReviews(asReq("admin"), scopeDeps);
  check(rv12.length === 1 && rv12[0].sectionName === "قسم اللغة العربية" && rv11.length === 0 && rvAdmin.length === 1, "H2 الصحيفةُ قيد المراجعة تصل قسمَها وإدارةَ النظام وحدهما");
  const rad11 = await radarNoticeFor(asReq("chair11"), scopeDeps), radAdmin = await radarNoticeFor(asReq("admin"), scopeDeps);
  check(Boolean(rad11.radar) && rad11.radar!.scoped === true && radAdmin.radar!.scoped === false && radAdmin.radar!.needsDecision >= rad11.radar!.needsDecision, "H2 الرادار بحدود النطاق: القسمُ أقلُّ من الإدارة أو يساويها", [rad11.radar, radAdmin.radar]);
  check(rad11.outcome !== null && rad11.outcome.answered >= 1 && rad11.outcome.stuck >= 1 && radAdmin.outcome!.stuck >= rad11.outcome.stuck, "H2 ما تعثّر فيه الطلبةُ يصل القسمَ بعدّه في مقرراته", [rad11.outcome, radAdmin.outcome]);
  const rad12 = await radarNoticeFor(asReq("chair12"), scopeDeps);
  check(rad12.outcome!.stuck === 0, "H2 قسمٌ لم يتعثّر طلبتُه في مقرراته: صفر");

  /* ── I: التشغيل التلقائي للرادار ── */
  const { radarDue, radarAutoSettings } = await import("../src/server/simulationRoutes");
  const H = 3_600_000, now = Date.parse("2026-10-15T09:00:00Z"), todayIso = "2026-10-15";
  const due = (o: any) => radarDue({ mode: "wishes", today: todayIso, now, everyMs: 24 * H, ...o });
  check(due({ ranAt: undefined }) === true, "I1 لم يُشغَّل قطّ والرغباتُ مفتوحة: يُشغَّل");
  check(due({ ranAt: new Date(now - 3 * H).toISOString() }) === false, "I1 شُغِّل قبل ٣ ساعات: لا تكرار");
  check(due({ ranAt: new Date(now - 25 * H).toISOString() }) === true, "I1 مضى ٢٥ ساعة: يتحدّث");
  check(due({ mode: "waiting", ranAt: undefined }) === false && due({ mode: "closed", ranAt: undefined }) === false, "I1 قبل الرغبات وبعد الإغلاق: لا يعمل وحدَه");
  check(due({ mode: "frozen", wishesClose: "2026-10-12", ranAt: "2026-10-12T05:00:00Z" }) === true, "I1 أُغلقت الرغباتُ بعد آخر تحديث: تحديثٌ أخيرٌ بالرغبات النهائية");
  check(due({ mode: "frozen", wishesClose: "2026-10-12", ranAt: "2026-10-14T20:00:00Z" }) === false, "I1 وبعد التحديث الأخير لا يتكرّر قبل ٢٤ ساعة");
  /* قديمٌ بتعديلٍ في الجدول: يُحدَّث بعد هدوءٍ قصير وبفاصلٍ بين تشغيلين، لا بعد ٢٤ ساعة */
  const MIN = 60_000;
  const stale = (agoStale: number, agoRan: number) => due({ ranAt: new Date(now - agoRan * MIN).toISOString(), stale: true, staleAt: new Date(now - agoStale * MIN).toISOString() });
  check(stale(5, 30) === true, "J1 عُدِّل الجدولُ قبل ٥ دقائق وآخر تشغيلٍ قبل ٣٠: يُحدَّث وحدَه");
  check(stale(1, 30) === false, "J1 عُدِّل قبل دقيقة فقط: ينتظر أن يهدأ التعديل (لا إعادةَ حسابٍ مع كل صفٍّ في استيراد)");
  check(stale(5, 4) === false, "J1 وآخرُ تشغيلٍ قبل ٤ دقائق: فاصلٌ أدنى بين تشغيلين");
  check(due({ ranAt: new Date(now - 30 * MIN).toISOString(), stale: false }) === false, "J1 غيرُ قديمٍ وحديث: لا يُشغَّل");
  check(due({ mode: "closed", ranAt: new Date(now - 30 * MIN).toISOString(), stale: true, staleAt: new Date(now - 10 * MIN).toISOString() }) === false, "J1 خارج مراحل الرغبات: لا تحديثَ وحدَه ولو كان قديماً");
  check(radarAutoSettings().enabled === true && radarAutoSettings().everyHours === 24, "I2 الافتراضي: تلقائيٌّ كل ٢٤ ساعة");
  const adminSummary = (await http("GET", "/api/simulation/summary", { who: "admin" })).json;
  check(adminSummary.auto?.enabled === true && adminSummary.auto.everyHours === 24, "I2 الشاشةُ تقول إنه تلقائي وكم ساعة");
  const rs = fs.readFileSync(path.join(process.cwd(), "src/server/simulationRoutes.ts"), "utf8"), sv = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  check(rs.includes("acquireRegistrationRunLease") && rs.includes("Repository.isDemoMode()") && sv.includes("scheduleRadarAutoRun(") && rs.includes("if (run?.stale) kickRadarRefresh()"), "I2 بقفلٍ بين الخوادم، ولا يعمل في التجربة، ويُجدول عند الإقلاع");
} finally { server.close(); }

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
