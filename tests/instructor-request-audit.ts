/**
 * ── تدقيق حُكم طلب الأستاذ ──────────────────────────────────────────────────
 *
 * هذا المحرّك هو الشيء الوحيد الذي يقف بين الأستاذ وبين إرسال طلبٍ لا يجوز.
 * وخطؤه نوعان، وكلاهما مكلف: أن يمنع ما يجوز فيتّصل الأستاذ بالقسم ويُبطَل
 * الغرضُ من الرابط كلّه، أو أن يُمرّر ما لا يجوز فيصل القسمَ طلبٌ يبدو سليماً
 * وليس كذلك — وهذا أسوأ، لأنه يُثبَّت.
 *
 * وما يلي برهانُ الحالتين، ومعهما ثلاثةُ حدودٍ اتُّفق عليها صراحةً ويسهل أن
 * تُنسى عند أول تعديل: أن اللائحة تُلزم الأستاذ ولا تُلزم اللجنة، وأن الصفَّ
 * الذي لم يُمسّ لا يُحاسَب عليه أحد، وأن اسم القاعة لا يصل الأستاذ.
 */

import {
  describeRequest, endForRequest, judgeRequest, rowFromRequest, weeklyLoadOf,
  type RequestedRow, type VerdictContext,
} from "../src/utils/instructorRequestVerdict";
import { roomKeyOf } from "../src/utils/locationRegistry";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const TEACHER = 7, OTHER = 8;

const row = (over: Partial<FSchedule> = {}): FSchedule => ({
  id: 1, AdCollegeId: 1, AdSectionId: 5, AdTermId: 20,
  AdCourseId: 100, AdCourseName: "تفاضل", SCode: "01", AdInstructorId: TEACHER,
  fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
  fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "أ", AdRoomHall: "101",
  ...over,
} as FSchedule);

const course = (id: number, hours = 1): AdCourse => ({
  AdCourseId: id, AdCollegeId: 1, AdSectionId: 5,
  CourseCode: `C${id}`, CourseName: `مقرر ${id}`,
  CourseCredit: hours, CourseHours: hours, MaxStudent: 25,
} as AdCourse);

const teacher = (id: number): AdInstructor => ({
  AdInstructorId: id, AdInstructorCivil: `${id}`.padStart(12, "0"),
  AdInstructorName: `د. ${id}`, AdInstructorMobile: "50000000",
} as AdInstructor);

const context = (over: Partial<VerdictContext> = {}): VerdictContext => ({
  instructorId: TEACHER,
  allRows: [row()],
  instructorRowsAfter: [row()],
  courses: new Map([[100, course(100)], [200, course(200)]]),
  instructors: new Map([[TEACHER, teacher(TEACHER)], [OTHER, teacher(OTHER)]]),
  knownRoomKeys: [],
  startLadder: ["08:00", "09:00", "10:00", "11:00"],
  ...over,
});

const ask = (over: Partial<RequestedRow> = {}): RequestedRow => ({
  rowId: 1, action: "change", AdCourseId: 100, days: ["fsunday"], start: "10:00", ...over,
});

/* ── النهاية تُحسب ولا تُسأل ────────────────────────────────────────────── */

check(endForRequest(["fsunday"], "08:00") === "08:50", "الأحد خمسون دقيقة");
check(endForRequest(["fthursday"], "08:00") === "08:50", "الخميس خمسون دقيقة");
check(endForRequest(["fmonday"], "08:00") === "09:20", "الاثنين ثمانون دقيقة");
check(endForRequest(["fwednesday"], "10:00") === "11:20", "الأربعاء ثمانون دقيقة");
/* أيامٌ مختلطةٌ لا مدّةَ واحدةَ لها، فتُؤخذ الأطولُ ولا يُخترع رقمٌ وسط. */
check(endForRequest(["fsunday", "fmonday"], "08:00") === "09:20", "الأيام المختلطة تأخذ الأطول لا معدّلاً مخترعاً");
check(endForRequest([], "08:00") === "", "بلا يومٍ لا نهاية");
check(endForRequest(["fsunday"], "") === "", "بلا بدايةٍ لا نهاية");

