/**
 * ── نواقص البيانات إشعارٌ لا مانع (قاعدة المالك 2026-09-27) ───────────────
 * «التوقيع لا يمنعه إلا تعارضٌ ماديّ». جدولٌ ببياناتٍ ناقصة وبلا تعارضٍ يُوقَّع؛
 * وجدولٌ فيه تعارضٌ حقيقي لا يُوقَّع. وعدّ النواقص يُطبّع القاعات النصّية
 * بالتطبيع نفسه الذي تُعدّ به الموانع.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canSign, emptyApproval } from "../src/utils/approvalWorkflow";
import { approvalBlockerSummary } from "../src/utils/scheduleBlockers";
import { computeScheduleDataReadiness } from "../src/utils/scheduleDataReadiness";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const course = { AdCourseId: 5, CourseCode: "C101", CourseName: "مقرر", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 };
const room = (id: string, capacity: number | null) => ({ id, buildingCode: "012", canonicalCode: id.toUpperCase(), capacity });
const row = (id: number, o: Record<string, unknown> = {}) => ({
  id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 5, AdInstructorId: 7, SCode: String(id),
  fsunday: true, ftuesday: true, fstarttime: "08:00", fendtime: "09:15", roomId: "f13", buildingId: "012", AdRoomCode: "012", AdRoomHall: "F13", ...o,
}) as any;
const base = { courses: [course], instructorIds: new Set([7, 8]) };

/* 1) نواقص بلا تعارضٍ ماديّ: يُوقَّع. */
{
  const rows = [row(1, { roomId: "f13" })];
  const gaps = computeScheduleDataReadiness({ ...base, courses: [{ ...course, MaxStudent: 0 }], rows, rooms: [room("f13", null)] });
  const blockers = approvalBlockerSummary(rows, rows, {});
  check(gaps.count > 0 && !gaps.ready, "الجدول فيه بياناتٌ ناقصة (سعة شعبة) — وسعة القاعة لم تعد بنداً");
  check(blockers.conflicts === 0, "ولا تعارضَ ماديّ فيه");
  const verdict = canSign(emptyApproval(1, 5, 20), "committee", { blockingConflicts: blockers.conflicts, blockingDuplicates: blockers.duplicates, rowCount: rows.length });
  check(verdict.ok === true, "نواقصُ البيانات وحدها لا تمنع التوقيع");
}
/* 2) تعارضٌ حقيقي: لا يُوقَّع. */
{
  const rows = [row(1), row(2, { AdInstructorId: 8 })];
  const blockers = approvalBlockerSummary(rows, rows, {});
  const verdict = canSign(emptyApproval(1, 5, 20), "committee", { blockingConflicts: blockers.conflicts, blockingDuplicates: blockers.duplicates, rowCount: rows.length });
  check(blockers.conflicts > 0 && verdict.ok === false && (verdict as any).code === "blocking-conflicts", "تعارضٌ ماديّ (قاعة واحدة في الوقت نفسه) يمنع التوقيع");
}
/* 3) قاعةٌ نصّية تطابق السجل ليست ناقصة؛ المجهولة ناقصة. */
{
  const registry = [room("f13", 40)];
  const normalizeRow = (r: any) => r.roomId || String(r.AdRoomHall) !== "F13" ? r : { ...r, roomId: "f13", locationStatus: "VERIFIED" };
  const textOnly = row(1, { roomId: undefined, buildingId: undefined });
  const unknown = row(2, { roomId: undefined, buildingId: undefined, AdRoomHall: "ZZ99", fstarttime: "10:00", fendtime: "11:15" });
  const without = computeScheduleDataReadiness({ ...base, rows: [textOnly], rooms: registry });
  check(without.items.some(i => i.kind === "location"), "دون تطبيع: الصفّ النصّي يُعدّ ناقصاً (أصل التضخيم)");
  const withNorm = computeScheduleDataReadiness({ ...base, rows: [textOnly], rooms: registry, normalizeRow });
  check(withNorm.ready && withNorm.count === 0, "مع التطبيع: القاعة النصّية المطابقة للسجل ليست ناقصة");
  const both = computeScheduleDataReadiness({ ...base, rows: [textOnly, unknown], rooms: registry, normalizeRow });
  check(both.count === 1 && both.items[0].kind === "location", "والقاعة المجهولة فعلاً تبقى ناقصة");
}
/* 4) البنية: لا بوابة في الخادم، والعدّ يستعمل مطبّع الموانع نفسه. */
{
  const server = readFileSync(join(ROOT, "server.ts"), "utf8");
  const sign = server.slice(server.indexOf('app.post("/api/approvals/sign"'), server.indexOf('app.post("/api/approvals/withdraw"'));
  check(!sign.includes("data-readiness") && !sign.includes("scheduleDataReadiness"), "مسار التوقيع بلا بوابة نواقص");
  const fn = server.slice(server.indexOf("async function scheduleDataReadiness"), server.indexOf('app.get("/api/approvals"'));
  check(fn.includes("normalizeRow: (row: any) => canonicalizeHistoricalLocationForRuntime(row as FSchedule, registry)"), "عدّ النواقص يطبّع الصفوف بمطبّع الموانع نفسه");
  const bar = readFileSync(join(ROOT, "src/components/ApprovalBar.tsx"), "utf8");
  check(!/disabled=\{busy \|\| blockingConflicts > 0 \|\|/.test(bar) && !bar.includes("تمنع التوقيع حتى") && bar.includes("لا تمنع التوقيع"), "زرّ التوقيع لا يُعطَّل بالنواقص والنصّ غير مانع");
  check(bar.includes("canSignNow && blockingConflicts === 0 ?"), "شارة «جاهز للتوقيع» تظهر مع غياب الموانع ولو بقيت نواقص");
  check(!bar.includes('className="apb-room-capacities"'), "لا بطاقات سعةٍ مكرّرة تحت القائمة");
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
