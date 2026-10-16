/**
 * ── «بعد التسجيل: ماذا حدث؟» بلغةٍ تُفهم من أول نظرة ─────────────────────────────
 *
 * الأرقامُ نفسُها (من أجابوا «هل سجلت؟»)، لكن تُروى بنقاط: كل نقطةٍ طالبٌ، خضراء إن سجّل وملوّنةٌ بسببه إن تعثّر.
 * وكل سببٍ يحمل جملةً بسيطة وما يفعله القسم. لا تُخمَّن أسباب: هي ما قاله الطلبة أنفسهم.
 */
export type OutcomeReason = "full" | "prereq" | "conflict" | "other";
export type Dot = "ok" | OutcomeReason;
export const REASON_ORDER: readonly OutcomeReason[] = ["full", "prereq", "conflict", "other"];

export const REASON_INFO: Record<OutcomeReason, { title: string; plain: string; action: string }> = {
  full: { title: "امتلأت الشعبة", plain: "لم يجدوا مقعداً", action: "افتح شعبة أو زد السعة" },
  prereq: { title: "ينقصهم متطلب سابق", plain: "لم يُسمح لهم بالتسجيل", action: "راجع المتطلب أو استثنِ الحالة" },
  conflict: { title: "تعارض وقت", plain: "وقته يصطدم بمقرر آخر عندهم", action: "حرّك الموعد أو افتح شعبة بوقتٍ آخر" },
  other: { title: "سببٌ آخر", plain: "ذكروا سبباً مختلفاً", action: "راجع ملاحظاتهم في كشف التسجيل" },
};

export interface OutcomeCounts { registered: number; stuck: number; full: number; prereq: number; conflict: number; other: number }

/** نقاطُ المقرر: طالبٌ لكل نقطة، وإن زادوا على السقف فنقطةٌ لكل عدّةِ طلاب (بحدٍّ أدنى نقطةٌ لكل فئةٍ موجودة). */
export function pictogram(row: OutcomeCounts, maxDots = 16): { dots: Dot[]; perDot: number } {
  const parts: Array<[Dot, number]> = [["ok", Math.max(0, row.registered)], ...REASON_ORDER.map(reason => [reason, Math.max(0, row[reason])] as [Dot, number])];
  const total = parts.reduce((sum, [, n]) => sum + n, 0);
  const perDot = total <= maxDots ? 1 : Math.ceil(total / maxDots);
  const dots: Dot[] = [];
  for (const [kind, n] of parts) {
    if (!n) continue;
    const count = perDot === 1 ? n : Math.max(1, Math.round(n / perDot));
    for (let i = 0; i < count; i += 1) dots.push(kind);
  }
  return { dots, perDot };
}

/** السببُ الأكثر بين المتعثّرين كلِّهم، أو null إن لم يتعثّر أحد. */
export function topReason(rows: readonly OutcomeCounts[]): { reason: OutcomeReason; count: number; total: number } | null {
  const sums = { full: 0, prereq: 0, conflict: 0, other: 0 };
  for (const row of rows) for (const reason of REASON_ORDER) sums[reason] += Math.max(0, row[reason]);
  const total = REASON_ORDER.reduce((sum, reason) => sum + sums[reason], 0);
  if (!total) return null;
  const reason = REASON_ORDER.reduce((best, next) => (sums[next] > sums[best] ? next : best), REASON_ORDER[0]);
  return { reason, count: sums[reason], total };
}
