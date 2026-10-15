/**
 * ── بروفةُ التسجيل: المسار الكامل داخل العملية (المرحلة ٦) ─────────────────────
 *
 * مستودعٌ حقيقيّ بملفٍّ مؤقّت، ومسارا الباب والبروفة على Express محلّي: طلبةٌ ينشئون
 * ملفّاتهم ويكتبون رغباتهم عبر الباب، وإدارةُ النظام تشغّل البروفة، ثم تُقرأ التذاكر.
 *
 *   F1 التشغيل: لإدارة النظام وحدها، ولا يتزاحم.
 *   F2 التذكرة: ثلاثُ خطط، ونافذة، والمسبقُ يمنع، والمعتمَدُ من القواعد وحده يُعتدّ به.
 *   F3 الظهور: لا موعدَ ولا شعبةَ قبل توقيع جدول القسم، وبعده تظهر.
 *   F4 النطاق: القسمُ يرى مقرراتِه في الملخّص، والإدارةُ ترى الكلّ، ولا أسماء في أيٍّ منهما.
 *   F5 الأمان: التذكرةُ لصاحبها وحده، وتتقادم إن عُدّل الملفّ بعد البروفة.
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
};
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => { const who = USERS[String(req.headers["x-who"] || "")]; if (who) { req.user = who.user; req.scopes = who.scopes; } next(); });
const identityKey = createHmac("sha256", "test-secret").update("identity").digest();
registerStudentDoorRoutes(app, {
  surveyFingerprint: async civilId => createHash("sha256").update("fp|" + civilId).digest("hex").slice(0, 32),
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
  const made = await http("POST", "/api/public/me/enter", { body: { civil: ID, code: "135790", create: true, agree: true } });
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

  check((await http("GET", "/api/public/me/ticket", { cookie: rookies[0].cookie })).json.reason === "no-run", "F0 قبل البروفة: «لم تُجرَ بعد»");
  check((await http("GET", "/api/public/me/ticket")).status === 401, "F0 بلا جلسة: ٤٠١");

  /* F1 */
  check((await http("POST", "/api/simulation/run")).status === 401, "F1 بلا دخول: ٤٠١");
  check((await http("POST", "/api/simulation/run", { who: "chair11" })).status === 403, "F1 رئيسُ لجنةٍ لا يشغّل (يحسب لكل الطلبة)");
  const first = await http("POST", "/api/simulation/run", { who: "admin" });
  const again = await http("POST", "/api/simulation/run", { who: "admin" });
  check(first.status === 200 && again.status === 200 && first.json.students === 24, "F1 تشغيلٌ ثم إعادةٌ: كلُّ الملفّات المكتملة دخلت (٢٤)", [first.json, again.json]);
  const routeSrc = fs.readFileSync(path.join(process.cwd(), "src/server/simulationRoutes.ts"), "utf8");
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
  check(td.defaulted === true && td.ready === true, "F2 من لم يكتب رغباتٍ: تذكرةٌ افتراضية موسومة");
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
  check(adminSum.run.students === 24 && adminSum.run.windows.reduce((a: number, b: number) => a + b, 0) === 24, "F4 الملخّص: ٢٤ ملفاً موزَّعون على النوافذ", adminSum.run);
  check(adminSum.courses.length === 9 && chairSum.courses.length === 6 && chairSum.courses.every((c: any) => c.sectionId === 11), "F4 القسمُ يرى مقرراتِه الستة، والإدارةُ التسعة", [adminSum.courses.length, chairSum.courses.length]);
  check(chairSum.run.scoped === true && adminSum.run.scoped === false, "F4 الملخّصُ يقول إن عرضه محدودٌ بالنطاق");
  const dump = JSON.stringify(adminSum);
  check(!/fingerprint|"fp"|civil|codeHash/.test(dump) && !rookies.some(r => dump.includes(r.ID)), "F4 لا أسماءَ ولا بصماتٍ ولا أرقامَ مدنية في الملخّص");
  const c101 = adminSum.courses.find((c: any) => c.code === "ISL100");
  check(c101.capacity === 60 && c101.taken <= c101.capacity && c101.wanted > 0 && c101.sections === 2, "F4 المقرر: سعةٌ ٦٠ (شعبتان × ٣٠) وطلبٌ وأخذٌ منها", c101);

  /* F5 */
  check((await http("GET", "/api/simulation/summary")).status === 401, "F5 الملخّصُ بدخولٍ فقط");
  await Repository.updateStudentProfile((await Repository.listStudentProfiles())[0].id, current => (current ? { ...current, updatedAt: new Date(Date.now() + 60_000).toISOString() } : undefined));
  const staleSeen = await Promise.all(rookies.slice(0, 3).map(async r => (await http("GET", "/api/public/me/ticket", { cookie: r.cookie })).json.stale));
  check(staleSeen.some(Boolean), "F5 ملفٌّ عُدّل بعد البروفة: تذكرتُه «قديمة»", staleSeen);
} finally { server.close(); }

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
