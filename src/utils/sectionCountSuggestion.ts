/**
 * ── كم شعبةً نفتح؟ — مدىً يرسيه التاريخ ─────────────────────────────────────
 *
 * ملاحظة صاحب النظام: ١٥٠٠٠ طالب ÷ سعة ٥٠ = ٣٠٠ شعبة — «ومن أين نأتي بأساتذة
 * وقاعات لثلاثمئة شعبة؟». فالذي يقود الاقتراح ما فتحه القسم فعلاً — فلا تُفتح
 * الشعب عشوائياً.
 *
 * والرقمُ الداخل من كشف عمادة التسجيل هو «المقاعد المتبقية» للمقرر؛ وهو مدخل
 * التخطيط الذي يرسي عدد الشعب، ويُقارن بتاريخ الشعب التي شغّلها القسم. أرقام
 * الاستيراد القديم لا تدخل المقارنة حتى لا تختلط دلالة المقاعد بسائر الأعمدة.
 *
 *   1) الأساس = متوسطٌ موزون لشعب المقرر في الفصول المماثلة (الموسم نفسه،
 *      الأقرب أثقل ٣، ٢، ١)، ومعها أحدثُ الفصول الأخرى بوزنٍ أخفّ (١). بلا
 *      مماثل يُكتفى بالأحدث.
 *   2) المقاعد المتبقية تُقارن بنفسها في تلك الفصول: أعلى بـ٢٠٪ ← الشعب أعلى بقدره،
 *      داخل نطاقٍ واقعي فقط: ±١ (و±٢ إن كان الأساس ٤ فأكثر). أول فصلٍ يُستورد
 *      فيه المقاعد المتبقية لا مقارنة لها، فيبقى الأساس ويُقال ذلك.
 *   3) ⌈المقاعد المتبقية ÷ سعة الشعبة⌉ يحدّ الميلَ صعوداً ولا ينزل بالاقتراح
 *      تحت التاريخ.
 *   4) مقررٌ لم يُفتح ← مدىً من شعبةٍ واحدة إلى ما تملؤه المقاعد المتبقية، مسقوفاً
 *      بـ NO_HISTORY_MAX، ويُبدأ بشعبة.
 *   5) مجموع المختار يُقارن بما شغّله القسم في الفصول المماثلة (departmentLoad).
 *
 * لا يُكتب شيءٌ في الجدول: الاقتراح يُختار منه أو يُترك.
 */
import { AR, countOf, oblique } from "./arabicCount";

export interface SimilarTermHistory {
  termName: string;
  /** شعبٌ فُتحت فعلاً في ذلك الفصل (من الجدول). */
  sections: number;
  /** المقاعد المتبقية في كشف العمادة لذلك الفصل، إن استُورد. */
  remaining?: number;
  /** من الموسم نفسه؟ (غير محدّد = نعم، للتوافق) */
  similar?: boolean;
}

export interface SectionSuggestion {
  /** القيمة الافتراضية للاختيار — داخل المدى دائماً. */
  suggested: number | null;
  min: number | null;
  max: number | null;
  basis: "history" | "pool" | "none" | "empty";
  /** «يُقترح هذا الفصل 15 إلى 16 شعبة» */
  headline: string;
  reason: string;
  baseline?: number;
  /** المتبقي يزيد فصلاً مماثلاً بعد فصل: الشعب المفتوحة لا تلحق به. */
  backlog?: string;
}

/** سقفُ مقررٍ لم يُفتح: لا يُقترح أكثر من هذا بحساب السعة وحده. */
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

const known = (value: unknown): value is number => value != null && Number.isFinite(Number(value)) && Number(value) >= 0;

/** خطّ الأساس من التاريخ: الشعب المعتادة، ووصفُ مصدرها، والمقاعد المعتادة إن عُرفت. */
export function historicalBaseline(history: readonly SimilarTermHistory[]): { sections: number; label: string; remaining: number | null } | null {
  const opened = history.filter(item => item.sections > 0);
  const similar = opened.filter(item => item.similar !== false).slice(0, 3);
  const others = opened.filter(item => item.similar === false).slice(0, 3);
  const used = [...similar, ...others];
  if (!used.length) return null;
  const avg = weighted(used, item => item.sections)!;
  const remaining = weighted(used, item => known(item.remaining) && Number(item.remaining) > 0 ? Number(item.remaining) : null);
  const label = similar.length
    ? `آخر ${similar.length === 1 ? "فصل مماثل" : similar.length === 2 ? "فصلين مماثلين" : `${similar.length} ${seasonPlural(similar[0].termName)}`}${others.length ? " وأحدث الفصول" : ""}`
    : (others.length === 1 ? "أحدث فصل" : "أحدث الفصول");
  return { sections: Math.max(1, Math.round(avg)), label, remaining };
}

/**
 * المتبقي يزيد في الفصول المماثلة فصلاً بعد فصل (الأحدث أولاً في التاريخ)،
 * وهذا الفصل أعلى منها كلها: الطلبة يتراكمون على المقرر. وإلا "".
 */