/* ── الصفُّ الذي لم يُمسّ ───────────────────────────────────────────────── */

const kept = judgeRequest(ask({ action: "keep" }), context());
check(kept.kind === "clear", "«أبقِه كما هو» يمرّ دائماً");
check(kept.sendable && !kept.needsExcuse, "ولا يُطلب له سببُ استثناء");
check(kept.roomAvailable === null, "ولا يُسأل عن قاعةٍ لصفٍّ لم يتحرّك");

/* والحدُّ الذي يسهل نسيانه: يمرّ حتى لو كان جدولُ الأستاذ كلُّه يخالف اللائحة،
   لأن من وضعه هو صاحبُ الاستثناء فيه — ومنعُ الأستاذ من قبول جدولٍ كتبه القسم
   عبثٌ يدفعه إلى الهاتف. */
const crowded = [
  row({ id: 1, fstarttime: "08:00", fendtime: "08:50" }),
  row({ id: 2, AdCourseId: 200, fstarttime: "09:00", fendtime: "09:50" }),
  row({ id: 3, AdCourseId: 100, fstarttime: "10:00", fendtime: "10:50" }),
  row({ id: 4, AdCourseId: 200, fstarttime: "11:00", fendtime: "11:50" }),
];
check(judgeRequest(ask({ action: "keep" }), context({ allRows: crowded, instructorRowsAfter: crowded })).sendable,
  "الإبقاء لا يُمنع ولو خالف جدولُ القسم اللائحة");

/* ── الحذف ─────────────────────────────────────────────────────────────── */

const deleted = judgeRequest(ask({ action: "delete" }), context());
check(deleted.kind === "clear" && deleted.sendable, "الحذف لا يصطدم بشيء: إخلاءُ موضعٍ لا يشغل أحداً");
check(deleted.roomAvailable === null, "ولا قاعةَ تُسأل في الحذف");

/* ── الشكل ─────────────────────────────────────────────────────────────── */

check(!judgeRequest(ask({ days: [] }), context()).sendable, "بلا يومٍ لا يُرسل");
check(!judgeRequest(ask({ start: "" }), context()).sendable, "بلا بدايةٍ لا يُرسل");
check(!judgeRequest(ask({ days: ["fmonday"], start: "19:30" }), context()).sendable,
  "محاضرةٌ تتجاوز نهاية اليوم الدراسي تُمنع");
const mixedDays = judgeRequest(ask({ days: ["fsunday", "fmonday"] }), context());
check(mixedDays.kind === "exception" && mixedDays.sendable,
  "الأيام المختلطة تُنبّه ولا تمنع — قد يكون توزيعاً مقصوداً");

/* ── الأستاذ لا يكون في مكانين ─────────────────────────────────────────── */

const busy = [row({ id: 1 }), row({ id: 2, AdCourseId: 200, fstarttime: "10:00", fendtime: "10:50" })];
const selfClash = judgeRequest(ask(), context({ allRows: busy, instructorRowsAfter: busy }));
check(!selfClash.sendable, "الأستاذ لا يُحجز في قاعتين في الساعة نفسها");
check(selfClash.reasons.some(reason => reason.source === "instructor"), "ويُقال له السبب: لديك محاضرةٌ أخرى");

/* وصفُّه هو لا يُحسب تعارضاً مع نفسه حين يُحرَّك. */
const moveSelf = judgeRequest(ask({ rowId: 2 }), context({
  allRows: [row({ id: 2, fstarttime: "10:00", fendtime: "10:50" })],
  instructorRowsAfter: [row({ id: 2, fstarttime: "10:00", fendtime: "10:50" })],
}));
check(moveSelf.sendable, "الصفّ لا يتعارض مع نفسه حين يُنقل");

