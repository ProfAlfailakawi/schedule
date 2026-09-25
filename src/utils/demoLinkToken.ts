/**
 * ── رابطُ البيئة التجريبية يعرف صندوقه ─────────────────────────────────────
 *
 * الروابطُ العامة (بطاقة الأستاذ، الاستبيان، طلب الجدول، «حالة طلبي»، التقويم)
 * تُفتح بلا جلسة: رمزُ الرابط هو المفتاح. وكانت تُبحث دائماً في البيانات
 * الحقيقية — فكلُّ رابطٍ أُنشئ في البيئة التجريبية يُفتح على «الرابط غير موجود»،
 * ورحلتا الأستاذ والطالب لا تُجرَّبان أصلاً.
 *
 * فرمزُ الرابط المُنشأ داخل صندوقٍ تجريبي يبدأ بـ«demo.» — والنقطةُ لا تقع في
 * رمزٍ حقيقي (base64url لا يحويها)، فلا يلتبس رمزٌ برمز. ويُربط الطلبُ بالصندوق
 * الذي يملك الرابط، ولا يُبحث عن رمزٍ تجريبي في البيانات الحقيقية أبداً. والرمزُ
 * الحقيقي يُقرأ من البيانات الحقيقية دائماً، ولو حمل المتصفّح جلسةً تجريبية:
 * زائرُ التجربة الذي يفتح رابطاً حقيقياً أرسله قسمُه لا يُحجب عنه.
 */
export const DEMO_LINK_TOKEN_PREFIX = "demo.";

export const isDemoLinkToken = (token: unknown): boolean =>
  String(token ?? "").startsWith(DEMO_LINK_TOKEN_PREFIX);

/** صفحاتُ الروابط العامة خارج /api، بمقطعٍ واحدٍ يليه الرمز. */
export const PUBLIC_LINK_PAGE_PREFIXES = ["/s/", "/q/", "/r/", "/m/"] as const;

/**
 * رمزُ الرابط من مسار الطلب الكامل (originalUrl)، أو "" إن لم يكن مساراً عاماً.
 *   /s/<t>  /q/<t>  /r/<t>  /m/<t>
 *   /api/public/<نوع>/<t>[/…]
 */
export function publicLinkTokenFromPath(url: string): string {
  const path = String(url || "").split("?")[0].split("#")[0];
  const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return ""; } };
  for (const prefix of PUBLIC_LINK_PAGE_PREFIXES) {
    if (path.startsWith(prefix)) return decode(path.slice(prefix.length).split("/")[0] || "");
  }
  const api = path.match(/^\/api\/public\/[^/]+\/([^/]+)/);
  return api ? decode(api[1]) : "";
}
