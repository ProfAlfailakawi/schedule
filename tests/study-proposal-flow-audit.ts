/**
 * ── المقترح الدراسي: المسار الكامل عبر الخادم الحقيقي ────────────────────────
 *
 * يشغّل الخادمَ في وضع العرض (DATA_MODE=demo) — أو يستعمل خادماً يعمل على المنفذ
 * نفسه — ثم يجري المسار كما يجريه منسّقٌ وأستاذ: يُعدّ المقترح، ويُفحص بفاحص الجدول
 * نفسه، ويُرسل، ويردّ الأستاذ من رابطه الشخصي بتوقيع رقمه المدني، ويثبّت القسم.
 * كلُّ سيناريو يختبر قاعدةً من قواعد الميزة لا نصّاً في الشيفرة.
 */
import { spawn, type ChildProcess } from "child_process";

const BASE = process.env.PROPOSAL_TEST_BASE || "http://localhost:3000";
let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

type Res = { status: number; json: any; cookie?: string };
async function http(method: string, path: string, body?: unknown, cookie?: string): Promise<Res> {
  const res = await fetch(BASE + path, {
    method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, cookie: set ? set.split(";")[0] : undefined };
}

async function serverUp() {
  try { const r = await fetch(BASE + "/api/demo/config"); return r.ok; } catch { return false; }
}

let child: ChildProcess | null = null;
async function ensureServer() {
  if (await serverUp()) return;
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development" }, stdio: "ignore" });
  for (let i = 0; i < 90; i++) { if (await serverUp()) return; await new Promise(r => setTimeout(r, 1000)); }
  throw new Error("الخادم لم يبدأ");
}

async function login(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const r = await http("POST", "/api/auth/demo", {});
    if (r.status === 200 && r.cookie) return r.cookie;
    await new Promise(res => setTimeout(res, 15000));
  }
  throw new Error("تعذّر الدخول التجريبي");
}

const SCOPE = "collegeId=1&sectionId=1&termId=1";
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const daysOfRow = (r: any) => DAYS.filter(d => r[d]);

