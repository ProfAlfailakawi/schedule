/**
 * ── محرّكُ الإعلانات: القواعدُ كلُّها هنا، نقيّةً وقابلةً للاختبار ──────────────────
 *
 * ما يُقبل وما يُرفض يُفرض بالكود لا بالاتفاق: المقاس، والوزن، والرابط، والسعة،
 * وتعارض الفئة، وتواريخ الحملة. الخادمُ يستدعي هذه الدوال عند الحفظ وعند الاعتماد
 * وعند كل عرض، فلا تعرض حملةٌ مخالفة ولا منتهية ولو بقيت في قاعدة البيانات.
 *
 * التواريخ أيامٌ بتوقيت الكويت (UTC+3) والنهاية شاملة.
 */
import type { AdCampaign, AdStatsDay } from "../types";

export interface AdSlotSpec {
  id: string;
  label: string;
  /** أين يظهر وأمام من. */
  where: string;
  audience: "students" | "staff" | "all";
  width: number;
  height: number;
  /** أقصى حملاتٍ متزامنة في الموقع (تتناوب بحصصٍ متساوية). */
  capacity: number;
  /** حصري: حملةٌ واحدة فقط في أي لحظة. */
  exclusive?: boolean;
}

export const AD_SLOTS: readonly AdSlotSpec[] = [
  { id: "sponsor", label: "شريك الفصل", where: "شريط «برعاية» أعلى كل موقعٍ إعلاني", audience: "all", width: 640, height: 80, capacity: 1, exclusive: true },
  { id: "me", label: "«مساري»", where: "أسفل البطاقة الرئيسية في «مساري» (/me)", audience: "students", width: 640, height: 200, capacity: 5 },
  { id: "schedule", label: "الجدول العام", where: "أسفل جدول القسم وجدول الطلبة (QR)", audience: "students", width: 640, height: 160, capacity: 3 },
  { id: "status", label: "حالة الطلب", where: "أسفل صفحة «حالة طلبي»", audience: "students", width: 600, height: 250, capacity: 3 },
  { id: "dashboard", label: "لوحة الكادر", where: "بطاقة في لوحة الأساتذة والإداريين", audience: "staff", width: 480, height: 160, capacity: 3 },
] as const;

export const slotById = (id: string): AdSlotSpec | undefined => AD_SLOTS.find(slot => slot.id === id);

export const AD_MAX_BYTES = 300 * 1024;
export const AD_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
export const AD_CATEGORIES = ["مطاعم وكافيهات", "تقنية وإلكترونيات", "كتب وقرطاسية", "تعليم ودورات", "خدمات مصرفية", "صحة ولياقة", "سفر وسياحة", "مواصلات", "ترفيه", "أخرى"] as const;
export const MAX_ROTATE_CREATIVES = 2;

/** شروطُ الإعلان كما تُعرض للشركة وللأدمن عند الإضافة. تُفرض آلياً ما أمكن. */
export const AD_RULES: readonly string[] = [
  "صورةٌ فقط (PNG أو JPEG أو WebP) بمقاس الموقع تماماً وبوزنٍ لا يتجاوز ٣٠٠ كيلوبايت.",
  "لا سكربتات ولا تتبّع طرفٍ ثالث؛ الرابط https فقط ويُفتح بوسم «إعلان» ثابت.",
  "ممنوع: التبغ والمنوّمات والمقامرة والمحتوى غير اللائق والادعاءات الطبية والمالية المضمونة.",
  "لا يظهر الإعلان في صفحات الهوية والاستبيان والاعتماد والطباعة والتقويم.",
  "لا يظهر منافسان من فئةٍ واحدة في الموقع نفسه معاً.",
  "تُراجَع كل حملةٍ وتُعتمد بتوقيع الإدارة قبل العرض، وللإدارة إيقافها فوراً.",
];

export const KUWAIT_OFFSET_MS = 3 * 3_600_000;
/** يومُ الكويت YYYY-MM-DD للحظةٍ معيّنة. */
export const kuwaitDay = (at: number | Date = Date.now()): string => new Date((at instanceof Date ? at.getTime() : at) + KUWAIT_OFFSET_MS).toISOString().slice(0, 10);
export const kuwaitHour = (at: number | Date = Date.now()): number => new Date((at instanceof Date ? at.getTime() : at) + KUWAIT_OFFSET_MS).getUTCHours();
export const isDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(`${value}T00:00:00Z`);
  /* ٣٠ فبراير لا يُرفض من Date.parse وحده؛ نتحقق أن التاريخ يعود كما كتب. */
  return !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === value;
};
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
export const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/* ── الصورة: نقرأ الأبعاد من رأس الملف بلا مكتبات، ونرفض ما لا يطابق ── */
export interface ImageInfo { mime: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number }

