/**
 * ── قرارُ الحالة كلها (طلب الخريج) ──────────────────────────────────────────
 *
 * طلبُ الخريج لا يسمّي مقرّراً، فلا يُعلَّق عليه قرارُ مقرّر. وكان الكشفُ
 * يُسقط كلَّ طلبٍ بلا مقرّرات، فيصل القسمَ ولا يُجاب أبداً. هنا القاعدةُ في
 * مكانٍ واحد: من يقرّر، وبأيّ ترتيب، وما الحالةُ التي تُعرض — يقرؤها الخادمُ
 * حين يكتب وحين يعرض الكشف وحين يقرأ الطالبُ حالته، وتقرؤها الشاشة.
 *
 * الترتيبُ نفسُه في المقرّرات: اللجنةُ أولاً، ثم التسجيل. لا يقرّر التسجيلُ
 * في حالةٍ لم توافق عليها اللجنة، ولا تنقض اللجنةُ ما قرّره التسجيل.
 */
import type { StudentCaseDecision, StudentCaseState, StudentNeed } from "../types";

export type StudentCaseSide = "committee" | "registrar";
/** الحالةُ كما تُصنَّف في الكشف — الأسماءُ نفسُها التي تُصنَّف بها المقرّرات. */
export type StudentCaseStatus = "pending" | "approved" | "committee-rejected" | "registered" | "rejected";

/** الطلبُ يُقرَّر على مستوى الحالة حين لا يسمّي مقرّراً. */
export const isCaseLevelNeed = (need: Pick<StudentNeed, "requestType" | "courseIds">): boolean =>
  need.requestType === "graduate" || !(Array.isArray(need.courseIds) && need.courseIds.length);

export const studentCaseStatus = (state?: StudentCaseState | null): StudentCaseStatus => {
  const committee = state?.committee, registrar = state?.registrar;
  if (!committee) return "pending";
  if (committee.state === "rejected") return "committee-rejected";
  if (!registrar) return "approved";
  return registrar.state === "approved" ? "registered" : "rejected";
};

/**
 * هل تُقبل هذه الكتابة على الحالة الحاليّة؟ يُرجع سبب الرفض أو null.
 * `next === null` يعني سحبَ قرار تلك الجهة (إعادته للانتظار).
 * تُسأل **داخل** المعاملة التي تكتب، على الحالة كما هي لحظتَها.
 */
export const studentCaseRefusal = (
  current: StudentCaseState | undefined,
  side: StudentCaseSide,
  next: StudentCaseDecision | null,
): string | null => {
  if (side === "committee") {
    if (current?.registrar) return "قرّر التسجيلُ في هذه الحالة، فلا يُغيَّر قرارُ اللجنة.";
    return null;
  }
  if (next && current?.committee?.state !== "approved")
    return "لم توافق لجنةُ القسم على هذه الحالة بعد، فلا يُكتب فيها من جهة التسجيل.";
  return null;
};

export const applyStudentCaseDecision = (
  current: StudentCaseState | undefined,
  side: StudentCaseSide,
  next: StudentCaseDecision | null,
): StudentCaseState => {
  const merged: StudentCaseState = { ...(current || {}) };
  if (next) merged[side] = next; else delete merged[side];
  return merged;
};
