/** الإنذار المبكر: حسابٌ حتميّ (نقص، تغطية، بيانات ناقصة، سعة مجهولة، نصاب) + عزل النطاق. */
import fs from "fs";
import { Repository } from "../src/db/repository";
import { computeTermForecast } from "../src/utils/termForecast";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const course = (id: number, code: string, cap: number, hours = 3): any => ({ AdCourseId: id, CourseCode: code, CourseName: code, CourseHours: hours, CourseCredit: hours, MaxStudent: cap });
let rid = 0;
const row = (courseId: number, scode: string, instructor: number, room = "A/1"): any =>
  ({ id: ++rid, AdCourseId: courseId, SCode: scode, AdInstructorId: instructor, AdRoomCode: room ? room.split("/")[0] : "", AdRoomHall: room ? room.split("/")[1] : "" });
const base = { courses: [course(1, "306", 30), course(2, "101", 40), course(3, "500", 0)], instructors: [{ AdInstructorId: 7, AdInstructorName: "س", AdInstructorLoad: 5 }] } as any;

// 306: متبقٍّ 100 / سعة 30 = 4 شعب مطلوبة، مجدولة 2 → ناقص 2؛ 101: متبقٍّ 40 / 40 = 1، مجدولة 1 → سليم.
const f = computeTermForecast({ ...base, remaining: { "1": 100, "2": 40, "3": 20 },
  rows: [row(1, "1", 7), row(1, "2", 7), row(2, "1", 8)] });
check(f.status === "ready", "كشف المتبقي موجود ← توقّع جاهز");
check(f.highlights[0].kind === "shortage" && f.highlights[0].text === "مقرر 306 ناقص شعبتان", `النقص = ⌈100÷30⌉−2 = 2 ويُكتب بالمثنى (${f.highlights[0].text})`);
check(f.coverage.totalSeats === 140 && f.coverage.coveredSeats === 100 && f.coverage.percent === 71, "التغطية: (60+40)÷(100+40) = 71٪، والسعة المجهولة خارجها");
check(f.highlights.some(r => r.kind === "capacity" && r.text.includes("السعة غير معروفة")), "السعة غير المعروفة تُذكر ولا تُخمَّن");
check(!computeTermForecast({ ...base, remaining: { "1": 90 }, rows: [row(1, "1", 7), row(1, "2", 7), row(1, "3", 7)] }).highlights.some(r => r.kind === "shortage"), "٣ شعب تكفي ٩٠ مقعداً: لا نقص");
check(computeTermForecast({ ...base, remaining: { "1": 0, "2": 0 }, rows: [] }).coverage.percent === null, "لا مقاعد ← لا نسبة مختلقة");

const none = computeTermForecast({ ...base, remaining: null, rows: [row(1, "1", 7)] });
check(none.status === "no-remaining" && none.coverage.percent === null && !none.highlights.some(r => r.kind === "shortage"), "بلا كشف: لا نقص ولا نسبة");

// نصاب 5 ساعات: مقرران من 3 ساعات = 6 > 5. المقرر نفسه بشعبتين يُعدّ مرتين (شعبتان مختلفتان).
const over = computeTermForecast({ ...base, remaining: { "1": 1 }, rows: [row(1, "1", 7), row(2, "1", 7)] });
check(over.highlights.some(r => r.kind === "overload"), "تجاوز النصاب المسجّل (6 > 5)");
const fine = computeTermForecast({ ...base, remaining: { "1": 1 }, rows: [row(1, "1", 7), row(1, "1", 7)] });
check(!fine.highlights.some(r => r.kind === "overload"), "الشعبة الواحدة تُعدّ مرة (3 ≤ 5)");
const noLimit = computeTermForecast({ ...base, instructors: [{ AdInstructorId: 7, AdInstructorName: "س" }], remaining: { "1": 1 }, rows: [row(1, "1", 7), row(2, "1", 7), row(2, "2", 7)] });
check(!noLimit.highlights.some(r => r.kind === "overload"), "بلا نصابٍ مسجّل لا حكم");

