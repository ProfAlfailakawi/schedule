/**
 * ── الذكاء التنبّؤي: ماذا سيحتاج الفصلُ القادم؟ ─────────────────────────────
 *
 * طبقةٌ واحدةٌ فوق ما في النظام فعلاً (لا نسخةٌ ثانية منه):
 *   · شعبُ الفصول السابقة ورموزُها (`FSchedule`) — كم شعبةً طُرحت لكل مقرر في كل فصل؛
 *   · كشفُ «الذين لم يسجلوا» و«المقاعد المتبقية» لكل فصل (`RegistrationStats`) — ما بقي بلا مقعد،
 *     بالقاعدة نفسها التي يقرؤها «الإنذار المبكر» (termForecast: الشاغرُ يُخصَم ثم ⌈الباقي ÷ السعة⌉)؛
 *   · رغباتُ الطلبة الحيّة التي يحسبها الرادار (`wanted`) — الإشارةُ الوحيدة عن الفصل القادم نفسه؛
 *   · ملفّاتُ الطلبة وقواعدُ الصحائف المعتمدة (`registrationSim` / `curriculumRules`).
 *
 * يتنبّأ بثلاثة أشياء، ولكلٍّ منها **درجةُ ثقةٍ وعددُ الفصول المستعملة**:
 *   ١) الطلبُ: كم شعبةً تُفتح لكل مقرر (مدى وقيمةٌ متوقّعة) ومقارنتُها بما في الجدول المخطَّط؛
 *   ٢) الاختناقات: مقررٌ مسبقٌ يحجز دفعةً كاملة، وساعاتٌ يزدحم فيها ما لم يعرفه القسمُ من قبل؛
 *   ٣) تأخّرُ التخرّج لكل طالب: محاكاةٌ للفصول القادمة بحمولة ١٥ وحدة، وبقيد أن المقرّر لا يُطرح
 *      إلا في الفصل (أولى/ثانية/صيفية) الذي طُرح فيه تاريخياً.
 * ثم يقترح إجراءً واحداً بضغطة لكلٍّ ما أمكن، بسطرِ سببٍ واحد.
 *
 * **حتميٌّ بلا عشوائيةٍ ولا ساعةٍ**: المدخلاتُ نفسُها تُنتج المخرجاتِ نفسَها. ولا يلمس قاعدةَ بيانات.
 *
 * **الصدقُ قبل الإبهار** — قواعدُ لا تُكسَر:
 *   · لا رقمَ بلا فصولٍ سابقة: تاريخٌ فارغ ← «لا يكفي التاريخ»، لا تخمين؛
 *   · فصلٌ واحدٌ لا يرفع الثقةَ فوق «منخفضة» مهما كان الرقم (سقفٌ صريح)؛
 *   · لا إجراءَ بضغطةٍ إلا من ثقةٍ متوسطةٍ فأعلى؛ ما دونها يُعرض اقتراحاً للمراجعة معطَّلاً بسببه؛
 *   · جدولٌ لم يكتمل (أقلُّ بكثيرٍ مما اعتاده القسم) يُخفّض ثقةَ كلِّ ما يُقاس عليه، ويُقال ذلك.
 */
import type { AdCourse, FSchedule } from "../types";
import { AR, countOf } from "./arabicCount";
import { compareArabic } from "./arabicText";
import { prereqMet, remainingNeed, unmetPrereq } from "./curriculumRules";
import { roomIdentityKey } from "./locationRegistry";
import { SIM_UNITS_DEFAULT, SIM_UNITS_MAX, type SimPlanRules, type SimStudent } from "./registrationSim";
import { termChronology, termSeasonOf, type TermSeason } from "./termSequence";

/* ═══════════════════════════ الثقة ═══════════════════════════ */

export type ConfidenceLevel = "high" | "medium" | "low" | "insufficient";
export interface Confidence {
  level: ConfidenceLevel;
  /** ٠–١٠٠. */
  score: number;
  /** الفصولُ السابقة التي بُني عليها هذا التنبّؤ بعينه. */
  termsUsed: number;
  /** منها ما كان من موسم الفصل المستهدف نفسه (أول/ثانٍ/صيفي). */
  sameSeason: number;
  /** سببٌ واحد بالعربية يشرح الدرجة، يُعرض عند الحاجة. */
  caveat: string;
  /** الخطأ النسبيّ المقيس بالاختبار الرجعي على فصولٍ مضت (٠–١+)؛ غائبٌ = لم يُختبر بعد. */
  backtestError?: number | null;
}

/** كم فصلاً يكفي لتغطيةٍ كاملة: أربعة (عامان بموسمَين). دونها تُحسب التغطيةُ جزئية. */
export const FULL_HISTORY_TERMS = 4;
/** حدُّ الثقة العليا والمتوسطة. */
export const CONFIDENCE_HIGH = 0.7;
export const CONFIDENCE_MEDIUM = 0.45;
/** سقفُ من لم يُرَ إلا في فصلٍ واحد: لا يتجاوز «منخفضة». */
export const THIN_HISTORY_CAP = 0.34;

export interface ConfidenceInput {
  termsUsed: number;
  sameSeason: number;
  /** القيمُ التاريخية التي بُني عليها المتوسط (لقياس الثبات). */
  values?: readonly number[];
  /** ٠–١: اتفاقُ الإشارتين (التاريخ والرغبات الحيّة). غائبٌ = لا إشارة ثانية. */
  agreement?: number | null;
  /** ٠–١: جودة المدخلات الأخرى (اكتمال الجدول، نسبة الطلبة القابلين للتقييم). */
  quality?: number | null;
  /**
   * الخطأ النسبيّ الرجعي: متوسطُ |المتوقَّع − الفعلي| ÷ متوسط الفعلي حين تنبّأ المحرّكُ بفصلٍ مضى بما قبله فقط.
   * يخفّض الثقةَ بحتى النصف (عند ١٠٠٪ خطأ)، ولا يرفعها أبداً. null = لا فصلَ يكفي للاختبار فلا أثر.
   */
  backtestError?: number | null;
}

/** أقصى ما يخصمه الخطأ الرجعي من الدرجة (نصفها). */
export const BACKTEST_MAX_PENALTY = 0.5;
/** خطأٌ رجعيٌّ فوقه يُذكر صراحةً في سبب الثقة. */
export const BACKTEST_CAVEAT_AT = 0.25;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** معاملُ التغيّر: الانحرافُ المعياري ÷ المتوسط (صفرٌ حين لا تغيّر). */
export function variation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return values.every(v => v === 0) ? 0 : 1;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * ثقةٌ واحدةٌ لكل تنبّؤ. المتوسطُ المرجَّح لمكوّناتٍ حاضرة فقط:
 *   التاريخ (٤٥) = فصولٌ مستعملة ÷ ٤ · الثبات (٢٥) = ١ − معاملُ التغيّر (٤٠٪ إن قلّت القيم عن ثلاث)
 *   الاتفاق (٢٠) = توافقُ الإشارتين · الجودة (١٠) = اكتمالُ المدخلات.
 * ثم: لا موسمَ مطابقاً ← ×٠٫٧٥ · فصلٌ واحدٌ أو أقل ← سقف ٣٤٪ · صفرُ فصولٍ بلا إشارةٍ حيّة ← «لا يكفي التاريخ».
 */
