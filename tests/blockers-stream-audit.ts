/**
 * ── Stream «blockers», B2–B15: each finding held by the smallest check that
 * would fail if the defect came back. Behavioural where the rule lives in a
 * shared module; source-level where it can only live inside a route.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blockingConflicts } from "../src/utils/scheduleBlockers";

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
