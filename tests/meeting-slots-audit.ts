/**
 * ── «متى نلتقي؟» ─────────────────────────────────────────────────────────────
 * 1) المشاركون: بلا «هيئة تدريسية» (placeholderInstructorIds) ولا منتدبين.
 * 2) لا طريق مسدود: نوافذ مرتبة بعدد المتفرغين، ويُسمّى المتعارض، ولكل يوم
 *    أفضل نافذته؛ ونافذة الإجماع أولاً حين توجد.
 * 3) الانشغال من الفصل كله عبر الكليات: الحساب يقرأ كل صف يُمرَّر له، والخادم
 *    يمرّر صفوف الفصل بلا تصفية كلية/قسم.
 */
import fs from "fs";
import path from "path";
import { computeMeetingSlots, meetingParticipants } from "../src/utils/meetingSlots";
import { directoryVisitingIds, termVisitingIds } from "../src/utils/liveVisiting";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

/* 1 — exclusion */
const people = [
  { AdInstructorId: 1, AdInstructorName: "د. أحمد الفيلكاوي" },
  { AdInstructorId: 2, AdInstructorName: "أ. خالد الرشيدي" },
  { AdInstructorId: 3, AdInstructorName: "هيئة تدريسية" },
  { AdInstructorId: 4, AdInstructorName: "د. زائر منتدب" },
  { AdInstructorId: 5, AdInstructorName: "هيئة  تدريسيه - قسم" },
  { AdInstructorId: 6, AdInstructorName: "د. متقاعد", AdInstructorStatus: "retired" },
  { AdInstructorId: 7, AdInstructorName: "د. متفرغ", AdInstructorStatus: "sabbatical" },
];
const shown = meetingParticipants(people, [4]).map(p => p.AdInstructorId);
check(!shown.includes(3) && !shown.includes(5), "«هيئة تدريسية» (بأي رسم) لا تظهر مشاركاً");
check(!shown.includes(4), "المنتدب لا يظهر مشاركاً");
check(!shown.includes(6) && !shown.includes(7), "المتقاعد والمتفرغ لا يظهران مشاركين");
check(shown.includes(1) && shown.includes(2), "من سواهما يبقى — اللقب «أ.» لا يُقرأ تصنيفاً");

/* 1b — visiting is term-wide, independent of the scope on screen */
const affiliations = [
  { collegeId: 1, sectionId: 10, kind: "directory" as const, instructorIds: [4] },
  { collegeId: 1, sectionId: 10, kind: "roster" as const, termId: 7, instructorIds: [4] },
  { collegeId: 2, sectionId: 20, kind: "directory" as const, instructorIds: [6, 8] },
  { collegeId: 2, sectionId: 20, kind: "roster" as const, termId: 7, instructorIds: [6] },
  { collegeId: 2, sectionId: 20, kind: "roster" as const, termId: 6, instructorIds: [8] },
  { collegeId: 2, sectionId: 21, kind: "roster" as const, termId: 7, instructorIds: [9] },
];
const known = (id: number) => id !== 404;
const termVisitors = termVisitingIds(affiliations, 7, known).sort();
check(termVisitors.join(",") === "4,6", "منتدبو الفصل من كل الكليات (4 من الكلية 1، و6 من الكلية 2)");
check(!termVisitors.includes(8), "منتدب فصلٍ آخر لا يُستبعد هذا الفصل");
check(!termVisitors.includes(9), "اسم في الروستر بلا دليل القسم ليس منتدباً (القاعدة نفسها لكل قسم)");
const collegeOnlyRoster = [
  ...people,
  { AdInstructorId: 6, AdInstructorName: "د. منتدب من كلية أخرى" },
];
/* College-only scope (or none): the client holds no section roster, yet the
   term-wide set from the server still removes both visitors. */
const collegeOnly = meetingParticipants(collegeOnlyRoster, termVisitors).map(p => p.AdInstructorId);
check(!collegeOnly.includes(4) && !collegeOnly.includes(6), "نطاق كلية فقط/بلا نطاق: المنتدبون مستبعدون");
check(collegeOnly.includes(1) && collegeOnly.includes(2), "نطاق كلية فقط: البقية باقون");

/* Fixture: 5 people, every one of them busy at some point every day. */
const all = { fsunday: 1, fmonday: 1, ftuesday: 1, fwednesday: 1, fthursday: 1 };
const nameById = new Map([[10, "د. أ"], [11, "د. ب"], [12, "د. ج"], [13, "د. د"], [14, "د. هـ"]]);
const ids = [...nameById.keys()];
const blocking = [
  { AdInstructorId: 10, AdCollegeId: 1, fstarttime: "08:00", fendtime: "12:00", ...all },
  { AdInstructorId: 11, AdCollegeId: 1, fstarttime: "11:00", fendtime: "16:00", ...all },
  { AdInstructorId: 12, AdCollegeId: 1, fstarttime: "15:00", fendtime: "20:00", ...all },
];

