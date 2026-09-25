/**
 * ── صفةُ الجدول الذي يراه العميد ────────────────────────────────────────────
 *
 * مشتركٌ بين الخادم (من أين يُقرأ) والواجهة (بأيِّ اسمٍ يُعرض)، فلا تُكتب
 * التسمية مرّتين.
 */

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
    const last = [...(approval.rounds || [])].filter(round => round.acceptedAt).sort((a, b) => b.number - a.number)[0];
    const versionId = last?.acceptedVersionId || last?.reviewedVersionId;
    if (versionId) return { kind: "version", versionId: String(versionId), finality: "accepted" };
  }
  return termEnded ? { kind: "live", finality: "historical" } : { kind: "none" };
}