export function confidenceFrom(input: ConfidenceInput): Confidence {
  const termsUsed = Math.max(0, Math.floor(input.termsUsed));
  const sameSeason = Math.max(0, Math.min(termsUsed, Math.floor(input.sameSeason)));
  const parts: Array<[number, number]> = [[clamp01(termsUsed / FULL_HISTORY_TERMS), 45]];
  const values = input.values || [];
  parts.push([values.length >= 3 ? clamp01(1 - variation(values)) : 0.4, 25]);
  if (input.agreement !== undefined && input.agreement !== null) parts.push([clamp01(input.agreement), 20]);
  if (input.quality !== undefined && input.quality !== null) parts.push([clamp01(input.quality), 10]);
  let score = parts.reduce((sum, [value, weight]) => sum + value * weight, 0) / parts.reduce((sum, [, weight]) => sum + weight, 0);
  let caveat = "";
  if (termsUsed > 0 && sameSeason === 0) { score *= 0.75; caveat = "لا فصلَ سابقاً من الموسم نفسه."; }
  if (termsUsed <= 1) { score = Math.min(score, THIN_HISTORY_CAP); caveat = termsUsed === 0 ? "لا يكفي التاريخ." : "فصلٌ واحدٌ فقط في التاريخ."; }
  else if (termsUsed < 3 && !caveat) caveat = "تاريخٌ قصير.";
  if (input.quality !== undefined && input.quality !== null && input.quality < 0.6 && !caveat) caveat = "المدخلاتُ غير مكتملة.";
  const backtestError = input.backtestError !== undefined && input.backtestError !== null && Number.isFinite(input.backtestError)
    ? Math.max(0, input.backtestError) : null;
  if (backtestError !== null) {
    score *= 1 - clamp01(backtestError) * BACKTEST_MAX_PENALTY;
    if (backtestError >= BACKTEST_CAVEAT_AT && !caveat) caveat = `أخطأ التنبّؤ الرجعي بنحو ${Math.round(backtestError * 100)}٪.`;
  }
  const level: ConfidenceLevel = termsUsed === 0 && (input.agreement === undefined || input.agreement === null)
    ? "insufficient" : score >= CONFIDENCE_HIGH ? "high" : score >= CONFIDENCE_MEDIUM ? "medium" : "low";
  return { level, score: Math.round(score * 100), termsUsed, sameSeason, caveat, backtestError };
}

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة", insufficient: "لا يكفي التاريخ" };
/** إجراءٌ بضغطة لا يُعرض فعّالاً إلا من متوسطةٍ فأعلى. */
export const isActionable = (confidence: Confidence): boolean => confidence.level === "high" || confidence.level === "medium";

/* ═══════════════════════════ المدخلات ═══════════════════════════ */

export interface PredTerm { AdTermId: number; AdTermName: string; AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean }
export interface PredStats {
  termId: number;
  /** AdCourseId → الذين لم يسجلوا (العمود "unregistered" وحده؛ القديمُ لا يدخل). */
  remaining?: Record<string, number> | null;
  /** AdCourseId → المقاعد المتبقية في الشعب المفتوحة. */
  vacant?: Record<string, number> | null;
}
export type PredCourse = Pick<AdCourse, "AdCourseId" | "CourseCode" | "CourseName" | "CourseCredit" | "MaxStudent"> & Partial<Pick<AdCourse, "AdCollegeId" | "AdSectionId">>;

export interface PredictiveInput {
  target: { termId: number; name: string };
  terms: readonly PredTerm[];
  /** شعبُ كلِّ الفصول (التاريخُ وفصلُ الهدف) لنطاق القارئ. */
  rows: readonly FSchedule[];
  courses: readonly PredCourse[];
  stats?: readonly PredStats[];
  /** AdCourseId → عددُ من يريدونه في الفصل القادم من رغباتهم (رادار التسجيل). */
  liveWanted?: Readonly<Record<string, number>> | null;
  students?: readonly SimStudent[];
  plans?: readonly SimPlanRules[];
  credit?: ReadonlyMap<number, number>;
}

/* ═══════════════════════════ التاريخ ═══════════════════════════ */

interface TermBook {
  termId: number; name: string; order: number; season: TermSeason | null;
  /** AdCourseId → رموزُ الشعب المميّزة. */
  codes: Map<number, Set<string>>;
  rows: FSchedule[];
}

const sectionKey = (row: FSchedule) => String(row.SCode ?? "").trim() || `#${row.id}`;

function bookTerms(input: PredictiveInput): { target: TermBook; past: TermBook[]; all: Map<number, TermBook> } {
  const byId = new Map(input.terms.map(term => [Number(term.AdTermId), term] as const));
  const books = new Map<number, TermBook>();
  for (const row of input.rows) {
    const id = Number(row.AdTermId);
    if (!id) continue;
    let book = books.get(id);
    if (!book) {
      const term = byId.get(id);
      book = { termId: id, name: String(term?.AdTermName || ""), order: term ? termChronology(term) : id, season: termSeasonOf(term?.AdTermName), codes: new Map(), rows: [] };
      books.set(id, book);
    }
    book.rows.push(row);
    const courseId = Number(row.AdCourseId);
    if (!courseId) continue;
    const set = book.codes.get(courseId) || new Set<string>();
    set.add(sectionKey(row));
    book.codes.set(courseId, set);
  }
  const targetTerm = byId.get(input.target.termId);
  const targetOrder = targetTerm ? termChronology(targetTerm) : input.target.termId;
  const target: TermBook = books.get(input.target.termId)
    || { termId: input.target.termId, name: input.target.name, order: targetOrder, season: termSeasonOf(input.target.name), codes: new Map(), rows: [] };
  target.season = termSeasonOf(input.target.name) || target.season;
  const past = [...books.values()]
    .filter(book => book.termId !== input.target.termId && book.order < targetOrder)
    .sort((a, b) => a.order - b.order);
  return { target, past, all: books };
}

const capacityOf = (course: PredCourse | undefined): number => {
  const cap = Number(course?.MaxStudent);
  return Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0;
};

/* ═══════════════════════════ ١) الطلب ═══════════════════════════ */

