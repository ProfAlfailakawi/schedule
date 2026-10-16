import { readSectionOpenings } from "../src/utils/sectionOpening";
import { demandFromTargets, gapRows, hardestFirst, weekFingerprint } from "../src/utils/sectionBuild";
import { findConflicts } from "../src/utils/scheduleIntelligence";
import type { AdCourse, AdInstructor, FSchedule, MasterRoom } from "../src/types";

const check = (ok: boolean, label: string) => { if (!ok) throw new Error(`✗ ${label}`); console.log(`✓ ${label}`); };

const mk = (id: number, code: string, level: number): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: 11, CourseCode: code, CourseName: `مقرر ${code}`, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 });
const courses = [mk(1, "0101101", 1), mk(2, "0101102", 1), mk(3, "0101201", 2)];
const row = (id: number, courseId: number, scode: string, room: string, start: string, instructor: number): FSchedule => ({
  id, AdCollegeId: 1, AdSectionId: 11, AdTermId: 7, AdCourseId: courseId, AdCourseName: `مقرر ${courseId}`, SCode: scode, AdInstructorId: instructor,
  fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: start, fendtime: start.replace(/^(\d\d)/, h => String(Number(h) + 1).padStart(2, "0")),
  AdRoomCode: room, AdRoomHall: "1", buildingId: "b", roomId: room, locationStatus: "VERIFIED",
});
// الفصل: المقرر 1 فيه ٥ شعب، المقرر 2 شعبة واحدة، المقرر 3 لا شيء
const week = [1, 2, 3, 4, 5].map(n => row(n, 1, String(n), "r1", `${7 + n}:00`.padStart(5, "0"), 1)).concat([row(10, 2, "1", "r2", "08:00", 2)]);
const history = [...week];

// ① الفجوة: المطلوب ٦، الموجود ٥ ⇒ باقٍ ١؛ لا أكثر من الموجود ولا تكرار شعب
const gaps = gapRows(courses, new Map([[1, 6], [2, 1], [3, 2]]), week);
const g1 = gaps.find(g => g.courseId === 1)!, g2 = gaps.find(g => g.courseId === 2)!, g3 = gaps.find(g => g.courseId === 3)!;
check(g1.target === 6 && g1.existing === 5 && g1.remaining === 1 && g1.state === "missing", "المطلوب ٦ والموجود ٥ ⇒ باقٍ ١");
check(g2.state === "done" && g2.remaining === 0, "المطلوب = الموجود ⇒ مكتمل");
check(g3.existing === 0 && g3.remaining === 2, "مقرر بلا شعب ⇒ كل المطلوب باقٍ");
check(gapRows(courses, new Map([[2, 0]]), week).find(g => g.courseId === 2)!.state === "over", "الموجود فوق المطلوب ⇒ «زائد» ولا تنزيل");
check(gapRows(courses, new Map(), week).every(g => g.state === "unset" && g.remaining === 0), "بلا اختيار ⇒ لم يُقرَّر ولا تنزيل");
check(gapRows(courses, new Map([[1, 4.9]]), week)[0].target === 4, "العدد الكسري يُقطع لا يُقرَّب للأعلى");

