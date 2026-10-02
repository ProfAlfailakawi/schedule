/**
 * استعلام المنتدبين عبر كليات القسم، وإجمالي القسم في سجل المنتدبين.
 * اختبارات سلوكية: دوالّ الحساب الحقيقية، ثم القراءة الحقيقية على الصندوق
 * التجريبي (قسم الدراسات الإسلامية في الكليات الثلاث) بصلاحيات كاملة ومقيّدة.
 */
import { Repository } from "../src/db/repository";
import { summarizeVisitingTeaching, dedupeVisitingRows, weeklyHours } from "../src/utils/visitingTeaching";
import { aggregateVisitingHistory, buildVisitingHistoryModel, termSectionCount } from "../src/utils/visitingHistory";
import { readVisitingTeaching } from "../src/server/visitingTeachingRead";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail ?? ""); }
};

const row = (over: Partial<any>) => ({
  id: 0, AdCollegeId: 1, AdSectionId: 10, AdTermId: 5, AdInstructorId: 7, AdCourseId: 100, AdCourseName: "مقرر",
  SCode: "01", fstarttime: "08:00", fendtime: "09:00", fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
  AdRoomCode: "A", AdRoomHall: "1", ...over,
});

/* ── ١. البطاقة: «٣ شعب · ١١ ساعة أسبوعياً» من كل كليات القسم ───────────── */
{
  const rows = [
    // الكلية ١: شعبة 01 محاضرة (أحد/ثلاثاء/خميس ساعة) + مختبر لها (اثنين ساعتان) = شعبة واحدة، ٥ ساعات
    row({ id: 1, fsunday: true, ftuesday: true, fthursday: true }),
    row({ id: 2, fmonday: true, fstarttime: "10:00", fendtime: "12:00" }),
    // الكلية ١: شعبة 02 (اثنين/أربعاء ساعة ونصف) = ٣ ساعات
    row({ id: 3, SCode: "02", fmonday: true, fwednesday: true, fstarttime: "12:00", fendtime: "13:30" }),
    // الكلية ٢ (القسم المناظر ٢٠): شعبة 01 لمقرر آخر (أحد/ثلاثاء/خميس ساعة) = ٣ ساعات
    row({ id: 4, AdCollegeId: 2, AdSectionId: 20, AdCourseId: 200, fsunday: true, ftuesday: true, fthursday: true }),
    // الصف نفسه وصل من مصدر ثانٍ — لا يُعدّ مرتين
    row({ id: 4, AdCollegeId: 2, AdSectionId: 20, AdCourseId: 200, fsunday: true, ftuesday: true, fthursday: true }),
    // أستاذ غير منتدب
    row({ id: 5, AdInstructorId: 99, fsunday: true }),
    // منتدب ثانٍ في الفصل نفسه
    row({ id: 6, AdInstructorId: 8, AdCourseId: 300, SCode: "05", fwednesday: true }),
  ];
  const [a, b] = summarizeVisitingTeaching(rows, [7, 8]).sort((x, y) => x.instructorId - y.instructorId);
  check(a.sections === 3, "الشعب = ٣ فريدة (محاضرة ومختبر شعبة واحدة، والمكرر يسقط، والكليتان معاً)", a.sections);
  check(weeklyHours(a.weeklyMinutes) === 11, "الساعات الأسبوعية = ١١ من كل مواقع التدريس", a.weeklyMinutes / 60);
  check(a.courses === 2, "المقررات = ٢", a.courses);
  check(a.places.length === 2 && a.places.some(p => p.collegeId === 2 && p.sectionId === 20 && p.sections === 1), "لكل موقع تدريس كليته وقسمه وعدد شعبه", a.places);
  check(!summarizeVisitingTeaching(rows, [7, 8]).some(s => s.instructorId === 99), "غير المنتدب لا يدخل الاستعلام");
  check(b.sections === 1 && weeklyHours(b.weeklyMinutes) === 1, "منتدب ثانٍ في الفصل نفسه يُحسب مستقلاً");
  check(dedupeVisitingRows(rows).length === rows.length - 1, "إزالة التكرار تُسقط النسخة المكررة فقط");
  const local = summarizeVisitingTeaching(rows.filter(r => r.AdCollegeId === 1), [7])[0];
  check(local.sections === 2 && weeklyHours(local.weeklyMinutes) === 8, "للمقارنة: الكلية المختارة وحدها كانت ستعطي ٢ شعبة و٨ ساعات (الخطأ القديم)");
}

