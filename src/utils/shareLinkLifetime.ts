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
import { deadlineEndsAt } from "./approvalWorkflow";

/** حين لا يُعرف للفصل تاريخٌ ولا يُستنبط من اسمه: فصلٌ دراسيٌّ تقريباً. */
export const TERM_LINK_FALLBACK_DAYS = 150;

type TermLike = Parameters<typeof termWindow>[0];

/** نهايةُ عمر الرابط الشخصي (ISO): نهايةُ الفصل، أو ‎+150‎ يوماً إن جُهلت أو مضت. */
export function termLinkExpiresAt(term: TermLike, now: number = Date.now()): string {
  const window = termWindow(term);
  if (window && window.to > now) return new Date(window.to).toISOString();
  return new Date(now + TERM_LINK_FALLBACK_DAYS * 86400000).toISOString();
}

/**
 * «آخر موعد» كما يكتبه القسم (YYYY-MM-DD) ← آخرُ لحظةٍ فيه **بتوقيت الكويت**،
 * بالصيغة نفسها في كل موضع. كان ‎T23:59:59.999Z‎ — أي الثالثة فجراً في الكويت
 * من اليوم التالي — وموعدُ الاعتماد ينتهي ‎23:59:59+03:00‎: موعدان لكلمة «آخر
 * يوم» واحدة. فصار الاثنان من `deadlineEndsAt` (approvalWorkflow.ts) وحدها.
 */
export function requestsCloseAtFromDate(date: unknown): string {
  const value = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return "";
  return new Date(deadlineEndsAt(value)).toISOString();
}

/**
 * ── أيُّ الروابط تُقرأ حتى نهاية فصلها؟ (قرارٌ مكتوبٌ هنا وحده) ──────────────
 *
 *   - `staff`: بطاقاتُ الأساتذة — **رابطُ القسم** (بطاقات الأساتذة كلهم، يختار
 *     كلٌّ رقمه) و**الرابطُ الشخصي** (AdInstructorId > 0) معاً. هذا مطلبُ D2:
 *     البطاقةُ تَعِد بـ«اشتراكٍ دائم» في التقويم، والتقويمُ في هاتف الأستاذ
 *     يتبع الرابطَ الذي أضافه منه — أيّاً كان نوعُه. فلا يُفرَّق بينهما هنا.
 *   - `request`: رابطُ طلب الأستاذ — قرارُ القسم وبدائلُه تصل بعد الموعد.
 *   - غيرُهما (رابطُ الجدول العام، الاستبيان): على تاريخ `expiresAt` وحده.
 *
 * و«القراءة حتى نهاية الفصل» لا تمدّ **الكتابة**: موعدُ الطلبات يبقى حيث كتبه
 * القسم — `requestsCloseAt` على رابط البطاقات (يرثه الرابطُ الشخصي منه)، و
 * `window.closesAt` على الطلب (من التاريخ نفسه بـ`requestsCloseAtFromDate`)،
 * وهو ما يُغلق باب الطلب في الخادم (requestWindowOpen).
 */
export function readsUntilTermEnd(kind: string | undefined | null): boolean {
  return kind === "staff" || kind === "request";
}

/**
 * هل ما زال الرابطُ مقروءاً؟ تاريخُه المخزون إن لم يمضِ؛ وإلا فالروابطُ التي
 * تُقرأ حتى نهاية فصلها (readsUntilTermEnd) تبقى ما دامت نهايةُ فصلها المعروفة
 * لم تأتِ — ومنها روابطُ صدرت قبل هذه القاعدة بتاريخ موعد الطلبات. فصلٌ انقضى
 * أو مجهولُ التاريخ لا يمدّ رابطاً منتهياً، والإيقافُ اليدوي يُحترم قبل هذا كله.
 */
export function shareLinkReadable(
  link: { kind?: string | null; expiresAt?: string | null },
  term: TermLike,
  now: number = Date.now(),
): boolean {
  const stored = Date.parse(String(link.expiresAt || ""));
  if (!Number.isFinite(stored) || stored >= now) return true;
  if (!readsUntilTermEnd(link.kind)) return false;
  const window = termWindow(term);
  return Boolean(window && now < window.to);
}
