/**
 * ── تدقيق تقرير التغييرات والملاحظة على الخانة ──────────────────────────────
 *
 * هذا التقرير هو ما يفتحه موظّف التسجيل عشرين مرّة في اليوم. وخطأٌ فيه ليس
 * خطأً في شاشة: هو أن يُقال له «تغيّرت» عمّا لم يتغيّر — فيفقد الثقة في
 * التقرير كله ويعود يقرأ الجدول من أوّله، وهو ما بُني التقرير ليُغنيه عنه.
 */

import fs from "fs";
import path from "path";
import { DIFF_FIELD_LABEL, daysText, diffSchedules, fieldValue, summarizeDiff } from "../src/utils/scheduleDiff";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 1, AdCollegeId: 1, AdSectionId: 5, AdTermId: 20,
  AdCourseId: 100, AdCourseName: "تفاضل وتكامل", SCode: "01", AdInstructorId: 7,
  fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false,
  fstarttime: "08:00", fendtime: "09:30", AdRoomCode: "أ", AdRoomHall: "101",
  ...over,
}) as any;

const names = {
  instructorById: new Map([[7, "د. سارة"], [8, "د. خالد"]]),
  courseById: new Map([[100, "تفاضل وتكامل"], [200, "جبر خطّي"]]),
};

/* ── لا تغييرَ زائف ──────────────────────────────────────────────────────── */

const same = diffSchedules([row()], [row()], names);
check(same.counts.changed === 0 && same.counts.unchanged === 1, "جدولٌ لم يُمسّ لا يُبلَّغ عنه");
check(same.entries.length === 0, "التقرير يعرض ما تحرّك فقط، لا الجدول كله");
check(summarizeDiff(same) === "لم يتغيّر شيء منذ مراجعتك", "«لم يتغيّر شيء» جوابٌ كامل يُقال صراحة");

/* أخطر ما في المقارنة: اختلاف صيغة الكتابة عن صيغة القراءة. */
const clockShapes = diffSchedules([row({ fstarttime: "8:00", fendtime: "9:30" })], [row({ fstarttime: "08:00", fendtime: "09:30" })], names);
check(clockShapes.counts.changed === 0, "«8:00» و«08:00» وقتٌ واحد: لا تغييرَ من صيغةٍ لا من قيمة");

const roomShapes = diffSchedules([row({ AdRoomCode: "أ", AdRoomHall: "101" })], [row({ AdRoomCode: "أ", AdRoomHall: "101" })], names);
check(roomShapes.counts.changed === 0, "القاعة نفسها لا تُبلَّغ");

/* ── ما تغيّر يُقال بخانته وبقيمتيه ────────────────────────────────────── */

const movedRoom = diffSchedules([row()], [row({ AdRoomHall: "205" })], names);
check(movedRoom.counts.changed === 1, "تغيير القاعة يُلتقط");
check(movedRoom.entries[0].changes.length === 1, "خانةٌ واحدة تغيّرت، فخانةٌ واحدة تُعرض — لا الصفّ كله");
check(movedRoom.entries[0].changes[0].field === "room", "الخانة تُسمّى بنفسها");
check(movedRoom.entries[0].changes[0].before === "أ / 101" && movedRoom.entries[0].changes[0].after === "أ / 205",
  "القيمة قبلُ وبعدُ معاً: «من ماذا إلى ماذا» هو السؤال دائماً");

const movedTime = diffSchedules([row()], [row({ fstarttime: "10:00", fendtime: "11:30" })], names);
check(movedTime.entries[0].changes[0].after === "10:00 – 11:30", "الوقت يُعرض مدىً مقروءاً");

const swappedInstructor = diffSchedules([row()], [row({ AdInstructorId: 8 })], names);
check(swappedInstructor.entries[0].changes[0].before === "د. سارة" && swappedInstructor.entries[0].changes[0].after === "د. خالد",
  "الأستاذ يُعرض باسمه لا برقمه: التقرير يُقرأ لا يُفكّ");

const noName = diffSchedules([row()], [row({ AdInstructorId: 99 })], { instructorById: new Map(), courseById: new Map() });
check(noName.entries[0].changes[0].after.includes("99"), "أستاذٌ بلا اسمٍ مسجّل يُعرض برقمه لا فراغاً");

const dropped = diffSchedules([row()], [row({ AdInstructorId: 0 })], names);
check(dropped.entries[0].changes[0].after === "بدون أستاذ", "الشعبة التي فقدت أستاذها تقولها صراحة");

const multi = diffSchedules([row()], [row({ AdRoomHall: "205", fstarttime: "10:00", fendtime: "11:30", AdInstructorId: 8 })], names);
check(multi.entries[0].changes.length === 3, "ثلاث خاناتٍ تغيّرت فثلاثٌ تُعرض");
check(new Set(multi.entries[0].changes.map(change => change.field)).size === 3, "لا تكرار في الخانات المعروضة");

/* ── المضاف والمحذوف ───────────────────────────────────────────────────── */