/* ── ٢. إجمالي القسم في سجل المنتدبين ─────────────────────────────────────── */
{
  const terms = new Map([[11, "الفصل الأول 2024/2025"], [12, "الفصل الثاني 2024/2025"], [13, "الفصل الأول 2025/2026"], [14, "الفصل الثاني 2025/2026"]]);
  const rowsByTerm = new Map<number, any[]>([
    // فصل ١١: منتدبان (7 و8) — 7 يدرّس في كليتين، و8 يدرّس شعبة مع مختبرها
    [11, [
      row({ id: 11, AdTermId: 11, AdInstructorId: 7, SCode: "01", fsunday: true }),
      row({ id: 12, AdTermId: 11, AdInstructorId: 7, AdCollegeId: 2, AdSectionId: 20, SCode: "01", fsunday: true }),
      row({ id: 13, AdTermId: 11, AdInstructorId: 8, AdCourseId: 101, SCode: "03", fmonday: true }),
      row({ id: 14, AdTermId: 11, AdInstructorId: 8, AdCourseId: 101, SCode: "03", fwednesday: true }),
    ]],
    // فصل ١٢: 7 وحده، والصف نفسه مكرر من مصدرين
    [12, [row({ id: 21, AdTermId: 12, SCode: "01", fsunday: true }), row({ id: 21, AdTermId: 12, SCode: "01", fsunday: true })]],
    // فصل ١٣: في الروستر بلا أي شعبة (فصل بلا انتداب فعلي)
    [13, []],
    // فصل ١٤: محاضرة 7 ومختبر 8 لشعبة واحدة — شعبة مشتركة
    [14, [
      row({ id: 41, AdTermId: 14, AdInstructorId: 7, AdCourseId: 400, SCode: "09", fsunday: true }),
      row({ id: 42, AdTermId: 14, AdInstructorId: 8, AdCourseId: 400, SCode: "09", fmonday: true }),
    ]],
  ]);
  const people = aggregateVisitingHistory({
    rosters: [{ termId: 11, instructorIds: [7, 8] }, { termId: 12, instructorIds: [7] }, { termId: 12, instructorIds: [7] }, { termId: 13, instructorIds: [7] }, { termId: 14, instructorIds: [7, 8] }],
    rowsByTerm, known: () => true, termName: id => terms.get(id) || String(id),
  });
  const p7 = people.find(p => p.instructorId === 7)!, p8 = people.find(p => p.instructorId === 8)!;
  check(p7.terms.find(t => t.termId === 11)?.sections === 2, "أستاذ يدرّس في كليتين للقسم: شعبتاه في الفصل تُجمعان", p7.terms);
  check(p7.terms.filter(t => t.termId === 12).length === 1 && p7.terms.find(t => t.termId === 12)?.sections === 1, "روستران للفصل نفسه وصف مكرر: فصلٌ واحد وشعبة واحدة");
  check(p8.terms.find(t => t.termId === 11)?.sections === 1, "محاضرة ومختبر لشعبة واحدة = شعبة واحدة للمنتدب");

  // كما تصفّيها الشاشة: الفصل بلا شعبة ليس انتداباً يُقارن به
  const shown = people.map(p => {
    const active = p.terms.map(t => ({ ...t, sections: termSectionCount(t) })).filter(t => t.sections > 0);
    return { ...p, name: `م${p.instructorId}`, terms: active, times: active.length, sections: active.reduce((s, t) => s + t.sections, 0) };
  });
  const model = buildVisitingHistoryModel({ terms: [...terms].map(([termId, termName]) => ({ termId, termName })), people: shown }, 0);
  check(model.totals.terms === 3, "إجمالي الفصول = فصول القسم الفريدة (٣) لا مجموع فصول الأفراد", model.totals);
  check(model.totals.personTerms === 5, "ومجموع فصول الأفراد (٥) محفوظ بعنوانه المستقل");
  check(model.totals.sections === 5, "إجمالي الشعب = شعب القسم الفريدة (٥): ٣ في ١١ + ١ في ١٢ + الشعبة المشتركة في ١٤ مرة واحدة", model.totals);
  check(model.totals.assignedSections === 6, "ومجموع الشعب المسندة للأفراد (٦) يظهر منفصلاً بعنوانه");
  const sumYears = model.allYears.reduce((s, y) => s + y.sections, 0);
  check(sumYears === model.totals.sections, "مجموع أعمدة السنوات = إجمالي الشعب", { sumYears, total: model.totals.sections });
  check(model.allYears.reduce((s, y) => s + y.terms, 0) === model.totals.terms, "مجموع فصول السنوات = إجمالي الفصول");
  check(!model.allYears.flatMap(y => y.slots).some(slot => slot.term?.termId === 13), "فصلٌ بلا انتداب فعلي لا يصير عموداً ولا يُعدّ");
  const windowed = buildVisitingHistoryModel({ terms: [...terms].map(([termId, termName]) => ({ termId, termName })), people: shown }, 1);
  const archived = windowed.archive!.years.reduce((s, y) => s + y.sections, 0);
  check(windowed.years.reduce((s, y) => s + y.sections, 0) + archived === windowed.totals.sections, "مع طيّ السنوات: الظاهر + المطوي = الإجمالي");
}

