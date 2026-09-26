/**
 * ── ما يظهر في شريط الاعتماد، وما لا يظهر ───────────────────────────────────
 *
 * قاعدةُ صاحب النظام: «إذا ما في بيانات لهذه الأيقونات… ماله داعي تظهر… أخفها،
 * علشان لا يصير زحمة وتلوث بصري». فكلُّ عنصرٍ في الشريط يظهر حين يحمل شيئاً:
 *   • المرقاة: حين يكون للدورة أثر — توقيع، أو جولة، أو إرجاع، أو إضافاتٌ
 *     تنتظر، أو حالٌ بعد الإعداد. قسمٌ في أول الإعداد لا مرقاةَ له.
 *   • «التفاصيل»: حين يكون تحتها شيء — والتفاصيلُ هي المرقاة بأختامها وما
 *     كتبه إنسان (سببُ الإرجاع، الشعبُ المضافة)، وكلُّها فرعُ المرقاة.
 *   • الشريط كله: حين يكون فيه أثرٌ أو موعدٌ أو ملاحظةٌ أو سجلٌّ أو فعلٌ
 *     لصاحبه. قسمٌ يُعدّ جدوله ولا شيء ينتظره لا يرى شريطاً فيه كلمةٌ واحدة.
 *
 * قاعدةٌ واحدة في مكانٍ واحد: الشريط يسألها ولا يعيد كتابتها.
 */
import type { ScheduleApprovalStatus } from "../types";

export interface ApprovalBarPresenceInput {
  status: ScheduleApprovalStatus;
  hasCommitteeSignature: boolean;
  hasHeadSignature: boolean;
  /** الجولة الجارية؛ صفرٌ قبل أول إرسال. */
  round: number;
  /** أرجع رئيسُ القسم الجدولَ للجنة وهو قيد الإعداد. */
  headReturned: boolean;
  pendingAdditions: number;
  /** سطرُ الموعد غير فارغ (حلقة الموعد). */
  hasDeadline: boolean;
  openNotes: number;
  escalatedNotes: number;
  historyEvents: number;
  /** زرُّ فعلٍ واحدٌ على الأقل معروضٌ لصاحب الحساب. */
  hasAction: boolean;
  /** خطأٌ معروض أو ورقةٌ مفتوحة: لا يُخفى الشريط من تحتهما. */
  pinned?: boolean;
}

export interface ApprovalBarPresence {
  /** مرقاة المراحل (المصغّرة والكبيرة). */
  relay: boolean;
  /** زرُّ «التفاصيل» ومنطقتُها. */
  details: boolean;
  /** الشريط كله. */
  bar: boolean;
}

export function approvalBarPresence(input: ApprovalBarPresenceInput): ApprovalBarPresence {
  const relay = input.hasCommitteeSignature || input.hasHeadSignature
    || Number(input.round || 0) > 0 || input.headReturned || Number(input.pendingAdditions || 0) > 0
    || input.status === "submitted" || input.status === "accepted" || input.status === "returned";
  const details = relay;
  const bar = relay || input.hasDeadline || Number(input.openNotes || 0) > 0 || Number(input.escalatedNotes || 0) > 0
    || Number(input.historyEvents || 0) > 0 || input.hasAction || Boolean(input.pinned);
  return { relay, details, bar };
}
