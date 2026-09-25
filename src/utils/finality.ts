/**
 * ── صفةُ الجدول الذي يراه العميد ────────────────────────────────────────────
 *
 * مشتركٌ بين الخادم (من أين يُقرأ) والواجهة (بأيِّ اسمٍ يُعرض)، فلا تُكتب
 * التسمية مرّتين.
 */

import { roundBaselineVersionId } from "./approvalWorkflow";

/* ══ ما يراه العميد: النهائي، أو المنفَّذ ═══════════════════════════════════ */

/**
 * «accepted»: جدولٌ قبِله التسجيل (حيّاً أو من نسخة القبول الأخيرة).
 * «historical»: فصلٌ انتهى وقسمٌ لم يمرّ بدورة الاعتماد — جدولٌ نُفّذ فعلاً،
 * يُعرض بصفته هذه لا بصفة «معتمد».
 */
export type Finality = "accepted" | "historical";
export const HISTORICAL_FINALITY_LABEL = "جدول نُفّذ (قبل دورة الاعتماد)";

export interface FinalApprovalLike {
  status: string;
  currentRound?: number;
  rounds?: ReadonlyArray<{ number: number; acceptedAt?: string | null; acceptedVersionId?: string | null; reviewedVersionId?: string | null }>;
}

export type FinalSource =
  | { kind: "live"; finality: Finality }
  | { kind: "version"; versionId: string; finality: "accepted" }
  | { kind: "none" };

/**
 * من أين يُقرأ جدولُ قسمٍ لمن يرى النهائيَّ وحده.
 *
 * كان كلُّ قسمٍ بلا سجلِّ اعتمادٍ يسقط — والإنتاج كلُّه بلا سجلات، فكان
 * العميد لا يرى شيئاً، ولا حتى فصولاً مضت ودُرِّست. القاعدة الآن:
 *   - معتمدٌ الآن → الحيّ، «معتمد».
 *   - قُبل من قبل ثم عاد → نسخةُ آخر قبول، «معتمد».
 *   - غير ذلك: فصلٌ انتهى → الحيّ، «منفَّذ»؛ فصلٌ جارٍ أو قادم → لا يظهر.
 */
export function finalSourceFor(approval: FinalApprovalLike | undefined, termEnded: boolean): FinalSource {
  if (approval?.status === "accepted") return { kind: "live", finality: "accepted" };
  if (approval) {
    /* آخرُ ما قُبل، من القاعدة الواحدة التي يقرأ بها تقريرُ التغييرات أساسَه. */
    const versionId = roundBaselineVersionId(
      { rounds: [...(approval.rounds || [])] as any, currentRound: Number(approval.currentRound || 0) || Math.max(0, ...(approval.rounds || []).map(r => r.number)) },
      Number(approval.currentRound || 0) || Math.max(0, ...(approval.rounds || []).map(r => r.number)),
      { acceptedOnly: true },
    );
    if (versionId) return { kind: "version", versionId: String(versionId), finality: "accepted" };
  }
  return termEnded ? { kind: "live", finality: "historical" } : { kind: "none" };
}
