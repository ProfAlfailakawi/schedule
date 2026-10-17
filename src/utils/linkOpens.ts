import type { InstructorRequest } from "../types";

/** نصف ساعة: «مرّات الفتح» تقيس العودة إلى البطاقة، لا إعادة تحميل الصفحة. */
export const OPEN_COUNT_GAP_MS = 30 * 60_000;
/** يوم الكويت (UTC+3 بلا توقيتٍ صيفي) كنصّ YYYY-MM-DD. */
export const kuwaitDayOfIso = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * فتحٌ جديد للبطاقة؟ يُرجع حقول السجلّ المحدَّثة، أو `null` إن لم يمضِ نصف ساعةٍ على آخر فتحٍ مُسجَّل.
 * الفتح الأول يضع `linkOpenedAt` أيضاً (يبقى معنى «فُتح الرابط» كما هو).
 */
export function recordLinkOpen(r: Pick<InstructorRequest, "linkOpenedAt" | "linkOpenDays" | "linkLastOpenAt">, nowIso: string): Pick<InstructorRequest, "linkOpenedAt" | "linkOpenDays" | "linkLastOpenAt"> | null {
  const last = r.linkLastOpenAt ? Date.parse(r.linkLastOpenAt) : NaN;
  if (r.linkOpenedAt && Number.isFinite(last) && Date.parse(nowIso) - last < OPEN_COUNT_GAP_MS) return null;
  const day = kuwaitDayOfIso(nowIso);
  const days = { ...(r.linkOpenDays || {}) };
  days[day] = (days[day] || 0) + 1;
  return { linkOpenedAt: r.linkOpenedAt || nowIso, linkOpenDays: days, linkLastOpenAt: nowIso };
}
