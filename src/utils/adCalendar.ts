/**
 * ── تقويمُ الشركة: تنبيهاتٌ بلا حساب ─────────────────────────────────────────────────
 *
 * الشركة لا تملك مستخدماً عندنا ولا نريد لها واحداً؛ رابطُ تقريرها هو هويتُها. فنُعطيها «اشتراك تقويم»: ملفٌّ
 * يضيفه جوالُها إلى تقويمه فيُنبّهها بنفسه (لا بريد ولا إشعاراتُ متصفح ولا خادمُ رسائل عندنا):
 *   • قبل انتهاء الحملة بأسبوع، ويومَ الانتهاء: تذكيرُ التجديد.
 *   • كل أحدٍ حتى الانتهاء: «تقريرك الأسبوعي جاهز» بالرابط الحي.
 * يتحدّث وحده إن تغيّرت تواريخُ الحملة (التقويمُ يُعيد قراءة الرابط). دالةٌ نقيّة قابلة للاختبار.
 */
import { AR, countOf } from "./arabicCount";

export interface CalendarCampaign { id: string; company: string; startDay: string; endDay: string; trial?: boolean }

const CRLF = "\r\n";
const compact = (day: string): string => day.replace(/-/g, "");
const shift = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** نصٌّ في iCalendar: تُهرَّب الفاصلة والفاصلة المنقوطة والشرطة المائلة والسطر الجديد. */
export const icsText = (s: string): string => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** طيُّ السطر عند ٧٥ بايتاً (RFC 5545) دون قطع حرفٍ متعدد البايتات. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ch; bytes = b; limit = 74; } else { cur += ch; bytes += b; }
  }
  out.push(cur);
  return out.join(CRLF + " ");
}

/** أولُ أحدٍ في اليوم المعطى أو بعده. */
function nextSunday(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shift(day, (7 - dow) % 7);
}

export function reportCalendar(c: CalendarCampaign, reportUrl: string, today: string, now: Date = new Date()): string {
  const events: string[][] = [];
  const base = (uid: string, day: string, summary: string, desc: string, extra: string[] = []): string[] => [
    "BEGIN:VEVENT", `UID:${uid}@schedule`, `DTSTAMP:${stamp(now)}`, `DTSTART;VALUE=DATE:${compact(day)}`, `DTEND;VALUE=DATE:${compact(shift(day, 1))}`,
    `SUMMARY:${icsText(summary)}`, `DESCRIPTION:${icsText(desc)}`, `URL:${reportUrl}`, "TRANSP:TRANSPARENT", ...extra,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(summary)}`, "TRIGGER;RELATED=START:PT9H", "END:VALARM", "END:VEVENT",
  ];
  const open = `افتح تقرير حملتك الحي: ${reportUrl}`;
  const warnDay = shift(c.endDay, -7);
  /* من اشترك بعد موعد التحذير يصله تذكيرُ اللحاق اليوم بالأيام الفعلية المتبقية، لا بـ«أسبوع» كاذبة؛ وفي يوم الانتهاء نفسه يكفيه حدثُ الانتهاء. */
  const left = Math.round((Date.parse(`${c.endDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const renewHow = `للتجديد أو تثبيت مكانكم في الفصل القادم تواصلوا مع إدارة البرنامج. ${open}`;
  if (c.endDay >= today && warnDay >= c.startDay && warnDay >= today) events.push(base(`${c.id}-renew`, warnDay, `تنتهي حملة ${c.company} بعد أسبوع`, renewHow));
  else if (left > 0 && left < 7) events.push(base(`${c.id}-renew`, today, `تنتهي حملة ${c.company} بعد ${countOf(left, AR.day)}`, renewHow));
  if (c.endDay >= today) events.push(base(`${c.id}-end`, c.endDay, `آخر يومٍ في حملة ${c.company}`, `${c.trial ? "تنتهي التجربة المجانية اليوم. " : ""}${open}`));
  const first = nextSunday(c.startDay > today ? c.startDay : today);
  if (first <= c.endDay) events.push(base(`${c.id}-weekly`, first, `تقريرك الأسبوعي: حملة ${c.company}`, `أرقام الأسبوع جاهزة. ${open}`, [`RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=${compact(c.endDay)}`]));
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SCHEDULE//Ads//AR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(`حملة ${c.company}`)}`, "X-PUBLISHED-TTL:PT12H", "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    ...events.flat(), "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
