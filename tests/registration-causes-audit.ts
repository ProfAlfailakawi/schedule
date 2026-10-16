/**
 * لماذا لا يبلغ الطالبُ 12 وحدة؟ بمقارنة سيناريوهات (رفع قيدٍ واحد عن الجميع)، وجاهزيةُ الفصل
 * رقماً واحداً. المحرّك بلا تغيير في الاحتساب العادي: العلَمُ `relax` للمقارنة وحدها.
 */
import { explainShortfalls, dominantCause, emptyCauseTotals } from "../src/utils/registrationCauses";
import { semesterReadiness } from "../src/utils/semesterReadiness";
import { parseClock, simulateRegistration, type SimInput, type SimOffering, type SimPlanRules, type SimStudent } from "../src/utils/registrationSim";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};

const IDS = [1, 2, 3, 4, 5, 6];
const credit = new Map<number, number>(IDS.map(id => [id, 3]));
const plan = (extra: Partial<SimPlanRules> = {}): SimPlanRules => ({ planId: "p", courseIds: IDS, hasApprovedRules: true, rules: IDS.map(courseId => ({ courseId, level: 100, kind: "compulsory" as const })), groups: [], ...extra });
const off = (courseId: number, day: number, start: string, end: string, capacity: number): SimOffering =>
  ({ id: `${courseId}|01`, courseId, code: "01", collegeId: 1, sectionId: 11, capacity, slots: [{ day, start: parseClock(start)!, end: parseClock(end)! }] });
const student = (fp: string, constraints: Record<string, boolean> = {}): SimStudent =>
  ({ fp, collegeId: 1, sectionId: 11, planId: "p", passed: [], wishes: { targetUnits: 15, courseIds: [], constraints: constraints as any } });
const input = (students: SimStudent[], offerings: SimOffering[], p = plan()): SimInput => ({ students, offerings, plans: [p], credit, rounds: 1 });
const spread = (capacity: number) => IDS.map(id => off(id, id % 5, "08:00", "09:00", capacity));

/* السلامة: العلَم لا يغيّر الاحتساب العادي */
{
  const base = input([student("a"), student("b")], spread(5));
  check(JSON.stringify(simulateRegistration({ ...base, assessCapacity: true })) === JSON.stringify(simulateRegistration({ ...base, assessCapacity: true, relax: {} })), "علَم relax الفارغ لا يغيّر شيئاً");
}
/* امتلاء الشعب */
{
  const report = explainShortfalls(input([student("a"), student("b")], spread(1)));
  check(report.short === 1 && report.totals.full === 1, "شعبٌ سعتُها 1: من فاته المقعد سببُه الامتلاء", report.totals);
}
/* تعارض الأوقات */
{
  const same = IDS.map(id => off(id, 0, "08:00", "09:00", 50));
  const report = explainShortfalls(input([student("a")], same));
  check(report.short === 1 && report.totals.conflict === 1, "كل الشعب في الوقت نفسه: السبب التعارض", report.totals);
}
/* قيود الطالب */
{
  const report = explainShortfalls(input([student("a", { noMorning: true })], spread(50)));
  check(report.short === 1 && report.totals.constraints === 1, "«لا صباح» وكل الشعب صباحاً: السبب قيد الطالب", report.totals);
}
/* المتطلب السابق */
{
  const gated = plan({ courseIds: [...IDS, 99], rules: [...IDS.map(courseId => ({ courseId, level: 100, kind: "compulsory" as const, prereq: { all: [99], anyOf: [] } })), { courseId: 99, level: 100, kind: "compulsory" as const }] });
  const withNinety = new Map(credit); withNinety.set(99, 3);
  const report = explainShortfalls({ ...input([student("a")], spread(50), gated), credit: withNinety });
  check(report.short === 1 && report.totals.prereq + report.totals.other === 1, "متطلبٌ ناقص يحجب المقررات", report.totals);
}
/* غير مطروح */
{
  const few = [off(1, 1, "08:00", "09:00", 50), off(2, 2, "08:00", "09:00", 50)];
  const report = explainShortfalls(input([student("a")], few));
  check(report.short === 1 && report.totals.other === 1, "مقرراتٌ لا تُطرح: «غير مطروح أو بيانات» لا سببٌ مخترع", report.totals);
}
/* لا ظلم: من بلغ 12 لا يدخل في النقص */
{
  const report = explainShortfalls(input([student("a"), student("b")], spread(50)));
  check(report.short === 0 && Object.values(report.totals).every(n => n === 0), "كل الطلبة يبلغون 12: لا نقص ولا أسباب");
}
/* الأكبر */
{
  const totals = { ...emptyCauseTotals(), full: 5, conflict: 9, shared: 20, other: 30 };
  check(dominantCause(totals) === "conflict", "السبب الأكبر يُقدَّم على «مشترك/غير ذلك» الأكثر عدداً");
  check(dominantCause({ ...emptyCauseTotals(), other: 3 }) === "other" && dominantCause(emptyCauseTotals()) === null, "بلا اسمٍ محدد: «غير ذلك» أو لا شيء");
}

/* جاهزية الفصل */
{
  const ok = semesterReadiness({ canReach15: 80, canReach12To14: 10, below12: 10, graduatingBelow12: 0, unknown: 0 }, 100, 95);
  check(ok.score === 92 && ok.tier === "ready" && !ok.weak, `90٪ يبلغون و95٪ مقاعد: ${ok.score} جاهز`, ok);
  const risky = semesterReadiness({ canReach15: 10, canReach12To14: 10, below12: 80, graduatingBelow12: 0, unknown: 0 }, 100, 50);
  check(risky.tier === "risk" && risky.score === 32, `20٪ يبلغون و50٪ مقاعد: ${risky.score} في خطر`, risky);
  const unknown = semesterReadiness({ canReach15: 5, canReach12To14: 0, below12: 0, graduatingBelow12: 0, unknown: 95 }, 10, 10);
  check(unknown.weak && unknown.unknownShare === 95, "أغلبُهم «غير معلوم»: التقدير ضعيف ويُقال", unknown);
  const none = semesterReadiness({ canReach15: 0, canReach12To14: 0, below12: 0, graduatingBelow12: 0, unknown: 0 }, 0, 0);
  check(none.score === null && none.tier === null, "بلا طلبة: لا رقمٌ مخترع");
  check(semesterReadiness(null, 0, 0).score === null, "بلا رادار: لا رقم");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