/* ── ٣. القراءة الحقيقية على الصندوق التجريبي ──────────────────────────────── */
async function sandbox() {
  const id = `demo_visiting_teaching_${Date.now()}`;
  Repository.createDemoSandbox(id, 60_000);
  await Repository.withDemoSandbox(id, async () => {
    const isl = (await Repository.getSections()).filter(s => String(s.AdSectionCode) === "ISL");
    check(isl.length === 3, "قسم الدراسات الإسلامية في ثلاث كليات");
    const [a, b, c] = isl.map(s => ({ collegeId: Number(s.AdCollegeId), sectionId: Number(s.AdSectionId) }));
    const termId = Number((await Repository.getTerms())[0]?.AdTermId || 1);
    const person = 13;
    await Repository.addDepartmentDelegate(a.collegeId, a.sectionId, person);
    await Repository.saveVisitingRoster(a.collegeId, a.sectionId, termId, [...await Repository.getVisitingRoster(a.collegeId, a.sectionId, termId), person]);
    const base = { AdTermId: termId, AdInstructorId: person, AdCourseName: "تجربة", fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "", AdRoomHall: "" } as any;
    await Repository.createSchedule({ ...base, AdCollegeId: a.collegeId, AdSectionId: a.sectionId, AdCourseId: 90001, SCode: "71" });
    await Repository.createSchedule({ ...base, AdCollegeId: b.collegeId, AdSectionId: b.sectionId, AdCourseId: 90002, SCode: "72", fstarttime: "10:00", fendtime: "11:30" });
    await Repository.createSchedule({ ...base, AdCollegeId: c.collegeId, AdSectionId: c.sectionId, AdCourseId: 90003, SCode: "73", fstarttime: "12:00", fendtime: "13:00" });

    const all = await readVisitingTeaching(() => true, a.collegeId, a.sectionId, termId);
    const mine = summarizeVisitingTeaching(all.rows, all.instructorIds).find(s => s.instructorId === person);
    check(all.complete && all.family.length === 3, "بصلاحية كاملة: العائلة كلها مقروءة والنتيجة مكتملة");
    check(mine?.sections === 3 && weeklyHours(mine.weeklyMinutes) === 7, "المنتدب: ٣ شعب · ٧ ساعات من الكليات الثلاث", mine);
    check(new Set(mine?.rows.map(r => r.AdCollegeId)).size === 3, "كل صف يحمل كليته — مواقع التدريس لا تختلط");

    const fromB = await readVisitingTeaching(() => true, b.collegeId, b.sectionId, termId);
    const viaB = summarizeVisitingTeaching(fromB.rows, fromB.instructorIds).find(s => s.instructorId === person);
    check(viaB?.sections === 3, "اختيار كلية أخرى للقسم نفسه يعطي الصورة نفسها (الكلية تحدد القسم لا تضيّق النتيجة)");

    const limited = await readVisitingTeaching((col, sec) => !(col === c.collegeId && sec === c.sectionId), a.collegeId, a.sectionId, termId);
    const partial = summarizeVisitingTeaching(limited.rows, limited.instructorIds).find(s => s.instructorId === person);
    check(!limited.complete && limited.family.some(m => m.collegeId === c.collegeId && !m.allowed), "بلا صلاحية على كلية: النتيجة معلَّمة غير مكتملة وتسمّي النطاق المحجوب");
    check(!limited.rows.some(r => Number(r.AdCollegeId) === c.collegeId), "ولا يُقرأ أي صف من الكلية المحجوبة");
    check(partial?.sections === 2, "والإجمالي الجزئي لا يتضمن ما لا يملكه القارئ");

    const others = await Repository.getSchedulesByScope({ collegeId: a.collegeId, sectionId: a.sectionId, termId });
    check(!others.some(r => Number(r.AdCollegeId) !== a.collegeId), "نطاق بقية الاستعلامات والجداول لم يتغير: صفوف الكلية المختارة وحدها");
  });
}

sandbox().then(() => {
  console.log(`\nVisiting teaching audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}).catch(error => { console.error(error); process.exit(1); });
