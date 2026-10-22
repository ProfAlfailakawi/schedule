/**
 * الديمو مكتملُ البيانات: ثلاثةُ أقسام بجداولها وقصصِ اعتمادها، وتاريخٌ يغطّي صحيفةَ القسم، ونصابُ أعضاءٍ يجد معه اقتراحُ الشعب أستاذاً،
 * ولا مقرّرٌ في صحيفة القسم بلا فصلٍ سابقٍ طُرح فيه — فلا تُفتح شاشةٌ على «لا يوجد».
 */
import { createDemoSandboxState, DEMO_HISTORY_TERMS, DEMO_OTHER_DEPARTMENTS, DEMO_VISITING_INSTRUCTOR_IDS } from "../src/db/demoSandbox";

let passed = 0, failed = 0;
function check(ok: boolean, label: string) {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
}

const demo = createDemoSandboxState() as any;
const rowsOf = (term: number, section?: number) => demo.schedules.filter((r: any) => r.AdTermId === term && (section === undefined || r.AdSectionId === section));

/* ── الأقسام الثلاثة ── */
for (const sectionId of [1, 2, 3]) check(rowsOf(1, sectionId).length >= 10, `قسم ${sectionId}: جدولٌ للفصل الجاري (${rowsOf(1, sectionId).length} موعداً)`);
for (const { sectionId, instructorIds } of DEMO_OTHER_DEPARTMENTS) {
  const rows = rowsOf(1, sectionId);
  check(rows.every((r: any) => (instructorIds as readonly number[]).includes(r.AdInstructorId)), `قسم ${sectionId}: يدرّسه أعضاؤه وحدهم`);
  const courses = new Set(demo.courses.filter((c: any) => c.AdSectionId === sectionId).map((c: any) => c.AdCourseId));
  check(rows.every((r: any) => courses.has(r.AdCourseId)), `قسم ${sectionId}: مقرراتُه وحدها`);
  const halls = new Set(demo.locationRooms.filter((r: any) => r.sectionIds.includes(sectionId)).map((r: any) => r.id));
  check(rows.every((r: any) => halls.has(r.roomId)), `قسم ${sectionId}: في قاعاته`);
}
const statuses = Object.fromEntries(demo.scheduleApprovals.map((a: any) => [a.AdSectionId, a.status]));
check(statuses[1] === "returned" && statuses[2] === "accepted" && statuses[3] === "submitted", "قصصٌ ثلاث: مُرجَع، ومعتمد، وعند التسجيل");
const acceptedV = demo.scheduleVersions.find((v: any) => v.scopeKey === "1:2:1");
check(!!acceptedV && acceptedV.rows.length === rowsOf(1, 2).length, "نسخةُ القسم المعتمد (ما يقرؤه العميدان) تحمل صفوفه كلَّها");

/* ── لا تعارضَ مصطنع بين الأقسام (إلا ما قُصد في الأول) ── */
const slotKey = (r: any, extra: string) => `${extra}|${r.fstarttime}|${["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].filter(d => r[d]).join(",")}`;
for (const sectionId of [2, 3]) {
  const keys = rowsOf(1, sectionId).flatMap((r: any) => [slotKey(r, `h${r.roomId}`), slotKey(r, `i${r.AdInstructorId}`)]);
  check(new Set(keys).size === keys.length, `قسم ${sectionId}: لا قاعةٌ ولا أستاذٌ في موعدين معاً`);
}

/* ── التاريخ يغطّي الصحيفة ── */
const own = demo.courses.filter((c: any) => c.AdSectionId === 1);
const taught = new Set(demo.schedules.filter((r: any) => DEMO_HISTORY_TERMS.some(t => t.id === r.AdTermId)).map((r: any) => r.AdCourseId));
const never = own.filter((c: any) => !taught.has(c.AdCourseId) && !rowsOf(1, 1).some((r: any) => r.AdCourseId === c.AdCourseId));
check(never.length === 0, `كلُّ مقرّرٍ في صحيفة القسم له فصلٌ سابقٌ طُرح فيه أو يُطرح الآن (${never.length} بلا تاريخ)`);
check(DEMO_HISTORY_TERMS.length >= 6 && DEMO_HISTORY_TERMS.filter(t => /الأول/.test(t.name)).length >= 3, "ثلاثةُ فصولٍ خريفيةٍ على الأقل: ثقةُ التنبّؤ تحتاج ثلاثةً من الموسم نفسه");

/* ── المنتدبون يظهرون للعميدين (النسخة المقبولة) ── */
const acceptedFirst = demo.scheduleVersions.find((v: any) => v.id === "demo-ver-t1-accepted");
check((DEMO_VISITING_INSTRUCTOR_IDS as readonly number[]).every(id => acceptedFirst.rows.some((r: any) => r.AdInstructorId === id)), "المنتدبون الثلاثة في النسخة المقبولة: عدسةُ «المنتدبون» عند العميد ممتلئة");

/* ── نصابُ الأعضاء: شرطُ أن يُقترح أستاذٌ لشعبةٍ جديدة ── */
const withLoad = demo.instructors.filter((i: any) => Number(i.AdInstructorLoad) > 0).map((i: any) => i.AdInstructorId);
check([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(id => withLoad.includes(id)), "أعضاء القسم كلُّهم بنصابٍ مسجَّل");
check(!DEMO_VISITING_INSTRUCTOR_IDS.some(id => withLoad.includes(id)), "المنتدبون بلا نصاب: لا يُسنَد إليهم اقتراح");

/* ── استعارة القاعات: سجلٌّ بثلاث حالات ── */
const barter = demo.hallBarterRequests.map((r: any) => r.status);
check(["pending", "approved", "rejected", "cancelled"].every(status => barter.includes(status)), "سجلُّ استعارة القاعات: قيد الانتظار ومقبولٌ ومرفوضٌ ومنتهي المهلة");
check(demo.hallBarterRequests.every((r: any) => r.status !== "cancelled" || r.cancelReason), "سببُ الإلغاء مكتوب");

console.log(`\nDemo fill audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
