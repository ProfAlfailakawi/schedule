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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
