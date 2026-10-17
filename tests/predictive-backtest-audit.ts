/**
 * ── الاختبار الرجعي للتنبّؤ: تاريخٌ اصطناعيٌّ متعدّد الفصول ─────────────────
 * يتنبّأ المحرّكُ بكل فصلٍ N بما قبله فقط ويُقاس الخطأ لكل مقرر. **بياناتٌ اصطناعية** نعرف شكلها:
 * لا يُستنتج منها دقةٌ على بياناتٍ حقيقية، وإنما يُفحص أن القياس صحيح وأن الثقة تتبعه.
 */
import { backtestDemand, confidenceFrom, predictDemand, type PredictiveInput } from "../src/utils/predictiveIntelligence";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const terms = Array.from({ length: 9 }, (_, i) => ({ AdTermId: i + 1, AdTermName: `الفصل ${i % 2 === 0 ? "الأول" : "الثاني"} ${2022 + Math.floor(i / 2)}/${2023 + Math.floor(i / 2)}` }));
const course = (id: number, name: string): any => ({ AdCourseId: id, CourseCode: `C${id}`, CourseName: name, CourseCredit: 3, MaxStudent: 30 });
let rid = 0;
const sections = (termId: number, courseId: number, n: number): any[] => Array.from({ length: n }, (_, i) => ({
  id: ++rid, AdCollegeId: 1, AdSectionId: 1, AdTermId: termId, AdCourseId: courseId, SCode: String(i + 1), AdInstructorId: 1,
  fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "09:00", fendtime: "09:50", AdRoomCode: "B", AdRoomHall: String(i + 1),
}));
/* مقرر ١: ثابتٌ تماماً (٣ شعب) · مقرر ٢: قفزاتٌ عنيفة بلا نمط · مقرر ٣: ازدياد خطّي هادئ. */
const wild = [1, 8, 2, 9, 1, 8, 2, 9];
const rows: any[] = [];
for (let t = 1; t <= 8; t += 1) rows.push(...sections(t, 1, 3), ...sections(t, 2, wild[t - 1]), ...sections(t, 3, 2 + Math.floor((t - 1) / 2)));
const input: PredictiveInput = { target: { termId: 9, name: terms[8].AdTermName }, terms, rows, courses: [course(1, "ثابت"), course(2, "متقلّب"), course(3, "متصاعد")] };

const bt = backtestDemand(input);
check(bt.termsTested === 7, `سبعةُ فصولٍ اختُبرت (لكلٍّ فصلٌ سابقٌ على الأقل) — ${bt.termsTested}`);
const steady = bt.byCourse.get(1)!, noisy = bt.byCourse.get(2)!, rising = bt.byCourse.get(3)!;
check(steady.meanAbsError === 0 && steady.relError === 0, "الثابت: خطأٌ رجعيٌّ صفر");
check(noisy.relError > 0.4, `المتقلّب: خطأٌ رجعيٌّ كبير (${Math.round(noisy.relError * 100)}٪)`);
check(rising.relError < noisy.relError && rising.relError > 0, `المتصاعد: خطأٌ بين الاثنين (${Math.round(rising.relError * 100)}٪)`);
check(steady.steps.every(step => step.predicted === 3 && step.actual === 3), "وكل خطوةٍ تُظهر المتوقَّع والفعلي");
/* لا تسرّب: تغيير فصلٍ لاحق لا يغيّر خطأ خطوةٍ سابقة. */
const altered = backtestDemand({ ...input, rows: [...rows.filter(r => r.AdTermId !== 8), ...sections(8, 1, 7)] });
check(JSON.stringify(altered.byCourse.get(1)!.steps.slice(0, 5)) === JSON.stringify(steady.steps.slice(0, 5)), "لا تسرُّب: الخطوات السابقة لا تتأثر بما بعدها");
check(JSON.stringify([...backtestDemand(input).byCourse]) === JSON.stringify([...bt.byCourse]), "حتميّ: التكرار يعطي القياس نفسه");
check(typeof bt.relError === "number" && bt.relError > 0 && bt.relError < 1, `خطأٌ كليّ نسبي (${Math.round((bt.relError || 0) * 100)}٪) على بياناتٍ اصطناعية فقط`);

/* الثقة تتبع الخطأ المقيس. */
const demand = predictDemand(input);
const d = (id: number) => demand.find(x => x.courseId === id)!;
check(d(1).confidence.backtestError === 0 && d(2).confidence.backtestError! > 0.4, "التنبّؤ يحمل خطأه الرجعي");
check(d(2).confidence.score < d(1).confidence.score, `الأخطأُ رجعياً أقلُّ ثقةً (${d(2).confidence.score} < ${d(1).confidence.score})`);
check(d(2).confidence.caveat.length > 0, "ويُقال السبب");
const base = { termsUsed: 6, sameSeason: 3, values: [3, 3, 3, 3, 3, 3] };
const clean = confidenceFrom({ ...base, backtestError: 0 }), bad = confidenceFrom({ ...base, backtestError: 0.8 }), none = confidenceFrom(base);
check(clean.score === none.score && bad.score < clean.score, "الخطأ الرجعي يخفّض الدرجة ولا يرفعها، وغيابُه لا أثر له");
check(confidenceFrom({ ...base, backtestError: 5 }).score >= Math.round(none.score * 0.5) - 1, "والخصمُ محدودٌ بنصف الدرجة");
const short = backtestDemand({ ...input, rows: rows.filter(r => r.AdTermId <= 1) });
check(short.termsTested === 0 && short.relError === null, "تاريخٌ من فصلٍ واحد: لا اختبار ولا رقم");

console.log(`\n${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
