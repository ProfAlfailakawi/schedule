/**
 * ── Stream «blockers», B2–B15: each finding held by the smallest check that
 * would fail if the defect came back. Behavioural where the rule lives in a
 * shared module; source-level where it can only live inside a route.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blockingConflicts } from "../src/utils/scheduleBlockers";
import { describeScopeChanges, replacementLoss, scopeBase, scopeFingerprint } from "../src/utils/scopeFingerprint";
import { applyWithOverwriteConfirm, SCOPE_CHANGED_CODE } from "../src/utils/scopeOverwrite";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const server = read("server.ts");
const route = (signature: string) => {
  const at = server.indexOf(signature);
  if (at < 0) return "";
  const next = server.indexOf("\napp.", at + signature.length);
  return server.slice(at, next < 0 ? undefined : next);
};

/* B2 — department balance says whose «all» it is, and counts real halls. */
{
  const balance = route('app.get("/api/reports/department-balance"');
  check(balance.includes("scopeLabel: balanceScopeLabel(req)"), "B2 الميزان يعيد scopeLabel بحسب نطاق القارئ");
  check(/function balanceScopeLabel[\s\S]*?"الجامعة"[\s\S]*?"الكلية"[\s\S]*?"النطاق"/.test(server), "B2 الجامعة/الكلية/النطاق");
  check(balance.includes("verifiedRooms: verifiedRooms.size") && balance.includes("rooms: rooms.size")
    && balance.includes("isInvalidLocationToken(canonical.AdRoomHall)") && balance.includes("roomIdentityKey(canonical)"),
    "B2 القاعات كلها (بعد طيّ الأسماء القديمة وبلا الفراغ و«---») وبجانبها الموثّقة");
}

/* B3 — JSON import reads the whole term, and its new rows can clash with each other. */
{
  const imp = route('app.post("/api/schedules/import",');
  check(imp.includes("Repository.getSchedulesByScope({termId})") && imp.includes("blockingConflicts(staged,termRowsForImport,")
    && !imp.includes("[...existing,...ready]"), "B3 استيراد JSON يُفحص ضد الفصل كله");
  check(imp.includes("ready.map((row:any,index:number)=>({...row,id:-(index+1)}))"), "B3 والصفوف الجديدة بمعرّفات مؤقتة فيتعارض بعضها مع بعض");
}

/* B4 — rows moved together are checked against each other in their NEW places. */
{
  const move = route('app.post("/api/schedules/move-batch"');
  check(move.includes("blockingConflicts(movedRows, movedRows, await approvalBlockerOptions())") && move.indexOf("blockingConflicts(movedRows") < move.indexOf("if (blocked.length)"),
    "B4 النقل الجماعي يفحص المنقولة بعضها مع بعض قبل الكتابة");
  const at = (id: number, hall: string) => ({ id, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: id, SCode: "1", AdInstructorId: id,
    fsunday: true, fstarttime: "10:00", fendtime: "10:50", AdRoomCode: "B", AdRoomHall: hall, roomId: `r-${hall}` });
  const landed = [at(1, "7"), at(2, "7")];
  check(blockingConflicts(landed, landed).length === 1, "B4 صفّان يهبطان في القاعة نفسها والساعة نفسها مانعٌ واحد");
}

/* B5 — a rooms-board drag changes the hall of a verified row. */
{
  const schedules = read("src/components/Schedules.tsx");
  const commit = schedules.slice(schedules.indexOf("const commitRoomMove"), schedules.indexOf("const commitRoomMove") + 9000);
  check(commit.includes("...targetLocation,") && commit.includes("{ buildingId: null, roomId: null, locationStatus: null }"),
    "B5 لوحة القاعات ترسل هوية القاعة الهدف أو تفرّغها صراحةً");
  const move = route('app.post("/api/schedules/move-batch"');
  check(move.includes("if (hallTextChangedWithoutIdentity(originals[index], fields))") && /function hallTextChangedWithoutIdentity[\s\S]*?String\(fields\.roomId\) === String\(original\?\.roomId/.test(server),
    "B5 الخادم يحسم القاعة من اسمها متى تغيّر الاسم وبقي المعرّف القديم");
}

/* B6 — undoing an editor edit restores the whole row, and says so only when it did. */
{
  const schedules = read("src/components/Schedules.tsx");
  const undo = schedules.slice(schedules.indexOf("const runUndoEntry"), schedules.indexOf("const offerUndo"));
  check(undo.includes("undoStepIsPlacementOnly(step.body, currentOf(step))"), "B6 باب النقل للتراجع عن النقل وحده");
  check(undo.includes("{ ...step.body, rev: current.rev }") && undo.includes("تراجعٌ ناقص"), "B6 تعديل المحرّر يُعاد كاملاً بالمراجعة الحالية، والنقص يُقال");
  check(undo.indexOf("تراجعٌ ناقص") < undo.indexOf("setMessage(`تم التراجع"), "B6 «تم التراجع» بعد نجاح كل الخطوات فقط");
  check(/UNDO_PLACEMENT_FIELDS = new Set\(\[[^\]]*"fstarttime"[^\]]*\]\)/.test(schedules) && !/UNDO_PLACEMENT_FIELDS = new Set\(\[[^\]]*"AdInstructorId"/.test(schedules),
    "B6 الأستاذ ليس من حقول الموضع");
}

