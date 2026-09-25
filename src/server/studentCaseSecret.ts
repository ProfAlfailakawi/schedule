/**
 * ── سرُّ هوية حالات الطلبة: المحفوظُ هو الحَكَم ─────────────────────────────
 *
 * كل اسمٍ ورقمٍ مدنيٍّ لطالب مختومٌ (AES-GCM) بمفتاحٍ مشتقٍّ من هذا السرّ،
 * وبصمةُ الرقم (مفتاحُ التكرار) مشتقّةٌ منه كذلك. فتغييرُه يجعل كلَّ حالةٍ
 * مختومةٍ قبله غيرَ مقروءة — بلا خطأٍ ظاهر.
 *
 * كان يُقرأ `STUDENT_CASE_SECRET || CALENDAR_SECRET` قبل المحفوظ: فمن ضبط
 * CALENDAR_SECRET لاحقاً (لغرض التقويم وحده) أعمى كلَّ الحالات. فصارت القاعدة:
 *   1) CALENDAR_SECRET لا شأن له هنا أبداً (له فكُّ الختم القديم وحده، في الخادم).
 *   2) السرُّ المحفوظ (Firestore أو الملف المحلي) هو الحَكَم متى وُجد.
 *   3) STUDENT_CASE_SECRET يُقبل إن لم يكن محفوظٌ بعد (فيُحفظ هو، ويُثبَّت)،
 *      أو كان مساوياً للمحفوظ. وإن خالفه رُفض — ويُسجَّل ذلك بصوتٍ عالٍ — لأن
 *      استعماله يُفسد ما خُتم قبله.
 *   4) وإلا يُولَّد سرٌّ عشوائيٌّ ويُحفظ.
 */
export type StudentCaseSecretChoice =
  | { secret: string; persist: boolean; conflict: false }
  | { secret: string; persist: false; conflict: true };

export function chooseStudentCaseSecret(input: {
  configured?: string | null;
  stored?: string | null;
  generate: () => string;
}): StudentCaseSecretChoice {
  const configured = String(input.configured || "").trim();
  const stored = String(input.stored || "").trim();
  if (stored) {
    if (configured && configured !== stored) return { secret: stored, persist: false, conflict: true };
    return { secret: stored, persist: false, conflict: false };
  }
  if (configured) return { secret: configured, persist: true, conflict: false };
  return { secret: input.generate(), persist: true, conflict: false };
}

export const STUDENT_CASE_SECRET_CONFLICT_MESSAGE =
  "STUDENT_CASE_SECRET differs from the stored student-case secret; the stored secret is used and the environment value is IGNORED. " +
  "Using it would make every sealed student identity unreadable. Remove STUDENT_CASE_SECRET or set it to the stored value.";
