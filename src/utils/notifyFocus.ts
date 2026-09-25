/**
 * ── «افتح على هذا القسم» ────────────────────────────────────────────────────
 *
 * الإشعارُ يعرف قسمه (وفصلَه). يتركه في sessionStorage حين يُضغط، والشاشةُ التي
 * يُفتح عليها تأخذه مرّةً واحدة وتفتح عليه. كان الإشعار يكتبه ولا تقرؤه شاشةٌ
 * أبداً — فيُفتح «تغييرات الجدول» على الوارد كلّه والتقرير على نطاقه المعتاد.
 */
export const NOTIFY_FOCUS_KEY = "schedule:notify-focus";
/** تركيزٌ أقدم من هذا لا يُطاع: ضغطةٌ قديمة لا تفتح شاشةً اليوم. */
export const NOTIFY_FOCUS_TTL_MS = 5 * 60_000;

export interface NotifyFocus {
  view?: string;
  collegeId: number;
  sectionId: number;
  termId?: number;
  /** لوحةٌ بعينها في الشاشة: «deadlines» تفتح مواعيد التسليم بدل تقرير القسم. */
  panel?: "deadlines";
  at: number;
}

export function writeNotifyFocus(item: { view?: string; collegeId?: number; sectionId?: number; termId?: number; panel?: "deadlines" }, now: number = Date.now()): void {
  try {
    if (item.collegeId || item.panel) sessionStorage.setItem(NOTIFY_FOCUS_KEY, JSON.stringify({
      view: item.view, collegeId: item.collegeId || 0, sectionId: item.sectionId || 0, termId: item.termId || 0,
      ...(item.panel ? { panel: item.panel } : {}), at: now,
    }));
  } catch { /* تخزينٌ ممنوع: تُفتح الشاشةُ على نطاقها المعتاد */ }
}

/** يأخذ التركيز إن كان لهذه الشاشة وحديثاً، ويمحوه — فلا يُطاع مرّتين. */
export function takeNotifyFocus(view: string, now: number = Date.now()): NotifyFocus | null {
  try {
    const raw = sessionStorage.getItem(NOTIFY_FOCUS_KEY);
    if (!raw) return null;
    const focus = JSON.parse(raw) as NotifyFocus;
    if (focus?.view !== view) return null;
    sessionStorage.removeItem(NOTIFY_FOCUS_KEY);
    if ((!focus.collegeId && focus.panel !== "deadlines") || !(now - Number(focus.at || 0) < NOTIFY_FOCUS_TTL_MS)) return null;
    return {
      ...focus, collegeId: Number(focus.collegeId || 0), sectionId: Number(focus.sectionId || 0), termId: Number(focus.termId || 0) || undefined,
      panel: focus.panel === "deadlines" ? "deadlines" : undefined,
    };
  } catch { return null; }
}