export function readImageInfo(buf: Buffer): ImageInfo | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a && buf.toString("ascii", 12, 16) === "IHDR") {
    return { mime: "image/png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      const length = buf.readUInt16BE(i + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { mime: "image/jpeg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      if (length < 2) return null;
      i += 2 + length;
    }
    return null;
  }
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8 ") return { mime: "image/webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { mime: "image/webp", width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8X") return { mime: "image/webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}

/** سببُ رفض الصورة بالعربية، أو "" إن صلحت للموقع. */
export function creativeProblem(slotId: string, bytes: number, info: ImageInfo | null): string {
  const slot = slotById(slotId);
  if (!slot) return "موقعٌ غير معروف.";
  if (!info) return "الملف ليس صورةً مدعومة (PNG أو JPEG أو WebP).";
  if (bytes > AD_MAX_BYTES) return `وزن الصورة ${Math.ceil(bytes / 1024)} كيلوبايت وهو أكبر من الحد ${AD_MAX_BYTES / 1024} كيلوبايت.`;
  if (info.width !== slot.width || info.height !== slot.height) return `مقاس الصورة ${info.width}×${info.height} والمطلوب لهذا الموقع ${slot.width}×${slot.height} تماماً.`;
  return "";
}

/** رابطُ الوجهة: https فقط، بلا بيانات دخولٍ ولا مضيفٍ محلي. يُرجع الرابط منظَّفاً أو سبب الرفض. */
export function cleanLink(raw: unknown): { url: string; problem: string } {
  const text = String(raw ?? "").trim();
  if (!text || text.length > 600) return { url: "", problem: "الرابط مطلوب (حتى ٦٠٠ حرفاً)." };
  let url: URL;
  try { url = new URL(text); } catch { return { url: "", problem: "الرابط غير صالح." }; }
  if (url.protocol !== "https:") return { url: "", problem: "الرابط يجب أن يبدأ بـ https://" };
  if (url.username || url.password) return { url: "", problem: "ممنوع وضع بيانات دخولٍ في الرابط." };
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes("[") || !host.includes(".")) {
    return { url: "", problem: "الرابط يجب أن يشير إلى موقعٍ عام." };
  }
  return { url: url.toString(), problem: "" };
}

/* ── الحالة: متى تُعرض الحملة ── */
export const isLive = (campaign: AdCampaign, today = kuwaitDay()): boolean =>
  campaign.status === "approved" && campaign.startDay <= today && today <= campaign.endDay;

export type AdPhase = "draft" | "paused" | "scheduled" | "live" | "ended";
export function phaseOf(campaign: AdCampaign, today = kuwaitDay()): AdPhase {
  if (campaign.status === "draft") return "draft";
  if (campaign.status === "paused") return "paused";
  if (today < campaign.startDay) return "scheduled";
  if (today > campaign.endDay) return "ended";
  return "live";
}

const overlaps = (a: Pick<AdCampaign, "startDay" | "endDay">, b: Pick<AdCampaign, "startDay" | "endDay">) => a.startDay <= b.endDay && b.startDay <= a.endDay;

export interface Candidate { id?: string; company: string; category: string; slot: string; startDay: string; endDay: string }

/** يتحقق من بيانات الحملة نفسها قبل الحفظ. يُرجع قائمة أسباب الرفض (فارغة = سليمة). */
export function campaignProblems(input: Candidate): string[] {
  const out: string[] = [];
  if (!slotById(input.slot)) out.push("اختر موقعاً صحيحاً.");
  if (!String(input.company || "").trim()) out.push("اسم الشركة مطلوب.");
  if (!String(input.category || "").trim()) out.push("الفئة مطلوبة.");
  if (!isDay(input.startDay) || !isDay(input.endDay)) out.push("تاريخا البداية والنهاية مطلوبان بصيغة YYYY-MM-DD.");
  else {
    if (input.endDay < input.startDay) out.push("تاريخ النهاية قبل تاريخ البداية.");
    else if (daysBetween(input.startDay, input.endDay) > 366) out.push("أطول حملةٍ مسموحة سنة واحدة.");
  }
  return out;
}

/**
 * التعارض عند الاعتماد: السعةُ لكل يوم، والحصريةُ، وفئةُ المنافس.
 * تُفحص أيامُ الحملة الجديدة يوماً يوماً مقابل الحملات المعتمدة الأخرى.
 */
export function placementProblems(input: Candidate, others: readonly AdCampaign[]): string[] {
  const slot = slotById(input.slot);
  if (!slot || !isDay(input.startDay) || !isDay(input.endDay)) return [];
  const same = others.filter(c => c.id !== input.id && c.slot === input.slot && c.status === "approved" && overlaps(c, input));
  const out: string[] = [];
  const rival = same.find(c => c.category === input.category);
  if (rival) out.push(`«${rival.company}» من الفئة نفسها (${input.category}) في هذا الموقع خلال ${rival.startDay} إلى ${rival.endDay}.`);
  const limit = slot.exclusive ? 1 : slot.capacity;
  const span = Math.min(daysBetween(input.startDay, input.endDay), 366);
  for (let i = 0; i <= span; i++) {
    const day = addDays(input.startDay, i);
    const count = same.filter(c => c.startDay <= day && day <= c.endDay).length;
    if (count >= limit) {
      out.push(slot.exclusive
        ? `«${slot.label}» حصريٌّ وهو محجوزٌ يوم ${day}.`
        : `موقع «${slot.label}» ممتلئ (${limit}) يوم ${day}؛ أجّل الحملة بعد انتهاء إحدى الحملات.`);
      break;
    }
  }
  return out;
}