// ② المحرّك يُخرج للمقرر عدداً يساوي الفجوة بالضبط
const levelOf = (id: number) => id === 3 ? 2 : 1;
const ordered = hardestFirst(gaps.filter(g => g.remaining > 0), levelOf);
check(ordered[0].courseId === 3 || ordered.length === 2, "الترتيب يُبقي المتبقين فقط");
const demand = demandFromTargets(gaps, id => 30, levelOf);
check(demand.pairs.some(p => p.a === 1 && p.b === 2) && !demand.pairs.some(p => p.a === 1 && p.b === 3), "أزواج الدفعة من المستوى نفسه فقط");
const people: AdInstructor[] = [1, 2, 3].map(id => ({ AdInstructorId: id, AdInstructorName: `أستاذ ${id}`, AdInstructorCivil: "", AdInstructorMobile: "", AdInstructorLoad: 30 }));
const rooms: MasterRoom[] = ["r1", "r2", "r3"].map(id => ({ id, buildingId: "b", buildingCode: "B", canonicalCode: id, capacity: 40, active: true, aliases: [], collegeIds: [1], sectionIds: [11], shared: false, historicalUsageCount: 1, confidence: "CONFIRMED", source: "T", adminVerified: true, evidence: [], auditHistory: [] }));
const rhythm: any = { forDay: () => ({ ladder: ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00"] }), patterns: [{ durationMinutes: 60 }], learnedFrom: { rows: 1, terms: 1 } };
const hist = [...history, row(20, 3, "1", "r3", "11:00", 3)];
const reading = readSectionOpenings(week, week, courses, people, hist, demand, null, rhythm, 0, 999, rooms);
const p1 = reading.proposals.find(p => p.courseId === 1)!, p3 = reading.proposals.find(p => p.courseId === 3)!;
check(p1.needed === 1 && p1.placements.length === 1, "المقرر ذو الشعب الخمس يُبنى له ما يساوي الفجوة: ١");
check(p3.needed === 2, "المقرر بلا شعب يُطلب له ٢ كما اختير");

// ③ لا تعارض: الأسبوع بعد الإضافة نظيف كله (قاعة، أستاذ، دفعة)
const added: FSchedule[] = reading.proposals.flatMap(p => p.placements.map((pl, i) => ({
  ...row(100 + p.courseId * 10 + i, p.courseId, pl.sectionCode, pl.roomId, pl.start, pl.instructorId),
  fsunday: pl.day === "fsunday", fmonday: pl.day === "fmonday", ftuesday: pl.day === "ftuesday", fwednesday: pl.day === "fwednesday", fthursday: pl.day === "fthursday",
  fendtime: pl.end, buildingId: pl.buildingId,
})));
check(added.length >= 2, "بُنيت شعبٌ فعلاً");
const all = [...week, ...added];
const pairs = new Set<string>(demand.pairs.map(p => `${p.a}|${p.b}`));
const physical = (a: FSchedule, b: FSchedule) => a.id !== b.id && (["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const).some(d => a[d] && b[d])
  && a.fstarttime < b.fendtime && b.fstarttime < a.fendtime && (a.roomId === b.roomId || a.AdInstructorId === b.AdInstructorId);
check(added.every(a => all.every(b => !physical(a, b))), "لا قاعة مزدوجة ولا أستاذ في مكانين بعد التنزيل");
check(findConflicts(added, all, { cohortPairs: pairs, doorwayMinutes: 0 }).length === 0, "محرّك التعارض نفسه لا يجد شيئاً بعد التنزيل");
check(new Set(added.map(a => `${a.AdCourseId}:${a.SCode}`)).size === added.length && added.every(a => !week.some(w => w.AdCourseId === a.AdCourseId && w.SCode === a.SCode)), "أرقام الشعب الجديدة لا تتكرر مع الموجود");

// ④ سبب التعثّر: بلا قاعة موثّقة، وبلا أستاذ
const noRooms = readSectionOpenings(week, week, courses, people, hist, demand, null, rhythm, 0, 999, []);
check(/قاعة/.test(noRooms.proposals.find(p => p.courseId === 1)!.unplacedReason || ""), "بلا قاعة موثّقة يُقال السبب لا الصمت");
const noTeacher = readSectionOpenings(week, week, courses, [], hist, demand, null, rhythm, 0, 999, rooms);
check(/أستاذ|أحمال/.test(noTeacher.proposals.find(p => p.courseId === 1)!.unplacedReason || ""), "بلا أستاذ مؤهل يُقال السبب");
check(p1.unplacedReason === undefined, "المبني كاملاً بلا سبب تعثّر");

// ⑤ بصمة الأسبوع تتغيّر بأي تغيير ولا تتغيّر بترتيب الصفوف
const fp = weekFingerprint(week);
check(fp === weekFingerprint([...week].reverse()), "البصمة لا تتأثر بترتيب الصفوف");
check(fp !== weekFingerprint([...week, added[0]]), "صفٌّ جديد يغيّر البصمة");
check(fp !== weekFingerprint(week.map((r, i) => i === 0 ? { ...r, fstarttime: "09:30" } : r)), "تغيّر موعد يغيّر البصمة");
console.log("section-build ✓");
