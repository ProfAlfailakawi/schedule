/**
 * ── الاختبار الرجعي للتنبّؤ: تاريخٌ اصطناعيٌّ متعدّد الفصول ─────────────────
 * يتنبّأ المحرّكُ بكل فصلٍ N بما قبله فقط ويُقاس الخطأ لكل مقرر. **بياناتٌ اصطناعية** نعرف شكلها:
 * لا يُستنتج منها دقةٌ على بياناتٍ حقيقية، وإنما يُفحص أن القياس صحيح وأن الثقة تتبعه.
 */
import { backtestBottlenecks, backtestDemand, backtestGraduation, backtestHotspots, confidenceFrom, predictDemand, predictGraduationDelay, predictPrereqBottlenecks, predictTimeHotspots, readPredictive, BACKTEST_MAX_PENALTY, type PredictiveInput } from "../src/utils/predictiveIntelligence";

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


/* ═════════════ الاختناقات: اختبارٌ رجعي ═════════════ */
const plan: any = {
  planId: "p", courseIds: [10, 11, 20, 21], hasApprovedRules: true, groups: [],
  rules: [{ courseId: 10 }, { courseId: 11, prereq: { all: [10], anyOf: [] } }, { courseId: 20 }, { courseId: 21, prereq: { all: [20], anyOf: [] } }],
};
const credit = new Map<number, number>([[10, 3], [11, 3], [20, 3], [21, 3]]);
const cohort: any[] = Array.from({ length: 40 }, (_, i) => ({ fp: `s${i}`, planId: "p", passed: [], assessable: true }));
const bCourses = [course(10, "مسبق ثابت"), course(11, "تابع ١"), course(20, "مسبق متقلّب"), course(21, "تابع ٢")];
/* ١٠: شعبة واحدة دائماً (٣٠ مقعداً لأربعين) ← مختنق دائماً · ٢٠: شعبتان ثم لا شيء بالتناوب. */
const bRows = (steadyOnly: boolean, lastTerm = 8, tweak?: (t: number) => number): any[] => {
  const out: any[] = [];
  for (let t = 1; t <= lastTerm; t += 1) out.push(...sections(t, 10, 1), ...sections(t, 20, steadyOnly ? 1 : tweak ? tweak(t) : t % 2 ? 2 : 0));
  return out;
};
const bInput = (steadyOnly: boolean, extra: Partial<PredictiveInput> = {}): PredictiveInput => ({
  target: { termId: 9, name: terms[8].AdTermName }, terms, rows: bRows(steadyOnly), courses: bCourses, students: cohort, plans: [plan], credit, ...extra,
});
const bSteady = backtestBottlenecks(bInput(true)), bNoisy = backtestBottlenecks(bInput(false));
check(bSteady.termsTested === 7 && bSteady.relError === 0, `اختناقٌ ثابتٌ مُتوقَّعٌ كما وقع: خطأٌ صفر عبر ${bSteady.termsTested} فصول`);
check(bNoisy.relError !== null && bNoisy.relError > 0.1 && bNoisy.relError <= 1, `شعبٌ متقلّبة تُخطئ التوقّع: خطأ ${Math.round((bNoisy.relError || 0) * 100)}٪`);
check(bNoisy.steps.every(step => step.predicted.includes(10) && step.actual.includes(10)), "وكل خطوةٍ تحفظ المتوقَّع والفعلي (مقرر ١٠ مختنقٌ في الاثنين)");
const bAltered = backtestBottlenecks(bInput(false, { rows: [...bRows(false, 7), ...sections(8, 10, 5), ...sections(8, 20, 5)] }));
check(JSON.stringify(bAltered.steps.slice(0, 6)) === JSON.stringify(bNoisy.steps.slice(0, 6)), "اختناقات: لا تسرّب — تغيير الفصل ٨ لا يغيّر خطوات الفصول ≤ ٧");
const snapshotted = backtestBottlenecks(bInput(false, { students: [], studentsByTerm: { "5": cohort.slice(0, 5) } }));
check(snapshotted.steps.length === 7 && snapshotted.steps.find(step => step.termId === 5)!.predicted.length === 0, "ولقطةُ الطلبة لفصلٍ بعينه تُستعمل لذلك الفصل وحده");
check(JSON.stringify(backtestBottlenecks(bInput(false))) === JSON.stringify(bNoisy), "اختناقات: حتميّ");
check(backtestBottlenecks(bInput(false, { students: [] })).relError === null && backtestBottlenecks(bInput(false, { rows: bRows(false, 1) })).termsTested === 0, "بلا طلبةٍ أو بفصلٍ واحد: لا رقم");
const pb = (input: PredictiveInput, options?: any) => predictPrereqBottlenecks({ ...input, rows: [...input.rows, ...sections(9, 10, 1), ...sections(9, 20, 0)] }, options);
const pbWith = pb(bInput(false)).find(item => item.courseId === 20)!, pbWithout = pb(bInput(false), { backtest: false }).find(item => item.courseId === 20)!;
check(pbWith.confidence.backtestError === bNoisy.relError && pbWith.confidence.score < pbWithout.confidence.score, `الاختناق يحمل الخطأ الرجعي ويخفّض ثقته (${pbWithout.confidence.score} ← ${pbWith.confidence.score})`);
const pbHuge = pb(bInput(false), { backtestError: 9 }).find(item => item.courseId === 20)!;
check(pbHuge.confidence.score >= Math.round(pbWithout.confidence.score * (1 - BACKTEST_MAX_PENALTY)) - 1 && pbHuge.confidence.score <= pbWithout.confidence.score, "والخصمُ لا يتجاوز النصف ولا يرفع الدرجة");

