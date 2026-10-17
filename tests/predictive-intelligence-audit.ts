/**
 * ── الذكاء التنبّؤي: تاريخٌ اصطناعيٌّ وحتميّ ─────────────────────────────────
 *
 * لا قاعدةَ بيانات ولا ساعة. كلُّ حالةٍ تُعيد بناءَ تاريخٍ صغيرٍ نعرف جوابَه سلفاً:
 * فنفحص الرقم، ونفحص أن الثقة صادقة (منخفضة حين يقلّ التاريخ، والإجراءُ بضغطة لا يُفعَّل بلا ثقة)،
 * وأن الترتيب أبجديٌّ عربيّ، وأن المخرجات نفسَها تتكرّر.
 */
import {
  CONFIDENCE_LABEL, THIN_HISTORY_CAP, confidenceFrom, isActionable, predictDemand, predictGraduationDelay,
  predictPrereqBottlenecks, predictTimeHotspots, readPredictive, scheduleCompleteness, variation,
  type PredictiveInput,
} from "../src/utils/predictiveIntelligence";
import { compareArabic } from "../src/utils/arabicText";
import { orderRadarCourses } from "../src/utils/registrationSim";
import { predictiveNarrow, predictiveSummaryOf } from "../src/utils/predictiveScope";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

/* ── فصولٌ اصطناعية: الأول/الثاني لثلاث سنوات، والهدف «الثاني 2026/2027» ── */
const terms = [
  { AdTermId: 1, AdTermName: "الفصل الأول 2024/2025" },
  { AdTermId: 2, AdTermName: "الفصل الثاني 2024/2025" },
  { AdTermId: 3, AdTermName: "الفصل الأول 2025/2026" },
  { AdTermId: 4, AdTermName: "الفصل الثاني 2025/2026" },
  { AdTermId: 5, AdTermName: "الفصل الأول 2026/2027" },
  { AdTermId: 6, AdTermName: "الفصل الثاني 2026/2027" },
];
const target = { termId: 6, name: "الفصل الثاني 2026/2027" };
const course = (id: number, name: string, cap = 30): any => ({ AdCourseId: id, CourseCode: `C${id}`, CourseName: name, CourseCredit: 3, MaxStudent: cap });

let rid = 0;
const DAY = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const row = (termId: number, courseId: number, code: string, opts: { day?: number; start?: string; end?: string; room?: string } = {}): any => ({
  id: ++rid, AdCollegeId: 1, AdSectionId: 1, AdTermId: termId, AdCourseId: courseId, AdCourseName: "", SCode: code, AdInstructorId: 1,
  fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, [DAY[opts.day ?? 0]]: true,
  fstarttime: opts.start || "09:00", fendtime: opts.end || "09:50", AdRoomCode: "B", AdRoomHall: opts.room || "1", locationStatus: "VERIFIED", roomId: `r-${opts.room || "1"}`,
});
const sections = (termId: number, courseId: number, n: number, opts: Parameters<typeof row>[3] = {}) =>
  Array.from({ length: n }, (_, i) => row(termId, courseId, String(i + 1), { ...opts, room: opts.room || String(i + 1) }));

/* ═════ ١) الثقة: قواعدٌ صريحة ═════ */
check(confidenceFrom({ termsUsed: 0, sameSeason: 0 }).level === "insufficient", "لا فصولَ ولا إشارةً حيّة ← «لا يكفي التاريخ»");
const thin = confidenceFrom({ termsUsed: 1, sameSeason: 1, values: [4], agreement: 1, quality: 1 });
check(thin.level === "low" && thin.score <= Math.round(THIN_HISTORY_CAP * 100), "فصلٌ واحد ← سقفٌ «منخفضة» مهما اتّفقت الإشارات");
const rich = confidenceFrom({ termsUsed: 5, sameSeason: 3, values: [3, 3, 3, 3, 3], agreement: 1, quality: 1 });
check(rich.level === "high" && rich.score >= 70, "خمسةُ فصولٍ ثابتة ومتّفقة ← عالية");
const noSeason = confidenceFrom({ termsUsed: 5, sameSeason: 0, values: [3, 3, 3, 3, 3], agreement: 1, quality: 1 });
check(noSeason.score < rich.score && /الموسم/.test(noSeason.caveat), "غيابُ الموسم المطابق يخفّض الثقة ويُقال سببه");
const noisy = confidenceFrom({ termsUsed: 5, sameSeason: 3, values: [1, 9, 1, 9, 1] });
check(noisy.score < confidenceFrom({ termsUsed: 5, sameSeason: 3, values: [4, 4, 4, 4, 4] }).score, "التذبذبُ الكبير يخفّض الثقة");
check(variation([4, 4, 4]) === 0 && variation([0, 0]) === 0 && variation([1]) === 0, "معاملُ التغيّر صفرٌ للثابت");
check(isActionable(rich) && !isActionable(thin), "الإجراء بضغطةٍ لا يُفعَّل إلا من متوسطة فأعلى");
check(CONFIDENCE_LABEL.insufficient === "لا يكفي التاريخ", "وللعبارة العربية صيغتها");