const un = computeTermForecast({ ...base, remaining: null, rows: [row(1, "1", 7, ""), row(1, "2", 7, ""), row(2, "1", 8, "")] });
check(un.highlights.some(r => r.kind === "unroomed" && r.text === "3 شعب بلا قاعة"), "شعبٌ بلا قاعة");
check(computeTermForecast({ ...base, remaining: { "1": 100 }, rows: [] }).highlights.length <= 3, "حتى ثلاثة إبرازات");
const many = computeTermForecast({ courses: [1, 2, 3, 4, 5].map(i => course(i, `C${i}`, 10)), instructors: [], remaining: { "1": 50, "2": 40, "3": 30, "4": 20, "5": 10 }, rows: [] });
check(many.highlights.length === 3 && many.more.length === 2 && new Set([...many.highlights, ...many.more].map(r => r.text)).size === 5, "الفائض في «كل التفاصيل» بلا تكرار");

async function behaviour() {
  const id = `demo_forecast_${Date.now()}`;
  Repository.createDemoSandbox(id, 60_000);
  await Repository.withDemoSandbox(id, async () => {
    const sections = await Repository.getSections();
    const [a, b] = sections.slice(0, 2);
    const ca = Number(a.AdCollegeId), sa = Number(a.AdSectionId), cb = Number(b.AdCollegeId), sb = Number(b.AdSectionId);
    await Repository.saveRegistrationStats(ca, sa, 1, { remaining: { "1": 55 }, accepted: {}, remainingSource: { fileName: "x", importedAt: "", column: "unregistered" } }, "t");
    const own = await Repository.getRegistrationStats(ca, sa, 1);
    const other = await Repository.getRegistrationStats(cb, sb, 1);
    check(own?.remaining?.["1"] === 55 && own?.remainingSource?.column === "unregistered", "المتبقي المحفوظ يُقرأ لنطاقه، بوسم عموده «unregistered»");
    check(!other?.remaining?.["1"], "ولا يظهر في قسمٍ آخر");
    const rows = (await Repository.getSchedulesByScope({ collegeId: ca, sectionId: sa, termId: 1 })).filter(r => Number(r.AdSectionId) === sa);
    check(rows.every(r => Number(r.AdSectionId) === sa), "صفوف النطاق لقسمه وحده");
  });
}

const server = fs.readFileSync("server.ts", "utf8");
const route = server.slice(server.indexOf('app.get("/api/forecast/term"'), server.indexOf('app.put("/api/registration-stats"'));
check(/requirePermission\(7\)/.test(route) && /isScopeAllowed\(req, collegeId, sectionId\)/.test(route), "المسار: صلاحية + isScopeAllowed");
check(/readSchedulesForRequest\(/.test(route) && /AdSectionId\) === sectionId/.test(route), "المسار: صفوف القارئ وقسمٌ واحد");
check(/column === "unregistered"/.test(route) && !/column === "seats"/.test(route), "المسار: عمود «اعداد الذين لم يسجلوا» وحده طلب");
const ui = fs.readFileSync("src/components/TermForecast.tsx", "utf8");
check(/createScopeGuard/.test(ui) && /guard\.accepts\(token\)/.test(ui), "الواجهة: حارس النطاق يرمي القراءة البائتة");
check(!/\d+ (شعب|مقرر|أستاذ)/.test(ui + fs.readFileSync("src/utils/termForecast.ts", "utf8").replace(/\/\*[\s\S]*?\*\//, "")), "لا «رقم اسم» مكتوبٌ باليد");

behaviour().then(() => {
  /* «الذين لم يسجلوا» سالب (المسجّلون أكثر ممن لم يجتازوا) = لا متأخرين: ليس طلباً، ولا خطر «فوق السعة». */
{
  const negative = computeTermForecast({ ...base, remaining: { "1": -22 }, rows: [] });
  const all = [...negative.highlights, ...negative.more];
  check(negative.status === "ready" && !all.some(r => r.kind === "overflow" || r.kind === "shortage" || /فوق السعة/.test(r.text))
    && negative.coverage.totalSeats === 0 && negative.coverage.percent === null, "لم يسجلوا −22: ليس طلباً — لا نقص ولا خطر «فوق السعة»، ولا يدخل نسبة التغطية");
  const mixed = computeTermForecast({ ...base, remaining: { "1": -22, "2": 40 }, rows: [row(2, "1", 8)] });
  check(mixed.coverage.totalSeats === 40 && mixed.coverage.coveredSeats === 40 && mixed.coverage.percent === 100
    && ![...mixed.highlights, ...mixed.more].some(r => r.kind === "overflow" || r.kind === "shortage"),
    "وبجانب مقررٍ موجب (40 بشعبة 40): التغطية 100٪ منه وحده، والسالب لا يُعدّ مقاعد سالبة");
}
console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}).catch(error => { console.error(error); process.exit(1); });
