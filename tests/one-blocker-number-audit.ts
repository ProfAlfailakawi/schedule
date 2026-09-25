/**
 * ── رقمٌ واحدٌ للمانع على الشاشة كلّها ────────────────────────────────────
 *
 * The owner's screen (legacy term) showed three «blocker» numbers at once:
 * the ApprovalBar said «4 تعارضات مادّية», the review said «5 يمنع», the board
 * said «14 مانع اعتماد». The rule now: the headline unit everywhere is the
 * number of blocking conflicts (pairs, `approvalBlockerCount`); where
 * appointments are shown they are `blockingRowIds` of the same list, and say
 * so with their noun. «هيئة تدريسية» is never a double-booked person on any of
 * those surfaces.
 *
 * Behaviour: one fixture — two placeholder pairs, two real hall pairs touching
 * three appointments — read by every surface's function.
 * Structure: each surface derives from those functions and nothing else.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  approvalBlockerCount, approvalBlockerSummary, approvalBlockers, blockingConflicts, blockingRowIds, placeholderInstructorIds,
} from "../src/utils/scheduleBlockers";
import { analyzeSchedule } from "../src/utils/scheduleIntelligence";
import { buildOneMinuteBrief, buildScheduleHealth2, buildSchedulePulse } from "../src/utils/livingSchedule";
import { blockingSummaryPhrase } from "../src/utils/approvalWorkflow";
import { AR, countOf } from "../src/utils/arabicCount";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const row = (id: number, course: number, instructor: number, hall: string, from: string, to: string, extra: Record<string, unknown> = {}) => ({
  id, AdCollegeId: 2, AdSectionId: 3, AdTermId: 1, AdCourseId: course, SCode: String(id),
  AdInstructorId: instructor, fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false,
  fstarttime: from, fendtime: to, AdRoomCode: "B", AdRoomHall: hall, roomId: `room-${hall}`, buildingId: "B",
  locationStatus: "VERIFIED", AdCourseName: `مقرر ${course}`, ...extra,
}) as any;

const PLACEHOLDER = 900;
const instructors = [
  { AdInstructorId: PLACEHOLDER, AdInstructorName: "هيئة تدريسية" },
  { AdInstructorId: 7, AdInstructorName: "د. أستاذ أول" },
  { AdInstructorId: 8, AdInstructorName: "د. أستاذ ثان" },
  { AdInstructorId: 9, AdInstructorName: "د. أستاذ ثالث" },
] as any[];
const placeholders = placeholderInstructorIds(instructors);
const options = { placeholderInstructorIds: placeholders };

/* Two real hall pairs over three appointments: A–B and B–C overlap in hall 101,
   A and C do not meet. Two placeholder pairs: «هيئة تدريسية» in two halls at
   one hour, twice — no person is double-booked. */
const rows = [
  row(1, 100, 7, "101", "08:00", "09:00"),
  row(2, 101, 8, "101", "08:30", "09:30"),
  row(3, 102, 9, "101", "09:15", "10:15"),
  row(4, 103, PLACEHOLDER, "201", "11:00", "12:00"),
  row(5, 104, PLACEHOLDER, "202", "11:00", "12:00"),
  row(6, 105, PLACEHOLDER, "203", "13:00", "14:00"),
  row(7, 106, PLACEHOLDER, "204", "13:00", "14:00"),
];

/* ── Every surface, one fixture ─────────────────────────────────────────── */
const summary = approvalBlockerSummary(rows, rows, options);
check(summary.conflicts === 2 && summary.rows === 3 && summary.rowIds.join() === "1,2,3",
  `شريط الاعتماد: تعارضان يمسّان ثلاثة مواعيد (${JSON.stringify(summary)})`);
check(approvalBlockerCount(rows, rows, options) === summary.conflicts, "والعدد هو approvalBlockerCount نفسه");
check(blockingRowIds(blockingConflicts(rows, rows, options), rows).length === summary.rows, "والمواعيد من القائمة نفسها");
check(blockingSummaryPhrase(summary.conflicts, summary.rows) === `تعارضان مادّيان · تمسّ ${countOf(3, AR.appointment)}`,
  `عبارة الشريط: «${blockingSummaryPhrase(summary.conflicts, summary.rows)}»`);
check(blockingSummaryPhrase(1, 1) === "تعارض مادّي واحد · تمسّ موعد واحد" && blockingSummaryPhrase(11, 0) === "11 تعارضاً مادّياً",
  "والعدد والمعدود صحيحان في الطرفين");

const analysis = analyzeSchedule(rows, rows, [], instructors, options);
check(analysis.metrics.criticalConflicts === 2, `التحليل (لوحة «حالة الجدول»): ${analysis.metrics.criticalConflicts}`);
const pulse = buildSchedulePulse(rows, rows, [], instructors, options);
check(pulse.items.some((item: any) => item.title === countOf(2, AR.approvalBlocker)),
  `نبض اللوحة يقول «${countOf(2, AR.approvalBlocker)}» كالشريط (${pulse.items.map((i: any) => i.title).join(" | ")})`);
check(buildScheduleHealth2(rows, rows, [], instructors, options).readiness === "blocked", "والحالة «محجوب» بالمانعين نفسيهما");
check(buildOneMinuteBrief(rows, rows, [], instructors, undefined, options).topIssues.some((item: any) => item.title === countOf(2, AR.approvalBlocker)),
  "وملخص الدقيقة يقرأ الرقم نفسه");

