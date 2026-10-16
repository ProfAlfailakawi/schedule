/**
 * ── مقترحُ الطالب: «سجّل هذه لأنها تفتح لك كذا» ──────────────────────────────────
 *   A1 المسبقُ يمنع: لا يُقترح ما ينقصه مسبقُه، ويُذكر في «ينتظرك» بما ينقصه.
 *   A2 الأولى هو الأكثر فتحاً: عقدةُ السلسلة تسبق الورقة، والسببُ يذكر ما تفتحه.
 *   A3 المطروحُ وحدَه يُقترح، وغيرُ المطروح يُذكر منفصلاً.
 *   A4 الاختياريُّ بمجموعته: لا يُقترح منه أكثرُ مما تحتاجه المجموعة.
 *   A5 الوحداتُ لا تتجاوز هدفَه، والتخرّجُ المقدَّر يُحاكى فصلاً فصلاً.
 *   A6 مستوى ٤٠٠ بحدّ وحداتٍ لا يُقترح لمن دونه، ويُقترح حين يبلغه.
 */
import { adviseStudent, type AdviceInput } from "../src/utils/studentAdvice";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};

const names: Record<number, string> = { 1: "مدخل", 2: "أسس", 3: "تصميم", 4: "إنتاج", 5: "مشروع", 6: "حرّ أ", 7: "حرّ ب", 8: "حرّ ج", 9: "متقدّم" };
const codes: Record<number, string> = { 1: "TEC101", 2: "TEC102", 3: "TEC201", 4: "TEC202", 5: "TEC401", 6: "TEC301", 7: "TEC302", 8: "TEC303", 9: "TEC402" };
const credit = new Map(Object.keys(names).map(id => [Number(id), 3] as const));
const base = (over: Partial<AdviceInput> = {}): AdviceInput => ({
  planCourseIds: [1, 2, 3, 4, 5, 6, 7, 8], passed: [], passedUnits: 0,
  rules: [
    { courseId: 1, kind: "compulsory" }, { courseId: 2, kind: "compulsory" },
    { courseId: 3, kind: "compulsory", prereq: { all: [1], anyOf: [] } },
    { courseId: 4, kind: "compulsory", prereq: { all: [2], anyOf: [] } },
    { courseId: 5, kind: "compulsory", prereq: { all: [3, 4], anyOf: [] } },
    { courseId: 6, kind: "elective", groupId: "g" }, { courseId: 7, kind: "elective", groupId: "g" }, { courseId: 8, kind: "elective", groupId: "g" },
  ],
  groups: [{ id: "g", name: "اختياري", minCourses: 1, minUnits: 3, courseIds: [6, 7, 8] }],
  credit, name: id => names[id], code: id => codes[id], offered: () => true, targetUnits: 15, ...over,
});

{
  const a = adviseStudent(base());
  const ids = a.picks.map(p => p.courseId);
  check(!ids.includes(3) && !ids.includes(4) && !ids.includes(5), "A1 لا يُقترح ما ينقصه مسبقُه (٣ و٤ و٥)", ids);
  check(a.waiting.some(w => w.courseId === 5 && w.reason.includes("«تصميم»")), "A1 «ينتظرك» يقول بعد ماذا", a.waiting);
  check(ids.includes(1) && ids.includes(2), "A2 المدخلان يُقترحان أولاً", ids);
  const first = a.picks.find(p => p.courseId === 1)!;
  check(first.why.includes("يفتح لك") && first.why.includes("«تصميم»"), "A2 السببُ يذكر ما يفتحه", first.why);
  check(a.picks.filter(p => [6, 7, 8].includes(p.courseId)).length <= 1, "A4 لا يُقترح من المجموعة أكثرُ مما تحتاجه", ids);
  check(a.units <= 15, "A5 لا يتجاوز هدفَ الوحدات", a.units);
}
{
  const a = adviseStudent(base({ offered: id => id !== 2 }));
  check(!a.picks.some(p => p.courseId === 2) && a.notOffered.includes("أسس"), "A3 غيرُ المطروح لا يُقترح ويُذكر منفصلاً", { picks: a.picks.map(p => p.courseId), no: a.notOffered });
}
{
  const a = adviseStudent(base({ passed: [1, 2, 3, 4], passedUnits: 12 }));
  check(a.picks[0]?.courseId === 5 && a.picks[0].why.includes("لتخرّجك"), "A2 الباقي الإجباريُّ يُقال له «مطلوب لتخرّجك»", a.picks);
  check(a.termsAfter === 0 || a.termsAfter === 1, "A5 فصولٌ قليلة بعد هذا الفصل", a.termsAfter);
}
{
  const done = adviseStudent(base({ passed: [1, 2, 3, 4, 5, 6], passedUnits: 18 }));
  check(done.done && done.picks.length === 0 && done.line.includes("أنجزت"), "A5 من أنجز كل صحيفته يُقال له ذلك");
}
{
  const chain = adviseStudent(base({ planCourseIds: [1, 2, 3, 4, 5], groups: [], rules: base().rules.filter(r => r.courseId <= 5), targetUnits: 6 }));
  check(chain.units <= 6 && chain.termsAfter !== null && chain.termsAfter >= 2, "A5 المحاكاةُ تعدّ الفصولَ التالية (٣ مستويات)", { units: chain.units, after: chain.termsAfter });
}
{
  const gated = (units: number) => adviseStudent(base({
    planCourseIds: [1, 9], groups: [], passed: [1], passedUnits: units, rules: [{ courseId: 1, kind: "compulsory" }, { courseId: 9, kind: "compulsory", prereq: { all: [], anyOf: [], minUnits: 60 } }],
  }));
  check(!gated(30).picks.some(p => p.courseId === 9) && gated(30).waiting[0]?.reason.includes("30"), "A6 مستوى ٤٠٠ بحدّ ٦٠ وحدة لا يُقترح لمن أنجز ٣٠ ويُقال كم ينقصه", gated(30).waiting);
  check(gated(60).picks.some(p => p.courseId === 9), "A6 ويُقترح حين يبلغ الحدّ");
}
{
  const noRules = adviseStudent(base({ rules: [], groups: [] }));
  check(!noRules.hasRules && noRules.picks.length > 0, "A1 بلا قواعد معتمدة: يُقترح بحسب المطروح وتُعلَن غيبةُ القواعد");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
