/**
 * معرّفُ الأستاذ قد يصل نصّاً من قاعدة البيانات ورقماً من الطلب. كان محرّكُ
 * التعارض يقارن بـ `===` فيفوته تعارضُ الأستاذ: الوارد يقول «متاح» والجدولُ
 * الدراسي يقول «متداخلة». الآن تُقارن الهويّاتُ أرقاماً.
 */
import { judgeRequest } from "../src/utils/instructorRequestVerdict";
import { findConflicts } from "../src/utils/scheduleIntelligence";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

const other: any = { id: 50, AdInstructorId: "7", AdCollegeId: 9, AdSectionId: 90, AdTermId: 1, AdCourseId: "300", SCode: "1",
  fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: true, fstarttime: "09:00", fendtime: "09:50" };
const mine: any = { id: -1, AdInstructorId: 7, AdCollegeId: 2, AdSectionId: 3, AdTermId: 1, AdCourseId: 112, SCode: "2",
  fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: false, fstarttime: "09:30", fendtime: "10:50" };

check(findConflicts([mine], [other]).some(c => c.type === "instructor" || c.reasons?.includes("instructor")),
  "findConflicts: أستاذٌ بمعرّفٍ نصّيّ ورقميّ هو الأستاذ نفسه");
const verdict = judgeRequest({ rowId: null, tempId: -1, action: "add", AdCourseId: 112, days: ["fmonday", "fwednesday"], start: "09:30" } as any,
  { instructorId: 7, allRows: [other], instructorRowsAfter: [other, mine], courses: new Map(), instructors: new Map(),
    cohortPairs: [], knownRoomKeys: [], startLadder: [], windowOpen: true } as any);
check(verdict.kind === "conflict", "الوارد يرى تعارضَ الأستاذ في كليةٍ أخرى ولو اختلف نوعُ المعرّف");
check(findConflicts([{ ...mine, AdCourseId: "300", SCode: "1", fmonday: true }], [{ ...other, AdCourseId: 300 }]).length > 0,
  "ومعرّفُ المقرّر كذلك");

console.log(`\nID-type conflict audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
