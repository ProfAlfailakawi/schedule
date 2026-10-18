import { suggestSectionCount, type SimilarTermHistory } from "./sectionCountSuggestion";

/**
 * ── الشعب مقابل الطلب ────────────────────────────────────────────────────────────────
 *
 * سطرٌ واحد لكل مقرر ينقصه شعب: «عندكم ٥ والمطلوب ٧». مصدران منفصلان لا يختلطان:
 *   ١) planGaps — التخطيط: ما اختاره القسم بيده («المختار»)، أو ما يقترحه حسابُ «تخطيط الشعب» من كشف المتبقي المرفوع وتاريخ الفصول.
 *      «مساري» لا شأن له به: لا يدخل في التخطيط ولا في نتيجة رفع الكشف.
 *   ٢) studentGaps — رغبات الطلبة (استبيانٌ + «مساري») مقسومةً على سعة الشعبة: إشارةٌ مستقلة.
 * نقيةٌ لا تقرأ ولا تكتب؛ يقرأها شريط الاعتماد بعد جلب المصدرين.
 */

export interface GapCourse { id: number; code: string; name: string; capacity: number; existing: number; students: number }
export interface GapPlan {
  remaining: Record<string, number>;
  accepted: Record<string, number>;
  history: Record<string, SimilarTermHistory[]>;
}
export interface GapItem {
  id: number; code: string; name: string;
  existing: number; required: number; extra: number;
  basis: "plan" | "students";
  /** الرقم الذي بُني عليه المطلوب: المتبقي من الكشف، أو عدد الطلبة. */
  demand: number;
}

const known = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const byNeed = (a: GapItem, b: GapItem) => b.extra - a.extra || b.demand - a.demand || a.code.localeCompare(b.code, "en");

/** من التخطيط وحده. بلا تخطيط (لا مختار ولا كشف) لا شيء. */
export function planGaps(courses: readonly GapCourse[], plan: GapPlan | null): GapItem[] {
  const items: GapItem[] = [];
  if (!plan) return items;
  for (const course of courses) {
    const key = String(course.id);
    const chosen = plan.accepted[key];
    const left = plan.remaining[key];
    let required: number | null = null, demand = known(left) ? left : 0;
    if (known(chosen)) required = Math.max(0, Math.floor(chosen));
    else if (known(left)) {
      const suggestion = suggestSectionCount(left, course.capacity, plan.history[key] || []);
      if (known(suggestion.suggested)) required = suggestion.suggested;
    }
    if (required === null) continue;
    const extra = required - course.existing;
    if (extra > 0) items.push({ id: course.id, code: course.code, name: course.name, existing: course.existing, required, extra, basis: "plan", demand });
  }
  return items.sort(byNeed);
}

/** من رغبات الطلبة وحدها: ⌈الطلبة ÷ السعة⌉. سعةٌ مجهولة أو طلبٌ صفر ← لا اقتراح. */
export function studentGaps(courses: readonly GapCourse[]): GapItem[] {
  const items: GapItem[] = [];
  for (const course of courses) {
    if (!(course.capacity > 0) || !(course.students > 0)) continue;
    const required = Math.ceil(course.students / course.capacity);
    const extra = required - course.existing;
    if (extra > 0) items.push({ id: course.id, code: course.code, name: course.name, existing: course.existing, required, extra, basis: "students", demand: course.students });
  }
  return items.sort(byNeed);
}
