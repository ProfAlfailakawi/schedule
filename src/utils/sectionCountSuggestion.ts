/**
 * ── كم شعبةً نفتح؟ ──────────────────────────────────────────────────────────
 *
 * قبل الفصل يُدخل القسم إحصاءَ التسجيل (عدد الطلبة لكل مقرر). الاقتراح:
 *
 *   1) السعة معروفة (AdCourse.MaxStudent) ← ⌈الطلبة ÷ السعة⌉.
 *   2) السعة مجهولة وفي التاريخ أعدادٌ وشعب ← متوسط الطلبة للشعبة في أقرب
 *      فصولٍ مماثلة (الموسم نفسه، سنوات سابقة؛ الأقرب أثقل وزناً ٣، ٢، ١) سعةً.
 *   3) لا سعة ولا أعداد تاريخية لكن شُعب سابقة ← عدد شعب آخر فصلٍ مماثل.
 *   4) لا شيء ← لا اقتراح، ويُقال ذلك.
 *
 * صفرُ طلبة ← صفرُ شعب. والسبب جملةٌ قصيرة تذكر الحساب وآخر فصلٍ مماثل.
 * لا يُكتب شيءٌ في الجدول: الاقتراح يُقبل أو يُترك.
 */
import { AR, countOf } from "./arabicCount";

export interface SimilarTermHistory {
  termName: string;
  /** شعبٌ فُتحت فعلاً في ذلك الفصل (من الجدول). */
  sections: number;
  /** عدد الطلبة المسجّل لذلك الفصل إن أُدخل. */
  headcount?: number;
}

export interface SectionSuggestion {
  suggested: number | null;
  basis: "capacity" | "history-capacity" | "history-sections" | "none" | "empty";
  reason: string;
}

const WEIGHTS = [3, 2, 1];

/** متوسطٌ موزون لطلبة الشعبة في أقرب ثلاثة فصول مماثلة لها عددٌ وشعب. */
export function historicalPerSection(history: readonly SimilarTermHistory[]): number | null {
  const usable = history.filter(item => Number(item.headcount) > 0 && item.sections > 0).slice(0, 3);
  if (!usable.length) return null;
  let sum = 0, weight = 0;
  usable.forEach((item, index) => { const w = WEIGHTS[index]; sum += w * (Number(item.headcount) / item.sections); weight += w; });
  return sum / weight;
}

export function suggestSectionCount(
  registered: number,
  capacity: number | null | undefined,
  history: readonly SimilarTermHistory[],
): SectionSuggestion {
  const students = Math.max(0, Math.floor(Number(registered) || 0));
  const cap = Number(capacity) > 0 ? Math.floor(Number(capacity)) : 0;
  const last = history.find(item => item.sections > 0);
  const lastNote = last
    ? ` · في ${last.termName}: ${countOf(last.sections, AR.section)}${Number(last.headcount) > 0 ? ` لـ${countOf(Number(last.headcount), AR.student)}` : ""}`
    : "";

  if (students === 0) return { suggested: 0, basis: "empty", reason: `لا طلبة مسجّلين${lastNote}` };

  if (cap) {
    const n = Math.ceil(students / cap);
    const spare = n * cap - students;
    return { suggested: n, basis: "capacity", reason: `${countOf(students, AR.student)} ÷ سعة ${cap} = ${countOf(n, AR.section)} · المقاعد الشاغرة: ${spare}${lastNote}` };
  }

  const perSection = historicalPerSection(history);
  if (perSection) {
    const eff = Math.max(1, Math.round(perSection));
    const n = Math.ceil(students / eff);
    return { suggested: n, basis: "history-capacity", reason: `لا سعة مسجّلة؛ متوسط الشعبة في الفصول المماثلة ${countOf(eff, AR.student)} ← ${countOf(n, AR.section)}${lastNote}` };
  }

  if (last) return { suggested: last.sections, basis: "history-sections", reason: `لا سعة ولا أعداد سابقة؛ كما في آخر فصلٍ مماثل${lastNote}` };

  return { suggested: null, basis: "none", reason: "لا سعة مسجّلة للمقرر ولا تاريخ مماثل — أدخل السعة في شاشة المقررات" };
}
