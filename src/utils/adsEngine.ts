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
import { SEASON_IDS, seasonLabel } from "./adSeasons";

export interface AdSlotSpec {
  id: string;
  label: string;
  /** أين يظهر وأمام من. */
  where: string;
  /** سطرٌ قصير يشرح الموقع لمن لا يعرف اسمه (يظهر تحت الاسم في بطاقة الاختيار). */
  hint: string;
  audience: "students" | "staff" | "all";
  width: number;
  height: number;
  /** أقصى حملاتٍ متزامنة في الموقع (تتناوب بحصصٍ متساوية). */
  capacity: number;
  /** حصري: حملةٌ واحدة فقط في أي لحظة. */
  exclusive?: boolean;
  /** موقعٌ متوقف: لا يُعرض فيه شيء ولا تُقبل فيه حملةٌ جديدة. يبقى معرَّفاً لتُقرأ حملاتٌ قديمة عليه. */
  retired?: boolean;
  /** موقعٌ يصل كلَّ طلبة الجامعة افتراضياً (بلا استهداف)؛ ويعرف كليةَ الطالب بعد إكمال ملفه، فيجوز حصرُه بكليات. */
  wholeUniversity?: boolean;
}

export const AD_SLOTS: readonly AdSlotSpec[] = [
  { id: "sponsor", label: "شريك الفصل", hint: "شريط «برعاية» فوق كل إعلان", where: "شريط «برعاية» أعلى كل موقعٍ إعلاني", audience: "all", width: 640, height: 80, capacity: 1, exclusive: true },
  { id: "me", label: "«مساري»", hint: "الصفحة الرئيسية للطالب", where: "أسفل البطاقة الرئيسية في «مساري» (/me)", audience: "students", width: 640, height: 200, capacity: 5, wholeUniversity: true },
  { id: "schedule", label: "الجدول العام", hint: "تحت جدول القسم وجدول الطلبة", where: "أسفل جدول القسم وجدول الطلبة (QR)", audience: "students", width: 640, height: 160, capacity: 3 },
  /* متوقف: صفحة «حالة طلبي» تطلب رقماً مدنياً ورقم الحالة، وشرطُنا ألا إعلان في صفحات الهوية. */
  { id: "status", label: "حالة الطلب (متوقف)", hint: "متوقف", where: "متوقف: الصفحة تطلب الهوية", audience: "students", width: 600, height: 250, capacity: 3, retired: true },
  { id: "break", label: "وقت الفراغ", hint: "للطالب حين يكون بين محاضراته فراغ ساعة فأكثر", where: "داخل «تذكرتي» في «مساري» حين يكون للطالب فراغ ساعةٍ فأكثر بين محاضراته", audience: "students", width: 480, height: 160, capacity: 3, wholeUniversity: true },
  { id: "dashboard", label: "أعضاء هيئة التدريس والإداريين", hint: "بطاقة تظهر لهم بعد تسجيل الدخول", where: "بطاقة في لوحة الأساتذة والإداريين", audience: "staff", width: 480, height: 160, capacity: 3 },
] as const;

export const slotById = (id: string): AdSlotSpec | undefined => AD_SLOTS.find(slot => slot.id === id);
/** المواقع الفاعلة التي تُقبل فيها حملاتٌ جديدة. */
export const activeSlots = (): AdSlotSpec[] => AD_SLOTS.filter(slot => !slot.retired);

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

export interface Candidate { id?: string; company: string; category: string; slot: string; startDay: string; endDay: string; seasons?: string[]; colleges?: number[] }

/* ── الاستهداف: المواسم والكليات ── */
export const cleanSeasons = (raw: unknown): string[] =>
  [...new Set((Array.isArray(raw) ? raw : []).map(v => String(v)).filter(v => SEASON_IDS.includes(v)))];
export const cleanColleges = (raw: unknown): number[] =>
  [...new Set((Array.isArray(raw) ? raw : []).map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0))].slice(0, 60);

/** قائمتان تتقاطعان؟ الفارغة تعني «الكل» فتتقاطع مع أي قائمة. */
const listsMeet = <T,>(a: readonly T[] | undefined, b: readonly T[] | undefined): boolean =>
  !a || !a.length || !b || !b.length || a.some(v => b.includes(v));
