/**
 * ── الفصلُ التالي يُنشأ وحده ────────────────────────────────────────────────
 *
 * من ١ أكتوبر يُنشأ «الثاني»، ومن ١ يناير «الصيفي»، ومن ١ أبريل «الأول» —
 * بتاريخ البداية وعدد الأسابيع من التقويم الافتراضي (autoTermDue في
 * termSequence.ts، القاعدة في موضعٍ واحد). المهمة متكرّرة الأمان: فصلٌ بالاسم
 * نفسه موجودٌ يُتخطّى. لا تعمل في وضع العرض (DATA_MODE=demo): عالمُ العرض ثابت.
 */
import { autoTermDue } from "../utils/termSequence";

export interface AutoTermDeps {
  isDemoMode: () => boolean;
  createTermIfAbsent: (name: string, dates: { start: string; weeks: number }) => Promise<{ AdTermId: number; AdTermName: string } | null>;
  log?: (message: string) => void;
}

export async function runAutoTermJob(deps: AutoTermDeps, now: number = Date.now()): Promise<string | null> {
  if (deps.isDemoMode()) return null;
  const due = autoTermDue(now);
  const created = await deps.createTermIfAbsent(due.name, { start: due.start, weeks: due.weeks });
  if (created) deps.log?.(`[auto-term] أُنشئ «${created.AdTermName}» (${due.start}، ${due.weeks} أسبوعاً)`);
  return created ? created.AdTermName : null;
}

export const AUTO_TERM_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** عند الإقلاع ثم كل يوم. الأخطاء تُسجَّل ولا تُسقط الخادم. */
export function scheduleAutoTermJob(deps: AutoTermDeps): void {
  const tick = () => { runAutoTermJob(deps).catch(error => console.error("[auto-term] تعذّر:", error)); };
  tick();
  setInterval(tick, AUTO_TERM_INTERVAL_MS).unref?.();
}