export function remainingBacklog(remaining: number | null | undefined, history: readonly SimilarTermHistory[]): string {
  if (!known(remaining) || !remaining) return "";
  const past = history.filter(item => item.similar !== false && known(item.remaining) && Number(item.remaining) > 0)
    .slice(0, 2).map(item => Number(item.remaining));
  if (past.length < 2 || !(remaining > past[0] && past[0] > past[1])) return "";
  return `المقاعد المتبقية ترتفع للفصل الثالث على التوالي في الفصول المماثلة (${past[1]} ← ${past[0]} ← ${remaining})`;
}

export function suggestSectionCount(
  remaining: number | null | undefined,
  capacity: number | null | undefined,
  history: readonly SimilarTermHistory[],
): SectionSuggestion {
  const pool = known(remaining) ? Math.floor(Number(remaining)) : null;
  const cap = Number(capacity) > 0 ? Math.floor(Number(capacity)) : 0;
  const base = historicalBaseline(history);
  const backlog = remainingBacklog(pool, history) || undefined;
  const result = (min: number, max: number, suggested: number, basis: SectionSuggestion["basis"], reason: string): SectionSuggestion =>
    ({ suggested, min, max, basis, reason, headline: rangeLabel(min, max), baseline: base?.sections, ...(backlog ? { backlog } : {}) });

  if (pool === 0) {
    return { suggested: 0, min: 0, max: 0, basis: "empty", headline: "لا شعب", baseline: base?.sections,
      reason: base ? `لا متبقي لهذا المقرر (فُتحت عادةً ${countOf(base.sections, AR.section)})` : "لا متبقي لهذا المقرر" };
  }

  if (base) {
    const b = base.sections;
    const head = `فُتحت عادةً ${countOf(b, AR.section)} (${base.label})`;
    if (pool == null) return result(b, b, b, "history", `${head} · لم يُستورد المتبقي`);
    const band = b >= 4 ? 2 : 1;
    let lean = 0, trend: string;
    if (base.remaining) {
      /* المتبقي مقارناً بنفسه: زاد ٢٠٪ ← الشعب تزيد بقدره، داخل النطاق. */
      const ratio = pool / base.remaining;
      lean = Math.max(-band, Math.min(band, Math.round(b * ratio) - b));
      const usual = Math.round(base.remaining);
      const pct = Math.round((ratio - 1) * 100);
      trend = Math.abs(pct) < 5 ? `المتبقي ${pool} في حدود المعتاد (${usual})`
        : pct > 0 ? `المتبقي ${pool} أعلى من المعتاد (${usual}) بـ${pct}٪`
        : `المتبقي ${pool} أقل من المعتاد (${usual}) بـ${-pct}٪`;
    } else {
      trend = `المتبقي ${pool} · لا مقارنة بفصلٍ سابق بعد`;
    }
    let target = Math.max(1, b + lean);
    let lo = Math.min(b, target), hi = Math.max(b, target);
    let ceiling = "";
    if (cap) {
      /* الميل صعوداً لا يتجاوز عدد الشعب الذي تملؤه المقاعد كلها؛ والتاريخ لا ينزل به. */
      const fill = Math.max(1, Math.ceil(pool / cap));
      if (target > b && target > fill) { target = Math.max(b, fill); hi = target; lo = Math.min(b, target); }
      if (fill < b) ceiling = ` · المتبقي يملأ ${countOf(fill, oblique(AR.section))} فقط بسعة ${cap} — أقل مما يُفتح عادةً، وقد يخدم المقرر أقساماً أخرى`;
    }
    return result(lo, hi, target, "history", `${head} · ${trend}${ceiling}`);
  }

  /* لم يُفتح: إن كان للقسم جداول في تلك الفصول قيل «لم يُفتح في آخر …»، وإلا «لا تاريخ». */
  const intro = history.length ? `لم يُفتح في آخر ${countOf(history.length, oblique(AR.term))}` : "لا تاريخ لهذا المقرر";
  if (pool == null) {
    return { suggested: null, min: null, max: null, basis: "none", headline: "لا اقتراح", reason: `${intro} · لم يُستورد المتبقي` };
  }
  if (!cap) {
    return { suggested: null, min: null, max: null, basis: "none", headline: "لا اقتراح", reason: `${intro} ولا سعة مسجّلة — أدخل السعة في شاشة المقررات` };
  }
  const fill = Math.max(1, Math.ceil(pool / cap));
  const max = Math.min(fill, NO_HISTORY_MAX);
  const capped = fill > NO_HISTORY_MAX ? ` · سُقف عند ${countOf(NO_HISTORY_MAX, AR.section)} حتى يتكوّن له تاريخ` : "";
  return result(1, max, 1, "pool",
    `${intro} · المتبقي ${countOf(pool, AR.student)} يملأ ${countOf(fill, oblique(AR.section))} على الأكثر بسعة ${cap}${capped}${max > 1 ? " · يُبدأ بشعبة واحدة" : ""}`);
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