export type ActionKind = "open-sections" | "open-prereq" | "review-timeslot" | "offer-in-season" | "review-surplus";
export interface PredictiveAction {
  kind: ActionKind;
  courseId?: number;
  count?: number;
  day?: string; from?: string; to?: string;
  season?: TermSeason;
  /** إجراءٌ يُنفَّذ بضغطةٍ عبر المسار القائم (فتح شعبة) أم يفتح الورشةَ فحسب. */
  oneClick: boolean;
  /** إن كان معطَّلاً: لماذا. */
  disabledReason?: string;
}

export interface DemandPrediction {
  courseId: number; code: string; name: string;
  /** القسمُ المالك (لفتح الشعبة في جدوله). */
  collegeId?: number; sectionId?: number;
  /** القيمةُ المتوقّعة والمدى. */
  expected: number; low: number; high: number;
  /** ما في جدول الفصل القادم الآن. */
  planned: number;
  /** expected − planned (موجبٌ = ينقص). */
  delta: number;
  /** الشعبُ الفعّالة في كل فصلٍ مستعمل، من الأقدم إلى الأحدث. */
  series: number[];
  trend: "up" | "down" | "flat";
  /** من يريدونه في الفصل القادم، إن توفّرت إشارة الرغبات. */
  wanted: number | null;
  capacity: number | null;
  confidence: Confidence;
  reason: string;
  action: PredictiveAction | null;
}

/** وزنُ الحداثة: الأحدثُ ١ ثم ×٠٫٦ لكل فصلٍ أقدم. */
export const RECENCY_DECAY = 0.6;

function weightedStats(values: readonly number[]): { mean: number; sd: number; slope: number } {
  const n = values.length;
  const weights = values.map((_, index) => RECENCY_DECAY ** (n - 1 - index));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const mean = values.reduce((sum, v, i) => sum + v * weights[i], 0) / total;
  const variance = values.reduce((sum, v, i) => sum + weights[i] * (v - mean) ** 2, 0) / total;
  /* ميلُ الانحدار الخطي (غير مرجَّح) لا يُحسب إلا من أربع نقاطٍ فأكثر. */
  let slope = 0;
  if (n >= 4) {
    const xs = values.map((_, i) => i), mx = (n - 1) / 2, my = values.reduce((a, b) => a + b, 0) / n;
    const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1;
    slope = xs.reduce((s, x, i) => s + (x - mx) * (values[i] - my), 0) / den;
  }
  return { mean, sd: Math.sqrt(variance), slope };
}

/** قيمةُ الطلب في فصلٍ مضى: شعبُه + ⌈(الباقي − الشاغر) ÷ السعة⌉ (قاعدة «الإنذار المبكر»). */
function termDemandValue(sections: number, stat: PredStats | undefined, courseId: number, cap: number): { value: number; hasStat: boolean } {
  const remaining = Number(stat?.remaining?.[String(courseId)]);
  const vacant = Number(stat?.vacant?.[String(courseId)]) || 0;
  const hasStat = Number.isFinite(remaining);
  const extra = hasStat && cap > 0 && remaining > 0 ? Math.ceil(Math.max(0, remaining - vacant) / cap) : 0;
  return { value: sections + extra, hasStat };
}

export interface BacktestStep { termId: number; name: string; predicted: number; actual: number; error: number }
export interface CourseBacktest { courseId: number; steps: BacktestStep[]; meanAbsError: number; relError: number }
export interface DemandBacktest {
  /** كم فصلاً اختُبر (له فصلٌ سابقٌ واحدٌ على الأقل). */
  termsTested: number;
  byCourse: Map<number, CourseBacktest>;
  /** متوسطُ الخطأ المطلق على كل المقررات والخطوات (شعبة). */
  meanAbsError: number;
  /** الخطأ المطلق الكلي ÷ مجموع الفعلي. */
  relError: number | null;
}

/**
 * ── الاختبار الرجعي: تنبّأ بفصلٍ مضى بما قبله فقط ───────────────────────────
 * لكل فصلٍ N له تاريخٌ سابق: يُحجب كلُّ فصلٍ ≥ N ثم يُشغَّل `predictDemand` ويُقارَن بما حدث فعلاً في N
 * (شعبٌ + شُعبٌ إضافية يقتضيها كشف N). بلا رغباتٍ حيّة (لا أرشيف لها)، فهو يقيس نموذجَ التاريخ وحده.
 * حتميّ. **لا يدّعي دقةً على بيانات حقيقية** — يقيس ما في المدخلات الممرَّرة فقط.
 */
export function backtestDemand(input: PredictiveInput): DemandBacktest {
  const booked = bookTerms(input);
  const past = [...booked.all.values()]
    .filter(book => book.termId !== input.target.termId && book.order < booked.target.order)
    .sort((x, y) => x.order - y.order);
  const catalog = new Map(input.courses.map(course => [Number(course.AdCourseId), course] as const));
  const statsByTerm = new Map((input.stats || []).map(stat => [Number(stat.termId), stat] as const));
  const byCourse = new Map<number, CourseBacktest>();
  let termsTested = 0, absTotal = 0, actualTotal = 0, cells = 0;
  for (let index = 1; index < past.length; index += 1) {
    const book = past[index];
    const earlier = new Set(past.slice(0, index).map(item => item.termId));
    const sub: PredictiveInput = {
      ...input, target: { termId: book.termId, name: book.name || input.terms.find(term => Number(term.AdTermId) === book.termId)?.AdTermName || "" },
      rows: input.rows.filter(row => earlier.has(Number(row.AdTermId))),
      stats: (input.stats || []).filter(stat => earlier.has(Number(stat.termId))),
      liveWanted: null, students: undefined, plans: undefined,
    };
    const predictions = new Map(predictDemand(sub, { backtest: false }).map(item => [item.courseId, item] as const));
    termsTested += 1;
    const ids = new Set<number>([...predictions.keys(), ...book.codes.keys()]);
    for (const courseId of ids) {
      const cap = capacityOf(catalog.get(courseId));
      const actual = termDemandValue(book.codes.get(courseId)?.size || 0, statsByTerm.get(book.termId), courseId, cap).value;
      const predicted = predictions.get(courseId)?.expected ?? 0;
      /* مقررٌ لم يُتوقَّع ولم يقع لا يُحتسب؛ ومقررٌ لم يكن له تاريخٌ فلم يُتوقَّع يُحتسب خطأً كاملاً. */
      if (!predicted && !actual) continue;
      const entry = byCourse.get(courseId) || { courseId, steps: [], meanAbsError: 0, relError: 0 };
      entry.steps.push({ termId: book.termId, name: book.name, predicted, actual, error: predicted - actual });
      byCourse.set(courseId, entry);
      absTotal += Math.abs(predicted - actual); actualTotal += actual; cells += 1;
    }
  }
  for (const entry of byCourse.values()) {
    const abs = entry.steps.reduce((sum, step) => sum + Math.abs(step.error), 0);
    const actual = entry.steps.reduce((sum, step) => sum + step.actual, 0);
    entry.meanAbsError = abs / entry.steps.length;
    entry.relError = abs / Math.max(1, actual);
  }
  return { termsTested, byCourse, meanAbsError: cells ? absTotal / cells : 0, relError: cells ? absTotal / Math.max(1, actualTotal) : null };
}

