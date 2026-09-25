/**
 * ── عمرُ الرابط الشخصي: الفصلُ، لا موعدُ الطلبات ────────────────────────────
 *
 * بطاقةُ الأستاذ ورابطُ طلبه كانا يموتان مع موعد استقبال الطلبات — أسبوعين
 * أو ثلاثة — والبطاقةُ نفسها تقول «اشتراك دائم». فيُضيف الأستاذ تقويمه إلى
 * هاتفه، وبعد أسبوعين يختفي جدوله ويصله «انتهت صلاحية هذا الرابط».
 *
 * موعدُ الطلبات يحكم **الكتابة** وحدها (`requestsCloseAt` في الرابط، و
 * `window.closesAt` في الطلب). أمّا **القراءة** — الجدول، التقويم، القرارات،
 * البدائل — فتبقى حتى نهاية الفصل الذي صدر له الرابط. القاعدةُ هنا وحدها؛
 * كلُّ رابطٍ شخصيٍّ يُصدَر من الخادم يأخذ عمرَه من هذه الدالّة.
 */
import { termWindow } from "./termSequence";

/** حين لا يُعرف للفصل تاريخٌ ولا يُستنبط من اسمه: فصلٌ دراسيٌّ تقريباً. */
export const TERM_LINK_FALLBACK_DAYS = 150;

type TermLike = Parameters<typeof termWindow>[0];

/** نهايةُ عمر الرابط الشخصي (ISO): نهايةُ الفصل، أو ‎+150‎ يوماً إن جُهلت أو مضت. */
export function termLinkExpiresAt(term: TermLike, now: number = Date.now()): string {
  const window = termWindow(term);
  if (window && window.to > now) return new Date(window.to).toISOString();
  return new Date(now + TERM_LINK_FALLBACK_DAYS * 86400000).toISOString();
}

/** «آخر موعد» كما يكتبه القسم (YYYY-MM-DD) ← آخرُ لحظةٍ فيه، بالصيغة نفسها في كل موضع. */
export function requestsCloseAtFromDate(date: unknown): string {
  const value = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return "";
  return `${value}T23:59:59.999Z`;
}

/**
 * هل ما زال الرابطُ الشخصي (بطاقة الأستاذ، رابط الطلب) مقروءاً؟
 *
 * روابطُ صدرت قبل هذه القاعدة تحمل `expiresAt` = موعد الطلبات. فالقراءةُ تبقى
 * ما دام أحدُ الحدّين قائماً: تاريخُ الرابط المخزون، أو نهايةُ فصله المعروفة.
 * فصلٌ انقضى لا يمدّ عمرَ رابطٍ منتهٍ — والإيقافُ اليدوي يُحترم قبل هذا كله.
 */
export function personalLinkReadable(expiresAt: string | undefined | null, term: TermLike, now: number = Date.now()): boolean {
  const stored = Date.parse(String(expiresAt || ""));
  if (!Number.isFinite(stored) || stored >= now) return true;
  const window = termWindow(term);
  return Boolean(window && now < window.to);
}
