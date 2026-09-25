/**
 * ── «متأخّر» قاعدةٌ واحدة ────────────────────────────────────────────────────
 *
 * كان التأخّر يُحكم عليه في موضعين بمنطقين: ميزانُ الأقسام يقول «متأخّر» لمن
 * انقضى موعده ولم يبدأ جولةً — لكنّ القسمَ بلا سجلٍّ («قيد الإعداد») لا يُحكم
 * عليه أبداً؛ وجرسُ التسجيل يعدّ المتأخّرين بموعد الفصل وينسى تمديدَ القسم.
 * فكان رئيسُ التسجيل يُنبَّه على قسمٍ مدّد له بنفسه، والعميدُ لا يرى قسماً لم
 * يبدأ أصلاً.
 *
 * القاعدة هنا وحدها:
 *   - الموعدُ الفاعل هو التمديد إن وُجد، وإلا موعدُ الفصل؛ وبلا موعدٍ لا تأخّر.
 *   - قسمٌ سلّم (أُرسل، أو قُبل، أو أُرجع بعد تسليم، أو له جولةٌ سابقة) ليس متأخّراً.
 *   - وما سواه متأخّرٌ إذا انقضى اليومُ الأخير — ولو لم يكتب موعداً واحداً:
 *     قسمٌ لم يبدأ بعد انقضاء الموعد هو أشدُّ التأخّر لا استثناءٌ منه.
 */
import { daysBetween, kuwaitDateISO } from "./approvalWorkflow";

export interface LatenessInput {
  /** عددُ مواعيد القسم في الفصل — للعرض فقط؛ الصفرُ لا يُعفي من التأخّر. */
  rowCount?: number;
  /** حال دورة الاعتماد؛ غيابُها يعني أن القسم لم يبدأ الدورة. */
  approvalStatus?: string | null;
  /** عددُ الجولات المُرسلة من قبل (currentRound). */
  submittedRounds?: number;
  /** موعد الفصل (YYYY-MM-DD). */
  deadline?: string | null;
  /** تمديد القسم (YYYY-MM-DD) — يتقدّم على موعد الفصل. */
  extension?: string | null;
  /** اللحظة التي يُقاس بها (ميلّي ثانية أو ISO)، للاختبار. */
  now?: number | string;
}

const HANDED_OVER = new Set(["submitted", "accepted", "returned"]);

/** الموعد الذي يُحاسَب عليه القسم. */
export function effectiveDeadline(input: Pick<LatenessInput, "deadline" | "extension">): string | undefined {
  return String(input.extension || input.deadline || "") || undefined;
}

function todayOf(now?: number | string): string {
  /* اليوم بتوقيت الكويت — القاعدة نفسها التي ينتهي بها الموعد (R15). */
  const date = now === undefined ? new Date() : new Date(now);
  return kuwaitDateISO(Number.isNaN(date.getTime()) ? new Date() : date);
}

/** الأيام الباقية حتى الموعد الفاعل (سالبةٌ بعد انقضائه)، أو undefined بلا موعد. */
export function daysLeftUntil(input: Pick<LatenessInput, "deadline" | "extension" | "now">): number | undefined {
  const due = effectiveDeadline(input);
  return due ? daysBetween(todayOf(input.now), due) : undefined;
}

export function isLate(input: LatenessInput): boolean {
  const due = effectiveDeadline(input);
  if (!due) return false;
  if (input.approvalStatus && HANDED_OVER.has(String(input.approvalStatus))) return false;
  if (Number(input.submittedRounds || 0) > 0) return false;
  return daysBetween(todayOf(input.now), due) < 0;
}
