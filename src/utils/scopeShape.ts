/**
 * ── شكلُ نطاق المستخدم: ما يُسأل عنه وما يُخفى ──────────────────────────────
 *
 * قرارُ المالك (18/10/2026): من دخل بحساب قسمٍ فلا معنى لأن يُسأل عن كليته أو قسمه في كل شاشة.
 *   • single    قسمٌ واحد في كليةٍ واحدة: لا كلية ولا قسم — يبقيان افتراضيَّين في الخلفية، وأمامه الفصلُ وحده.
 *   • multiSite قسمٌ واحدٌ في عدّة كليات (مواقع): يُخفى القسم، ويُختار الموقع (الكلية) والفصل.
 *   • many      من يملك أكثر من قسم (عميد، مساعد، تسجيل، مدير…): الكلية والقسم والفصل كلُّها كما هي.
 * والإدارة دائماً many. هذه الدالة الموضعُ الوحيد لهذا القرار؛ كل شاشةٍ تسألها ولا تكتب شرطها بنفسها.
 */
import { singleDepartmentOf, soleCollegeOf, type ScopeAssignmentLike } from "./scopeContext";
import { multiSiteDepartment } from "./inboxAudience";

export type ScopeShape = "single" | "multiSite" | "many";

export function scopeShape(scopes: ScopeAssignmentLike[] = [], isAdmin = false): ScopeShape {
  if (isAdmin || !Array.isArray(scopes) || !scopes.length) return "many";
  const college = soleCollegeOf(scopes, false);
  if (college && singleDepartmentOf(scopes, college, false) !== null) return "single";
  if (multiSiteDepartment(scopes as any)) return "multiSite";
  return "many";
}

/** هل تُخفى قائمةُ الكلية؟ — حساب القسم الواحد في كليةٍ واحدة. */
export const hidesCollege = (shape: ScopeShape): boolean => shape === "single";
/** هل تُخفى قائمةُ القسم؟ — حسابُ قسمٍ واحد، في كليةٍ أو في عدّة مواقع. */
export const hidesSection = (shape: ScopeShape): boolean => shape === "single" || shape === "multiSite";