async function main() {
  await ensureServer();
  const cookie = await login();
  const A = (method: string, path: string, body?: unknown) => http(method, path, body, cookie);

  const reqs = (await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows as any[];
  const salem = reqs.find(r => r.instructorName === "د. سالم فهد")!;
  const noura = reqs.find(r => r.instructorName === "د. نورة خالد")!;
  const instructors = (await A("GET", "/api/instructors")).json as any[];
  const civilOf = (name: string) => String(instructors.find(i => i.AdInstructorName === name).AdInstructorCivil);
  const placeholder = instructors.find(i => String(i.AdInstructorName).startsWith("هيئة"));
  const rows = async () => ((await A("GET", `/api/schedules?${SCOPE}`)).json as any[]);
  const base = await rows();
  const room = base.find(r => r.roomId)!;
  const roomFields = { AdRoomCode: room.AdRoomCode, AdRoomHall: room.AdRoomHall, buildingId: room.buildingId, roomId: room.roomId, locationStatus: "VERIFIED" };
  /* قاعةٌ مختلفة لكل شعبةٍ يصنعها الاختبار، فلا يتعارض الاختبار بقاعةٍ مع نفسه. */
  const distinctRooms = [...new Map(base.filter(r => r.roomId && r.roomId !== room.roomId).map(r => [r.roomId, { AdRoomCode: r.AdRoomCode, AdRoomHall: r.AdRoomHall, buildingId: r.buildingId, roomId: r.roomId, locationStatus: "VERIFIED" }])).values()];
  let roomCursor = 0;
  const freshRoom = () => distinctRooms[roomCursor++ % distinctRooms.length];
  const courses = (await A("GET", "/api/courses")).json as any[];
  const course = (code: string) => courses.find(c => c.CourseCode === code);
  const salemRows = base.filter(r => r.AdInstructorId === salem.AdInstructorId);
  const salemInstructorId = salem.AdInstructorId;

  check(Boolean(placeholder) && base.some(r => r.AdInstructorId === placeholder.AdInstructorId), "البيئة تحمل سجل «هيئة تدريسية» وشعباً تحمله");

  /* مساعدات: إنشاء شعبة «هيئة تدريسية» وبناء العمليات */
  let nextRoomHall = 1;
  const makeFaculty = async (courseCode: string, scode: string, flags: string, start: string, end: string, hall?: string) => {
    const c = course(courseCode);
    const body = {
      AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: c.AdCourseId, SCode: scode, AdInstructorId: placeholder.AdInstructorId,
      fsunday: flags.includes("S"), fmonday: flags.includes("M"), ftuesday: flags.includes("T"), fwednesday: flags.includes("W"), fthursday: flags.includes("H"),
      fstarttime: start, fendtime: end, ...freshRoom(),
    };
    void hall;
    const r = await A("POST", "/api/schedules", body);
    if (r.status !== 201) console.log("makeFaculty refused", r.status, JSON.stringify(r.json).slice(0, 200));
    return r.json;
  };
  const targetOf = (courseId: number, scode: string, days: string[], start: string, end: string, extra: any = {}) =>
    ({ AdCourseId: courseId, SCode: scode, days, fstarttime: start, fendtime: end, ...roomFields, ...extra });
  const ownRoom = (r: any) => ({ AdRoomCode: r.AdRoomCode, AdRoomHall: r.AdRoomHall, buildingId: r.buildingId, roomId: r.roomId, locationStatus: r.locationStatus });
  const opAssign = (id: string, r: any, over: any = {}) =>
    ({ id, kind: "assign", source: { id: r.id }, target: targetOf(r.AdCourseId, r.SCode, daysOfRow(r), r.fstarttime, r.fendtime, { ...ownRoom(r), ...over }) });
  const opCreate = (id: string, courseId: number, scode: string, days: string[], start: string, end: string, extra: any = {}) =>
    ({ id, kind: "create", target: targetOf(courseId, scode, days, start, end, extra) });
  const evaluate = async (req: any, ops: any[], proposalId?: string) => (await A("POST", "/api/study-proposals/evaluate", { requestId: req.id, ops, proposalId })).json.evaluation;
  const newProposal = async (req: any, ops: any[], mode = "independent") => {
    const r = await A("POST", "/api/study-proposals", { requestId: req.id, ops, responseMode: mode });
    return r;
  };
  const sendIt = async (p: any) => A("POST", `/api/study-proposals/${p.proposal.id}/send`, { rev: p.proposal.rev });
  const respond = async (req: any, pid: string, version: number, decisions: any, civilName: string, extra: any = {}) =>
    http("POST", `/api/public/request/${req.linkId}/proposals/${pid}/respond`, { civil: civilOf(civilName), version, ...(Array.isArray(decisions) ? { decisions } : { decision: decisions }), ...extra });
  const getP = async (pid: string) => ((await A("GET", `/api/study-proposals?${SCOPE}`)).json.proposals as any[]).find(p => p.proposal.id === pid);

  /* ═══ ١) الإسناد: الشعبة نفسها تنتقل، ولا تتكرر عند التكرار ═══════════════ */
  const fac1 = await makeFaculty("CS315", "601", "H", "17:00", "17:50");
  const termCount0 = (await rows()).length;
  let p1 = (await newProposal(salem, [opAssign("a1", fac1)])).json;
  check(p1.proposal?.status === "draft", "المقترح يُحفظ مسودةً مستقلة", p1.error);
  let ev = await evaluate(salem, p1.proposal.ops, p1.proposal.id);
  check(ev.status === "complete" && ev.counts.blockers === 0 && ev.readiness.canSend, "إسناد شعبة لا تتعارض: فحصٌ مكتمل بلا موانع", ev.findings);
  check(ev.after.metrics.sections === ev.before.metrics.sections + 1, "الجدول الناتج يضيف الشعبة مرةً واحدة");
  check((await rows()).find(r => r.id === fac1.id).AdInstructorId === placeholder.AdInstructorId, "قبل الموافقة والتثبيت: الشعبة ما زالت لـ«هيئة تدريسية» (لا حجز)");
  const sent1 = await sendIt(p1);
  check(sent1.status === 200 && sent1.json.proposal.status === "sent", "الإرسال ينجح بعد اكتمال الفحص", sent1.json.error);
  check((await sendIt(p1)).json.alreadySent === true, "ضغطتا إرسال متتاليتان لا تُرسلان مرتين");
  check((await rows()).length === termCount0 && (await rows()).find(r => r.id === fac1.id).AdInstructorId === placeholder.AdInstructorId, "الإرسال لا يغيّر الجدول الفعلي ولا يحجز الشعبة");
  const wrong = await http("POST", `/api/public/request/${salem.linkId}/proposals/${p1.proposal.id}/respond`, { civil: "111111111111", version: 1, decisions: [{ opId: "a1", decision: "approve" }] });
  check(wrong.status === 403 || wrong.status === 400, "رقمٌ مدني خاطئ لا يوقّع الردّ", wrong.json);
  const other = await http("GET", `/api/public/request/${noura.linkId}/proposals/${p1.proposal.id}`);
  check(other.status === 404, "رابط أستاذٍ آخر لا يرى مقترح غيره");
  const ok1 = await respond(salem, p1.proposal.id, 1, [{ opId: "a1", decision: "approve" }], "د. سالم فهد");
  check(ok1.status === 200 && ok1.json.proposal.status === "approved", "ردّ الأستاذ الموقَّع بالرقم المدني يُسجَّل موافقة", ok1.json);
  check(JSON.stringify((await getP(p1.proposal.id)).proposal).includes(civilOf("د. سالم فهد")) === false, "الرقم المدني لا يُخزَّن في المقترح");
  check((await respond(salem, p1.proposal.id, 1, [{ opId: "a1", decision: "approve" }], "د. سالم فهد")).json.duplicate === true, "تكرار الموافقة نفسها لا يسجَّل مرتين");
  check((await rows()).find(r => r.id === fac1.id).AdInstructorId === placeholder.AdInstructorId, "موافقة الأستاذ وحدها لا تغيّر الجدول (بانتظار تثبيت القسم)");
  const cur1 = await getP(p1.proposal.id);
  const dry = await A("POST", `/api/study-proposals/${p1.proposal.id}/commit`, { rev: cur1.proposal.rev });
  check(dry.status === 200 && dry.json.dryRun === true && dry.json.evaluation.counts.blockers === 0, "«مراجعة وتثبيت» تعيد الفحص دون كتابة");
  const done1 = await A("POST", `/api/study-proposals/${p1.proposal.id}/commit`, { rev: cur1.proposal.rev, confirm: true });
  check(done1.status === 200 && done1.json.proposal.status === "committed", "التثبيت ينفَّذ", done1.json);
  const after1 = await rows();
  check(after1.length === termCount0, "الإسناد لم يُنشئ نسخةً ثانية من الشعبة: عدد صفوف الفصل كما هو");
  check(after1.find(r => r.id === fac1.id).AdInstructorId === salemInstructorId, "الشعبة نفسها (بمعرّفها) صارت للأستاذ");
  const again = await A("POST", `/api/study-proposals/${p1.proposal.id}/commit`, { rev: cur1.proposal.rev, confirm: true });
  check(again.status === 200 && again.json.alreadyCommitted === true && (await rows()).length === termCount0, "تكرار التثبيت لا يكرّر الإسناد");
  const closed = await respond(salem, p1.proposal.id, 1, [{ opId: "a1", decision: "changes" }], "د. سالم فهد", { reason: "time" });
  check(closed.status === 409, "لا ردّ على مقترحٍ مثبّت", closed.json);

  /* ═══ ٢) الشعبة الجديدة: تُنشأ عند التثبيت فقط ═════════════════════════════ */
  const ds = course("CS220") || courses.find(c => c.AdSectionId === 1 && c.CourseCode !== "CS315");
  const p2 = (await newProposal(salem, [opCreate("c1", ds.AdCourseId, "701", ["fthursday"], "18:00", "18:50")])).json;
  check((await rows()).filter(r => r.SCode === "701").length === 0, "إضافة المادة إلى المسودة لا تُنشئها في الجدول الفعلي");
  await sendIt(p2);
  check((await rows()).filter(r => r.SCode === "701").length === 0, "إرسالها للأستاذ لا يُنشئها أيضاً");
  await respond(salem, p2.proposal.id, 1, [{ opId: "c1", decision: "approve" }], "د. سالم فهد");
  const c2 = await getP(p2.proposal.id);
  const done2 = await A("POST", `/api/study-proposals/${p2.proposal.id}/commit`, { rev: c2.proposal.rev, confirm: true });
  const made = (await rows()).filter(r => r.SCode === "701");
  check(done2.status === 200 && made.length === 1 && made[0].AdInstructorId === salemInstructorId, "الشعبة الجديدة تُنشأ عند التثبيت وحده، مرةً واحدة", done2.json);
  check((await A("POST", `/api/study-proposals/${p2.proposal.id}/commit`, { rev: c2.proposal.rev, confirm: true })).json.alreadyCommitted === true && (await rows()).filter(r => r.SCode === "701").length === 1, "تكرار التثبيت لا يكرّر الإنشاء");
  const result2 = done2.json.proposal.commit.results[0];
  check(result2.createdRowIds?.length === 1 && result2.createdRowIds[0] === made[0].id, "نتيجة التثبيت تحمل مرجع السجل الناتج");

  /* ═══ ٣) التعارضات: الأستاذ، القاعة، رقم الشعبة، وتمييز الموانع من الملاحظات ═ */
  const clashRow = salemRows[0];
  ev = await evaluate(salem, [opCreate("x1", course("CS350").AdCourseId, "702", daysOfRow(clashRow), clashRow.fstarttime, clashRow.fendtime, { AdRoomHall: "999", roomId: undefined, locationStatus: "PENDING_ROOM" })]);
  check(ev.counts.blockers >= 1 && ev.findings.some(f => f.kind === "blocker" && f.code === "instructor"), "تعارضٌ مع محاضرةٍ قائمة للأستاذ: مانع", ev.findings);
  check(!ev.readiness.canSend, "المقترح الذي فيه مانع لا يُرسل كعرضٍ جاهز");
  const blockedSend = await (async () => { const p = (await newProposal(salem, [opCreate("x1", course("CS350").AdCourseId, "702", daysOfRow(clashRow), clashRow.fstarttime, clashRow.fendtime, { roomId: undefined, locationStatus: "PENDING_ROOM" })])).json; return sendIt(p); })();
  check(blockedSend.status === 409 && blockedSend.json.code === "not-ready", "الخادم يعيد الفحص عند الإرسال ويمنع ما فيه مانع", blockedSend.json.error);
  const other2 = base.find(r => r.AdInstructorId !== salemInstructorId && r.roomId && r.AdInstructorId !== placeholder.AdInstructorId)!;
  ev = await evaluate(salem, [opCreate("x2", course("CS350").AdCourseId, "703", daysOfRow(other2), other2.fstarttime, other2.fendtime, { AdRoomCode: other2.AdRoomCode, AdRoomHall: other2.AdRoomHall, buildingId: other2.buildingId, roomId: other2.roomId, locationStatus: "VERIFIED" })]);
  check(ev.findings.some(f => f.kind === "blocker" && (f.code === "room" || f.code === "instructor")), "قاعةٌ مشغولة أو أستاذٌ مشغول: مانع", ev.findings.map(f => f.code));
  ev = await evaluate(salem, [opCreate("x3", ds.AdCourseId, "701", ["fthursday"], "19:00", "19:50")]);
  check(ev.findings.some(f => f.code === "section-code-taken" && f.kind === "blocker"), "رقم شعبةٍ مستخدمٍ لنفس المقرر: مانع", ev.findings.map(f => f.code));
  ev = await evaluate(salem, [opCreate("x4", ds.AdCourseId, "705", ["fthursday"], "19:00", "18:00")]);
  check(ev.status === "partial" && ev.incompleteReasons.length > 0 && !ev.readiness.canSend, "بيانات ناقصة: الفحص «غير مكتمل» ولا يُعرض «لا تعارضات»");
  ev = await evaluate(salem, [opCreate("x5", ds.AdCourseId, "706", ["fthursday"], "20:00", "20:50")]);
  check(ev.status === "partial" || ev.incompleteReasons.length > 0, "وقتٌ خارج ساعات اليوم الدراسي لا يُفحص كأنه صحيح");
  const f2 = await makeFaculty("CS315", "602", "S", "08:30", "09:20");
  ev = await evaluate(salem, [opAssign("a9", f2)]);
  check(ev.findings.some(f => f.kind === "blocker" && f.code === "instructor"), "تُفحص الشعبة المُسندة بهوية الأستاذ المستهدف لا بهوية «هيئة تدريسية»", ev.findings.map(f => f.code));
  const wholeDay = await evaluate(salem, [opCreate("y1", ds.AdCourseId, "711", ["fthursday"], "09:00", "09:50"), opCreate("y2", ds.AdCourseId, "712", ["fthursday"], "09:30", "10:20")]);
  check(wholeDay.findings.some(f => f.kind === "blocker" && f.opId && ["y1", "y2"].includes(f.opId)), "مواد المقترح تُفحص مقابل بعضها", wholeDay.findings.map(f => `${f.code}:${f.opId}`));
  const soft = await evaluate(salem, [opCreate("z1", ds.AdCourseId, "721", ["fthursday"], "17:55", "18:45")]);
  check(soft.counts.blockers === 0 || soft.findings.filter(f => f.kind === "blocker").every(f => f.code !== "doorway"), "الملاحظات الإرشادية (الفاصل القصير…) لا تتحول إلى موانع");

  /* ═══ ٤) تعديل وإحلال: لا تُحسب المحاضرة القديمة والجديدة معاً ════════════ */
  const movable = salemRows.find(r => !daysOfRow(r).includes("fthursday") && r.id !== fac1.id)!;
  const editOp = { id: "e1", kind: "edit", source: { id: movable.id }, target: targetOf(movable.AdCourseId, movable.SCode, ["fthursday"], "16:00", "16:50", { AdRoomCode: movable.AdRoomCode, AdRoomHall: movable.AdRoomHall, buildingId: movable.buildingId, roomId: movable.roomId }) };
  ev = await evaluate(salem, [editOp]);
  check(ev.after.metrics.sections === ev.before.metrics.sections, "التعديل: عدد الشعب بعده = قبله (القديم لا يُحسب مع الجديد)", [ev.before.metrics.sections, ev.after.metrics.sections]);
  check(ev.after.ghosts.some((g: any) => g.state === "out") && ev.after.items.some((i: any) => i.state === "modified"), "معاينة التعديل تُظهر الموضع القديم (ghost) والجديد (معدّل)");
  const f3 = await makeFaculty("CS350", "603", "M", "17:00", "17:50");
  const swapOut = salemRows.find(r => r.id !== movable.id && r.id !== fac1.id)!;
  const replaceOp = { id: "r1", kind: "replace", incoming: "assign", source: { id: f3.id }, out: { snapshot: { id: swapOut.id }, action: "unassign" }, target: targetOf(f3.AdCourseId, f3.SCode, daysOfRow(f3), f3.fstarttime, f3.fendtime, ownRoom(f3)) };
  ev = await evaluate(salem, [replaceOp]);
  check(ev.after.metrics.sections === ev.before.metrics.sections, "الاستبدال: لا تُحسب المحاضرة القديمة والجديدة معاً", [ev.before.metrics.sections, ev.after.metrics.sections]);
  check(ev.after.ghosts.some((g: any) => g.state === "out" && g.outAction === "unassign"), "ما سيخرج من جدول الأستاذ موضَّحٌ في المعاينة");

  /* ═══ ٥) ترتيبٌ مترابط: يُردّ عليه كاملاً أو يُطلب تعديله، ويُثبَّت كاملاً ═══ */
  const lp = (await newProposal(salem, [replaceOp], "linked")).json;
  check(lp.proposal?.responseMode === "linked", "الترتيب المترابط يُحفظ بنوعه");
  await sendIt(lp);
  const lr = await respond(salem, lp.proposal.id, 1, "changes", "د. سالم فهد", { reason: "time", note: "الخميس مزدحم" });
  check(lr.status === 200 && lr.json.proposal.status === "changes", "ترتيبٌ مترابط: طلبُ التعديل يشمل المجموعة", lr.json);
  const lcur = await getP(lp.proposal.id);
  const lcommit = await A("POST", `/api/study-proposals/${lp.proposal.id}/commit`, { rev: lcur.proposal.rev, confirm: true });
  check(lcommit.status === 409, "لا تثبيت لمجموعةٍ طلب الأستاذ تعديلها", lcommit.json);
  const edited = await A("PUT", `/api/study-proposals/${lp.proposal.id}`, { rev: lcur.proposal.rev, ops: [{ ...replaceOp, target: { ...replaceOp.target, fstarttime: "16:00", fendtime: "16:50" } }] });
  check(edited.status === 200 && edited.json.proposal.version === 2 && edited.json.proposal.status === "draft", "تعديل تفاصيل ما أُرسل ينشئ نسخةً جديدة (٢) مسودة", edited.json.error);
  check(edited.json.proposal.versions.length === 1 && edited.json.proposal.responses.length === 1, "تاريخ النسخ والردود السابقة محفوظ لا يُمحى");
  const midResp = await respond(salem, lp.proposal.id, 1, "approve", "د. سالم فهد");
  check(midResp.status === 409, "أثناء تجهيز نسخةٍ جديدة لا يُقبل الردّ على القديمة", midResp.json);
  const sent2 = await A("POST", `/api/study-proposals/${lp.proposal.id}/send`, { rev: edited.json.proposal.rev });
  check(sent2.status === 200 && sent2.json.proposal.sentVersion === 2, "إرسال النسخة المعدّلة", sent2.json.error);
  const oldVer = await respond(salem, lp.proposal.id, 1, "approve", "د. سالم فهد");
  check(oldVer.status === 409 && oldVer.json.code === "stale-version", "موافقةٌ على نسخةٍ قديمة تُرفض ولا تنطبق على الأحدث", oldVer.json);
  const newVer = await respond(salem, lp.proposal.id, 2, "approve", "د. سالم فهد");
  check(newVer.status === 200 && newVer.json.proposal.status === "approved", "الموافقة على النسخة الحالية");
  const hist = (await getP(lp.proposal.id)).proposal;
  check(hist.responses.length === 2 && hist.responses[0].version === 1, "ردُّ النسخة القديمة محفوظٌ بجانب الجديد");
  const lcur2 = await getP(lp.proposal.id);
  const beforeLinked = await rows();
  const ldone = await A("POST", `/api/study-proposals/${lp.proposal.id}/commit`, { rev: lcur2.proposal.rev, confirm: true });
  const afterLinked = await rows();
  check(ldone.status === 200, "تثبيت الاستبدال المترابط", ldone.json);
  check(afterLinked.find(r => r.id === f3.id).AdInstructorId === salemInstructorId && afterLinked.find(r => r.id === swapOut.id).AdInstructorId === placeholder.AdInstructorId, "طرفا الاستبدال نُفّذا معاً: دخلت الشعبة وفُكّ إسناد الموعد القديم");
  check(afterLinked.length === beforeLinked.length, "الاستبدال لا يحذف شعبةً من جدول القسم عند فك الإسناد");

  /* ═══ ٦) مواد مستقلة: موافقةٌ جزئية تُثبّت ما وُوفق عليه وحده ═══════════════ */
  const f4 = await makeFaculty("CS315", "604", "H", "18:00", "18:50");
  const f5 = await makeFaculty("CS350", "605", "H", "19:00", "19:50");
  const p6 = (await newProposal(noura, [opAssign("n1", f4), opAssign("n2", f5)])).json;
  const s6 = await sendIt(p6);
  check(s6.status === 200, "تجهيز مقترح المواد المستقلة وإرساله", s6.json.evaluation?.findings?.map((f: any) => `${f.kind}:${f.code}:${f.title}:${f.detail}`));
  const pr = await respond(noura, p6.proposal.id, 1, [{ opId: "n1", decision: "approve" }, { opId: "n2", decision: "changes" }], "د. نورة خالد", { reason: "place", note: "أفضّل قاعةً أخرى" });
  check(pr.status === 200 && pr.json.proposal.status === "partial", "موافقةٌ على مادة وطلبُ تعديل أخرى = موافقةٌ جزئية", pr.json);
  const c6 = await getP(p6.proposal.id);
  check(c6.commitReadiness.ok === true && c6.commitReadiness.partial === true && c6.commitReadiness.opIds.join() === "n1", "الجاهز للتثبيت هو المادة الموافَق عليها وحدها");
  const d6 = await A("POST", `/api/study-proposals/${p6.proposal.id}/commit`, { rev: c6.proposal.rev, confirm: true });
  const r6 = await rows();
  check(d6.status === 200 && r6.find(r => r.id === f4.id).AdInstructorId === noura.AdInstructorId && r6.find(r => r.id === f5.id).AdInstructorId === placeholder.AdInstructorId, "ثُبّتت المادة الموافَق عليها وبقيت الأخرى لـ«هيئة تدريسية»", d6.json);

  /* ═══ ٧) تغيّر البيانات أثناء انتظار الرد ═══════════════════════════════ */
  const f6 = await makeFaculty("CS315", "606", "S", "17:00", "17:50");
  const p7 = (await newProposal(salem, [opAssign("s1", f6)])).json;
  const sent7 = await sendIt(p7);
  check(sent7.status === 200, "تجهيز مقترحٍ سيتغيّر جدوله", sent7.json.error);
  await respond(salem, p7.proposal.id, 1, [{ opId: "s1", decision: "approve" }], "د. سالم فهد");
  const fresh = (await rows()).find(r => r.id === f6.id);
  const takenBy = base.find(r => r.AdInstructorId !== placeholder.AdInstructorId && r.AdInstructorId !== salemInstructorId)!.AdInstructorId;
  const put = await A("PUT", `/api/schedules/${f6.id}`, { ...fresh, AdInstructorId: takenBy, rev: fresh.rev });
  check(put.status === 200 || put.status === 409, "تُسند الشعبة إلى شخصٍ آخر أثناء الانتظار", put.json.error);
  const c7 = await getP(p7.proposal.id);
  const d7 = await A("POST", `/api/study-proposals/${p7.proposal.id}/commit`, { rev: c7.proposal.rev, confirm: true });
  if (put.status === 200) {
    check(d7.status === 409 && ["proposal-stale", "proposal-blocked"].includes(d7.json.code), "شعبةٌ أُسندت لغيره: التثبيت يُرفض بسببٍ محدد ولا يُنفَّذ بديلٌ صامت", d7.json);
    check((await rows()).find(r => r.id === f6.id).AdInstructorId === takenBy, "لم يُكتب شيء عند رفض التثبيت");
  }

  /* ═══ ٨) الصلاحيات والهوية ═══════════════════════════════════════════════ */
  const role = await http("POST", "/api/demo/role", { role: "dean" }, cookie);
  const ck2 = role.cookie || cookie;
  const deanList = await http("GET", `/api/study-proposals?${SCOPE}`, undefined, ck2);
  const deanCreate = await http("POST", "/api/study-proposals", { requestId: salem.id, ops: [] }, ck2);
  check(deanList.status === 403 && deanCreate.status === 403, "صفةُ اطّلاعٍ (العميد) لا تقرأ المقترحات ولا تنشئها", [deanList.status, deanCreate.status]);
  const back = await http("POST", "/api/demo/role", { role: "admin" }, ck2);
  void back;
  const committee = await http("POST", "/api/demo/role", { role: "committeeChair" }, cookie);
  const ckc = committee.cookie || cookie;
  const asCommittee = await http("GET", `/api/study-proposals?${SCOPE}`, undefined, ckc);
  check(asCommittee.status === 200, "رئيس اللجنة (صلاحية الجداول) يقرأ مقترحات قسمه", asCommittee.status);
  await http("POST", "/api/demo/role", { role: "admin" }, ckc);
  const noToken = await http("GET", "/api/public/request/not-a-token/proposals");
  check(noToken.status === 404 || noToken.status === 410, "رابطٌ غير صالح لا يكشف شيئاً");
  const noAuth = await http("POST", "/api/study-proposals/evaluate", { requestId: salem.id, ops: [] });
  check(noAuth.status === 401 || noAuth.status === 403, "بلا جلسةٍ لا يعمل أيُّ مسارٍ للقسم", noAuth.status);

  /* ═══ ٩) الحوارُ القديم ما زال يعمل ═════════════════════════════════════ */
  const item = (salem.items as any[]).findIndex(i => i.action !== "keep");
  const reply = await A("POST", `/api/instructor-requests/${salem.id}/reply`, { itemIndex: item, text: "هل يناسبك الاثنين والأربعاء؟" });
  check(reply.status === 200, "رسالةٌ نصّية بسيطة في الحوار دون فتح محرر المقترح", reply.json.error);
  const tl = (await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows.find((r: any) => r.id === salem.id).timeline.map((e: any) => e.kind);
  check(tl.includes("study-proposal-sent") && tl.includes("study-proposal-approved") && tl.includes("study-proposal-committed"), "أحداث المقترح تُسجَّل في سجل الحوار نفسه", tl);
  const pub = await http("GET", `/api/public/request/${salem.linkId}`);
  check(pub.status === 200 && pub.json.request, "صفحة الطلب القديمة تعمل مع وجود المقترحات");

  /* ═══ ١٠) الكرت ينبّه، والإشعارات تصل القسم ═════════════════════════════ */
  const live = await http("GET", `/api/public/request/${noura.linkId}/proposals`);
  check(live.status === 200 && Array.isArray(live.json.proposals), "كرت الأستاذ يجلب مقترحاته");
  const bell = await A("GET", "/api/notifications");
  check(bell.status === 200, "الجرس يعمل مع وجود مقترحات", bell.status);

  console.log(`\n${passed} passed, ${failed} failed`);
}

main().catch(error => { console.error(error); failed++; })
  .finally(() => { if (child) child.kill(); setTimeout(() => process.exit(failed ? 1 : 0), 200); });