/* B7 — an empty term is not a dead end: «بداية الفصل» and the data tools are offered on the empty state. */
{
  const schedules = read("src/components/Schedules.tsx");
  const layer = read("src/components/LivingScheduleLayer.tsx");
  check(schedules.includes("(rows.length > 0 || genesisFromEmpty)") && schedules.includes('initialScene={genesisFromEmpty ? "genesis" : null}'),
    "B7 الطبقة الحية تُركَّب لفصلٍ فارغ حين تُطلب بداية الفصل");
  const empty = schedules.slice(schedules.indexOf('title="لا توجد مواعيد ضمن الاختيار الحالي"'), schedules.indexOf('title="لا توجد مواعيد ضمن الاختيار الحالي"') + 3000);
  check(empty.includes("بداية الفصل من الفصل السابق") && empty.includes("setGenesisFromEmpty(true)") && empty.includes("setTransferOpen(true)"),
    "B7 الحالة الفارغة تعرض بداية الفصل وأدوات البيانات");
  check(layer.includes("useState<Scene | null>(initialScene)"), "B7 الطبقة تُفتح على المشهد المطلوب من أول لحظة");
  check(/const onLivingPanelOpenChange = useCallback\(/.test(schedules), "B7 ردّ الإغلاق ثابت الهوية فلا يُغلق المشهد عند كل رسم");
}

/* B8 — genesis refuses archived-curriculum courses exactly like add/copy/import. */
{
  const genesis = route('app.post("/api/intelligence/genesis"');
  check(genesis.includes("await splitArchivedCourseRows(source,sectionId)") && genesis.includes("!archivedCourseIds.has(Number(c.AdCourseId))"),
    "B8 بداية الفصل لا تنسخ مقرراً مؤرشفاً");
  check(genesis.includes("archivedSkipped:archivedSource.length") && genesis.includes("لمقررات مؤرشفة أكاديمياً"), "B8 وتقول كم تركت ولماذا");
  check((server.match(/await splitArchivedCourseRows\(/g) || []).length >= 3, "B8 النسخ ومعاينته وبداية الفصل تقرأ القاعدة نفسها");
}

/* B9 — publish / restore / undo compare the live scope with the base they were built on. */
await (async () => {
  const r = (id: number, course: number, start = "08:00", extra: Record<string, unknown> = {}) => ({ id, AdCourseId: course, SCode: "501", AdInstructorId: 7,
    fsunday: true, fstarttime: start, fendtime: "08:50", AdRoomCode: "B", AdRoomHall: "1", roomId: "r1", ...extra });
  const base = scopeBase([r(1, 10), r(2, 11)]);
  check(scopeFingerprint([r(2, 11), r(1, 10)]) === base.baseFingerprint, "B9 البصمة لا تتأثر بترتيب الصفوف");
  const live = [r(1, 10, "09:00"), r(3, 12)];
  const lines = describeScopeChanges(base.baseSignatures, live, id => ({ 10: "أ", 11: "ب", 12: "ج" } as any)[id]);
  check(lines.length === 3 && lines.some(l => l.startsWith("عُدّل بعدها: أ")) && lines.some(l => l.startsWith("أُضيف بعدها: ج")) && lines.some(l => l.startsWith("حُذف بعدها: ب")),
    "B9 ما تغيّر بعد الأساس يُسمّى: مُعدَّل ومُضاف ومحذوف");
  const sent: string[] = [];
  let asked = 0;
  const refusal = Object.assign(new Error("x"), { data: { code: SCOPE_CHANGED_CODE, error: "تغيّر", changes: ["عُدّل بعدها: أ"] } });
  const ok = await applyWithOverwriteConfirm("restore", async header => { sent.push(header); if (sent.length === 1) throw refusal; return "done"; }, async () => { asked++; return true; });
  check(ok === "done" && asked === 1 && sent.join("|") === "restore|restore, overwrite-newer", "B9 الواجهة تسأل مرة ثم تعيد الطلب بموافقة المحو");
  const declined = await applyWithOverwriteConfirm("publish", async () => { throw refusal; }, async () => false);
  check(declined === null, "B9 والرفض لا يكتب شيئاً");
  const publish = route('app.post("/api/intelligence/drafts/:id/publish"');
  const restore = route('app.post("/api/intelligence/versions/:id/restore"');
  const undo = route('app.post("/api/intelligence/safety-net/:id/undo"');
  for (const [name, body, marker] of [["النشر", publish, "Repository.replaceScheduleScope"], ["الاسترجاع", restore, "Repository.replaceScheduleScope"], ["التراجع", undo, "Repository.replaceScheduleScope"]] as const) {
    const at = body.search(/scopeOverwriteRefusal\(req,/);
    check(at > 0 && at < body.indexOf(marker), `B9 ${name} يقارن بالأساس قبل الاستبدال`);
  }
  check(server.includes('...scopeBase(await Repository.getSchedulesByScope({collegeId,sectionId,termId})),') && server.includes("...scopeBase(targetUniverse.filter("),
    "B9 المسودة تحفظ أساسها لحظة إنشائها");
  check(/response\.once\("finish"[\s\S]{0,300}setScheduleVersionBase\(version\.id, scopeBase\(after\)\)/.test(server), "B9 النسخة تحفظ الجدول كما صار بعد التغيير الذي تحميه");
  const repo = read("src/db/repository.ts");
  check(/setScheduleVersionBase: async[\s\S]{0,400}firestoreDb[\s\S]{0,300}db\.scheduleVersions/.test(repo), "B9 حفظ الأساس يعمل في Firestore وفي العرض التجريبي");
  for (const file of ["src/components/IntelligenceWorkspace.tsx", "src/components/Schedules.tsx", "src/components/LivingScheduleLayer.tsx", "src/components/ScheduleTransfer.tsx"]) {
    const text = read(file);
    check(!/"x-schedule-confirm": "(restore|decision-undo)"/.test(text), `B9 ${file.split("/").pop()} لا يسترجع إلا عبر سؤال المحو`);
  }
})();

/* B10 — the deadline judges the effect of a replacement, not the button. */
{
  const r = (id: number, start: string) => ({ id, AdCourseId: id, SCode: "501", AdInstructorId: 1, fsunday: true, fstarttime: start, fendtime: "09:50", AdRoomCode: "B", AdRoomHall: "1" });
  const live = [r(1, "08:00"), r(2, "08:00"), r(3, "08:00"), r(4, "08:00")];
  check(JSON.stringify(replacementLoss(live, live.map(x => ({ ...x, id: x.id + 100 })))) === JSON.stringify({ deleting: 0, total: 4 }), "B10 إعادة كتابة الصفوف نفسها بمعرّفات جديدة ليست حذفاً");
  check(replacementLoss(live, [live[0], { ...live[1], fstarttime: "09:00" }]).deleting === 3, "B10 ما يُمحى أو يتغيّر يُعدّ");
  const publish = route('app.post("/api/intelligence/drafts/:id/publish"');
  check(publish.includes("replacementWholesaleRefusal(group.scope.collegeId,group.scope.sectionId,draft.AdTermId,group.rows,draftWholesaleKind)")
    && !publish.includes('{kind:"import"});'), "B10 نشر مسودة عادية لا يُرفض بوصفه استيراداً");
  check(route('app.post("/api/intelligence/versions/:id/restore"').includes("replacementWholesaleRefusal(") && route('app.post("/api/intelligence/safety-net/:id/undo"').includes("replacementWholesaleRefusal("),
    "B10 والاسترجاع والتراجع يُقاسان بالقاعدة نفسها");
  check(/kind: "bulk-delete", deleting: loss\.deleting, total: loss\.total/.test(server), "B10 قاعدة الحذف الجماعي موصولة");
}

/* B11 — a registrar note is never closed through the generic comments door. */
{
  const put = route('app.put("/api/intelligence/comments/:scheduleId/:commentId"');
  const guard = put.indexOf('(comment as any).origin==="registrar"'), write = put.indexOf("setScheduleCommentResolved(");
  check(guard > 0 && guard < write && put.includes("getScheduleComments(scheduleId)"), "B11 ملاحظة التسجيل تُردّ قبل أي كتابة، والتعليق يجب أن يخصّ الموعد");
}

/* B12 — an empty scope gets a 200 that points to genesis, and the screens show it. */
{
  for (const path of ["war-room", "autopilot", "auto-schedule"]) {
    const body = route(`app.post("/api/intelligence/${path}"`);
    check(body.includes("res.json(emptyScopeGuidance(") && !/res\.status\(400\)\.json\(\{error:"لا (يوجد جدول|توجد مواعيد)/.test(body), `B12 ${path} يردّ بالطريق لا بخطأ`);
  }
  check(/function emptyScopeGuidance[\s\S]{0,700}kind: "genesis"/.test(server), "B12 والطريق هو بداية الفصل");
  const iw = read("src/components/IntelligenceWorkspace.tsx"), xp = read("src/components/ScheduleExperienceLayer.tsx");
  check(iw.includes("if (d?.empty) { setMessage(d.message); return; }") && iw.includes("if (room?.empty)") && iw.includes("if (plan?.empty)") && xp.includes("if (room?.empty)"),
    "B12 الشاشات تعرض الإرشاد ولا تحاول رسم جدولٍ غير موجود");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