/** أقرب موعدٍ يفرغ فيه الموقع (للعرض في رسالة الرفض). "" إن كان فارغاً اليوم. */
export function nextFreeDay(slotId: string, campaigns: readonly AdCampaign[], today = kuwaitDay()): string {
  const slot = slotById(slotId);
  if (!slot) return "";
  const limit = slot.exclusive ? 1 : slot.capacity;
  const live = campaigns.filter(c => c.slot === slotId && c.status === "approved" && c.endDay >= today);
  for (let i = 0; i < 400; i++) {
    const day = addDays(today, i);
    if (live.filter(c => c.startDay <= day && day <= c.endDay).length < limit) return day;
  }
  return "";
}

/** حصةُ الظهور المتوقعة لحملةٍ في موقعها، كما تُقال للشركة. */
export function expectedShare(slotId: string, liveCount: number): number {
  if (liveCount <= 0) return 1;
  return slotById(slotId)?.exclusive ? 1 : 1 / liveCount;
}

/** ترتيبُ العرض: عشوائيٌّ في كل طلب فلا يحتكر أحدٌ أول موضع. `rand` للاختبار. */
export function rotationOrder<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── الأرقام ── */
export interface CampaignTotals {
  impressions: number; uniques: number; clicks: number; filteredClicks: number;
  /** نسبة النقر % بخانةٍ عشرية. */
  ctr: number;
}
export const ctrOf = (clicks: number, impressions: number): number => (impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : 0);

export function totalsOf(rows: readonly AdStatsDay[]): CampaignTotals {
  const t = { impressions: 0, uniques: 0, clicks: 0, filteredClicks: 0 };
  for (const r of rows) { t.impressions += r.impressions; t.uniques += r.uniques; t.clicks += r.clicks; t.filteredClicks += r.filteredClicks; }
  return { ...t, ctr: ctrOf(t.clicks, t.impressions) };
}

export interface DayRow { day: string; impressions: number; clicks: number }
/** سلسلةٌ يومية متصلة من بداية الحملة حتى اليوم/النهاية (الأيام بلا بيانات = صفر). */
export function dailySeries(rows: readonly AdStatsDay[], startDay: string, endDay: string, today = kuwaitDay()): DayRow[] {
  const last = endDay < today ? endDay : today;
  if (!isDay(startDay) || !isDay(last) || last < startDay) return [];
  const byDay = new Map<string, DayRow>();
  for (const r of rows) {
    const cur = byDay.get(r.day) || { day: r.day, impressions: 0, clicks: 0 };
    cur.impressions += r.impressions; cur.clicks += r.clicks; byDay.set(r.day, cur);
  }
  const out: DayRow[] = [];
  const span = Math.min(daysBetween(startDay, last), 400);
  for (let i = 0; i <= span; i++) { const day = addDays(startDay, i); out.push(byDay.get(day) || { day, impressions: 0, clicks: 0 }); }
  return out;
}

/** مقارنة A/B: صورةٌ لكل بنية، بنسبة نقرها. */
export function creativeBreakdown(rows: readonly AdStatsDay[]): Array<{ creativeId: string } & CampaignTotals> {
  const ids = [...new Set(rows.map(r => r.creativeId))];
  return ids.map(creativeId => ({ creativeId, ...totalsOf(rows.filter(r => r.creativeId === creativeId)) }));
}

/* ── كودُ الخصم ── */
export const cleanCoupon = (raw: unknown): string => String(raw ?? "").toUpperCase().replace(/[^A-Z0-9؀-ۿ_-]/g, "").slice(0, 24);

/* ── أيامُ الانتهاء ── */
export const daysLeft = (campaign: Pick<AdCampaign, "endDay">, today = kuwaitDay()): number => daysBetween(today, campaign.endDay);
export const endingSoon = (campaign: AdCampaign, today = kuwaitDay(), within = 7): boolean =>
  campaign.status === "approved" && campaign.startDay <= today && daysLeft(campaign, today) >= 0 && daysLeft(campaign, today) <= within;

/* ── تصفيةُ الأحداث: روبوتات ونقراتٌ متكررة ── */
export const looksAutomated = (userAgent: unknown): boolean => {
  const ua = String(userAgent ?? "");
  return !ua || ua.length < 12 || /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|curl|wget|python|httpclient|monitor|lighthouse/i.test(ua);
};