/* The review's list: the same pairs; the placeholder never a person. */
const instructorName = new Map(instructors.map((i: any) => [Number(i.AdInstructorId), String(i.AdInstructorName)] as [number, string]));
const listed = approvalBlockers(rows, rows, { ...options, instructorName });
check(listed.length === 2 && listed.every(item => item.type !== "instructor"), "قائمة المراجعة: بندان، ولا «حجز مزدوج لأستاذ»");
check(!listed.some(item => item.rowIds.some(id => id >= 4)), "ولا موعدَ لـ«هيئة تدريسية» بين ما يمنع");
check(new Set(listed.flatMap(item => item.rowIds)).size === summary.rows, "وبنودها تمسّ المواعيد الثلاثة نفسها");
/* The client's offline fallback (ScheduleReview localBlockers). */
check(blockingConflicts(rows, rows, { placeholderInstructorIds: placeholderInstructorIds(instructorName.size ? instructors : []) })
  .every(item => item.type !== "instructor"), "والقراءة المحلية في المراجعة لا تجعل «هيئة تدريسية» أستاذاً مزدوجاً");

/* A legacy hall alias: the board must normalise the way the gate does. */
{
  const alias = [row(11, 110, 7, "205", "08:00", "09:00"), row(12, 111, 8, "205-قديم", "08:00", "09:00", { roomId: undefined })];
  const normalizeRow = (r: any) => r.AdRoomHall === "205-قديم" ? { ...r, AdRoomHall: "205", roomId: "room-205" } : r;
  const gate = { ...options, normalizeRow };
  const bar = approvalBlockerSummary(alias, alias, gate);
  const board = buildSchedulePulse(alias, alias, [], instructors, gate);
  check(bar.conflicts === 1 && bar.rows === 2 && board.items.some((item: any) => item.title === countOf(1, AR.approvalBlocker)),
    "القاعة بصيغتها القديمة: الشريط واللوحة يقولان مانعاً واحداً");
}

/* ── STRUCTURE: every surface reads those functions ─────────────────────── */
const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const server = read("server.ts");
const bar = read("src/components/ApprovalBar.tsx");
const review = read("src/components/ScheduleReview.tsx");

check(/async function blockingSummaryFor[\s\S]{0,400}approvalBlockerSummary\(scopeRows, termRows, options\)/.test(server)
  && /blockingConflicts: blocking\.conflicts,[\s\S]{0,200}blockingRows: blocking\.rows,/.test(server),
  "‎/api/approvals يعيد العددين من approvalBlockerSummary");
check(/const conflictList=blockingConflicts\(scopeRows,termRows,await approvalBlockerOptions\(\)\);\s*const touchedRowIds=blockingRowIds\(conflictList,scopeRows\);/.test(server)
  && server.includes("blockingConflicts:conflictList.length,blockingRows:touchedRowIds.length")
  && server.includes("rowIds:pairOwn"),
  "‎/api/schedules/review-readiness يعيد العددين من القائمة نفسها، وقدما الزوج كلتاهما");
const livingRoute = server.slice(server.indexOf('app.get("/api/intelligence/living"'), server.indexOf('app.post("/api/intelligence/why"'));
check(/const blockerOptions = await approvalBlockerOptions\(\);/.test(livingRoute)
  && ["buildSchedulePulse", "buildScheduleHealth2", "buildFragilityMap", "buildConflictTopology", "buildOneMinuteBrief"]
    .every(name => new RegExp(`${name}\\([^;]*blockerOptions\\)`).test(livingRoute)),
  "لوحة «حالة الجدول» تمرّر خيارات البوابة لكل قراءة");
const bareAnalyses = server.split("\n").filter(line => /analyzeSchedule\(/.test(line) && !/import/.test(line) && !/BlockerOptions/.test(line));
check(bareAnalyses.length === 0, `كل analyzeSchedule( في الخادم يمرّر خيارات البوابة (${bareAnalyses.length} بلا خيارات)`);
check(/buildOneMinuteBrief\(rows,universe,courses,instructors,changedSince,await approvalBlockerOptions\(\)\)/.test(server), "وملخص الدقيقة المنفرد كذلك");
check((bar.match(/blockingSummaryPhrase\(blockingConflicts, state\.blockingRows\)/g) || []).length === 2 && !/blockingConflictPhrase\(/.test(bar),
  "الشريط يقول «تعارضات · تمسّ مواعيد» في التوقيع والإرسال");
check(review.includes("blockingSummaryPhrase(blockerSummary.conflicts, blockerSummary.rows)") && review.includes("blockingRowIds(localConflicts, rows)"),
  "نافذة المراجعة تتصدّرها عبارة الشريط نفسها، ومحلياً من الدوال نفسها");
check(review.includes("countOf(spread.high, AR.appointment)") && review.includes("nounFor(spread.high, AR.blockVerb)")
  && !/<small>يمنع<\/small>|<small>سليم<\/small>|<small>يراجَع<\/small>/.test(review) && !/\{spread\.high\} يمنع/.test(review),
  "ومفاتيح الشريط تقول «مواعيد تمنع» بالمعدود، لا رقماً عارياً يُقرأ موانع");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
