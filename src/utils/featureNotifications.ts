/**
 * ── إشعاراتُ المزايا الجديدة للعاملين ─────────────────────────────────────────
 *
 * كمركز الإشعارات الأصلي: لا يُخزَّن شيءٌ، وكلُّ إشعارٍ يُشتقّ من الحال لحظةَ السؤال، فلا
 * إشعارَ يبقى بعد زوال سببه. ثلاثةٌ:
 *   • صحيفةٌ قيد المراجعة (القسمُ يراجع، ورئيسُ اللجنة يعتمد).
 *   • الرادار: مقرراتٌ تحتاج قراراً (مقاعد لا تكفي، أو مطلوبٌ ولا يُطرح).
 *   • بعد التسجيل: ما تعثّر فيه الطلبة (أعدادٌ؛ الأسماءُ تصل كشفَ التسجيل بطلباتٍ عادية).
 *
 * المعرّفُ يحمل ما يجعل التغيّرَ إشعاراً جديداً (وقتَ التعديل، وقتَ تشغيل الرادار، العدد).
 */
import { AR, countOf } from "./arabicCount";
import type { CenterNotification } from "./notificationCenter";

export interface PlanReviewNotice { planId: string; planName: string; sectionId: number; collegeId: number; sectionName: string; updatedAt: string }
export interface RadarNotice { ranAt: string; needsDecision: number; scoped: boolean }
export interface OutcomeNotice { answered: number; stuck: number; scoped: boolean }

export interface FeatureNotificationInput {
  role: string;
  planReviews: readonly PlanReviewNotice[];
  radar: RadarNotice | null;
  outcome: OutcomeNotice | null;
  termId?: number;
  termName?: string;
}

const WATCHERS = new Set(["dean", "viceDean", "registrarDean", "registrarHead", "registrarStaff", "admin"]);

export function buildFeatureNotifications(input: FeatureNotificationInput): CenterNotification[] {
  const { role } = input;
  const items: CenterNotification[] = [];
  const decides = role === "committeeChair" || role === "admin";

  /* ── صحائف قيد المراجعة ── */
  for (const review of input.planReviews.slice(0, 4)) {
    items.push({
      id: `plan-review:${review.planId}:${review.updatedAt}`, tone: decides ? "action" : "waiting",
      title: decides ? `صحيفة «${review.planName}» تنتظر مراجعتك واعتمادك` : `صحيفة «${review.planName}» قيد المراجعة`,
      detail: review.sectionName, view: "planReview", at: review.updatedAt, collegeId: review.collegeId, sectionId: review.sectionId,
    });
  }
  if (input.planReviews.length > 4) {
    const more = input.planReviews.length - 4;
    items.push({
      id: `plan-review:more:${input.planReviews.length}`, tone: "waiting", title: `و${countOf(more, AR.draft)} أخرى قيد المراجعة`,
      detail: "مراجعة الصحيفة", view: "planReview",
    });
  }

  /* ── الرادار ── */
  if (input.radar && input.radar.needsDecision > 0) {
    const n = input.radar.needsDecision;
    const own = role === "committeeChair" || role === "departmentHead" || role === "standard";
    items.push({
      id: `radar:${input.radar.ranAt}:${n}`, tone: own ? (role === "departmentHead" ? "waiting" : "action") : "waiting",
      title: `${countOf(n, AR.course)} ${n === 1 ? "يحتاج" : "تحتاج"} قراراً في رادار التسجيل`,
      detail: input.radar.scoped ? "في مقررات قسمك: زحامٌ أو مطلوبٌ لا يُطرح" : "زحامٌ أو مطلوبٌ لا يُطرح في الجامعة",
      view: "simulation", at: input.radar.ranAt,
    });
  }

  /* ── بعد التسجيل ── */
  if (input.outcome && input.outcome.stuck > 0 && (WATCHERS.has(role) || role === "committeeChair" || role === "departmentHead")) {
    items.push({
      id: `outcome:${input.outcome.answered}:${input.outcome.stuck}`, tone: "alert",
      title: `تعثّر الطلبة في ${countOf(input.outcome.stuck, AR.course)} بعد التسجيل`,
      detail: `${countOf(input.outcome.answered, AR.student)} أجابوا «هل سجلت؟»${input.outcome.scoped ? " — في مقررات قسمك" : ""}`,
      view: "simulation",
    });
  }
  return items.map(item => ({ ...item, termId: input.termId, termName: input.termName }));
}
