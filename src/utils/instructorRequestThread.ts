/**
 * ── حوارُ البند: القسمُ يقترح، والأستاذُ يوافق أو يقترح غيره ─────────────────
 *
 * كان قرارُ القسم على البند كلمةً واحدةً أخيرة: «ثُبّت» أو «رُفض» ومعه بدائل.
 * وما بين الطرفين من «هل يناسبك الاثنين بدل الأحد؟» كان يجري في الهاتف، فلا
 * يبقى منه شيءٌ في السجلّ، ولا يعرف أحدٌ على مَن الدور.
 *
 * فصار لكل بندٍ خيطٌ واحد: رسائلُ القسم والأستاذ بترتيبها، وكلُّ رسالةٍ قد
 * تحمل أوقاتاً مقترحة. وحالةُ البند تُقرأ من آخر دورٍ فيه — رسالةً كان أو
 * قراراً — في هذا الموضع وحده، فلا تقول صفحةُ الأستاذ شيئاً ويقول الواردُ غيره.
 */
import type { InstructorRequestSlot } from "../types";

export type RequestNegotiationState = "awaiting" | "proposed" | "agreed" | "rejected";

/** الألفاظُ نفسُها في الوارد وفي صفحة الأستاذ. */
export const NEGOTIATION_LABEL: Record<RequestNegotiationState, string> = {
  awaiting: "بانتظار الرد",
  proposed: "مقترح من القسم",
  agreed: "موافَق",
  rejected: "مرفوض",
};

/** أقصى ما يُحفظ من رسائل البند الواحد، وأقصى طول الرسالة. */
export const THREAD_LIMIT = 40;
export const THREAD_TEXT_LIMIT = 400;

const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
type DayKey = typeof DAY_KEYS[number];

/**
 * الأوقاتُ المقترحة كما تصل من أيّ طرف: ثلاثةٌ على الأكثر، وكلُّ واحدٍ بيومٍ
 * وبدايةٍ ونهاية. هي القاعدةُ نفسُها لبدائل الرفض ولاقتراحات الحوار.
 */
export function parseOfferedSlots(raw: unknown): InstructorRequestSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).map((entry: any) => {
    const days = Array.isArray(entry?.days)
      ? (entry.days as unknown[]).map(String).filter((day): day is DayKey => (DAY_KEYS as readonly string[]).includes(day))
      : [];
    const day = String(entry?.day || days[0] || "");
    return {
      day: day as DayKey, start: String(entry?.start || ""), end: String(entry?.end || ""),
      ...(Array.isArray(entry?.days) ? { days } : {}),
    };
  }).filter(slot => (DAY_KEYS as readonly string[]).includes(slot.day)
    && /^\d{1,2}:\d{2}$/.test(slot.start) && /^\d{1,2}:\d{2}$/.test(slot.end));
}

/** ما تحتاجه القاعدة من البند — بشكلٍ يقبل البندَ كاملاً ويقبل صورتَه المختصرة. */
export interface ThreadItem {
  action: string;
  decision?: { state?: string; alternatives?: readonly unknown[]; decidedAt?: string };
  thread?: ReadonlyArray<{ from: string; at: string; accepted?: boolean }>;
}

/**
 * على مَن الدور؟ آخرُ ما وقع في البند هو الجواب:
 *   - قرارٌ «ثُبّت» أو موافقةُ الأستاذ على مقترح ← موافَق.
 *   - رسالةٌ من القسم، أو رفضٌ ببدائل ← مقترح من القسم (الدورُ على الأستاذ).
 *   - رفضٌ بلا بدائل ولا ردَّ بعده ← مرفوض.
 *   - وما عدا ذلك — طلبٌ وصل، أو ردٌّ من الأستاذ — ← بانتظار الرد (الدورُ على القسم).
 */
export function negotiationState(item: ThreadItem): RequestNegotiationState {
  const last = (item.thread || [])[(item.thread || []).length - 1];
  const decision = item.decision?.state && item.decision.state !== "pending" ? item.decision : undefined;
  const decidedAt = Date.parse(decision?.decidedAt || "") || 0;
  const saidAt = Date.parse(last?.at || "") || 0;
  if (decision && (!last || decidedAt >= saidAt)) {
    if (decision.state === "fixed") return "agreed";
    return (decision.alternatives || []).length ? "proposed" : "rejected";
  }
  if (last?.accepted) return "agreed";
  if (last?.from === "department") return "proposed";
  return "awaiting";
}

/**
 * يُغلق البندُ حين يكون آخرُ ما وقع فيه قراراً نهائياً لا ينتظر أحداً: «ثُبّت»،
 * أو رفضٌ بلا بدائل. موافقةُ الأستاذ على مقترحٍ لا تُغلقه — تنتظر التثبيت.
 */
export function negotiationClosed(item: ThreadItem): boolean {
  if (item.action === "keep" && !(item.thread || []).length) return true;
  const state = negotiationState(item);
  if (state === "rejected") return true;
  const last = (item.thread || [])[(item.thread || []).length - 1];
  return state === "agreed" && item.decision?.state === "fixed"
    && (!last || (Date.parse(item.decision.decidedAt || "") || 0) >= (Date.parse(last.at) || 0));
}