export function predictDemand(input: PredictiveInput, options: { backtest?: boolean } = {}): DemandPrediction[] {
  const { target, past } = bookTerms(input);
  const backtest = options.backtest === false ? null : backtestDemand(input);
  const catalog = new Map(input.courses.map(course => [Number(course.AdCourseId), course] as const));
  const statsByTerm = new Map((input.stats || []).map(stat => [Number(stat.termId), stat] as const));
  const wanted = input.liveWanted || {};
  const ids = new Set<number>();
  for (const book of past) for (const id of book.codes.keys()) ids.add(id);
  for (const id of target.codes.keys()) ids.add(id);
  for (const key of Object.keys(wanted)) if (Number(wanted[key]) > 0) ids.add(Number(key));

  /* الموسمُ المطابق أولاً: إن وُجد منه فصلان فأكثر استُعمل وحدُه؛ وإلا كل التاريخ بثقةٍ أدنى. */
  const sameSeasonAll = past.filter(book => target.season && book.season === target.season);
  const pool = sameSeasonAll.length >= 2 ? sameSeasonAll : past;

  const out: DemandPrediction[] = [];
  for (const courseId of [...ids].sort((a, b) => a - b)) {
    const course = catalog.get(courseId);
    if (!course) continue;
    const cap = capacityOf(course);
    /* المقررُ الجديد لا يُعاقَب بفصولٍ سبقت وجودَه: تبدأ السلسلةُ من أول فصلٍ ظهر فيه (شعبةٌ أو كشف). */
    const entries: Array<{ value: number; seasonMatch: boolean; evidence: boolean }> = [];
    for (const book of pool) {
      const codes = book.codes.get(courseId);
      const stat = statsByTerm.get(book.termId);
      const sections = codes ? codes.size : 0;
      const { value, hasStat } = termDemandValue(sections, stat, courseId, cap);
      entries.push({ value, seasonMatch: Boolean(target.season && book.season === target.season), evidence: sections > 0 || hasStat });
    }
    const first = entries.findIndex(entry => entry.evidence);
    const used = first < 0 ? [] : entries.slice(first);
    const series = used.map(entry => entry.value);
    const sameSeason = used.filter(entry => entry.seasonMatch).length;
    const planned = target.codes.get(courseId)?.size || 0;
    const wantedNow = Number(wanted[String(courseId)]) > 0 ? Number(wanted[String(courseId)]) : null;
    const liveSections = wantedNow && cap > 0 ? Math.ceil(wantedNow / cap) : null;

    const termsUsed = series.length;
    let expected = 0, low = 0, high = 0;
    let trend: DemandPrediction["trend"] = "flat";
    let histExpected: number | null = null;
    if (termsUsed > 0) {
      const { mean, sd, slope } = weightedStats(series);
      const damped = Math.max(-1, Math.min(1, slope * 0.5));
      histExpected = Math.max(0, mean + damped);
      trend = damped >= 0.4 ? "up" : damped <= -0.4 ? "down" : "flat";
      const spread = termsUsed < 3 ? 1 : Math.ceil(sd);
      expected = Math.round(histExpected);
      low = Math.max(0, expected - spread);
      high = expected + spread;
    }
    if (liveSections !== null) {
      /* الرغباتُ الحيّة أقوى دليلٍ عن الفصل نفسه، لكنها رغباتُ من أجاب فقط: تُمزج ولا تحلّ محلّ التاريخ. */
      if (histExpected === null) { expected = liveSections; low = Math.max(0, liveSections - 1); high = liveSections + 1; }
      else {
        const liveWeight = termsUsed >= 3 ? 0.5 : 0.6;
        expected = Math.round(histExpected * (1 - liveWeight) + liveSections * liveWeight);
        low = Math.max(0, Math.min(low, liveSections, expected));
        high = Math.max(high, liveSections, expected);
      }
    }
    const agreement = histExpected !== null && liveSections !== null
      ? clamp01(1 - Math.abs(histExpected - liveSections) / Math.max(1, histExpected, liveSections)) : null;
    const confidence = confidenceFrom({ termsUsed, sameSeason, values: series, agreement, backtestError: backtest?.byCourse.get(courseId)?.relError ?? null });
    if (termsUsed === 0 && liveSections === null) continue;
    const delta = expected - planned;
    const reason = demandReason({ expected, planned, delta, termsUsed, trend, wantedNow, liveSections, agreement });
    let action: PredictiveAction | null = null;
    if (delta >= 1) {
      action = isActionable(confidence)
        ? { kind: "open-sections", courseId, count: delta, oneClick: true }
        : { kind: "open-sections", courseId, count: delta, oneClick: false, disabledReason: `الثقة ${CONFIDENCE_LABEL[confidence.level]} — ${confidence.caveat || "راجع قبل التنفيذ."}` };
    } else if (delta <= -2 && isActionable(confidence)) {
      action = { kind: "review-surplus", courseId, count: -delta, oneClick: false, disabledReason: "للمراجعة فقط: لا يُغلق شيءٌ تلقائياً." };
    }
    out.push({
      courseId, code: String(course.CourseCode || ""), name: String(course.CourseName || `مقرر ${courseId}`),
      collegeId: Number(course.AdCollegeId) || undefined, sectionId: Number(course.AdSectionId) || undefined,
      expected, low, high, planned, delta, series, trend, wanted: wantedNow, capacity: cap || null, confidence, reason, action,
    });
  }
  /* قائمةٌ تُتصفَّح: أبجدياً (عربي موحَّد الهمزات)، لا بترتيب الأثر. */
  return out.sort((a, b) => compareArabic(a.name, b.name) || a.code.localeCompare(b.code, "en", { numeric: true }));
}

function demandReason(i: { expected: number; planned: number; delta: number; termsUsed: number; trend: string; wantedNow: number | null; liveSections: number | null; agreement: number | null }): string {
  const base = i.termsUsed > 0 ? `من ${countOf(i.termsUsed, AR.term)} سابقة` : "من رغبات الطلبة وحدها";
  const live = i.wantedNow ? ` · ${countOf(i.wantedNow, AR.student)} يريدونه` : "";
  const trend = i.trend === "up" ? " · الطلب في ازدياد" : i.trend === "down" ? " · الطلب في تراجع" : "";
  const gap = i.delta >= 1 ? `ينقص ${countOf(i.delta, AR.section)}` : i.delta <= -1 ? `زيادة ${countOf(-i.delta, AR.section)}` : "الجدول مطابق للتوقّع";
  return `${gap} — ${base}${live}${trend}`;
}

/* ═══════════════════════════ ٢) الاختناقات ═══════════════════════════ */