/* ═════════════ الساعات المزدحمة ═════════════ */
const hotRows = (noisy: boolean, lastTerm = 8): any[] => {
  const out: any[] = [];
  const slot = (t: number, courseId: number, n: number, day: "fsunday" | "ftuesday", start: string, end: string) => {
    for (let i = 0; i < n; i += 1) out.push({ id: ++rid, AdCollegeId: 1, AdSectionId: 1, AdTermId: t, AdCourseId: courseId, SCode: `${courseId}-${i}`, AdInstructorId: 1,
      fsunday: day === "fsunday", fmonday: false, ftuesday: day === "ftuesday", fwednesday: false, fthursday: false, fstarttime: start, fendtime: end, AdRoomCode: "H", AdRoomHall: String(i + 1) });
  };
  for (let t = 1; t <= lastTerm; t += 1) {
    slot(t, 1, 4, "fsunday", "10:00", "10:50");
    slot(t, 2, noisy ? (t % 2 ? 4 : 1) : 4, "ftuesday", "11:00", "11:50");
  }
  return out;
};
const hInput = (noisy: boolean, rows = hotRows(noisy)): PredictiveInput => ({ target: { termId: 9, name: terms[8].AdTermName }, terms, rows, courses: [course(1, "أ"), course(2, "ب")] });
const hSteady = backtestHotspots(hInput(false)), hNoisy = backtestHotspots(hInput(true));
check(hSteady.termsTested === 7 && hSteady.relError === 0, "ازدحامٌ ثابت: خطأٌ صفر");
check(hNoisy.relError !== null && hNoisy.relError > 0 && hNoisy.relError < 1, `ازدحامٌ متناوب يُخطئ: ${Math.round((hNoisy.relError || 0) * 100)}٪`);
check(JSON.stringify(backtestHotspots(hInput(true, [...hotRows(true, 7), ...hotRows(false, 8).filter(r => r.AdTermId === 8)])).steps.slice(0, 6)) === JSON.stringify(hNoisy.steps.slice(0, 6)), "ساعات: لا تسرّب من الفصل ٨");
check(JSON.stringify(backtestHotspots(hInput(true))) === JSON.stringify(hNoisy), "ساعات: حتميّ");
const hotPlanned = [...hotRows(true), ...hotRows(false, 9).filter(r => r.AdTermId === 9)];
const hWith = predictTimeHotspots(hInput(true, hotPlanned)), hWithout = predictTimeHotspots(hInput(true, hotPlanned), { backtest: false });
check(hWith.length > 0 && hWith[0].confidence.backtestError === hNoisy.relError && hWith[0].confidence.score < hWithout[0].confidence.score, "الساعةُ المزدحمة تحمل الخطأ الرجعي وتنخفض ثقتها");