/* ── طلبةٌ مشتركون ─────────────────────────────────────────────────────── */

const cohortRows = [row({ id: 1 }), row({ id: 9, AdCourseId: 200, AdInstructorId: OTHER, fstarttime: "10:00", fendtime: "10:50" })];
const cohort = judgeRequest(ask(), context({
  allRows: cohortRows, instructorRowsAfter: [row({ id: 1 })],
  cohortPairs: new Set(["100|200"]),
}));
check(!cohort.sendable, "التقاطع مع مقرّرٍ يشترك طلبتُه يمنع");
check(cohort.reasons.some(reason => reason.source === "cohort"), "ويُسمّى السببُ باسمه");
/* ولا يُسمّى المقرّرُ الآخر: الأستاذ لا يحتاج اسمه ليغيّر وقته، وتسميتُه تكشف
   جدولَ قسمٍ آخرَ لمن لا شأن له به. */
check(!cohort.reasons.some(reason => reason.text.includes("200") || reason.text.includes("مقرر 200")),
  "ولا يُكشف اسمُ المقرّر الآخر ولا رقمه");

const noSurvey = judgeRequest(ask(), context({ allRows: cohortRows, instructorRowsAfter: [row({ id: 1 })] }));
check(noSurvey.sendable, "قسمٌ بلا استبيانٍ يرى ما كان يراه تماماً — لا قيدَ مخترع");

/* ── القاعة: كلمةٌ واحدةٌ للأستاذ، ومرشّحاتٌ للقسم ──────────────────────── */

const ROOM_A = roomKeyOf(undefined, "أ", "101"), ROOM_B = roomKeyOf(undefined, "أ", "102");
const free = judgeRequest(ask(), context({ knownRoomKeys: [ROOM_A, ROOM_B] }));
check(free.roomAvailable === true, "القاعة متاحةٌ فيُقال «متاح»");
check(free.sendable && free.kind === "clear", "ويمضي الطلب");

const takenRows = [
  row({ id: 1 }),
  row({ id: 20, AdInstructorId: OTHER, AdCourseId: 200, AdRoomCode: "أ", AdRoomHall: "101", fstarttime: "10:00", fendtime: "10:50" }),
  row({ id: 21, AdInstructorId: OTHER, AdCourseId: 200, AdRoomCode: "أ", AdRoomHall: "102", fstarttime: "10:00", fendtime: "10:50" }),
];
const taken = judgeRequest(ask(), context({ allRows: takenRows, knownRoomKeys: [ROOM_A, ROOM_B] }));
check(taken.roomAvailable === false, "كلُّ القاعات مشغولةٌ فيُقال «غير متاح»");
check(!taken.sendable, "ولا يُرسل طلبٌ لا قاعةَ له");

/* الحدُّ الذي اتُّفق عليه: أيُّ قاعةٍ بعينها لا تصل الأستاذ. */
check(!taken.reasons.some(reason => reason.text.includes("101") || reason.text.includes("102")),
  "ولا يُذكر للأستاذ اسمُ قاعةٍ في أيِّ سبب");
check(!taken.reasons.some(reason => reason.text.includes("د. 8")),
  "ولا اسمُ من يشغلها");

/* والقسم يرى المرشّحات كاملةً — وهي الفرقُ بين الشاشتين. */
const onlyOneFree = [
  row({ id: 1 }),
  row({ id: 20, AdInstructorId: OTHER, AdCourseId: 200, AdRoomCode: "أ", AdRoomHall: "101", fstarttime: "10:00", fendtime: "10:50" }),
];
const partial = judgeRequest(ask(), context({ allRows: onlyOneFree, knownRoomKeys: [ROOM_A, ROOM_B] }));
check(partial.roomCandidates.includes(ROOM_B) && !partial.roomCandidates.includes(ROOM_A),
  "المرشّحات للقسم: الحرّةُ فيها والمشغولةُ خارجَها");