/** حملتان قد تظهران أمام الطالب نفسه في اللحظة نفسها؟ (مواسمُهما وكلياتُهما تتقاطعان) */
export const targetsOverlap = (a: Pick<Candidate, "seasons" | "colleges">, b: Pick<Candidate, "seasons" | "colleges">): boolean =>
  listsMeet(a.seasons, b.seasons) && listsMeet(a.colleges, b.colleges);

export interface AdContext {
  today?: string;
  /** المواسم الفاعلة الآن (utils/adSeasons). */
  seasons?: readonly string[];
  /** كلية الطالب إن عرفتها الصفحة (روابط الجدول والحالة)، وإلا undefined. */
  collegeId?: number;
}
/** هل تُعرض هذه الحملة الآن في هذا السياق؟ التواريخ والاعتماد ثم الموسم ثم الكلية. */
export function eligibleNow(campaign: AdCampaign, ctx: AdContext = {}): boolean {
  if (!isLive(campaign, ctx.today)) return false;
  if (campaign.seasons?.length && !campaign.seasons.some(s => ctx.seasons?.includes(s))) return false;
  if (campaign.colleges?.length && !(ctx.collegeId && campaign.colleges.includes(ctx.collegeId))) return false;
  return true;
}

/** يتحقق من بيانات الحملة نفسها قبل الحفظ. يُرجع قائمة أسباب الرفض (فارغة = سليمة). */
export function campaignProblems(input: Candidate): string[] {
  const out: string[] = [];
  if (!slotById(input.slot)) out.push("اختر موقعاً صحيحاً.");
  else if (slotById(input.slot)?.retired) out.push("هذا الموقع متوقف؛ اختر موقعاً آخر.");
  if (!String(input.company || "").trim()) out.push("اسم الشركة مطلوب.");
  if (!String(input.category || "").trim()) out.push("الفئة مطلوبة.");
  if (input.seasons?.some(s => !SEASON_IDS.includes(s))) out.push("موسمٌ غير معروف.");
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
  const rival = same.find(c => c.category === input.category && targetsOverlap(c, input));
  if (rival) out.push(`«${rival.company}» من الفئة نفسها (${input.category}) في هذا الموقع خلال ${rival.startDay} إلى ${rival.endDay}${rival.seasons?.length || rival.colleges?.length ? " ولجمهورٍ يتقاطع مع جمهورك" : ""}.`);
  const limit = slot.exclusive ? 1 : slot.capacity;
  /* السعة لكل «مشاهدٍ» ممكن: زوجُ (موسم، كلية). الطالب يرى حملات شريحته وحدها، فالحملة المستهدِفة موسمين
     لا تُحسب عليها حملاتُ الموسمين معاً. الكلية 0 = صفحةٌ لا تعرف كلية الطالب. ولا يتغير العدد إلا عند بدء حملة،
     فيكفي فحص يوم بداية الحملة الجديدة وأيام بدايات الحملات المتقاطعة. */
  const seasons = input.seasons?.length ? input.seasons : [...SEASON_IDS];
  const colleges = new Set<number>([0, ...(input.colleges || []), ...same.flatMap(c => c.colleges || [])]);
  const days = [...new Set([input.startDay, ...same.map(c => c.startDay).filter(d => d > input.startDay && d <= input.endDay)])].sort();
  for (const day of days) {
    const active = same.filter(c => c.startDay <= day && day <= c.endDay);
    for (const season of seasons) {
      for (const college of colleges) {
        if (input.colleges?.length && !input.colleges.includes(college)) continue;
        const count = active.filter(c => (!c.seasons?.length || c.seasons.includes(season)) && (!c.colleges?.length || c.colleges.includes(college))).length;
        if (count >= limit) {
          const where = `${input.seasons?.length || same.some(c => c.seasons?.length) ? ` في موسم «${seasonLabel(season)}»` : ""}${college ? " لهذه الكلية" : ""}`;
          out.push(slot.exclusive ? `${slot.label} حصريٌّ وهو محجوزٌ يوم ${day}${where}.` : `موقع ${slot.label} ممتلئ (${limit}) يوم ${day}${where}؛ أجّل الحملة بعد انتهاء إحدى الحملات أو اختر موسماً آخر.`);
          return out;
        }
      }
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

/* ── الرابط المتتبَّع: تستطيع الشركة التحقق من أرقامنا في تحليلاتها هي ──
   يُضاف إلى وجهة النقر وسمُ utm (المصدر والوسيط والحملة) ما لم يكن في الرابط أصلاً أيُّ utm_*، فلا نعبث بوسوم الشركة. */
export function trackedLink(url: string, campaign: Pick<AdCampaign, "id" | "slot">): string {
  try {
    const u = new URL(url);
    if ([...u.searchParams.keys()].some(k => k.toLowerCase().startsWith("utm_"))) return url;
    u.searchParams.set("utm_source", "schedule");
    u.searchParams.set("utm_medium", "banner");
    u.searchParams.set("utm_campaign", `ad-${campaign.id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}`);
    u.searchParams.set("utm_content", campaign.slot);
    return u.toString();
  } catch { return url; }
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

/* ── التجربة المجانية: سبعة أيام، ومرةً لكل شركة ── */
export const TRIAL_DAYS = 7;
export const normCompany = (name: string): string => String(name || "").toLowerCase().replace(/[\s\u200e\u200f]+/g, " ").trim();

/** أسبابُ رفض حملةٍ تجريبية: أطول من أسبوع، أو شركةٌ أخذت تجربتها من قبل. */
/** `registry`: سجلٌّ دائم بالشركات التي استهلكت تجربتها (اسمٌ مُطبَّع ← رقم الحملة)؛ لا يمحوه تعديلُ الحملة ولا حذفها. */
export function trialProblems(input: { id?: string; company: string; trial?: boolean; startDay: string; endDay: string }, others: readonly AdCampaign[], registry: Readonly<Record<string, string>> = {}): string[] {
  if (!input.trial) return [];
  const out: string[] = [];
  if (isDay(input.startDay) && isDay(input.endDay) && daysBetween(input.startDay, input.endDay) + 1 > TRIAL_DAYS) out.push("الحملة التجريبية سبعة أيام كحدٍّ أقصى.");
  const name = normCompany(input.company);
  const usedBy = name ? registry[name] : undefined;
  if (name && (others.some(c => c.id !== input.id && c.trial && normCompany(c.company) === name) || (usedBy && usedBy !== input.id))) out.push("هذه الشركة أخذت تجربتها المجانية من قبل؛ الحملة التجريبية مرةٌ واحدة لكل شركة.");
  return out;
}

/* ── الأسبوع مقابل الأسبوع الماضي ── */
export interface WeekTotals { impressions: number; uniques: number; clicks: number; ctr: number }
export interface WeeklyCompare { thisWeek: WeekTotals; lastWeek: WeekTotals; impressionsChange: number | null; clicksChange: number | null; hasLastWeek: boolean }
const changePct = (now: number, before: number): number | null => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

/** آخر ٧ أيام (تنتهي اليوم) مقابل ٧ أيامٍ قبلها. التغيّر null حين لا أساس للمقارنة. */
export function weeklyCompare(rows: readonly AdStatsDay[], today = kuwaitDay()): WeeklyCompare {
  const sum = (from: string, to: string): WeekTotals => {
    const t = totalsOf(rows.filter(r => r.day >= from && r.day <= to));
    return { impressions: t.impressions, uniques: t.uniques, clicks: t.clicks, ctr: t.ctr };
  };
  const thisWeek = sum(addDays(today, -6), today);
  const lastWeek = sum(addDays(today, -13), addDays(today, -7));
  return { thisWeek, lastWeek, impressionsChange: changePct(thisWeek.impressions, lastWeek.impressions), clicksChange: changePct(thisWeek.clicks, lastWeek.clicks), hasLastWeek: lastWeek.impressions > 0 };
}

/** متوسط نسبة النقر لباقي حملات الموقع نفسه (≥٢٠٠ ظهور لكلٍّ) للمقارنة؛ null إن قلّت العيّنة (أقل من حملتين). */
export function slotBenchmarkCtr(campaignId: string, slotId: string, campaigns: readonly AdCampaign[], stats: readonly AdStatsDay[]): number | null {
  const rates = campaigns.filter(c => c.id !== campaignId && c.slot === slotId)
    .map(c => totalsOf(stats.filter(r => r.campaignId === c.id)))
    .filter(t => t.impressions >= 200).map(t => t.ctr);
  if (rates.length < 2) return null;
  return Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10;
}