/* ═════════════ تأخّر التخرّج ═════════════ */
const gPlan: any = {
  planId: "g", courseIds: [1, 2, 3, 4], hasApprovedRules: true, groups: [],
  rules: [{ courseId: 1 }, { courseId: 2, prereq: { all: [1], anyOf: [] } }, { courseId: 3, prereq: { all: [2], anyOf: [] } }, { courseId: 4 }],
};
const gCredit = new Map<number, number>([[1, 3], [2, 3], [3, 3], [4, 3]]);
const gStudents: any[] = [
  { fp: "a", planId: "g", passed: [1, 2], assessable: true }, { fp: "b", planId: "g", passed: [1, 2], assessable: true }, { fp: "c", planId: "g", passed: [1, 2, 3], assessable: true },
];
/* ٣ يُطرح في الفصول الفردية («الأول») فقط في النمط المنتظم؛ وفي النمط غير المنتظم بلا نمطٍ موسمي. */
const offers3 = (regular: boolean, t: number) => regular ? t % 2 === 1 : [true, true, false, false, true, false, false, true][t - 1];
const gRows = (regular: boolean, lastTerm = 8): any[] => Array.from({ length: lastTerm }, (_, i) => i + 1).flatMap(t => [...sections(t, 1, 1), ...sections(t, 2, 1), ...sections(t, 4, 1), ...(offers3(regular, t) ? sections(t, 3, 1) : [])]);
const gInput = (regular: boolean, rows = gRows(regular)): PredictiveInput => ({ target: { termId: 9, name: terms[8].AdTermName }, terms, rows, courses: [1, 2, 3, 4].map(id => course(id, `م${id}`)), students: gStudents, plans: [gPlan], credit: gCredit });
const gReg = backtestGraduation(gInput(true)), gIrr = backtestGraduation(gInput(false));
check(gReg.relError !== null && gIrr.relError !== null && gReg.relError >= 0 && gIrr.relError <= 1, `تخرّج: خطآن مقيسان ضمن ٠–١ (منتظم ${Math.round((gReg.relError || 0) * 100)}٪ · غير منتظم ${Math.round((gIrr.relError || 0) * 100)}٪)`);
check(gIrr.relError! > gReg.relError!, "وطرحٌ بلا نمطٍ موسمي أخطأُ من الطرح المنتظم");
check(gReg.steps.some(step => step.students > 0) && gReg.steps.every(step => step.students + step.censored <= gStudents.length), "ويُحجب (censored) من لم تكتمل نتيجته ولا يُحتسب");
const gLaterChanged = backtestGraduation(gInput(true, [...gRows(true, 6), ...sections(7, 1, 1), ...sections(8, 3, 3)]));
check(gLaterChanged.steps.slice(0, 5).every((step, i) => step.predictedDelayed === gReg.steps[i].predictedDelayed), "تخرّج: لا تسرّب — ما يُتوقَّع عند حدٍّ لا يتأثر بفصولٍ بعده");
check(JSON.stringify(backtestGraduation(gInput(false))) === JSON.stringify(gIrr), "تخرّج: حتميّ");
check(backtestGraduation({ ...gInput(true), students: [] }).relError === null && backtestGraduation(gInput(true, gRows(true, 1))).termsTested === 0, "بلا طلبة أو بفصلٍ واحد: لا رقم");
const gWith = predictGraduationDelay(gInput(false)), gWithout = predictGraduationDelay(gInput(false), { backtest: false });
check(gWith.confidence.backtestError === gIrr.relError && gWith.confidence.score <= gWithout.confidence.score, `ثقة التخرّج لا ترتفع بالخطأ الرجعي (${gWithout.confidence.score} → ${gWith.confidence.score})`);
const gHuge = predictGraduationDelay(gInput(false), { backtestError: 9 });
check(gHuge.confidence.score >= Math.round(gWithout.confidence.score * (1 - BACKTEST_MAX_PENALTY)) - 1, "والخصمُ مقصورٌ على النصف");
const reading = readPredictive({ ...gInput(false), students: gStudents });
check(reading.backtests.graduation === gIrr.relError && reading.backtests.termsTested.graduation === gIrr.termsTested && "demand" in reading.backtests, "الحزمة تعرض الأخطاء الرجعية الأربعة للواجهة");

console.log(`\n${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
