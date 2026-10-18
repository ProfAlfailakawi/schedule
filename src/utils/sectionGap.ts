import { suggestSectionCount, type SimilarTermHistory } from "./sectionCountSuggestion";

/**
 * ── الشعب مقابل الطلب ────────────────────────────────────────────────────────────────
 *
 * سطرٌ واحد لكل مقرر ينقصه شعب: «عندكم ٥ والمطلوب ٧». المطلوب يأتي من أصدق مصدرٍ متاح:
 *   ١) تخطيط القسم: ما اختاره بيده («المختار»)، أو ما يقترحه حسابُ «تخطيط الشعب» من كشف المتبقي المرفوع وتاريخ الفصول.
 *   ٢) وإلا طلبُ الطلبة أنفسهم (استبيانٌ + رغبات «مساري») مقسوماً على سعة الشعبة.
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

export function sectionGaps(courses: readonly GapCourse[], plan: GapPlan | null): GapItem[] {
  const items: GapItem[] = [];
  for (const course of courses) {
    const key = String(course.id);
    let required: number | null = null, basis: GapItem["basis"] = "students", demand = course.students;
    if (plan) {
      const chosen = plan.accepted[key];
      const left = plan.remaining[key];
      if (known(chosen)) { required = Math.max(0, Math.floor(chosen)); basis = "plan"; demand = known(left) ? left : 0; }
      else if (known(left)) {
        const suggestion = suggestSectionCount(left, course.capacity, plan.history[key] || []);
        if (known(suggestion.suggested)) { required = suggestion.suggested; basis = "plan"; demand = left; }
      }
    }
    if (required === null && course.capacity > 0 && course.students > 0) {
      required = Math.ceil(course.students / course.capacity);
    }
    if (required === null) continue;
    const extra = required - course.existing;
    if (extra > 0) items.push({ id: course.id, code: course.code, name: course.name, existing: course.existing, required, extra, basis, demand });
  }
  return items.sort((a, b) => b.extra - a.extra || b.demand - a.demand || a.code.localeCompare(b.code, "en"));
}
