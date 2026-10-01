/**
 * ── كم شعبةً نفتح؟ — مدىً يرسيه التاريخ ─────────────────────────────────────
 *
 * ملاحظة صاحب النظام: ١٥٠٠٠ طالب ÷ سعة ٥٠ = ٣٠٠ شعبة — «ومن أين نأتي بأساتذة
 * وقاعات لثلاثمئة شعبة؟». والأعداد الكبيرة حقيقية، فلا تُوصف بأنها غير معقولة؛
 * لكنها لا تقود الاقتراح. الذي يقوده هو ما فتحه القسم فعلاً — فلا تُفتح الشعب
 * عشوائياً:
 *
 *   1) الأساس = متوسطٌ موزون لشعب المقرر في الفصول المماثلة (الموسم نفسه،
 *      الأقرب أثقل ٣، ٢، ١)، ومعها أحدثُ الفصول الأخرى بوزنٍ أخفّ (١). بلا
 *      مماثل يُكتفى بالأحدث.
 *   2) الناتج مدى: «يُقترح هذا الفصل 15 إلى 16 شعبة». التسجيل يميل به داخل
 *      نطاقٍ واقعي فقط: ±١ (و±٢ إن كان الأساس ٤ فأكثر). السعة (أو متوسط طلبة
 *      الشعبة تاريخياً) تقيس الميل ولا تقفز به.
 *   3) مقررٌ بلا تاريخ ← مدىً من حساب السعة مسقوفاً بـ NO_HISTORY_MAX، ويُقال
 *      «لا تاريخ لهذا المقرر».
 *   4) مجموع المختار يُقارن بما شغّله القسم في الفصول المماثلة (departmentLoad).
 *
 * لا يُكتب شيءٌ في الجدول: الاقتراح يُختار منه أو يُترك.
 */
import { AR, countOf } from "./arabicCount";

export interface SimilarTermHistory {
  termName: string;
  /** شعبٌ فُتحت فعلاً في ذلك الفصل (من الجدول). */
  sections: number;
  /** عدد الطلبة المسجّل لذلك الفصل إن أُدخل. */
  headcount?: number;
  /** من الموسم نفسه؟ (غير محدّد = نعم، للتوافق) */
  similar?: boolean;
}

export interface SectionSuggestion {
  /** القيمة الافتراضية للاختيار — داخل المدى دائماً. */
  suggested: number | null;
  min: number | null;
  max: number | null;
  basis: "history" | "capacity" | "none" | "empty";
  /** «يُقترح هذا الفصل 15 إلى 16 شعبة» */
  headline: string;
  reason: string;
  baseline?: number;
}

/** سقفُ مقررٍ بلا تاريخ: لا يُقترح أكثر من هذا بحساب السعة وحده. */
export const NO_HISTORY_MAX = 6;

/** «يُقترح هذا الفصل 15 إلى 16 شعبة» أو «… 3 شعب». */
export function rangeLabel(min: number, max: number): string {
  return min === max ? `يُقترح هذا الفصل ${countOf(min, AR.section)}` : `يُقترح هذا الفصل ${min} إلى ${countOf(max, AR.section)}`;
}

const SIMILAR_WEIGHTS = [3, 2, 1];
const OTHER_WEIGHT = 1;

function weighted<T>(items: readonly T[], value: (item: T) => number | null): number | null {
  let sum = 0, weight = 0, similarIndex = 0, other = 0;
  for (const item of items as Array<T & { similar?: boolean }>) {
    const isSimilar = item.similar !== false;
    const w = isSimilar ? SIMILAR_WEIGHTS[similarIndex++] : (other++ < 3 ? OTHER_WEIGHT : 0);
    const v = value(item);
    if (!w || v == null) continue;
    sum += w * v; weight += w;
  }
  return weight ? sum / weight : null;
}

/** «فصول أولى/ثانية/صيفية» من اسم فصل. */
function seasonPlural(termName: string): string {
  return termName.includes("الصيفي") ? "فصول صيفية" : termName.includes("الثاني") ? "فصول ثانية" : termName.includes("الأول") ? "فصول أولى" : "فصول";
}

/** خطّ الأساس من التاريخ: الشعب المعتادة، ووصفُ مصدرها. */
export function historicalBaseline(history: readonly SimilarTermHistory[]): { sections: number; label: string; headcount: number | null } | null {
  const opened = history.filter(item => item.sections > 0);
  const similar = opened.filter(item => item.similar !== false).slice(0, 3);
  const others = opened.filter(item => item.similar === false).slice(0, 3);
  const used = [...similar, ...others];
  if (!used.length) return null;
  const avg = weighted(used, item => item.sections)!;
  const head = weighted(used, item => Number(item.headcount) > 0 ? Number(item.headcount) : null);
  const label = similar.length
    ? `آخر ${similar.length === 1 ? "فصل مماثل" : `${similar.length} ${seasonPlural(similar[0].termName)}`}${others.length ? " وأحدث الفصول" : ""}`
    : (others.length === 1 ? "أحدث فصل" : "أحدث الفصول");
  return { sections: Math.max(1, Math.round(avg)), label, headcount: head };
}