/** اكتمالُ جدول الفصل القادم قياساً إلى ما اعتاده القسم (شعبٌ مميّزة). null حين لا تاريخ. */
export function scheduleCompleteness(input: PredictiveInput): number | null {
  const { target, past } = bookTerms(input);
  const counts = past.map(book => [...book.codes.values()].reduce((sum, set) => sum + set.size, 0)).filter(n => n > 0).sort((a, b) => a - b);
  if (!counts.length) return null;
  const median = counts[Math.floor((counts.length - 1) / 2)];
  const planned = [...target.codes.values()].reduce((sum, set) => sum + set.size, 0);
  return clamp01(planned / median);
}

export interface PrereqBottleneck {
  courseId: number; code: string; name: string;
  collegeId?: number; sectionId?: number;
  /** طلبةٌ لا يتقدّمون في مقرر تابعٍ حتى يجتازوه. */
  blockedStudents: number;
  /** من يحتاجه فعلاً هذا الفصل (قد يزيد على المحجوزين). */
  needSeats: number;
  plannedSections: number;
  plannedSeats: number | null;
  /** مقرراتٌ تابعةٌ يحجبها (حتى ثلاثة). */
  dependents: string[];
  seatsShort: number | null;
  confidence: Confidence;
  reason: string;
  action: PredictiveAction | null;
}

export function predictPrereqBottlenecks(input: PredictiveInput): PrereqBottleneck[] {
  const students = input.students || [], plans = input.plans || [], credit = input.credit || new Map<number, number>();
  if (!students.length || !plans.length) return [];
  const { target, past } = bookTerms(input);
  const catalog = new Map(input.courses.map(course => [Number(course.AdCourseId), course] as const));
  const planById = new Map(plans.map(plan => [plan.planId, plan] as const));
  const completeness = scheduleCompleteness(input);

  const blocked = new Map<number, Set<string>>();
  const needers = new Map<number, Set<string>>();
  const gates = new Map<number, Set<number>>();
  let assessed = 0;
  for (const student of students) {
    const plan = planById.get(student.planId);
    if (!plan?.hasApprovedRules || student.assessable === false) continue;
    assessed += 1;
    const passed = new Set(student.passed);
    const passedUnits = student.passed.reduce((sum, id) => sum + (credit.get(id) || 0), 0);
    const need = remainingNeed(plan.courseIds, { rules: plan.rules, groups: plan.groups }, passed, credit);
    const ruleOf = new Map(plan.rules.map(rule => [rule.courseId, rule] as const));
    for (const required of need.compulsoryRemaining) {
      const rule = ruleOf.get(required);
      if (!rule?.prereq || prereqMet(rule.prereq, passed, passedUnits)) continue;
      const missing = unmetPrereq(rule.prereq, passed, passedUnits);
      const gate = new Set<number>([...missing.all, ...missing.anyOf.flat()]);
      for (const prereqId of gate) {
        if (passed.has(prereqId)) continue;
        /* المسبقُ نفسُه يجب أن يكون متاحاً للطالب الآن، وإلا فالعقدةُ أعمق وتُقاس عند مسبقه. */
        const prereqRule = ruleOf.get(prereqId);
        if (prereqRule?.prereq && !prereqMet(prereqRule.prereq, passed, passedUnits)) continue;
        (blocked.get(prereqId) || blocked.set(prereqId, new Set()).get(prereqId)!).add(student.fp);
        (gates.get(prereqId) || gates.set(prereqId, new Set()).get(prereqId)!).add(required);
      }
    }
    for (const required of need.compulsoryRemaining) {
      const rule = ruleOf.get(required);
      if (!rule?.prereq || prereqMet(rule.prereq, passed, passedUnits)) (needers.get(required) || needers.set(required, new Set()).get(required)!).add(student.fp);
    }
  }
  const quality = students.length ? assessed / students.length : 0;
  const out: PrereqBottleneck[] = [];
  for (const [courseId, set] of blocked) {
    const course = catalog.get(courseId);
    if (!course) continue;
    const cap = capacityOf(course);
    const sections = target.codes.get(courseId)?.size || 0;
    const seats = cap > 0 ? sections * cap : null;
    /* من يحتاجه الآن ومن يحجبه: طالبٌ واحدٌ قد يكون في المجموعتين فلا يُعدّ مرتين. */
    const needSeats = new Set([...(needers.get(courseId) || []), ...set]).size;
    const short = seats === null ? null : Math.max(0, needSeats - seats);
    /* اختناقٌ حين لا شعبةَ أصلاً، أو حين المقاعدُ أقلُّ ممن يحتاجه. */
    if (sections > 0 && (short === null || short === 0)) continue;
    const offeredBefore = past.filter(book => book.codes.has(courseId)).length;
    const confidence = confidenceFrom({
      termsUsed: Math.max(past.length, 0), sameSeason: past.filter(book => target.season && book.season === target.season).length,
      values: [], quality: quality * (completeness === null ? 0.7 : completeness),
    });
    if (completeness !== null && completeness < 0.6) confidence.caveat = "جدول الفصل القادم لم يكتمل بعد.";
    const dependents = [...(gates.get(courseId) || [])].map(id => String(catalog.get(id)?.CourseName || "")).filter(Boolean).slice(0, 3);
    const count = cap > 0 && short ? Math.max(1, Math.ceil(short / cap)) : 1;
    out.push({
      courseId, code: String(course.CourseCode || ""), name: String(course.CourseName || ""),
      collegeId: Number(course.AdCollegeId) || undefined, sectionId: Number(course.AdSectionId) || undefined,
      blockedStudents: set.size, needSeats, plannedSections: sections, plannedSeats: seats, dependents, seatsShort: short, confidence,
      reason: sections === 0
        ? `${countOf(set.size, AR.student)} ينتظرونه ليكملوا ${dependents[0] ? `«${dependents[0]}»` : "مقرراً تابعاً"} — ولا شعبة له${offeredBefore ? ` (طُرح في ${countOf(offeredBefore, AR.term)} سابقة)` : ""}`
        : `${countOf(set.size, AR.student)} ينتظرونه · المقاعد ${seats} والمحتاج ${needSeats}`,
      action: isActionable(confidence)
        ? { kind: "open-prereq", courseId, count, oneClick: true }
        : { kind: "open-prereq", courseId, count, oneClick: false, disabledReason: `الثقة ${CONFIDENCE_LABEL[confidence.level]} — ${confidence.caveat || "راجع قبل التنفيذ."}` },
    });
  }
  return out.sort((a, b) => b.blockedStudents - a.blockedStudents || a.courseId - b.courseId).slice(0, 12);
}