/* 2 — ranking, no dead end */
const partial = computeMeetingSlots({ rows: blocking, ids, nameById, duration: 60 });
check(partial.best === null, "لا نافذة إجماع في هذا المثال");
check(partial.ranked.length > 0, "ومع ذلك تُعرض نوافذ مرتبة — لا طريق مسدود");
check(partial.ranked.every((w, i, a) => i === 0 || a[i - 1].free >= w.free), "الترتيب تنازلي بعدد المتفرغين");
check(partial.ranked[0].free === 4 && partial.ranked[0].total === 5 && partial.ranked[0].busy.length === 1, "أفضلها 4 من 5 ويُسمّى المتعارض الوحيد");
check(partial.days.every(day => day.free.length || day.bestPartial), "كل يوم يعرض أفضل نافذته بدل «لا نافذة كاملة»");
check(partial.days.every(day => !day.bestPartial || day.bestPartial.busy.length === day.bestPartial.total - day.bestPartial.free), "أسماء المتعارضين تطابق العدد");

const withRoom = computeMeetingSlots({ rows: blocking.filter(r => r.AdInstructorId !== 11), ids, nameById, duration: 60 });
check(Boolean(withRoom.best) && withRoom.ranked[0].busy.length === 0, "نافذة الإجماع في رأس القائمة حين توجد");
check(withRoom.best?.start === withRoom.ranked[0].start && withRoom.best?.day === withRoom.ranked[0].day, "best هي ranked[0]");

/* 3 — cross-college: a row from another college makes the person busy */
const quiet = computeMeetingSlots({ rows: [], ids: [10, 11], nameById, duration: 60 });
const other = computeMeetingSlots({ rows: [{ AdInstructorId: 11, AdCollegeId: 99, fstarttime: "08:00", fendtime: "20:00", ...all }], ids: [10, 11], nameById, duration: 60 });
check(Boolean(quiet.best), "بلا صفوف: الجميع متفرغ");
check(!other.best && other.ranked[0].busy.includes("د. ب"), "صفّ الأستاذ في كلية أخرى يجعله مشغولاً");

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const route = server.slice(server.indexOf('app.post("/api/schedules/meeting-slots"'), server.indexOf('app.post("/api/schedules", requirePermission(7)'));
check(/getSchedulesByScope\(\{\s*termId\s*\}\)/.test(route), "الخادم يقرأ صفوف الفصل كله (termId فقط، بلا كلية/قسم)");
check(/computeMeetingSlots\(/.test(route) && !/SCHEDULE_DAY_START/.test(route), "الحساب في utils/meetingSlots وحده — لا نسخة ثانية في الخادم");
check(/requirePermission\(7\)/.test(route), "المسار محمي بصلاحية الجدول");
check(!/AdCourseName|AdRoomCode|AdCollegeName/.test(route), "لا يخرج من المسار إلا متفرغ/مشغول — لا مقرر ولا قاعة ولا كلية");
check(/meetingExcludedIds\(termId\)/.test(route) && /participantIds/.test(route), "الخادم هو الحَكَم: يُسقط «هيئة تدريسية» والمنتدبين مما أرسله العميل");
const helper = server.slice(server.indexOf("async function meetingExcludedIds"), server.indexOf('app.post("/api/schedules/meeting-slots"'));
check(/termVisitingIds\(/.test(helper) && /meetingParticipants\(/.test(helper) && !/collegeId|sectionId/.test(helper.replace(/getDelegateAffiliations/, "")), "المستبعدون من الفصل كله بلا كلية/قسم، وبالقاعدة المشتركة");
check(/meeting-participants/.test(helper) && /requirePermission\(7\)/.test(helper), "قائمة المستبعدين للواجهة من الخادم وبصلاحية الجدول");
const live = server.slice(server.indexOf("async function readLiveVisitingRoster"), server.indexOf("async function readLiveVisitingRoster") + 900);
check(/liveVisitingIds\(/.test(live), "readLiveVisitingRoster يسأل القاعدة نفسها (liveVisitingIds) — لا نسخة ثانية");

const ui = fs.readFileSync(path.join(process.cwd(), "src/components/MeetingSlots.tsx"), "utf8");
check(!ui.includes("لا نافذة كاملة"), "الواجهة لا تنتهي بـ«لا نافذة كاملة»");
check(ui.includes("meetingParticipants("), "الواجهة تختار المشاركين بالقاعدة المشتركة");
{
  const dir = directoryVisitingIds([
    { collegeId: 6, sectionId: 7, instructorIds: [50], kind: "directory" },
    { collegeId: 6, sectionId: 7, instructorIds: [51], kind: "roster", termId: 42 },
  ], () => true);
  check(dir.includes(50) && !dir.includes(51), "منتدبٌ في الدليل بلا روستر للفصل يُستبعد (أمثال العيفان)");
  check(/directoryVisitingIds\(/.test(helper), "الخادم يستبعد كل من في دليل المنتدبين");
}
check(ui.includes("/api/schedules/meeting-participants") && !/visitingIds/.test(ui), "الواجهة تأخذ المستبعدين من الخادم لا من اختيار القسم");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