check(partial.roomAvailable === true, "ووجودُ قاعةٍ واحدةٍ حرّة يكفي لأن يُقال «متاح»");

/* الفاصلُ المقرَّر محسوب: قاعةٌ تنتهي محاضرتُها العاشرةَ إلا عشراً ليست حرّةً
   في العاشرة تماماً يومَ أحد. */
const tightRows = [
  row({ id: 1 }),
  row({ id: 30, AdInstructorId: OTHER, AdCourseId: 200, AdRoomCode: "أ", AdRoomHall: "101", fstarttime: "09:15", fendtime: "09:55" }),
];
const tight = judgeRequest(ask(), context({ allRows: tightRows, knownRoomKeys: [ROOM_A] }));
check(tight.roomAvailable === false, "الفاصل بين محاضرتين في القاعة الواحدة محسوب، لا مُهمَل");

/* وقاعةٌ واحدةٌ بصيغتين هي قاعةٌ واحدة: المقارنةُ بالهويّة لا بالنصّ. */
const spaced = [
  row({ id: 1 }),
  row({ id: 31, AdInstructorId: OTHER, AdCourseId: 200, AdRoomCode: " أ ", AdRoomHall: " 101 ", fstarttime: "10:00", fendtime: "10:50" }),
];
check(judgeRequest(ask(), context({ allRows: spaced, knownRoomKeys: [ROOM_A] })).roomAvailable === false,
  "«أ/101» و« أ / 101 » قاعةٌ واحدة، فلا تُعلن حرّيةُ قاعةٍ مشغولة");

/* قسمٌ لم يسجّل قاعاتِه لا يُدّعى له جواب. */
check(judgeRequest(ask(), context({ knownRoomKeys: [] })).roomAvailable === null,
  "بلا قاعاتٍ مسجّلة لا يُقال «متاح» ولا «غير متاح»");

/* ── البدائل ───────────────────────────────────────────────────────────── */

check(taken.nearestTimes.length > 0, "حين يُمنع الطلب تُعرض أقربُ الأوقات");
check(taken.nearestTimes.every(slot => slot.end === endForRequest([slot.day], slot.start)),
  "وكلُّ بديلٍ نهايتُه محسوبةٌ بلائحة يومه");
check(taken.nearestTimes.length <= 3, "ثلاثةٌ على الأكثر: قائمةٌ طويلةٌ قرارٌ لا اقتراح");
check(!taken.nearestTimes.some(slot => slot.start === "10:00"), "ولا يُقترح الوقتُ المرفوض نفسه");

/* البديل خالٍ من كل شيء لا من القاعة وحدها: موضعٌ يُصلح شيئاً ويكسر آخرَ ليس
   بديلاً، لأن أحداً سيعمل به. */
const busyLadder = [
  row({ id: 1 }),
  row({ id: 40, AdInstructorId: OTHER, AdCourseId: 200, AdRoomCode: "أ", AdRoomHall: "101", fstarttime: "10:00", fendtime: "10:50" }),
  row({ id: 41, AdCourseId: 200, AdRoomCode: "ب", AdRoomHall: "201", fstarttime: "09:00", fendtime: "09:50" }),
];
/* `instructorRowsAfter` صارت حاملةً للمعنى: هي جدولُ الأستاذ بعد الحزمة، فما
   لم يُذكر فيها ليس له. فتُذكر محاضرتُه التاسعةَ التي لم يطلب تغييرها. */
const alternatives = judgeRequest(ask(), context({
  allRows: busyLadder, knownRoomKeys: [ROOM_A],
  instructorRowsAfter: [row({ id: 1 }), row({ id: 41, AdCourseId: 200, AdRoomCode: "ب", AdRoomHall: "201", fstarttime: "09:00", fendtime: "09:50" })],
}));
check(!alternatives.nearestTimes.some(slot => slot.start === "09:00"),
  "ولا يُقترح وقتٌ الأستاذُ نفسه مشغولٌ فيه");

