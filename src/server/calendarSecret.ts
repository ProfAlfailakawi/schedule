/**
 * ── مفتاح اشتراك التقويم: واحدٌ لكل النسخ، لا لكل إقلاع ────────────────────
 *
 * رابطُ اشتراك التقويم يحمل مفتاحاً مشتقّاً (HMAC على الرابط ورقم الأستاذ).
 * كان سرُّ الاشتقاق `process.env.CALENDAR_SECRET || randomBytes(32)` — وعلى
 * Cloud Run لم يكن المتغيّر مضبوطاً، فكلُّ إقلاعٍ بارد يولّد سرّاً جديداً،
 * فيموت كلُّ اشتراكٍ في هواتف الأساتذة، وتردّ نسختان متجاورتان مفتاحين
 * مختلفين للبطاقة نفسها.
 *
 * القاعدة هنا في موضعٍ واحد:
 *   1) إن ضبط المشغّلُ CALENDAR_SECRET فهو الحَكَم (والاشتراكات القائمة
 *      عليه تبقى كما هي حرفاً بحرف).
 *   2) وإلا يُشتقّ من السرّ المشترك المحفوظ مرّةً واحدة (السرّ نفسه الذي
 *      تعتمده حالات الطلبة، في Firestore) بوسمٍ خاصٍّ بالتقويم، فلا يُعاد
 *      استعمالُ مادةٍ مفتاحية واحدة لغرضين.
 *
 * التهيئة كسولة ومنتظَرة: أوّلُ من يحتاج المفتاح ينتظر قراءة السرّ، ومن
 * بعده يأخذه من الذاكرة. وإن فشلت القراءة لا يُحفظ الفشل؛ يُعاد المحاولة.
 */
import { createHmac } from "crypto";

export const CALENDAR_KEY_LABEL = "calendar-feed-key-v1";

export function deriveCalendarSecret(envSecret: string | undefined | null, sharedSecret: string): string {
  const configured = String(envSecret || "").trim();
  if (configured) return configured;
  const shared = String(sharedSecret || "").trim();
  if (!shared) throw new Error("calendar secret: shared server secret is empty");
  return createHmac("sha256", shared).update(CALENDAR_KEY_LABEL).digest("hex");
}

/** مفتاحُ اشتراك أستاذٍ واحد في رابطٍ واحد. */
export function calendarFeedKey(secret: string, token: string, instructorId: number): string {
  return createHmac("sha256", secret).update(`${token}|${instructorId}`).digest("hex").slice(0, 32);
}

/**
 * يبني محلِّلاً للسرّ له ذاكرته الخاصة — نسخةُ خادمٍ واحدة = محلِّلٌ واحد.
 * `readEnv` يُقرأ عند أوّل طلب لا عند التحميل، فيصحّ الاختبار والتهيئة المتأخرة.
 */
export function createCalendarSecretResolver(readEnv: () => string | undefined, readShared: () => Promise<string>) {
  let pending: Promise<string> | null = null;
  return (): Promise<string> => {
    if (!pending) {
      const configured = String(readEnv() || "").trim();
      pending = configured
        ? Promise.resolve(configured)
        : readShared().then(shared => deriveCalendarSecret("", shared));
      pending.catch(() => { pending = null; });
    }
    return pending;
  };
}