export interface TimeHotspot {
  day: string; dayIndex: number; from: string; to: string;
  /** شعبٌ متزامنة في الجدول المخطَّط. */
  planned: number;
  /** أكبرُ تزامنٍ رآه القسمُ في فصلٍ سابق في هذه الساعة. */
  historicalPeak: number;
  /** قاعاتٌ استعملها القسمُ تاريخياً (سعةٌ مقدَّرة). */
  roomsKnown: number;
  /** أخفُّ ساعةٍ في اليوم نفسه، بديلاً. */
  calmer: { from: string; to: string; planned: number } | null;
  confidence: Confidence;
  reason: string;
  action: PredictiveAction;
}

const DAY_FIELDS: Array<[keyof FSchedule, string]> = [["fsunday", "الأحد"], ["fmonday", "الاثنين"], ["ftuesday", "الثلاثاء"], ["fwednesday", "الأربعاء"], ["fthursday", "الخميس"]];
const toMin = (clock: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(clock || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const clockOf = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const DAY_START = 7 * 60, DAY_END = 20 * 60, SLOT = 60;

/** تزامنُ الشعب في كل ساعةٍ من كل يوم: أي شعبةٍ (رمزٌ مميّز) لها محاضرةٌ تتقاطع مع الساعة. */
function concurrency(rows: readonly FSchedule[]): number[][] {
  const grid = DAY_FIELDS.map(() => Array.from({ length: Math.ceil((DAY_END - DAY_START) / SLOT) }, () => new Set<string>()));
  for (const row of rows) {
    const start = toMin(row.fstarttime), end = toMin(row.fendtime);
    if (start === null || end === null || end <= start) continue;
    DAY_FIELDS.forEach(([field], day) => {
      if (!row[field]) return;
      for (let slot = 0; slot < grid[day].length; slot++) {
        const from = DAY_START + slot * SLOT, to = from + SLOT;
        if (start < to && from < end) grid[day][slot].add(`${row.AdCourseId}|${sectionKey(row)}`);
      }
    });
  }
  return grid.map(day => day.map(set => set.size));
}

export function predictTimeHotspots(input: PredictiveInput): TimeHotspot[] {
  const { target, past } = bookTerms(input);
  if (!target.rows.length || past.length === 0) return [];
  const rooms = new Set<string>();
  for (const book of past) for (const row of book.rows) { const key = roomIdentityKey(row); if (key) rooms.add(key); }
  for (const row of target.rows) { const key = roomIdentityKey(row); if (key) rooms.add(key); }
  const roomsKnown = rooms.size;
  const planned = concurrency(target.rows);
  const history = past.map(book => concurrency(book.rows));
  const peak = (day: number, slot: number) => history.reduce((max, grid) => Math.max(max, grid[day][slot]), 0);
  const completeness = scheduleCompleteness(input);
  const sameSeason = past.filter(book => target.season && book.season === target.season).length;
  const out: TimeHotspot[] = [];
  planned.forEach((daySlots, day) => {
    daySlots.forEach((count, slot) => {
      if (count < 3) return;
      const historicalPeak = peak(day, slot);
      /* مزدحمٌ إن تجاوز ما رآه القسمُ في أيّ فصلٍ في هذه الساعة، أو بلغ ٩٠٪ من قاعاته المعروفة. */
      const beyondHistory = count > historicalPeak && historicalPeak > 0;
      const nearRooms = roomsKnown >= 3 && count >= Math.ceil(roomsKnown * 0.9);
      if (!beyondHistory && !nearRooms) return;
      const calmer = daySlots
        .map((value, index) => ({ value, index }))
        .filter(item => item.index !== slot && item.value < count - 1 && (DAY_START + item.index * SLOT) >= 8 * 60 && (DAY_START + item.index * SLOT) <= 14 * 60)
        .sort((a, b) => a.value - b.value || a.index - b.index)[0];
      const confidence = confidenceFrom({
        termsUsed: past.length, sameSeason, values: history.map(grid => grid[day][slot]),
        quality: (completeness ?? 0.7) * (roomsKnown >= 3 ? 1 : 0.6),
      });
      if (completeness !== null && completeness < 0.6) confidence.caveat = "جدول الفصل القادم لم يكتمل بعد.";
      const from = clockOf(DAY_START + slot * SLOT), to = clockOf(DAY_START + (slot + 1) * SLOT);
      out.push({
        day: DAY_FIELDS[day][1], dayIndex: day, from, to, planned: count, historicalPeak, roomsKnown,
        calmer: calmer ? { from: clockOf(DAY_START + calmer.index * SLOT), to: clockOf(DAY_START + (calmer.index + 1) * SLOT), planned: calmer.value } : null,
        confidence,
        reason: beyondHistory
          ? `${countOf(count, AR.section)} معاً — أكثر مما رآه القسم هنا (${historicalPeak}) في ${countOf(past.length, AR.term)}`
          : `${countOf(count, AR.section)} معاً من ${countOf(roomsKnown, AR.room)} يعرفها القسم`,
        action: { kind: "review-timeslot", day: DAY_FIELDS[day][1], from, to, oneClick: false, disabledReason: undefined },
      });
    });
  });
  return out.sort((a, b) => (b.planned - b.historicalPeak) - (a.planned - a.historicalPeak) || b.planned - a.planned || a.dayIndex - b.dayIndex || a.from.localeCompare(b.from)).slice(0, 5);
}

/* ═══════════════════════════ ٣) تأخّر التخرّج ═══════════════════════════ */

export interface GraduationStudent {
  fp: string;
  /** الفصولُ اللازمة لو طُرح كلُّ شيءٍ في كل فصل (الحدُّ البنيوي: المسبقات والحمولة). */
  idealTerms: number;
  /** الفصولُ المتوقّعة بقيد موسم الطرح. */
  expectedTerms: number;
  delay: number;
  /** مقرراتٌ كانت جاهزةً للطالب في فصلٍ لا تُطرح فيه فتأجّل بسببها شيء. */
  causeCourseIds: number[];
  /** فصلٌ لم تكتمل محاكاتُه ضمن السقف. */
  capped: boolean;
}
export interface GraduationCause {
  courseId: number; code: string; name: string;
  delayedStudents: number;
  /** الموسمُ الذي يعطّلهم عدمُ طرحه. */
  missingSeason: TermSeason | null;
  confidence: Confidence;
  reason: string;
  action: PredictiveAction | null;
}
export interface GraduationPrediction {
  students: GraduationStudent[];
  total: number;
  /** الذين لم يُقيَّموا (صحيفةٌ بلا قواعد معتمدة أو ملفٌّ ناقص). */
  unassessed: number;
  onTime: number; delayed1: number; delayed2plus: number;
  causes: GraduationCause[];
  confidence: Confidence;
  note: string;
}

export const GRAD_MAX_TERMS = 12;
const SEASON_CYCLE: TermSeason[] = ["الأول", "الثاني"];

/** كم فصلاً سابقاً طُرح فيه المقرر في موسمٍ ما، من الفصول التي نعرف موسمَها. */
function seasonAvailability(past: readonly TermBook[]): { offered: Map<string, number>; seen: Map<TermSeason, number> } {
  const offered = new Map<string, number>(), seen = new Map<TermSeason, number>();
  for (const book of past) {
    if (!book.season) continue;
    seen.set(book.season, (seen.get(book.season) || 0) + 1);
    for (const id of book.codes.keys()) offered.set(`${id}|${book.season}`, (offered.get(`${id}|${book.season}`) || 0) + 1);
  }
  return { offered, seen };
}

export function predictGraduationDelay(input: PredictiveInput): GraduationPrediction {
  const students = input.students || [], plans = input.plans || [], credit = input.credit || new Map<number, number>();
  const { target, past } = bookTerms(input);
  const catalog = new Map(input.courses.map(course => [Number(course.AdCourseId), course] as const));
  const planById = new Map(plans.map(plan => [plan.planId, plan] as const));
  const { offered, seen } = seasonAvailability(past);

  /* مقررٌ متاحٌ في موسم: طُرح في نصف فصولِ ذلك الموسم على الأقل. وموسمٌ بلا تاريخٍ ← يُفترض متاحاً (لا ندّعي تأخّراً بلا دليل). */
  const available = (courseId: number, season: TermSeason): boolean => {
    const total = seen.get(season) || 0;
    if (total === 0) return true;
    return (offered.get(`${courseId}|${season}`) || 0) / total >= 0.5;
  };
  const seasonsFrom = (first: TermSeason | null): TermSeason[] => {
    const start = first && SEASON_CYCLE.includes(first) ? SEASON_CYCLE.indexOf(first) : 0;
    const out: TermSeason[] = [];
    if (first === "الصيفي") out.push("الصيفي");
    for (let i = 0; i < GRAD_MAX_TERMS; i++) out.push(SEASON_CYCLE[(start + i) % SEASON_CYCLE.length]);
    return out.slice(0, GRAD_MAX_TERMS);
  };
  const sequence = seasonsFrom(target.season);

  const cache = new Map<string, { ideal: number; expected: number; causes: number[]; capped: boolean }>();
  const results: GraduationStudent[] = [];
  let unassessed = 0;

  for (const student of students) {
    const plan = planById.get(student.planId);
    if (!plan?.hasApprovedRules || student.assessable === false) { unassessed += 1; continue; }
    const passed = new Set(student.passed);
    const need = remainingNeed(plan.courseIds, { rules: plan.rules, groups: plan.groups }, passed, credit);
    /* الإجباري كلُّه + من كل مجموعةٍ اختياريةٍ أولُ ما يلزم من المتاح (ترتيبٌ ثابت: الأكثر طرحاً ثم المعرّف). */
    const required = new Set<number>(need.compulsoryRemaining);
    for (const progress of need.groups) {
      if (progress.done) continue;
      const ranked = [...progress.candidateIds].sort((a, b) => {
        const share = (id: number) => [...offered].filter(([key]) => key.startsWith(`${id}|`)).reduce((s, [, n]) => s + n, 0);
        return share(b) - share(a) || a - b;
      });
      const take = Math.max(progress.needCourses, progress.needUnits > 0 ? Math.ceil(progress.needUnits / 3) : 0);
      ranked.slice(0, take).forEach(id => required.add(id));
    }
    /* المحاكاةُ تتوقف على المطلوب وعلى ما اجتازه مما هو مسبقٌ لشيء، وعلى وحداته؛ فالطلبةُ المتشابهون يتشاركون حساباً واحداً. */
    const gating = new Set<number>(plan.rules.flatMap(rule => [...(rule.prereq?.all || []), ...(rule.prereq?.anyOf.flat() || [])]));
    const passedUnits = [...passed].reduce((sum, id) => sum + (credit.get(id) || 0), 0);
    const key = `${plan.planId}|${[...required].sort((a, b) => a - b).join(",")}|${[...passed].filter(id => gating.has(id)).sort((a, b) => a - b).join(",")}|${passedUnits}`;
    let sim = cache.get(key);
    if (!sim) {
      sim = simulateGraduation({ required: [...required], plan, passed, credit, sequence, available });
      cache.set(key, sim);
    }
    results.push({ fp: student.fp, idealTerms: sim.ideal, expectedTerms: sim.expected, delay: Math.max(0, sim.expected - sim.ideal), causeCourseIds: sim.causes, capped: sim.capped });
  }

  const onTime = results.filter(r => r.delay === 0).length;
  const delayed1 = results.filter(r => r.delay === 1).length;
  const delayed2plus = results.filter(r => r.delay >= 2).length;
  const causeCount = new Map<number, number>();
  for (const r of results) if (r.delay > 0) for (const id of new Set(r.causeCourseIds)) causeCount.set(id, (causeCount.get(id) || 0) + 1);

  const assessedShare = students.length ? results.length / students.length : 0;
  const seasonEvidence = [...seen.values()].reduce((a, b) => a + b, 0);
  const overall = confidenceFrom({
    termsUsed: seasonEvidence, sameSeason: target.season ? (seen.get(target.season) || 0) : 0,
    values: [], quality: assessedShare,
  });
  const causes: GraduationCause[] = [...causeCount].map(([courseId, delayedStudents]) => {
    const course = catalog.get(courseId);
    const missing = SEASON_CYCLE.filter(season => (seen.get(season) || 0) > 0 && !available(courseId, season));
    const missingSeason = missing[0] || null;
    const cap = capacityOf(course);
    const conf = confidenceFrom({ termsUsed: seasonEvidence, sameSeason: missingSeason ? (seen.get(missingSeason) || 0) : 0, values: [], quality: assessedShare });
    const count = cap > 0 ? Math.max(1, Math.ceil(delayedStudents / cap)) : 1;
    return {
      courseId, code: String(course?.CourseCode || ""), name: String(course?.CourseName || `مقرر ${courseId}`), delayedStudents, missingSeason, confidence: conf,
      reason: missingSeason
        ? `لا يُطرح في الفصل ${missingSeason} (${countOf(seen.get(missingSeason) || 0, AR.term)} سابقة) فيتأخر ${countOf(delayedStudents, AR.student)}`
        : `يؤخّر ${countOf(delayedStudents, AR.student)} بسبب ترتيب المسبقات`,
      action: missingSeason
        ? (isActionable(conf)
          ? { kind: "offer-in-season" as const, courseId, count, season: missingSeason, oneClick: false, disabledReason: "يُخطَّط له في فصل ذلك الموسم القادم — يُفتح من الورشة." }
          : { kind: "offer-in-season" as const, courseId, count, season: missingSeason, oneClick: false, disabledReason: `الثقة ${CONFIDENCE_LABEL[conf.level]} — ${conf.caveat || "راجع قبل التنفيذ."}` })
        : null,
    };
  }).sort((a, b) => b.delayedStudents - a.delayedStudents || a.courseId - b.courseId).slice(0, 8);

  const note = seasonEvidence === 0
    ? "لا تاريخ لمواسم الطرح: التأخّرُ هنا بنيويٌّ فقط (المسبقات والحمولة)."
    : `مواسمُ الطرح من ${countOf(seasonEvidence, AR.term)} سابقة؛ الصيفيُّ خارج المحاكاة.`;
  return { students: results, total: students.length, unassessed, onTime, delayed1, delayed2plus, causes, confidence: overall, note };
}

function simulateGraduation(args: {
  required: number[]; plan: SimPlanRules; passed: ReadonlySet<number>; credit: ReadonlyMap<number, number>;
  sequence: readonly TermSeason[]; available: (courseId: number, season: TermSeason) => boolean;
}): { ideal: number; expected: number; causes: number[]; capped: boolean } {
  const { required, plan, credit, sequence, available } = args;
  const ruleOf = new Map(plan.rules.map(rule => [rule.courseId, rule] as const));
  /* الحرجُ أولاً: كم مقرراً يتوقف عليه (مباشرةً) ثم الوحدات ثم المعرّف. */
  const dependents = new Map<number, number>();
  for (const rule of plan.rules) for (const id of [...(rule.prereq?.all || []), ...(rule.prereq?.anyOf.flat() || [])]) dependents.set(id, (dependents.get(id) || 0) + 1);
  const order = (a: number, b: number) => (dependents.get(b) || 0) - (dependents.get(a) || 0) || (credit.get(b) || 0) - (credit.get(a) || 0) || a - b;

  const run = (constrained: boolean) => {
    const done = new Set(args.passed);
    let left = [...required].filter(id => !done.has(id)).sort(order);
    const causes = new Set<number>();
    let terms = 0;
    while (left.length && terms < GRAD_MAX_TERMS) {
      const season = sequence[terms] ?? "الأول";
      const unitsBefore = [...done].reduce((sum, id) => sum + (credit.get(id) || 0), 0);
      let units = 0;
      const taken: number[] = [];
      for (const id of left) {
        const rule = ruleOf.get(id);
        if (!prereqMet(rule?.prereq, done, unitsBefore)) continue;
        if (constrained && !available(id, season)) { causes.add(id); continue; }
        const cr = credit.get(id) || 3;
        if (units + cr > SIM_UNITS_MAX) continue;
        taken.push(id); units += cr;
        if (units >= SIM_UNITS_DEFAULT) break;
      }
      for (const id of taken) done.add(id);
      left = left.filter(id => !done.has(id));
      terms += 1;
    }
    return { terms: left.length ? GRAD_MAX_TERMS : terms, causes, capped: left.length > 0 };
  };
  const ideal = run(false), expected = run(true);
  /* السببُ لا يُحسب إلا حين أخّر فعلاً: إن ساوى المقيَّدُ المثاليَّ فلا سببَ. */
  const delayed = expected.terms > ideal.terms;
  return { ideal: ideal.terms, expected: expected.terms, causes: delayed ? [...expected.causes].sort((a, b) => a - b) : [], capped: expected.capped || ideal.capped };
}

/* ═══════════════════════════ الحزمة ═══════════════════════════ */

export interface PredictiveReading {
  target: { termId: number; name: string; season: TermSeason | null };
  /** الفصولُ السابقة التي وُجد لها جدولٌ في هذا النطاق. */
  historyTerms: number;
  historyNames: string[];
  demand: DemandPrediction[];
  prereq: PrereqBottleneck[];
  hotspots: TimeHotspot[];
  graduation: GraduationPrediction;
  /** إجراءاتٌ مرتّبةٌ بالأثر × الثقة، حتى ستة. */
  top: Array<{ id: string; label: string; reason: string; confidence: Confidence; action: PredictiveAction; impact: number }>;
  completeness: number | null;
  /** تحذيراتٌ صريحة تُعرض ولا تُخفى. */
  caveats: string[];
}

export function readPredictive(input: PredictiveInput): PredictiveReading {
  const { target, past } = bookTerms(input);
  const demand = predictDemand(input);
  const prereq = predictPrereqBottlenecks(input);
  const hotspots = predictTimeHotspots(input);
  const graduation = predictGraduationDelay(input);
  const completeness = scheduleCompleteness(input);

  const top: PredictiveReading["top"] = [];
  const name = (id?: number) => String(input.courses.find(course => Number(course.AdCourseId) === id)?.CourseName || "");
  for (const row of demand) if (row.action && row.action.kind === "open-sections") {
    top.push({ id: `d${row.courseId}`, label: `افتح ${countOf(row.action.count || 1, AR.section)} لـ«${row.name}»`, reason: row.reason, confidence: row.confidence, action: row.action, impact: (row.action.count || 1) * (row.capacity || 30) });
  }
  for (const row of prereq) if (row.action) {
    top.push({ id: `p${row.courseId}`, label: `افتح «${row.name}» — يحجز ${countOf(row.blockedStudents, AR.student)}`, reason: row.reason, confidence: row.confidence, action: row.action, impact: row.blockedStudents * 2 });
  }
  for (const row of hotspots.slice(0, 2)) {
    top.push({ id: `h${row.dayIndex}${row.from}`, label: `خفّف ${row.day} ${row.from}–${row.to}${row.calmer ? ` ← ${row.calmer.from}` : ""}`, reason: row.reason, confidence: row.confidence, action: row.action, impact: row.planned - row.historicalPeak });
  }
  for (const row of graduation.causes.slice(0, 2)) if (row.action) {
    top.push({ id: `g${row.courseId}`, label: `اطرح «${row.name}» في فصل ${row.missingSeason}`, reason: row.reason, confidence: row.confidence, action: row.action, impact: row.delayedStudents });
  }
  const rank = (item: { impact: number; confidence: Confidence }) => item.impact * (item.confidence.score / 100);
  top.sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id));
  void name;

  const caveats: string[] = [];
  if (past.length === 0) caveats.push("لا فصلَ سابقاً له جدولٌ في هذا النطاق: لا تنبّؤ من التاريخ.");
  else if (past.length < 3) caveats.push(`التاريخ قصير (${countOf(past.length, AR.term)}) — الأرقامُ استئناسية.`);
  if (completeness !== null && completeness < 0.6) caveats.push("جدول الفصل القادم لم يكتمل: فجواتُه قد تكون نقصَ إدخالٍ لا نقصَ شعب.");
  if (!input.liveWanted || !Object.keys(input.liveWanted).length) caveats.push("لا رغباتٌ حيّة للطلبة بعد: الطلبُ من التاريخ وحده.");
  return {
    target: { ...input.target, season: target.season }, historyTerms: past.length, historyNames: past.map(book => book.name).filter(Boolean),
    demand, prereq, hotspots, graduation, top: top.slice(0, 6), completeness, caveats,
  };
}