/* بلا سُلّمِ بداياتٍ معروفٍ لا يُقترح شيء: ساعةٌ لا يدرّس فيها أحدٌ أسوأُ من
   الصمت، لأن أحداً سيعمل بها. */
check(judgeRequest(ask(), context({ allRows: takenRows, knownRoomKeys: [ROOM_A, ROOM_B], startLadder: [] })).nearestTimes.length === 0,
  "بلا سُلّمِ بداياتٍ لا تُخترع ساعة");

/* ── النافذة ───────────────────────────────────────────────────────────── */

const closed = judgeRequest(ask(), context({ windowOpen: false }));
check(!closed.sendable, "خارج نافذة الطلبات لا يُقبل شيء");
check(closed.reasons.some(reason => reason.source === "window"), "ويُقال السببُ صراحة");
check(closed.reasons.length === 1, "ولا تُكدَّس عليه أسبابٌ لا معنى لها بعد الإغلاق");

/* ── بناءُ الصفّ ───────────────────────────────────────────────────────── */

const built = rowFromRequest(ask({ days: ["fmonday"], start: "09:00" }), { AdInstructorId: TEACHER });
check(built.fendtime === "10:20", "الصفُّ المبنيُّ نهايتُه محسوبة");
check(built.fmonday === true && built.fsunday === false, "وأيامُه هي المطلوبة وحدها");
check(rowFromRequest(ask({ rowId: null, action: "add" }), {}).id === -1,
  "الإضافةُ تُبنى بمعرّفٍ غيرِ موجود، فلا تُطابق صفّاً قائماً");

/* ── سطر الحزمة ────────────────────────────────────────────────────────── */

check(describeRequest([]).includes("لا تعديلات"), "حزمةٌ بلا تعديلاتٍ تُقال صراحة");
const line = describeRequest([free, taken, mixedDays]);
check(line.includes("بلا تعارض") && line.includes("يحتاج استثناءً") && line.includes("متعارض"),
  "والسطرُ يفصل الأصنافَ الثلاثة");
check(/^\S*\s*3|ثلاث/.test(line) || line.includes("3"), "ويبدأ بالعدد الكلّي، فلا رقمَ بلا قاعدته");


/* ── أربعةُ أعطالٍ كشفتها مراجعةٌ آلية على العمل نفسه ───────────────────── */

/* ١) اليومُ الدراسيُّ له أوّلٌ كما له آخِر. كان الفحصُ يحرس آخِرَه وحده، فموعدٌ
      السابعةَ صباحاً يمرّ سليماً — ثم لا يجد البحثُ عن البدائل موضعاً له، لأن
      سُلّمَ البدايات يبدأ من الثامنة. */
check(!judgeRequest(ask({ start: "07:00" }), context()).sendable,
  "موعدٌ قبل بداية اليوم الدراسي يُمنع");
check(judgeRequest(ask({ start: "07:00" }), context()).reasons.some(r => r.text.includes("قبل بداية اليوم")),
  "ويُقال السببُ صراحة");
check(judgeRequest(ask({ start: "08:00" }), context()).sendable, "وأوّلُ اليوم نفسُه مقبول");

/* والصيغةُ تُتحقَّق قبل القياس: `toMinutes` تقرأ ما ليس وقتاً صفراً، فنصٌّ
   حرٌّ كان يصير منتصفَ الليل ويمرّ بقيّةَ الفحوص كأنه موعدٌ صحيح. */
check(!judgeRequest(ask({ start: "صباحاً" as any }), context()).sendable, "ونصٌّ ليس وقتاً يُردّ");
check(!judgeRequest(ask({ start: "8" as any }), context()).sendable, "ورقمٌ بلا دقائق يُردّ");