/* ═════ ٢) الطلب ═════ */
const courses = [course(1, "أصول التربية"), course(2, "إدارة صفية"), course(3, "اساسيات القياس"), course(4, "بحث تربوي"), course(5, "مقرر وحيد"), course(6, "مقرر بلا تاريخ"), course(7, "مقرر مستقر")];
const history: any[] = [
  /* مقرر ١: شعبتان في كل «ثاني» (فصلا ٢ و٤)، وثلاث في «الأول». */
  ...sections(1, 1, 3), ...sections(2, 1, 2), ...sections(3, 1, 3), ...sections(4, 1, 2), ...sections(5, 1, 3),
  /* مقرر ٢: ثلاثٌ ثم أربع شعب في «الثاني» + كشف متبقٍّ في الفصل ٤ (٤٥ لم يسجلوا، ١٥ شاغر، سعة ٣٠ ← شعبة إضافية). */
  ...sections(2, 2, 3), ...sections(4, 2, 3),
  /* مقرر ٥: طُرح مرةً واحدة فقط. */
  ...sections(4, 5, 2),
  /* ٣ و٤ موجودان ليُرتَّبا. */
  ...sections(2, 3, 1), ...sections(4, 3, 1), ...sections(2, 4, 1), ...sections(4, 4, 1),
  /* مقرر ٧: شعبتان ثابتتان في كل فصل — تاريخٌ كافٍ يصمد أمام الاختبار الرجعي. */
  ...[1, 2, 3, 4, 5].flatMap(t => sections(t, 7, 2)),
];
const planned = [...sections(6, 1, 1), ...sections(6, 2, 4), ...sections(6, 3, 1), ...sections(6, 4, 1)];
const base: PredictiveInput = {
  target, terms, rows: [...history, ...planned], courses,
  stats: [{ termId: 4, remaining: { "2": 45 }, vacant: { "2": 15 } }],
  liveWanted: { "6": 90 },
};
const demand = predictDemand(base);
const byId = (id: number) => demand.find(item => item.courseId === id)!;

check(byId(1).series.join() === "2,2" && byId(1).expected === 2 && byId(1).confidence.sameSeason === 2, `مقرر ١: يُقاس بفصلَي «الثاني» وحدهما (لا بشعب «الأول» الثلاث) (${byId(1).series.join(",")} → ${byId(1).expected})`);
check(byId(1).planned === 1 && byId(1).delta === byId(1).expected - 1, "ويُقارَن بما في جدول الفصل القادم");
check(byId(2).series[byId(2).series.length - 1] === 4, "مقرر ٢: الكشفُ يضيف شعبةً (٣ + ⌈(٤٥−١٥)÷٣٠⌉ = ٤) بقاعدة الإنذار المبكر نفسها");
check(byId(2).planned === 4 && byId(2).expected >= 3 && byId(2).expected <= 4, "ولا يُقترح فتحٌ حين الجدول مطابق");
check(byId(5).confidence.termsUsed === 1 && byId(5).confidence.level === "low", "مقرر طُرح مرةً واحدة ← ثقةٌ منخفضة وعددُ الفصول معلَن (١)");
check(byId(5).action === null || byId(5).action.oneClick === false, "ولا إجراءَ بضغطةٍ بتاريخٍ فصلٍ واحد");
check(byId(6).confidence.level === "insufficient" && byId(6).expected === 3, "مقرر بلا تاريخٍ برغباتٍ حيّةٍ فقط: ٩٠÷٣٠ = ٣ لكن «لا يكفي التاريخ»");
check(byId(6).action !== null && byId(6).action.oneClick === false && Boolean(byId(6).action.disabledReason), "وإجراؤه معطَّلٌ بسببٍ مكتوب — لا يُقدَّم تخمينٌ كأنه حقيقة");
check(byId(7).action?.oneClick === true && byId(7).action.kind === "open-sections", "ومقررٌ بتاريخٍ كافٍ ومستقرٍّ رجعياً يُعطى إجراءً بضغطة");
check(byId(1).confidence.backtestError! > 0 && byId(1).action?.oneClick !== true, "ومقررٌ يخطئ فيه الاختبارُ الرجعي (٣،٢،٣،٢) لا إجراءَ بضغطةٍ له");

