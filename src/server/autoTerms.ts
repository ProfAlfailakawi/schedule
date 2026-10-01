/**
 * ── الفصلُ التالي يُنشأ وحده ────────────────────────────────────────────────
 *
 * من ١ أكتوبر يُنشأ «الثاني»، ومن ١ يناير «الصيفي»، ومن ١ أبريل «الأول» —
 * بتاريخ البداية وعدد الأسابيع من التقويم الافتراضي (autoTermDue في
 * termSequence.ts، القاعدة في موضعٍ واحد). المهمة متكرّرة الأمان: فصلٌ بالاسم
 * نفسه موجودٌ يُتخطّى.
 *
 * والفصلُ الذي انقضى تاريخُ نهايته (termHasEnded) يُعلَن «منتهياً» وحده
 * (AdTermClosed=true)، كأن المنسق ضغط «انتهى هذا الفصل» — قرار المالك
 * ٢٠٢٦/١٠/١. «false» المخزّنة وحدها لا تحمي: نموذج التعديل يكتبها مع كل
 * حفظ. الذي يحمي إعادةُ فتحٍ حقيقية (مغلق ← مفتوح، AdTermReopenedAt) بعد
 * نهاية الفصل. لا تعمل في وضع العرض (DATA_MODE=demo): عالمُ العرض ثابت.
 */
import { autoTermDue, termHasEnded, termWindow } from "../utils/termSequence";
import { AR, countOf } from "../utils/arabicCount";

export interface AutoTermDeps {
  isDemoMode: () => boolean;
  createTermIfAbsent: (name: string, dates: { start: string; weeks: number }) => Promise<{ AdTermId: number; AdTermName: string } | null>;
  log?: (message: string) => void;
  getTerms?: () => Promise<Array<{ AdTermId: number; AdTermName: string; AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean; AdTermReopenedAt?: string }>>;
  closeTerm?: (term: { AdTermId: number; AdTermName: string; AdTermStart?: string; AdTermWeeks?: number }) => Promise<unknown>;
}

/** الفصول التي انتهى تاريخها ولم يُحسم أمرها بعد — تُغلق. */
export async function closeEndedTerms(deps: AutoTermDeps, now: number = Date.now()): Promise<string[]> {
  if (deps.isDemoMode() || !deps.getTerms || !deps.closeTerm) return [];
  const reopenedAfterEnd = (term: { AdTermReopenedAt?: string; AdTermName: string; AdTermStart?: string; AdTermWeeks?: number }) => {
    const window = termWindow(term);
    return Boolean(term.AdTermReopenedAt && window && Date.parse(term.AdTermReopenedAt) >= window.to);
  };
  const ended = (await deps.getTerms()).filter(term => term.AdTermClosed !== true && termHasEnded(term, now) && !reopenedAfterEnd(term));
  for (const term of ended) {
    await deps.closeTerm(term);
    deps.log?.(`[auto-term] انتهى «${term.AdTermName}» بتاريخه`);
  }
  return ended.map(term => term.AdTermName);
}

export async function runAutoTermJob(deps: AutoTermDeps, now: number = Date.now()): Promise<string | null> {
  if (deps.isDemoMode()) return null;
  const due = autoTermDue(now);
  const created = await deps.createTermIfAbsent(due.name, { start: due.start, weeks: due.weeks });
  if (created) deps.log?.(`[auto-term] أُنشئ «${created.AdTermName}» (${due.start}، ${countOf(due.weeks, AR.week)})`);
  return created ? created.AdTermName : null;
}

export const AUTO_TERM_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** عند الإقلاع ثم كل يوم. الأخطاء تُسجَّل ولا تُسقط الخادم. */
export function scheduleAutoTermJob(deps: AutoTermDeps): void {
  const tick = () => {
    runAutoTermJob(deps).catch(error => console.error("[auto-term] تعذّر:", error));
    closeEndedTerms(deps).catch(error => console.error("[auto-term] تعذّر إغلاق المنتهي:", error));
  };
  tick();
  setInterval(tick, AUTO_TERM_INTERVAL_MS).unref?.();
}
