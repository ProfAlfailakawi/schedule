/**
 * ── جاهزية الفصل: رقمٌ واحد يُقرأ في ثانية ─────────────────────────────────────
 *
 * يجمع ما في الرادار بلا خوارزميةٍ جديدة: كم من الطلبة يبلغون 12 وحدة فأكثر (0.6)، وكم من الطلب
 * وجد مقعداً (0.4). تقديرٌ لا ضمان؛ ويُقال ذلك حين يكثر «غير المعلوم».
 */
export interface ReadinessBands { canReach15: number; canReach12To14: number; below12: number; graduatingBelow12: number; unknown: number }
export type ReadinessTier = "ready" | "watch" | "risk";

export interface Readiness {
  /** 0–100، أو null حين لا طلبةَ يُقاس عليهم. */
  score: number | null;
  tier: ReadinessTier | null;
  /** نسبة من يبلغون 12 فأكثر ممن يمكن الحكم عليهم. */
  reachShare: number;
  /** نسبة الطلب الذي وجد مقعداً. */
  seatShare: number;
  /** نسبة «غير المعلوم» من الكل: إن زادت على 20٪ فالتقدير ضعيف. */
  unknownShare: number;
  weak: boolean;
}

const pct = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 100);

export function semesterReadiness(bands: ReadinessBands | null | undefined, wanted: number, seated: number): Readiness {
  const total = bands ? bands.canReach15 + bands.canReach12To14 + bands.below12 + bands.graduatingBelow12 + bands.unknown : 0;
  const judged = bands ? total - bands.unknown : 0;
  if (!bands || judged <= 0) return { score: null, tier: null, reachShare: 0, seatShare: 0, unknownShare: total ? pct(bands!.unknown / total) : 0, weak: true };
  const reachShare = (bands.canReach15 + bands.canReach12To14 + bands.graduatingBelow12) / judged;
  const seatShare = wanted > 0 ? seated / wanted : 1;
  const score = pct(reachShare * 0.6 + seatShare * 0.4);
  const unknownShare = pct(bands.unknown / total);
  return { score, tier: score >= 85 ? "ready" : score >= 65 ? "watch" : "risk", reachShare: pct(reachShare), seatShare: pct(seatShare), unknownShare, weak: unknownShare > 20 };
}

export const TIER_LABEL: Record<ReadinessTier, string> = { ready: "جاهز", watch: "يحتاج انتباهاً", risk: "في خطر" };