const names = demand.map(item => item.name);
const sorted = [...names].sort(compareArabic);
check(JSON.stringify(names) === JSON.stringify(sorted), "قائمةُ التوقّعات أبجديةٌ عربية");
check(names.indexOf("إدارة صفية") < names.indexOf("اساسيات القياس") && names.indexOf("اساسيات القياس") < names.indexOf("أصول التربية") && names.indexOf("أصول التربية") < names.indexOf("بحث تربوي"),
  "والهمزاتُ موحَّدة: «إ» و«ا» و«أ» تُرتَّب كحرفٍ واحد (إدارة < اساسيات < أصول < بحث)");
check(JSON.stringify(demand) === JSON.stringify(predictDemand(base)), "حتميّ: التشغيلُ مرتين يعطي النتيجة نفسها");

/* ترتيب قائمة الرادار الفعلي: التوقعات أبجدية، والرغبات الفعلية بالأثقل أولاً. */
const radarRows = [
  { name: "بحث", code: "B", wanted: 5 }, { name: "أصول", code: "A", wanted: 1 }, { name: "إدارة", code: "I", wanted: 9 },
];
check(orderRadarCourses(radarRows, "projected", () => 0).map(r => r.code).join("") === "IAB", "رادار التسجيل: «التوقعات» أبجدية (إدارة، أصول، بحث)");
check(orderRadarCourses(radarRows, "actual", r => r.wanted).map(r => r.code).join("") === "IBA", "و«الرغبات الفعلية» تبقى بالأثقل أولاً");

/* ═════ ٣) الاختناقات: المسبق ═════ */
const plan = {
  planId: "p1", courseIds: [10, 11], hasApprovedRules: true, groups: [],
  rules: [{ courseId: 10 }, { courseId: 11, prereq: { all: [10], anyOf: [] } }],
} as any;
const credit = new Map<number, number>([[10, 3], [11, 3], [1, 3], [2, 3], [3, 3], [4, 3]]);
const cohort = Array.from({ length: 20 }, (_, i) => ({ fp: `s${i}`, planId: "p1", passed: [] as number[], assessable: true }));
const prereqInput = (plannedSections: number, cap: number): PredictiveInput => ({
  target, terms, courses: [course(10, "حساب ١", cap), course(11, "حساب ٢", cap)],
  rows: [...[2, 4].flatMap(t => [...sections(t, 10, 1), ...sections(t, 11, 1)]), ...sections(5, 10, 1), ...sections(6, 11, 1), ...sections(6, 10, plannedSections)],
  students: cohort as any, plans: [plan], credit,
});
const none = predictPrereqBottlenecks(prereqInput(0, 30));
check(none.length === 1 && none[0].courseId === 10 && none[0].blockedStudents === 20 && none[0].plannedSections === 0, "المسبقُ بلا شعبة ← اختناق: ٢٠ طالباً محجوزين");
check(none[0].dependents[0] === "حساب ٢", "ويُسمّي التابعَ الذي يحجبه");
check(predictPrereqBottlenecks(prereqInput(1, 30)).length === 0, "شعبةٌ واحدة بسعة ٣٠ لعشرين طالباً ← لا اختناق");
const short = predictPrereqBottlenecks(prereqInput(1, 10));
check(short.length === 1 && short[0].plannedSeats === 10 && short[0].seatsShort === 10 && short[0].action?.count === 1, "وسعةٌ ١٠ لعشرين ← عجز ١٠ مقاعد ويُقترح شعبة");
check(none[0].confidence.termsUsed === 3 && none[0].confidence.level !== "high", "وتحمل ثقتُه عددَ الفصول المستعملة (٣) ولا تبلغ «عالية» بتاريخٍ قصير");
const unassessed = predictPrereqBottlenecks({ ...prereqInput(0, 30), students: cohort.map(s => ({ ...s, assessable: false })) as any });
check(unassessed.length === 0, "طلبةٌ غير قابلين للتقييم لا يُبنى عليهم اختناق");

