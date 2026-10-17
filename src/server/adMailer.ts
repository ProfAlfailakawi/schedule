/**
 * ── البريد الاختياري للشركات ─────────────────────────────────────────────────────────
 *
 * معطَّلٌ تماماً ما لم تُضبط إعدادات البيئة؛ فلا يتغيّر شيء في الإنتاج حتى يقرّر المالك:
 *   AD_MAIL_API_KEY   مفتاحُ واجهة الإرسال (يُحفظ في أسرار البيئة لا في المستودع).
 *   AD_MAIL_FROM      عنوانُ المرسِل المعتمد عند المزوّد.
 *   AD_MAIL_API_URL   (اختياري) عنوان الواجهة؛ الافتراضي واجهة Resend (POST JSON بـ Bearer).
 * يُخزَّن بريدُ الشركة (يعطيه المالكُ لحملتها بنفسه) في الحملة وحدها، ولا يظهر في أي صفحةٍ عامة ولا في سجل التدقيق.
 * الرسائل نصٌّ بسيط: رابطُ التقرير الحي وخلاصةُ الأسبوع، بلا أرقامٍ شخصية ولا تتبّع.
 */
import type { AdCampaign } from "../types";
import type { WeeklyCompare } from "../utils/adsEngine";
import { AR, countOf } from "../utils/arabicCount";

export interface MailConfig { key: string; from: string; url: string }

export function mailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig | null {
  const key = String(env.AD_MAIL_API_KEY || "").trim(), from = String(env.AD_MAIL_FROM || "").trim();
  if (!key || !from) return null;
  return { key, from, url: String(env.AD_MAIL_API_URL || "https://api.resend.com/emails").trim() };
}

/** بريدٌ صالحٌ بسيط؛ فارغٌ مقبول (لا بريد). غير الصالح null. */
export function cleanEmail(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return "";
  return v.length <= 120 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(v) ? v : null;
}

/** مفتاحُ الأسبوع (الأحد أوله): يمنع إرسال الأسبوعي مرتين. */
export function weekKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const sunday = new Date(d.getTime() - d.getUTCDay() * 86_400_000);
  return sunday.toISOString().slice(0, 10);
}

const nf = new Intl.NumberFormat("ar-KW-u-nu-latn");
const pct = (n: number) => `${new Intl.NumberFormat("ar-KW-u-nu-latn", { maximumFractionDigits: 1 }).format(n)}٪`;

export function weeklyMail(c: Pick<AdCampaign, "company" | "endDay">, w: WeeklyCompare, reportUrl: string): { subject: string; text: string } {
  const change = w.hasLastWeek && w.impressionsChange != null ? (w.impressionsChange > 0 ? ` (ارتفاع ${pct(w.impressionsChange)} عن الأسبوع الماضي)` : w.impressionsChange < 0 ? ` (انخفاض ${pct(Math.abs(w.impressionsChange))} عن الأسبوع الماضي)` : " (مثل الأسبوع الماضي)") : "";
  return {
    subject: `تقريرك الأسبوعي: حملة ${c.company}`,
    text: [
      "السلام عليكم،", "",
      `ملخص أسبوع حملة «${c.company}»:`,
      `• الظهور المرئي: ${nf.format(w.thisWeek.impressions)}${change}`,
      `• النقرات الصحيحة: ${nf.format(w.thisWeek.clicks)}`,
      `• نسبة النقر: ${pct(w.thisWeek.ctr)}`, "",
      `تقريركم الحي: ${reportUrl}`,
    ].join("\n"),
  };
}

export function renewalMail(c: Pick<AdCampaign, "company" | "endDay">, daysLeft: number, reportUrl: string): { subject: string; text: string } {
  return {
    subject: `حملة ${c.company}: تثبيت مكانكم في الفصل القادم`,
    text: [
      "السلام عليكم،", "",
      daysLeft > 0 ? `تنتهي حملة «${c.company}» بعد ${countOf(daysLeft, AR.day)}.` : `تنتهي حملة «${c.company}» اليوم.`,
      "يسعدنا تثبيت مكانكم في الفصل القادم؛ نحجز لكم الموقع نفسه قبل أن يمتلئ. للتجديد تواصلوا مع إدارة البرنامج.", "",
      `نتائجكم الحية: ${reportUrl}`,
    ].join("\n"),
  };
}

export async function sendMail(cfg: MailConfig, to: string, msg: { subject: string; text: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    const res = await fetch(cfg.url, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` }, body: JSON.stringify({ from: cfg.from, to: [to], subject: msg.subject, text: msg.text }) });
    clearTimeout(timer);
    return res.ok ? { ok: true } : { ok: false, error: `رفض مزوّد البريد الطلب (${res.status}).` };
  } catch (e: any) {
    return { ok: false, error: e?.name === "AbortError" ? "انتهت مهلة مزوّد البريد." : "تعذّر الوصول إلى مزوّد البريد." };
  }
}
