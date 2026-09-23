/**
 * ── موانعُ الاعتماد في شاشة التغييرات: تفاصيلُ القسم، ولا شيءَ من غيره ─────
 *
 * يُقاس بصفوفٍ من قسمين في كليةٍ واحدة: تعارضُ قاعةٍ داخل القسم يُسمّى بمقرّريه
 * وأستاذيهما، وتعارضُ قاعةٍ مع قسمٍ آخر يُقال عامّاً — ولا يصل منه اسمُ مقرّرٍ
 * ولا أستاذٍ ولا رقمُ صفّه.
 */
import { blockingConflictDetails } from "../src/utils/scheduleBlockers";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const row = (id: number, section: number, course: number, instructor: number, room: string, start = "08:00", end = "08:50") => ({
  id, AdCollegeId: 2, AdSectionId: section, AdTermId: 1, AdCourseId: course, SCode: String(id).padStart(2, "0"),
  AdInstructorId: instructor, fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false,
  fstarttime: start, fendtime: end, AdRoomCode: "B", AdRoomHall: room, roomId: `room-${room}`, buildingId: "B",
});
const mine = [row(1, 3, 100, 7, "205"), row(2, 3, 101, 8, "205"), row(3, 3, 102, 9, "301", "10:00", "10:50")];
const theirs = [row(40, 4, 400, 44, "301", "10:00", "10:50")];
const courseName = new Map([[100, "مبادئ الإدارة"], [101, "السلوك التنظيمي"], [102, "إدارة المشاريع"], [400, "التفكير الريادي"]]);
const instructorName = new Map([[7, "د. خالد ناصر"], [8, "د. مريم علي"], [9, "د. ريم حسن"], [44, "د. أستاذ القسم الآخر"]]);
const blockers = blockingConflictDetails(mine, [...mine, ...theirs], courseName, instructorName);
const payload = JSON.stringify(blockers);

const inside = blockers.find(item => item.rowIds.length === 2);
check(Boolean(inside) && inside!.detail.includes("مبادئ الإدارة") && inside!.detail.includes("السلوك التنظيمي"),
  "تعارضٌ داخل القسم يُسمّى بمقرّريه");
check(Boolean(inside) && inside!.detail.includes("د. خالد ناصر") && inside!.detail.includes("د. مريم علي"),
  "وبأستاذيهما، فلا يُقرأ «المقرر نفسه والمقرر نفسه»");
const outside = blockers.find(item => item.title.includes("خارج هذا القسم"));
check(Boolean(outside) && outside!.rowIds.join() === "3", "تعارضٌ مع قسمٍ آخر يُذكر بموعد هذا القسم وحده");
check(!payload.includes("التفكير الريادي") && !payload.includes("د. أستاذ القسم الآخر") && !payload.includes('"40"') && !/\b40\b/.test(blockers.map(item => item.rowIds.join()).join()),
  "ولا يصل منه اسمُ مقرّرٍ ولا أستاذٍ ولا رقمُ صفّ من القسم الآخر");
check(blockers.length === 2, "ولا يُعدّ التعارضُ الواحد مرّتين");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