/* ═════ ٤) الاختناقات: الساعات المزدحمة ═════ */
const crowdHistory = [2, 4].flatMap(t => [...sections(t, 1, 3, { day: 0, start: "10:00", end: "10:50" })]);
const crowdTarget = [...sections(6, 1, 6, { day: 0, start: "10:00", end: "10:50" }), ...sections(6, 2, 1, { day: 0, start: "13:00", end: "13:50" })];
const hot = predictTimeHotspots({ target, terms, courses, rows: [...crowdHistory, ...sections(1, 2, 2), ...crowdTarget] });
check(hot.length >= 1 && hot[0].day === "الأحد" && hot[0].from === "10:00" && hot[0].planned === 6 && hot[0].historicalPeak === 3, "ستُّ شعبٍ الأحد ١٠:٠٠ بعد أن كان الأقصى ثلاثاً ← ساعةٌ مزدحمة");
check(Boolean(hot[0].calmer) && hot[0].calmer!.planned < hot[0].planned, "ويُقترح أهدأُ بديلٍ في اليوم نفسه");
check(hot[0].action.kind === "review-timeslot" && hot[0].action.oneClick === false, "والإجراءُ فتحُ الورشة للمراجعة لا تحريكٌ آلي");
check(predictTimeHotspots({ target, terms, courses, rows: crowdTarget }).length === 0, "بلا تاريخٍ لا يُدّعى ازدحامٌ مقارَن");

/* ═════ ٥) اكتمال الجدول يخفّض الثقة ═════ */
const incomplete = readPredictive({ ...base, rows: [...history, ...sections(6, 1, 1)] });
check((scheduleCompleteness({ ...base, rows: [...history, ...sections(6, 1, 1)] }) ?? 1) < 0.6 && incomplete.caveats.some(text => /لم يكتمل/.test(text)), "جدولٌ ناقصٌ يُعلَن تحذيراً صريحاً");

/* ═════ ٦) تأخّر التخرّج ═════ */
const gradPlan = {
  planId: "g", courseIds: [1, 2, 3, 4], hasApprovedRules: true, groups: [],
  rules: [{ courseId: 1 }, { courseId: 2, prereq: { all: [1], anyOf: [] } }, { courseId: 3, prereq: { all: [2], anyOf: [] } }, { courseId: 4 }],
} as any;
/* المقرر ٣ يُطرح في «الأول» فقط (فصول ١، ٣، ٥)، والهدف «ثاني». */
const gradHistory = [1, 2, 3, 4, 5].flatMap(t => [...sections(t, 1, 1), ...sections(t, 2, 1), ...sections(t, 4, 1), ...(t % 2 === 1 ? sections(t, 3, 1) : [])]);
const gradInput = (students: any[]): PredictiveInput => ({ target, terms, courses, rows: gradHistory, students, plans: [gradPlan], credit });
const grad = predictGraduationDelay(gradInput([
  { fp: "a", planId: "g", passed: [1, 2], assessable: true },
  { fp: "b", planId: "g", passed: [1, 2, 3], assessable: true },
  { fp: "c", planId: "g", passed: [], assessable: true },
  { fp: "x", planId: "none", passed: [], assessable: true },
]));
const A = grad.students.find(s => s.fp === "a")!, B = grad.students.find(s => s.fp === "b")!, C = grad.students.find(s => s.fp === "c")!;
check(A.idealTerms === 1 && A.expectedTerms === 2 && A.delay === 1 && A.causeCourseIds.join() === "3", "طالبٌ يحتاج ٣ وهو لا يُطرح في «الثاني»: يتأخر فصلاً بسبب ٣");
check(B.delay === 0 && B.expectedTerms === 1, "وآخر يحتاج ٤ فقط: في موعده");
check(C.idealTerms === 3 && C.expectedTerms === 4 && C.delay === 1 && C.causeCourseIds.join() === "3", "وسلسلةُ ١←٢←٣ لمن لم يبدأ: ثلاثُ فصولٍ بنيوياً، وأربعٌ لأن ٣ يقع في «الثاني» الذي لا يُطرح فيه");
check(grad.unassessed === 1 && grad.total === 4, "وغير القابل للتقييم يُعدّ ولا يُحكم عليه");
check(grad.onTime === 1 && grad.delayed1 === 2 && grad.delayed2plus === 0, "والتوزيع: ١ في موعده، ٢ يتأخران فصلاً");
check(grad.causes.length === 1 && grad.causes[0].courseId === 3 && grad.causes[0].missingSeason === "الثاني" && grad.causes[0].delayedStudents === 2, "والسببُ مقرر ٣ وموسمُه الناقص «الثاني»");
check(grad.causes[0].action?.kind === "offer-in-season" && grad.causes[0].confidence.termsUsed === 5, "والإجراء اطرحه في ذلك الموسم، وثقتُه تحمل ٥ فصول");
const noSeasonEvidence = predictGraduationDelay({ ...gradInput([{ fp: "a", planId: "g", passed: [1, 2], assessable: true }]), rows: [] });
check(noSeasonEvidence.students[0].delay === 0 && /لا تاريخ/.test(noSeasonEvidence.note), "بلا تاريخ مواسم لا يُدّعى تأخّرٌ موسمي");
check(JSON.stringify(grad) === JSON.stringify(predictGraduationDelay(gradInput([
  { fp: "a", planId: "g", passed: [1, 2], assessable: true }, { fp: "b", planId: "g", passed: [1, 2, 3], assessable: true },
  { fp: "c", planId: "g", passed: [], assessable: true }, { fp: "x", planId: "none", passed: [], assessable: true },
]))), "حتميّ: محاكاةُ التخرّج تتكرّر");