/* ٢) الملاحظةُ اللائحية تُنسب إلى الصفّ المطلوب وحدَه: أستاذٌ يدرّس شعبتين من
      مقرّرٍ واحد كانت ملاحظةٌ تخصّ شعبةً لم يمسّها تُعلَّق على التي عدّلها. */
const twoSections = [
  row({ id: 1, SCode: "01", fstarttime: "10:00", fendtime: "10:50" }),
  row({ id: 2, SCode: "02", fstarttime: "12:00", fendtime: "12:50" }),
];
const onlyOther = judgeRequest(ask({ rowId: 1 }), context({ allRows: twoSections, instructorRowsAfter: twoSections }));
check(onlyOther.reasons.every(reason => reason.source !== "regulation" || (reason.article || "").length > 0),
  "كلُّ ملاحظةٍ لائحيةٍ تحمل مادّتها");

/* ٣) الحزمةُ تُقاس على نفسها: نقلُ محاضرتين إلى الساعة نفسها لا يصطدم في
      الجدول القديم، لأن أيّاً منهما لم تكن هناك بعد. */
const packageAfter = [
  row({ id: 1, fstarttime: "10:00", fendtime: "10:50" }),
  row({ id: 2, AdCourseId: 200, fstarttime: "10:00", fendtime: "10:50" }),
];
const packageBefore = [
  row({ id: 1, fstarttime: "08:00", fendtime: "08:50" }),
  row({ id: 2, AdCourseId: 200, fstarttime: "12:00", fendtime: "12:50" }),
];
const inPackage = judgeRequest(ask({ rowId: 1 }), context({
  allRows: packageBefore, instructorRowsAfter: packageAfter,
}));
check(!inPackage.sendable, "بندٌ يصطدم ببندٍ آخرَ في حزمته يُمنع");
check(inPackage.reasons.some(reason => reason.source === "instructor"),
  "ويُقال إنه تعارضٌ مع محاضرةٍ أخرى له");

/* وصفُّه هو لا يُحسب تعارضاً مع نفسه في الأسبوع الجديد. */
const aloneAfter = [row({ id: 1, fstarttime: "10:00", fendtime: "10:50" })];
check(judgeRequest(ask({ rowId: 1 }), context({ allRows: [row({ id: 1 })], instructorRowsAfter: aloneAfter })).sendable,
  "والصفُّ لا يتعارض مع نسخته الجديدة");

/* ٤) إضافتان في حزمةٍ واحدةٍ هويّتان لا هويّةٌ واحدة: بلا ذلك كانتا صفّاً
      واحداً في نظر محرّك التعارض، فيتخطّى المقارنةَ بينهما ويُجيز الاثنتين. */
const twoAdds = [
  row({ id: -1, AdCourseId: 100, fstarttime: "10:00", fendtime: "10:50" }),
  row({ id: -2, AdCourseId: 200, fstarttime: "10:00", fendtime: "10:50" }),
];
const secondAdd = judgeRequest(
  { rowId: null, tempId: -2, action: "add", AdCourseId: 200, days: ["fsunday"], start: "10:00" },
  context({ allRows: [], instructorRowsAfter: twoAdds }),
);
check(!secondAdd.sendable, "إضافتان على الساعة نفسها تتعارضان");
check(rowFromRequest({ rowId: null, tempId: -7, action: "add", AdCourseId: 1, days: ["fsunday"], start: "08:00" }, {}).id === -7,
  "والهويّةُ المؤقّتة تصل إلى الصفّ المبنيّ");


/* ── النصاب ────────────────────────────────────────────────────────────── */

/* القيدُ الذي كان غائباً: اللائحةُ تقول أين يقع الموعد، والقاعةُ تقول أيمكن،
   ولا شيء كان يقول «هذا يتجاوز نصابك» قبل أن يُرسل الطلب. */
