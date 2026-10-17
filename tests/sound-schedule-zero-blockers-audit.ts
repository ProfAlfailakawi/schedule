/**
 * ── جدولٌ سليم يجب أن يقول «صفر موانع» في كل قراءة ─────────────────────────
 *
 * Regression: the schedule page's pressure map counted EVERY finding (a short
 * turnaround, the same section in two distinct halls) as a «conflict», so a
 * sound schedule never read «خالٍ من الموانع». Only `isBlockingConflict`
 * findings are موانع; the rest are advisories, said and never counted.
 *
 * Also covers the pure helpers behind the redesigned overwrite dialog and the
 * dossier's compact day text.
 */
import { approvalBlockerCount, approvalBlockerSummary, approvalBlockers, approvalWarnings, placeholderInstructorIds } from "../src/utils/scheduleBlockers";
import { buildConflictTopology } from "../src/utils/livingSchedule";
import { groupOverwriteChanges } from "../src/utils/scopeOverwriteGroups";
import { compactDays } from "../src/utils/approvalDossier";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const row = (id: number, o: Record<string, unknown> = {}) => ({
  id, AdCollegeId: 2, AdSectionId: 3, AdTermId: 1, AdCourseId: 100 + id, AdCourseName: `مقرر ${id}`, SCode: String(id),
  AdInstructorId: 10 + id, fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false,
  fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "B", AdRoomHall: `H${id}`, roomId: `room-${id}`, buildingId: "B",
  locationStatus: "VERIFIED", ...o,
}) as any;

const PLACEHOLDER = 900;
const instructors = [
  { AdInstructorId: PLACEHOLDER, AdInstructorName: "هيئة تدريسية" },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ AdInstructorId: 10 + i, AdInstructorName: `د. أستاذ ${i}` })),
] as any[];
const placeholders = placeholderInstructorIds(instructors as any);

/* A sound department: nothing physical collides. */
const scope = [
  row(1, { AdInstructorId: PLACEHOLDER }),                       // placeholder teacher...
  row(2, { AdInstructorId: PLACEHOLDER }),                       // ...at the same hour as another placeholder
  row(3, { fstarttime: "09:00", fendtime: "09:50", AdRoomHall: "T1", roomId: "room-T" }),
  row(4, { fstarttime: "10:00", fendtime: "10:50", AdRoomHall: "T1", roomId: "room-T" }), // tight turnaround in one hall
  row(5, { AdCourseId: 105, SCode: "5", fstarttime: "11:00", fendtime: "11:50", AdRoomHall: "H5", roomId: "room-5" }),
  row(6, { AdCourseId: 105, SCode: "5", fstarttime: "11:00", fendtime: "11:50", AdRoomHall: "H6", roomId: "room-6", AdInstructorId: 16 }), // section recorded in two halls: a warning
];
const other = [row(40, { AdSectionId: 4, AdInstructorId: 44, AdRoomHall: "H40", roomId: "room-40" })];
const term = [...scope, ...other];
const options = { placeholderInstructorIds: placeholders };

check(approvalBlockerCount(scope, term, options) === 0, "جدولٌ سليم: صفر موانع اعتماد");
check(approvalBlockers(scope, term, options).length === 0, "ولا بند مانعٍ في القائمة المفصّلة");
const summary = approvalBlockerSummary(scope, term, options);
check(summary.conflicts === 0 && summary.rows === 0, "ولا موعد يقف في مانع");
check(approvalWarnings(scope, term, options).length >= 1, "الشعبة المسجّلة مرتين في قاعتين تُقال تنبيهاً لا مانعاً");

const topology: any = buildConflictTopology(scope, term, [], instructors as any, { placeholderInstructorIds: placeholders } as any);
check(topology.conflicts === 0, "خريطة الضغط: صفر موانع (كانت تعدّ كل تنبيهٍ مانعاً)");
check(topology.advisories >= 1, "والتنبيهات تُعدّ على حدة");

const real = [...scope, row(7, { AdInstructorId: 17, AdRoomHall: "H1", roomId: "room-1" })];
check(approvalBlockerCount(real, real, options) === 1, "التحقق المعاكس: حجز قاعة مزدوج حقيقي يُعدّ مانعاً واحداً");
check((buildConflictTopology(real, real, [], instructors as any, { placeholderInstructorIds: placeholders } as any) as any).conflicts === 1, "وخريطة الضغط تعدّه");

/* The overwrite dialog: a course once, with its section chips. */
const groups = groupOverwriteChanges([
  "عُدّل بعدها: مبادئ الإدارة · شعبة 1", "عُدّل بعدها: مبادئ الإدارة · شعبة 2", "أُضيف بعدها: مبادئ الإدارة · شعبة 3", "حُذف بعدها: التسويق · شعبة 7",
]);
check(groups.length === 2 && groups[0].course === "مبادئ الإدارة" && groups[0].count === 3 && groups[0].sections.length === 3, "حوار المحو: المقرر مرّةً واحدة بأرقام شعبه");
check(groups[1].sections[0].kind === "removed" && groups[1].sections[0].section === "7", "ويحفظ نوع كل تغيير");
check(groupOverwriteChanges([]).length === 0, "ولا مقررات حين لا تغييرات");

check(compactDays("الثلاثاء") === "ث" && compactDays("الأحد والثلاثاء والخميس") === "ح ث خ", "الأيام مختصرةً في الرقاقة");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