export function suggestSectionCount(
  registered: number,
  capacity: number | null | undefined,
  history: readonly SimilarTermHistory[],
): SectionSuggestion {
  const students = Math.max(0, Math.floor(Number(registered) || 0));
  const cap = Number(capacity) > 0 ? Math.floor(Number(capacity)) : 0;
  const base = historicalBaseline(history);
  const result = (min: number, max: number, suggested: number, basis: SectionSuggestion["basis"], reason: string): SectionSuggestion =>
    ({ suggested, min, max, basis, reason, headline: rangeLabel(min, max), baseline: base?.sections });

  if (students === 0) {
    return { suggested: 0, min: 0, max: 0, basis: "empty", headline: "لا شعب", baseline: base?.sections,
      reason: base ? `لا طلبة مسجّلين (فُتحت عادةً ${countOf(base.sections, AR.section)})` : "لا طلبة مسجّلين" };
  }

  if (base) {
    const b = base.sections;
    const head = `فُتحت عادةً ${countOf(b, AR.section)} (${base.label})`;
    /* كم طالباً تحمل الشعبة: السعة، وإلا متوسطها التاريخي. */
    const perSection = cap || (base.headcount ? base.headcount / b : 0);
    if (!perSection) return result(b, b, b, "history", `${head} · لا سعة لقياس التسجيل`);
    const need = Math.ceil(students / perSection);
    const band = b >= 4 ? 2 : 1;
    const lean = Math.max(-band, Math.min(band, need - b));
    const target = Math.max(1, b + lean);
    const trend = need > b + band ? "التسجيل أعلى بكثير من المعتاد (أقصى ميلٍ واقعي)"
      : lean > 0 ? "التسجيل أعلى قليلاً"
      : need < b - band ? "التسجيل أقل بكثير من المعتاد (أقصى ميلٍ واقعي)"
      : lean < 0 ? "التسجيل أقل قليلاً"
      : "التسجيل في حدود المعتاد";
    return result(Math.min(b, target), Math.max(b, target), target, "history", `${head} · ${trend}`);
  }

  if (cap) {
    const exact = students / cap;
    const max = Math.min(Math.max(1, Math.ceil(exact)), NO_HISTORY_MAX);
    const min = Math.min(Math.max(1, Math.floor(exact)), max);
    const capped = Math.ceil(exact) > NO_HISTORY_MAX ? ` · سُقف عند ${countOf(NO_HISTORY_MAX, AR.section)} حتى يتكوّن له تاريخ` : "";
    return result(min, max, max, "capacity", `لا تاريخ لهذا المقرر · ${countOf(students, AR.student)} ÷ سعة ${cap}${capped}`);
  }

  return { suggested: null, min: null, max: null, basis: "none", headline: "لا اقتراح", reason: "لا تاريخ لهذا المقرر ولا سعة مسجّلة — أدخل السعة في شاشة المقررات" };
}

/** ما شغّله القسم كله في فصلٍ سابق. */
export interface DepartmentTermLoad { termName: string; similar?: boolean; sections: number; instructors: number; halls: number }

/** ما شغّله القسم عادةً في الفصول المماثلة (متوسط موزون، وإلا الأحدث)، أو null. */
export function departmentTypicalTotal(history: readonly DepartmentTermLoad[]): number | null {
  const ran = history.filter(item => item.sections > 0);
  const similar = ran.filter(item => item.similar !== false);
  const avg = weighted(similar.length ? similar : ran.map(item => ({ ...item, similar: true })), item => item.sections);
  return avg == null ? null : Math.round(avg);
}

/** تحذيرٌ إن تجاوز مجموعُ المقترح أعلى ما شغّله القسم تاريخياً، وإلا "". */
export function departmentLoadWarning(totalSuggested: number, history: readonly DepartmentTermLoad[]): string {
  const ran = history.filter(item => item.sections > 0);
  if (!ran.length || totalSuggested <= 0) return "";
  const peak = ran.reduce((best, item) => item.sections > best.sections ? item : best, ran[0]);
  if (totalSuggested <= peak.sections) return "";
  return `مجموع المقترح ${countOf(totalSuggested, AR.section)} يتجاوز أعلى ما شغّله القسم (${countOf(peak.sections, AR.section)} في ${peak.termName} بـ${countOf(peak.instructors, AR.instructor)} و${countOf(peak.halls, AR.room)}) — راجع الأساتذة والقاعات قبل الاعتماد`;
}