const threeHourCourses = new Map([
  [100, course(100, 3)], [200, course(200, 3)], [300, course(300, 3)], [400, course(400, 3)],
]);
const fourRows = [
  row({ id: 1, AdCourseId: 100, SCode: "01" }),
  row({ id: 2, AdCourseId: 200, SCode: "01", fstarttime: "09:00", fendtime: "09:50" }),
  row({ id: 3, AdCourseId: 300, SCode: "01", fstarttime: "11:00", fendtime: "11:50" }),
  row({ id: -1, AdCourseId: 400, SCode: "01", fstarttime: "12:00", fendtime: "12:50" }),
];
const addAsk = (): RequestedRow =>
  ({ rowId: null, tempId: -1, action: "add", AdCourseId: 400, days: ["fsunday"], start: "12:00" });

check(weeklyLoadOf(fourRows, threeHourCourses) === 12, "النصابُ مجموعُ الساعات المعتمدة لما يُدرَّس");
/* والشعبةُ الواحدة تُعدّ مرّةً: مقرّرٌ له صفّان بالشعبة نفسها ساعاتُه ساعاتُه. */
check(weeklyLoadOf([...fourRows, row({ id: 9, AdCourseId: 100, SCode: "01" })], threeHourCourses) === 12,
  "وصفّان لشعبةٍ واحدةٍ لا يُضاعفانها");
check(weeklyLoadOf([...fourRows, row({ id: 9, AdCourseId: 100, SCode: "02" })], threeHourCourses) === 15,
  "وشعبتان من مقرّرٍ واحدٍ نصابان");

const overLoad = judgeRequest(addAsk(), context({
  courses: threeHourCourses, allRows: [], instructorRowsAfter: fourRows,
  instructorLoad: 9,
}));
check(!overLoad.sendable, "إضافةٌ تتجاوز النصاب تُمنع");
check(overLoad.reasons.some(reason => reason.source === "load"), "ويُسمّى السببُ باسمه");
check(overLoad.reasons.some(reason => reason.text.includes("9")), "ويُقال النصابُ المسجّل، فلا يُمنع بلا رقم");

check(judgeRequest(addAsk(), context({
  courses: threeHourCourses, allRows: [], instructorRowsAfter: fourRows, instructorLoad: 12,
})).sendable, "وبلوغُ النصاب تماماً ليس تجاوزاً");

/* غيابُ النصاب ليس صفراً: أستاذٌ لا نصابَ مسجّلٌ له لا يُمنع برقمٍ مخترع. */
check(judgeRequest(addAsk(), context({
  courses: threeHourCourses, allRows: [], instructorRowsAfter: fourRows,
})).sendable, "وأستاذٌ بلا نصابٍ مسجّل لا يُقيَّد برقمٍ مخترع");
check(judgeRequest(addAsk(), context({
  courses: threeHourCourses, allRows: [], instructorRowsAfter: fourRows, instructorLoad: null,
})).sendable, "و«لا نصاب» صراحةً كغيابه");

/* ويُقاس على الإضافة وحدَها: نقلُ محاضرةٍ لا يغيّر ساعاتِ المقرّر، وحذفُها
   يُنقصها، والإبقاءُ لا يُحاسَب عليه أحد. */
check(judgeRequest(ask({ rowId: 1 }), context({
  courses: threeHourCourses, allRows: [row({ id: 1, AdCourseId: 100 })],
  instructorRowsAfter: fourRows, instructorLoad: 3,
})).reasons.every(reason => reason.source !== "load"), "والنقلُ لا يُحاسَب على النصاب");
check(judgeRequest(ask({ action: "keep" }), context({
  courses: threeHourCourses, instructorRowsAfter: fourRows, instructorLoad: 3,
})).sendable, "والإبقاءُ كذلك");
check(judgeRequest(ask({ action: "delete" }), context({
  courses: threeHourCourses, instructorRowsAfter: fourRows, instructorLoad: 3,
})).sendable, "والحذفُ يُنقص النصاب فلا يُمنع به");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