const added = diffSchedules([row()], [row(), row({ id: 2, SCode: "02" })], names);
check(added.counts.added === 1 && added.counts.unchanged === 1, "الشعبة المضافة تُلتقط وحدها");
check(added.entries[0].kind === "added" && added.entries[0].scheduleId === 2, "المضاف يُعرف بمعرّفه");

const removed = diffSchedules([row(), row({ id: 2, SCode: "02" })], [row()], names);
check(removed.counts.removed === 1, "الشعبة المحذوفة تُلتقط");
check(removed.entries[0].kind === "removed", "المحذوف يُعرض أولاً: الصفّ المضاف يراه الناظر في الجدول، والمحذوف لا أثر له فيه");
check(removed.entries[0].row.SCode === "02", "المحذوف يُعرض بما كان عليه قبل حذفه");

const mixed = diffSchedules(
  [row(), row({ id: 2, SCode: "02" }), row({ id: 3, SCode: "03" })],
  [row({ AdRoomHall: "205" }), row({ id: 3, SCode: "03" }), row({ id: 4, SCode: "04" })],
  names,
);
check(mixed.counts.added === 1 && mixed.counts.removed === 1 && mixed.counts.changed === 1 && mixed.counts.unchanged === 1,
  "الأنواع الأربعة تُحصى معاً بلا تداخل");
check(mixed.entries[0].kind === "removed" && mixed.entries[mixed.entries.length - 1].kind === "changed",
  "الترتيب كما يُقرأ: محذوفٌ ثم مضافٌ ثم معدّل");
check(summarizeDiff(mixed) === "1 مضاف · 1 محذوف · 1 معدّل", "السطر الملخّص يقول الثلاثة بترتيبٍ ثابت");

/* ── أول مراجعة ────────────────────────────────────────────────────────── */

const first = diffSchedules(undefined, [row(), row({ id: 2 })], names);
check(first.firstReview && first.counts.added === 2, "أول مراجعةٍ: كل صفٍّ مضاف — وهذا صحيحٌ منطقياً لا استثناء");
check(summarizeDiff(first).includes("جدولٌ جديد"), "أول مراجعةٍ تُسمّى باسمها لا تُعرض «٤٠ مضافاً»");
check(diffSchedules([], [row()], names).firstReview, "قائمةٌ فارغة كغيابها");
check(!diffSchedules([row()], [row()], names).firstReview, "أساسٌ موجود ليس أول مراجعة");

const emptied = diffSchedules([row(), row({ id: 2 })], [], names);
check(emptied.counts.removed === 2, "جدولٌ أُفرغ: كل صفٍّ محذوف — وهو أهمّ تقريرٍ ممكن");

/* ── العرض ─────────────────────────────────────────────────────────────── */

check(daysText(row()) === "ح ث", "الأيام حروفٌ تُقرأ لا أرقامٌ تُفكّ");
check(daysText(row({ fsunday: true, fmonday: true, ftuesday: true, fwednesday: true, fthursday: true })) === "ح ن ث ر خ", "الأسبوع كامل بترتيبه");
check(fieldValue(row({ fsunday: false, ftuesday: false }), "days") === "—", "خانةٌ بلا قيمةٍ تُعرض شرطةً لا فراغاً");
check(Object.keys(DIFF_FIELD_LABEL).length === 6, "ست خاناتٍ تُقارَن");
check(Object.values(DIFF_FIELD_LABEL).every(label => /[؀-ۿ]/.test(label)), "كل خانةٍ لها اسمٌ عربي");

/* ── ما رُكّب في الخادم ────────────────────────────────────────────────── */

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
check(server.includes('app.get("/api/reports/schedule-changes"'), "تقرير التغييرات له مسار");
check(server.includes('app.get("/api/approvals/inbox"'), "صندوق الوارد له مسار");
check(server.includes("diffSchedules(baselineVersion?.rows"), "المقارنة بآخر نسخةٍ رآها التسجيل، لا بملفّ الاعتماد");
check(server.includes("noteFieldValue"), "قيمة الخانة تُلتقط لحظة الملاحظة");
check(server.includes('function noteState'), "حالة الملاحظة تُحسب من الواقع");
check(server.includes('return noteFieldValue(row, field) !== String(note.valueAtNote ?? "") ? "changed" : "open";'),
  "«عُولجت» تُستنتج من تغيّر الخانة، فلا يمكن أن تُدّعى وهي على حالها");
check(server.includes('app.post("/api/schedule-notes/:id/rebut"'), "ردّ القسم على الملاحظة له مسار");
check(server.includes("اكتب سبب الإبقاء"), "الردّ بلا سببٍ مرفوض");
check(server.includes('app.post("/api/schedule-notes/:id/verdict"'), "قرار التسجيل على الردّ له مسار");
check(server.includes('rebuttalVerdict: "insisted", rebuttal: undefined'),
  "الإصرار يمحو الردّ: الخانة تعود برتقاليةً تنتظر، لا رماديةً أُجيب عنها");

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