/* ═════ ٧) الحزمة والصدق ═════ */
const empty = readPredictive({ target, terms, rows: [], courses, liveWanted: { "6": 60 } });
check(empty.historyTerms === 0 && empty.caveats.some(text => /لا فصلَ سابقاً/.test(text)), "بلا تاريخ: تحذيرٌ صريح");
check(empty.top.every(item => !isActionable(item.confidence) || item.action.oneClick === false), "وبلا تاريخ لا يظهر في «أهم الإجراءات» ما هو بضغطةٍ مؤكَّدة");
const full = readPredictive({ ...base, students: cohort as any, plans: [plan], credit });
check(full.historyTerms === 5 && full.historyNames.length === 5, "الحزمة تصرّح بعدد الفصول السابقة المستعملة");
check(full.top.length > 0 && full.top.every((item, i, list) => i === 0 || item.confidence.score * item.impact <= list[i - 1].confidence.score * list[i - 1].impact + 1e-9), "وأهمُّ الإجراءات مرتّبةٌ بالأثر × الثقة");
check(full.top.every(item => item.reason.length > 0 && item.confidence.termsUsed >= 0), "ولكلٍّ سطرُ سببٍ وثقةٌ بعدد الفصول");

/* ═════ ٨) نطاق التنبّؤ وملخّص البطاقة ═════ */
const sectionsList = [
  { AdCollegeId: 1, AdSectionId: 10, AdSectionName: "قسم الرياضيات" }, { AdCollegeId: 2, AdSectionId: 20, AdSectionName: "الرياضيات" },
  { AdCollegeId: 1, AdSectionId: 11, AdSectionName: "الفيزياء" },
];
const hereOnly = predictiveNarrow({ analysisScope: "college", collegeId: "1", sectionId: "10" }, sectionsList)!;
const familyWide = predictiveNarrow({ analysisScope: "department", collegeId: "1", sectionId: "10" }, sectionsList)!;
check(hereOnly.match(1, 10) && !hereOnly.match(2, 20) && !hereOnly.match(1, 11), "«هذه الكلية»: القسم المفتوح في هذه الكلية وحده");
check(familyWide.match(1, 10) && familyWide.match(2, 20) && !familyWide.match(1, 11), "«كل كليات القسم»: عائلة القسم عبر الكليات دون أقسامٍ أخرى");
check(hereOnly.key !== familyWide.key, "ومفتاحا الذاكرة مختلفان فلا يتشاركان قراءة");
check(predictiveNarrow({}, sectionsList) === null && predictiveNarrow({ analysisScope: "college" }, sectionsList) === null, "بلا نطاقٍ صريح لا تضييق (يبقى شرطُ صلاحيات القارئ وحده)");
check(predictiveNarrow({ analysisScope: "college", collegeId: 1 }, sectionsList)!.match(1, 11), "ونداءٌ قديم بكليةٍ بلا قسم يعني كل أقسام الكلية");
const sumFull = predictiveSummaryOf(full), sumEmpty = predictiveSummaryOf(empty);
check(sumFull.historyTerms === 5 && !sumFull.thin && sumFull.actions === full.top.length && sumFull.best?.label === full.top[0].label, "الملخّص: عمقُ التاريخ وعددُ المقترحات وأفضلُها من القراءة نفسها");
check(sumEmpty.thin && sumEmpty.actions === empty.top.length, "وبلا تاريخٍ يُعلَن أنه غير كافٍ");
check(predictiveSummaryOf({ historyTerms: 1, top: [] }).thin && !predictiveSummaryOf({ historyTerms: 2, top: [] }).thin, "وفصلٌ واحد = غير كافٍ، فصلان = كافٍ للعرض");

console.log(`\n${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
