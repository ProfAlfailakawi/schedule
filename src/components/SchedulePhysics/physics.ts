import type { FSchedule } from "../../types";
import type {
  ScheduleDayKey,
  SchedulePhysicsAutopsy,
  SchedulePhysicsCounterfactual,
  SchedulePhysicsDecision,
  SchedulePhysicsFingerprintItem,
  SchedulePhysicsHorizon,
  SchedulePhysicsQuality,
  SchedulePhysicsStress,
  SchedulePhysicsTarget,
} from "./types";

export const PHYSICS_DAYS: Array<{ key: ScheduleDayKey; label: string }> = [
  { key: "fsunday", label: "الأحد" },
  { key: "fmonday", label: "الاثنين" },
  { key: "ftuesday", label: "الثلاثاء" },
  { key: "fwednesday", label: "الأربعاء" },
  { key: "fthursday", label: "الخميس" },
];

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const toNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const signed = (value: unknown, suffix = "") => {
  const n = toNumber(value, 0);
  return `${n > 0 ? "+" : ""}${n}${suffix}`;
};

const minutes = (value: string) => {
  const [h, m] = String(value || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const timeFromMinutes = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

export function buildMoveCandidate(row: FSchedule, target: Pick<SchedulePhysicsTarget, "day" | "start">) {
  const duration = Math.max(30, minutes(row.fendtime) - minutes(row.fstarttime));
  const candidate: any = {
    ...row,
    fstarttime: target.start,
    fendtime: timeFromMinutes(Math.min(23 * 60 + 59, minutes(target.start) + duration)),
  };
  const selected = PHYSICS_DAYS.filter(day => Boolean((row as any)[day.key]));
  if (selected.length === 1) PHYSICS_DAYS.forEach(day => { candidate[day.key] = day.key === target.day; });
  return candidate as FSchedule;
}

export function isSamePlacement(row: FSchedule, sourceDay: ScheduleDayKey, target: SchedulePhysicsTarget) {
  const selected = PHYSICS_DAYS.filter(day => Boolean((row as any)[day.key]));
  if (selected.length > 1) return row.fstarttime === target.start;
  return sourceDay === target.day && row.fstarttime === target.start;
}

export function classifyDecision(ripple: any, why: any, conflicts: any[] = [], hardBlocked = false): SchedulePhysicsQuality {
  if (hardBlocked) return "impossible";
  if (!ripple && !why && !conflicts.length) return "unknown";
  const delta = ripple?.delta || why?.delta || {};
  const conflictDelta = toNumber(delta.conflicts || 0);
  const qualityDelta = toNumber(delta.quality ?? delta.score ?? 0);
  const gapDelta = toNumber(delta.professorGap ?? delta.gap ?? 0);
  const pressureDelta = toNumber(delta.dayPressure || 0);
  const ruleDelta = toNumber(why?.delta?.rules ?? delta.rules ?? 0);
  const spatialDelta = toNumber(delta.spatialBurnout ?? 0);
  const hasHighConflict = conflicts.some(item => item?.severity === "high" || item?.type === "duplicate");
  const hasWhyWarning = Array.isArray(why?.warnings) && why.warnings.length > 0;
  if (hasHighConflict) return "impossible";
  if (conflictDelta > 0 || hasWhyWarning || ruleDelta > 0 || qualityDelta <= -2 || gapDelta >= 90 || pressureDelta >= 20 || spatialDelta <= -6) return "suboptimal";
  if (conflictDelta < 0 || ruleDelta < 0 || qualityDelta >= 3 || gapDelta <= -90 || spatialDelta >= 6) return "excellent";
  if (qualityDelta > 0 || gapDelta < 0 || pressureDelta < 0) return "good";
  return "neutral";
}

export function decisionTitle(quality: SchedulePhysicsQuality) {
  if (quality === "excellent") return "جذب راقٍ · خيار ممتاز";
  if (quality === "good") return "جذب هادئ · خيار جيد";
  if (quality === "suboptimal") return "مقاومة خفيفة · ممكن لكنه غير مفضل";
  if (quality === "impossible") return "غير متاح";
  if (quality === "unknown") return "لا توجد بيانات كافية";
  return "استقرار محايد";
}

function buildFingerprint(ripple: any, why: any, conflicts: any[], quality: SchedulePhysicsQuality): SchedulePhysicsFingerprintItem[] {
  const delta = ripple?.delta || why?.delta || {};
  const conflictDelta = toNumber(delta.conflicts || 0);
  const gapDelta = toNumber(delta.professorGap ?? delta.gap ?? 0);
  const qualityDelta = toNumber(delta.quality ?? delta.score ?? 0);
  const pressureDelta = toNumber(delta.dayPressure || 0);
  const rulesDelta = toNumber(why?.delta?.rules ?? delta.rules ?? 0);
  const spatialDelta = toNumber(delta.spatialBurnout ?? 0);
  return [
    { label: "التعارض", value: conflicts.length ? `${conflicts.length} ظاهر · ${signed(conflictDelta)}` : signed(conflictDelta), tone: conflictDelta < 0 ? "good" : conflictDelta > 0 ? "warn" : "neutral" },
    { label: "فراغ الأستاذ", value: signed(gapDelta, "د"), tone: gapDelta < 0 ? "good" : gapDelta > 0 ? "warn" : "neutral" },
    { label: "ضغط اليوم", value: signed(pressureDelta, "%"), tone: pressureDelta > 0 ? "warn" : pressureDelta < 0 ? "good" : "neutral" },
    { label: "القواعد", value: signed(rulesDelta), tone: rulesDelta > 0 ? "warn" : rulesDelta < 0 ? "good" : "neutral" },
    { label: "راحة الحركة", value: signed(spatialDelta), tone: spatialDelta > 0 ? "good" : spatialDelta < 0 ? "warn" : "neutral" },
    { label: "بصمة القرار", value: quality === "unknown" ? "غير محسومة" : quality === "impossible" ? "مرفوض" : quality === "suboptimal" ? "حذر" : quality === "excellent" ? "ممتاز" : quality === "good" ? "جيد" : "محايد", tone: quality === "excellent" || quality === "good" ? "good" : quality === "suboptimal" || quality === "impossible" ? "warn" : "info" },
  ];
}

function buildHorizon(ripple: any, why: any, quality: SchedulePhysicsQuality): SchedulePhysicsHorizon {
  const delta = ripple?.delta || why?.delta || {};
  const pressureDelta = toNumber(delta.dayPressure || 0);
  const gapDelta = toNumber(delta.professorGap ?? delta.gap ?? 0);
  const qualityDelta = toNumber(delta.quality ?? delta.score ?? 0);
  const conflictDelta = toNumber(delta.conflicts || 0);
  if (!ripple && !why) return { tone: "unknown", label: "لا أرى ما بعد الخطوة بعد", summary: "لا توجد بيانات كافية لقراءة الأثر اللاحق لهذا الموضع." };
  if (quality === "excellent" || (conflictDelta < 0 && pressureDelta <= 8 && gapDelta <= 0 && qualityDelta >= 0)) {
    return { tone: "good", label: "يحافظ على المرونة", summary: "القرار لا يحل اللحظة الحالية فقط؛ بل يترك الجدول أكثر قابلية للحركة لاحقًا." };
  }
  if (quality === "suboptimal" || quality === "impossible" || pressureDelta >= 18 || gapDelta >= 90) {
    return { tone: "warn", label: "يستهلك جزءًا من المرونة", summary: "قد ينجح الآن، لكنه يرفع التوتر أو يترك خيارات أقل لقرارات لاحقة." };
  }
  return { tone: "guarded", label: "أثر لاحق محدود", summary: "التأثير القادم ليس خطيرًا، لكنه يستحق الانتباه إذا تراكمت قرارات مشابهة." };
}

function buildStress(ripple: any, why: any, conflicts: any[], quality: SchedulePhysicsQuality): SchedulePhysicsStress {
  const delta = ripple?.delta || why?.delta || {};
  const pressureDelta = toNumber(delta.dayPressure || 0);
  const conflictDelta = toNumber(delta.conflicts || 0);
  const spatialDelta = toNumber(delta.spatialBurnout ?? 0);
  if (!ripple && !why && !conflicts.length) return { level: "unknown", label: "لا توجد قراءة توتر", summary: "الجدول لا يملك معطيات كافية لتقدير حساسية هذه المنطقة الآن." };
  if (quality === "suboptimal" || quality === "impossible" || pressureDelta >= 18 || conflictDelta > 0 || spatialDelta <= -6 || conflicts.some(c => c?.severity === "high")) {
    return { level: "high", label: "منطقة متوترة", summary: "هذا الموضع يزيد الإجهاد على اليوم أو يقترب من تعارضات فعالة." };
  }
  if (quality === "excellent" || quality === "good") {
    return { level: "low", label: "منطقة مستقرة", summary: "القرار يهبط على منطقة مرنة نسبيًا ولا يظهر ضغطًا واضحًا." };
  }
  return { level: "guarded", label: "توتر محسوب", summary: "المنطقة قابلة للاستخدام، لكن قرارًا آخر فوقها قد يضاعف الحساسية." };
}

function buildCounterfactual(ripple: any, why: any, whyNot: any, quality: SchedulePhysicsQuality): SchedulePhysicsCounterfactual {
  const delta = ripple?.delta || why?.delta || {};
  const bullets: string[] = [];
  const conflictDelta = toNumber(delta.conflicts || 0);
  const gapDelta = toNumber(delta.professorGap ?? delta.gap ?? 0);
  const qualityDelta = toNumber(delta.quality ?? delta.score ?? 0);
  const pressureDelta = toNumber(delta.dayPressure || 0);
  if (conflictDelta < 0) bullets.push(`يخفض التعارضات بمقدار ${Math.abs(conflictDelta)} مقارنة بالوضع الحالي.`);
  if (gapDelta < 0) bullets.push(`يقلص فراغ الأستاذ ${Math.abs(gapDelta)} دقيقة.`);
  if (qualityDelta > 0) bullets.push(`يرفع جودة القرار ${qualityDelta > 0 ? "بنقطة" : ""}${Math.abs(qualityDelta)}.`);
  if (pressureDelta > 0) bullets.push(`مقابل ذلك يرفع ضغط اليوم ${Math.abs(pressureDelta)}٪.`);
  if (!bullets.length && Array.isArray(whyNot?.tradeoffs) && whyNot.tradeoffs.length) bullets.push(String(whyNot.tradeoffs[0]));
  if (!bullets.length && Array.isArray(why?.positives) && why.positives.length) bullets.push(String(why.positives[0]));
  return {
    title: quality === "suboptimal" || quality === "impossible" ? "لماذا ليس أفضل من وضعك الحالي؟" : "لماذا هو أفضل من وضعك الحالي؟",
    bullets: bullets.slice(0, 3),
  };
}

function buildAutopsy(summary: string, reasons: string[], quality: SchedulePhysicsQuality, dataAvailable: boolean, hardBlocked: boolean): SchedulePhysicsAutopsy {
  const confidence = !dataAvailable ? "منخفضة" : hardBlocked ? "مرتفعة" : quality === "unknown" ? "متوسطة" : reasons.length >= 2 ? "مرتفعة" : "جيدة";
  return {
    headline: "Decision Autopsy",
    summary,
    confidence,
    bullets: [
      reasons[0] || "لا توجد إشارة سببية كافية بعد.",
      reasons[1] || (quality === "excellent" || quality === "good" ? "الموضع الجديد مستقر بصريًا ومنطقيًا." : "الموضع يحتاج مراجعة بشرية قبل اعتماده."),
      hardBlocked ? "المسار الحالي نفسه يمنع هذا الاختيار." : "لم يتم حفظ أي شيء بعد؛ هذه قراءة قرار فقط.",
    ].filter(Boolean).slice(0, 3),
  };
}

export function buildDecision(key: string, ripple: any, why: any, whyNot: any, conflicts: any[] = [], hardBlocked = false, hardReason = ""): SchedulePhysicsDecision {
  const quality = classifyDecision(ripple, why, conflicts, hardBlocked);
  const positives = Array.isArray(why?.positives) ? why.positives.filter(Boolean).slice(0, 3) : [];
  const tradeoffs = [...(Array.isArray(why?.tradeoffs) ? why.tradeoffs : []), ...(Array.isArray(why?.warnings) ? why.warnings : []), ...(Array.isArray(whyNot?.tradeoffs) ? whyNot.tradeoffs : []), ...(Array.isArray(whyNot?.warnings) ? whyNot.warnings : [])].filter(Boolean).slice(0, 3);
  const conflictReasons = conflicts.map(item => item?.message || item?.detail).filter(Boolean).slice(0, 3);
  const rippleEffects = Array.isArray(ripple?.effects) ? ripple.effects.map((item: any) => item?.text).filter(Boolean) : [];
  const reasons = quality === "suboptimal" || quality === "impossible"
    ? [...conflictReasons, ...tradeoffs, ...rippleEffects].filter(Boolean).slice(0, 4)
    : [...positives, ...rippleEffects].filter(Boolean).slice(0, 4);
  const summary = hardBlocked
    ? hardReason || "هذا الموضع يرفضه المسار الحالي للنظام."
    : String((quality === "suboptimal" || quality === "impossible" ? whyNot?.answer : "") || why?.verdict || ripple?.headline || (quality === "unknown" ? "لا توجد بيانات كافية لتقييم هذا الموضع الآن." : "تم تقييم الأثر على الجدول الحالي."));
  const dataAvailable = Boolean(ripple || why || whyNot || conflicts.length);
  return {
    key,
    quality,
    title: decisionTitle(quality),
    summary,
    reasons,
    positives,
    tradeoffs,
    conflicts,
    ripple: ripple || null,
    why: why || null,
    whyNot: whyNot || null,
    dataAvailable,
    hardBlocked,
    fingerprint: buildFingerprint(ripple, why, conflicts, quality),
    horizon: buildHorizon(ripple, why, quality),
    stress: buildStress(ripple, why, conflicts, quality),
    counterfactual: buildCounterfactual(ripple, why, whyNot, quality),
    autopsy: buildAutopsy(summary, reasons, quality, dataAvailable, hardBlocked),
  };
}

export function magnetStrength(quality: SchedulePhysicsQuality) {
  switch (quality) {
    case "excellent": return 0.12;
    case "good": return 0.07;
    case "neutral": return 0.025;
    case "suboptimal": return -0.025;
    default: return 0;
  }
}

export function rotationForVelocity(velocityX: number, reducedMotion: boolean) {
  if (reducedMotion) return 0;
  return clamp(velocityX * 0.012, -1.7, 1.7);
}

export function relatedness(row: FSchedule, candidate: FSchedule) {
  return {
    professor: row.AdInstructorId === candidate.AdInstructorId,
    course: row.AdCourseId === candidate.AdCourseId,
    room: Boolean(row.AdRoomCode && row.AdRoomHall && row.AdRoomCode === candidate.AdRoomCode && row.AdRoomHall === candidate.AdRoomHall),
  };
}
