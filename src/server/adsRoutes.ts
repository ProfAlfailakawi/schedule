/**
 * ── مسارات الإعلانات والجمهور ─────────────────────────────────────────────────────
 *
 * ثلاث طبقات:
 *
 *   1) العامة (خارج /api عمداً): `/_ads/*` و`/_pulse`. لا تمرّ بجلسةٍ ولا بمحدّد
 *      `/api/public` — فشبكةُ الجامعة عنوانٌ واحدٌ لآلاف الطلبة، ولا يصحّ أن تزاحم
 *      إشارةُ قياسٍ طالباً يفتح جدوله. لها محدّدها الأوسع، وتتجاهل الروبوتات.
 *   2) صفحاتُ الشركاء: `/ad-report/:token` و`/partners/:token`.
 *   3) الإدارة: `/api/admin/ads/*` و`/api/admin/audience-stats`، لحساب الإدارة الرئيسي.
 *
 * العدّاداتُ تُجمَّع في الذاكرة وتُكتب دفعةً كل نصف دقيقة، فلا تُكلّف كتابةً لكل ظهور.
 * الحملاتُ تُقرأ من ذاكرةٍ مؤقتة عمرها ١٥ ثانية: إيقافُ حملةٍ يسري خلال ثوانٍ.
 */
import { randomBytes, randomUUID } from "crypto";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { Repository } from "../db/repository";
import type { AdCampaign, AdCourse, AdCreative, AdStatsDay, AdTerm, AudienceDay, InstructorRequest, StudentNeed, StudentProfile } from "../types";
import { PUBLIC_LINK_PAGE_PREFIXES, isDemoLinkToken } from "../utils/demoLinkToken";
import {
  AD_CATEGORIES, AD_MAX_BYTES, AD_RULES, AD_SLOTS, MAX_ROTATE_CREATIVES, campaignProblems, cleanColleges, cleanCoupon, cleanLink, cleanSeasons, eligibleNow,
  creativeBreakdown, creativeProblem, daysBetween, daysLeft, endingSoon, expectedShare, isLive, kuwaitDay, kuwaitHour,
  looksAutomated, nextFreeDay, phaseOf, placementProblems, readImageInfo, rotationOrder, slotById, totalsOf, dailySeries,
  trialProblems, weeklyCompare, slotBenchmarkCtr, TRIAL_DAYS, normCompany, activeSlots,
} from "../utils/adsEngine";
import { buildAudienceStats } from "../utils/audienceStats";
import { reportCalendar } from "../utils/adCalendar";
import { abVerdict } from "../utils/adInsights";
import { cleanEmail, mailConfig, renewalMail, sendMail, weekKey, weeklyMail } from "./adMailer";
import { SEASONS, activeSeasons, seasonCalendar, seasonsText } from "../utils/adSeasons";
import { AR, countOf } from "../utils/arabicCount";
import type { CenterNotification } from "../utils/notificationCenter";
import { AD_CLIENT_SCRIPT } from "./adClientScript";
import { analyzeCreative } from "./adQuality";
import { campaignReportPage, measurementPage, partnerKitPage } from "./adsPages";

/** إشعاراتُ الجرس لحساب الإدارة الرئيسي: حملاتٌ تنتهي قريباً أو انتهت هذه الأيام، ليُجدَّد معها أو تُؤرشف. */
export async function adNotifications(today = kuwaitDay()): Promise<CenterNotification[]> {
  const all = await Repository.listAdCampaigns();
  const items: CenterNotification[] = [];
  for (const c of all) {
    if (endingSoon(c, today)) {
      const n = daysLeft(c, today);
      items.push({
        id: `ad-ending:${c.id}:${c.endDay}`, tone: "action",
        title: n === 0 ? `حملة «${c.company}» تنتهي اليوم` : `حملة «${c.company}» تنتهي بعد ${countOf(n, AR.day)}`,
        detail: "تواصل مع الشركة للتجديد قبل أن يُخلى مكانها", view: "ads", at: `${c.endDay}T00:00:00Z`,
      });
    } else if (c.status === "approved" && c.endDay < today && daysBetween(c.endDay, today) <= 3) {
      items.push({
        id: `ad-ended:${c.id}:${c.endDay}`, tone: "waiting", title: `انتهت حملة «${c.company}»`,
        detail: "جدّدها أو أرشِفها؛ أرقامها وتقريرها باقيان", view: "ads", at: `${c.endDay}T00:00:00Z`,
      });
    }
  }
  return items;
}

export interface AdsDeps {
  requireAuth: (req: any, res: Response, next: NextFunction) => void;
  requireRootAdmin: (req: any, res: Response, next: NextFunction) => void;
  publicPageNonce: (res: Response) => string;
}

/* ─────────────────────────── العدّاداتُ المجمَّعة ─────────────────────────── */

const pendingStats = new Map<string, Omit<AdStatsDay, "id">>();
const pendingAudience = new Map<string, Omit<AudienceDay, "id" | "day">>();

const bumpStat = (campaignId: string, creativeId: string, patch: Partial<Pick<AdStatsDay, "impressions" | "uniques" | "clicks" | "filteredClicks">>) => {
  const day = kuwaitDay();
  const key = `${campaignId}|${creativeId}|${day}`;
  const row = pendingStats.get(key) || { campaignId, creativeId, day, impressions: 0, uniques: 0, clicks: 0, filteredClicks: 0 };
  row.impressions += patch.impressions || 0; row.uniques += patch.uniques || 0; row.clicks += patch.clicks || 0; row.filteredClicks += patch.filteredClicks || 0;
  pendingStats.set(key, row);
};

export async function flushAdsCounters(): Promise<void> {
  if (pendingStats.size) {
    const rows = [...pendingStats.values()];
    pendingStats.clear();
    try { await Repository.addAdStats(rows); }
    catch (error) { for (const r of rows) bumpStat(r.campaignId, r.creativeId, r); console.error("[ads] stats flush failed:", error); }
  }
  if (pendingAudience.size) {
    const entries = [...pendingAudience.entries()];
    pendingAudience.clear();
    for (const [day, delta] of entries) {
      try { await Repository.addAudienceDay(day, delta); }
      catch (error) {
        /* نبضاتٌ جديدة قد وصلت لليوم نفسه أثناء الكتابة: تُدمج الدفعة الفاشلة فيها ولا تُسقَط. */
        const back = pendingAudience.get(day);
        pendingAudience.set(day, back ? mergeAudience(back, delta) : delta);
        console.error("[ads] audience flush failed:", error);
      }
    }
  }
}

const addMaps = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) out[key] = (out[key] || 0) + value;
  return out;
};
export const mergeAudience = (a: Omit<AudienceDay, "id" | "day">, b: Omit<AudienceDay, "id" | "day">): Omit<AudienceDay, "id" | "day"> => ({
  visits: addMaps(a.visits, b.visits), hours: addMaps(a.hours, b.hours),
  returning: a.returning + b.returning, fresh: a.fresh + b.fresh, mobile: a.mobile + b.mobile, desktop: a.desktop + b.desktop, installed: a.installed + b.installed,
});

const PULSE_KINDS = new Set(["me", "schedule", "status", "survey", "staff", "app", "install"]);

export function recordPulse(input: { kind: string; returning: boolean; mobile: boolean }, at = Date.now()): boolean {
  if (!PULSE_KINDS.has(input.kind)) return false;
  const day = kuwaitDay(at);
  const delta = pendingAudience.get(day) || { visits: {}, returning: 0, fresh: 0, mobile: 0, desktop: 0, installed: 0, hours: {} };
  if (input.kind === "install") delta.installed += 1;
  else {
    delta.visits[input.kind] = (delta.visits[input.kind] || 0) + 1;
    if (input.returning) delta.returning += 1; else delta.fresh += 1;
    if (input.mobile) delta.mobile += 1; else delta.desktop += 1;
    const hour = String(kuwaitHour(at));
    delta.hours[hour] = (delta.hours[hour] || 0) + 1;
  }
  pendingAudience.set(day, delta);
  return true;
}

/* ─────────────────────────── ذاكرةٌ مؤقتة صغيرة ─────────────────────────── */

let campaignCache: { at: number; rows: AdCampaign[] } | null = null;
const CAMPAIGN_TTL_MS = 15_000;
async function campaigns(): Promise<AdCampaign[]> {
  if (campaignCache && Date.now() - campaignCache.at < CAMPAIGN_TTL_MS) return campaignCache.rows;
  const rows = await Repository.listAdCampaigns();
  campaignCache = { at: Date.now(), rows };
  return rows;
}
const dropCampaignCache = () => { campaignCache = null; };

const imageCache = new Map<string, { at: number; mime: string; buf: Buffer; campaignId: string }>();
async function creativeImage(id: string): Promise<{ mime: string; buf: Buffer; campaignId: string } | null> {
  const hit = imageCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit;
  const row = await Repository.getAdCreative(id);
  if (!row) return null;
  const entry = { at: Date.now(), mime: row.mime, buf: Buffer.from(row.data, "base64"), campaignId: row.campaignId };
  if (imageCache.size >= 60) imageCache.delete(imageCache.keys().next().value as string);
  imageCache.set(id, entry);
  return entry;
}

/* ── سياق العرض: المواسم الفاعلة، وكلية الصفحة إن عرفتها ── */
let seasonsCache: { at: number; ids: string[] } | null = null;
async function currentSeasons(): Promise<string[]> {
  if (seasonsCache && Date.now() - seasonsCache.at < 60_000) return seasonsCache.ids;
  let ids: string[] = [];
  try { ids = activeSeasons(await Repository.getTerms()); } catch { ids = []; }
  seasonsCache = { at: Date.now(), ids };
  return ids;
}
/** نوعُ رابطٍ عام وكليتُه (من رمز الصفحة). الصفحة الواحدة قد تخدم أنواعاً (`/s/` تخدم جدول القسم وبطاقة الأستاذ والاستبيان)، فالنوع وحده يقرّر هل يجوز فيها إعلان. */
interface LinkInfo { known: boolean; kind: string; collegeId: number }
const tokenInfo = new Map<string, { at: number; info: LinkInfo }>();
async function linkInfo(raw: unknown): Promise<LinkInfo> {
  const token = String(raw ?? "").slice(0, 120);
  const none: LinkInfo = { known: false, kind: "", collegeId: 0 };
  if (!token || isDemoLinkToken(token)) return none;
  const hit = tokenInfo.get(token);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.info;
  let info = none;
  try {
    const link = await Repository.getShareLink(token);
    if (link) info = { known: true, kind: String(link.kind || "department"), collegeId: Number(link.AdCollegeId || 0) };
  } catch { info = none; }
  if (tokenInfo.size >= 500) tokenInfo.delete(tokenInfo.keys().next().value as string);
  tokenInfo.set(token, { at: Date.now(), info });
  return info;
}
/** أنواعُ الروابط التي يجوز فيها إعلان: جدولٌ للعرض فقط. بطاقةُ الأستاذ والاستبيان وطلبُ الجدول تطلب هويةً فلا إعلان فيها أبداً. */
const AD_LINK_KINDS = new Set(["department", "students"]);

/* ─────────────────────────── حدودٌ بسيطة ضد الإساءة ─────────────────────────── */

const windows = new Map<string, { n: number; at: number; ms: number }>();
function underLimit(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const cur = windows.get(key);
  if (!cur || now - cur.at >= windowMs) { windows.set(key, { n: 1, at: now, ms: windowMs }); return true; }
  cur.n += 1;
  return cur.n <= max;
}
const lastClick = new Map<string, number>();
/* نافذةٌ قصيرة ومفتاحٌ من العنوان ووكيل المتصفح معاً: شبكةُ الجامعة عنوانٌ واحد لآلاف الطلبة، فلا يُعدّ ثانيَ طالبٍ نقر بعد ثوانٍ مكرِّراً. */
const CLICK_REPEAT_MS = 4_000;
const clickWasRepeat = (key: string): boolean => {
  const now = Date.now();
  const prev = lastClick.get(key);
  lastClick.set(key, now);
  return prev !== undefined && now - prev < CLICK_REPEAT_MS;
};
/** يمحو مفاتيح الحدّ المنتهية (فيها العنوان): كل ٣٠ ثانية، فلا يبقى مفتاحٌ أكثر من دقيقتين. هذا ما تعد به صفحة «كيف نقيس؟». */
export function sweepLimiters(now = Date.now()): number {
  let removed = 0;
  for (const [k, v] of windows) if (now - v.at >= v.ms) { windows.delete(k); removed++; }
  for (const [k, t] of lastClick) if (now - t >= CLICK_REPEAT_MS) { lastClick.delete(k); removed++; }
  return removed;
}
export const limiterSizes = () => ({ windows: windows.size, clicks: lastClick.size });

/* ─────────────────────────── حقنُ السكربت في الصفحات العامة ─────────────────────────── */

interface InjectPlan { pulse: string; slot: string }

/** أيُّ صفحةٍ تحمل نبضاً، وأيُّها تحمل إعلاناً. الاستبيانُ وبطاقةُ الأستاذ نبضٌ فقط: صفحاتُ هويةٍ لا إعلان فيها أبداً. */
export function injectPlanFor(path: string): InjectPlan | null {
  const clean = path.split("?")[0].split("#")[0];
  /* «مساري» نبضٌ فقط من الحقن: أولُ شاشةٍ فيه تطلب الرقم المدني، فالإعلان لا يُركَّب إلا بعد الدخول (من صفحة «مساري» نفسها). */
  if (clean === "/me" || clean === "/me/") return { pulse: "me", slot: "" };
  const head = PUBLIC_LINK_PAGE_PREFIXES.find(prefix => clean.startsWith(prefix));
  if (!head) return null;
  const token = decodeURIComponent(clean.slice(head.length).split("/")[0] || "");
  if (!token || isDemoLinkToken(token)) return null;
  const rest = clean.slice(head.length + token.length);
  switch (head) {
    case "/s/": return rest === "" || rest === "/" ? { pulse: "schedule", slot: "schedule" } : null;
    case "/t/": return rest === "" || rest === "/" ? { pulse: "schedule", slot: "schedule" } : null;
    case "/m/": return rest === "" || rest === "/" ? { pulse: "status", slot: "" } : null;
    case "/q/": return rest === "" || rest === "/" ? { pulse: "survey", slot: "" } : null;
    case "/r/": return { pulse: "staff", slot: "" };
    default: return null;
  }
}

export function injectionSnippet(plan: InjectPlan, nonce: string): string {
  const box = plan.slot ? `<aside id="adx" class="adx" aria-label="إعلان" dir="rtl"></aside>` : "";
  const attrs = `nonce="${nonce}" src="/_ads/ad.js?v=1" defer data-pulse="${plan.pulse}"${plan.slot ? ` data-slot="${plan.slot}"` : ""}`;
  return `${box}<script ${attrs}></script>`;
}

/** يلفّ res.send لصفحات HTML العامة فيُدخل النبضَ (والإعلانَ حيث يجوز) قبل </body>. */
export function adInjection(): express.RequestHandler {
  return (req, res, next) => {
    if (req.method !== "GET") { next(); return; }
    let plan: InjectPlan | null = null;
    try { plan = injectPlanFor(req.path); } catch { plan = null; }
    if (!plan) { next(); return; }
    const send = res.send.bind(res);
    res.send = ((body?: any) => {
      try {
        if (typeof body === "string" && res.statusCode === 200 && /text\/html/i.test(String(res.getHeader("Content-Type") || ""))) {
          const nonce = /'nonce-([^']+)'/.exec(String(res.getHeader("Content-Security-Policy") || ""))?.[1];
          const at = body.lastIndexOf("</body>");
          if (nonce && at > -1) body = body.slice(0, at) + injectionSnippet(plan, nonce) + body.slice(at);
        }
      } catch { /* الصفحة الأصلية أهم من القياس */ }
      return send(body);
    }) as typeof res.send;
    next();
  };
}

/* ─────────────────────────── مساعداتُ الإدارة ─────────────────────────── */

const newToken = () => randomBytes(24).toString("base64url");
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

async function campaignView(c: AdCampaign, stats: AdStatsDay[], heads: Array<Omit<AdCreative, "data">>, all: AdCampaign[], today: string) {
  const mine = stats.filter(s => s.campaignId === c.id);
  const creatives = heads.filter(h => h.campaignId === c.id);
  const live = all.filter(x => x.slot === c.slot && isLive(x, today)).length;
  return {
    ...c,
    slotLabel: slotById(c.slot)?.label || c.slot,
    phase: phaseOf(c, today),
    daysLeft: daysLeft(c, today),
    endingSoon: endingSoon(c, today),
    creatives,
    totals: totalsOf(mine),
    breakdown: creativeBreakdown(mine),
    ab: abVerdict(c.creativeIds.map(id => creativeBreakdown(mine).find(b => b.creativeId === id) ?? { creativeId: id, impressions: 0, clicks: 0 })),
    series: dailySeries(mine, c.startDay, c.endDay, today).slice(-30),
    weekly: weeklyCompare(mine, today),
    sharePct: Math.round(expectedShare(c.slot, Math.max(1, live)) * 100),
    reportUrl: `/ad-report/${c.reportToken}`,
  };
}

/** يرسل تقرير الأسبوع أو تذكير التجديد لبريد الحملة ويسجّل ما أُرسل لئلا يتكرر. */
async function mailCampaign(c: AdCampaign, kind: "weekly" | "renewal", origin: string, cfg: NonNullable<ReturnType<typeof mailConfig>>, today = kuwaitDay(), manual = false): Promise<{ ok: boolean; error?: string }> {
  if (!c.contactEmail) return { ok: false, error: "لا بريد." };
  const url = `${origin}/ad-report/${c.reportToken}`;
  const msg = kind === "weekly"
    ? weeklyMail(c, weeklyCompare((await Repository.listAdStats(c.id)), today), url)
    : renewalMail(c, daysLeft(c, today), url);
  /* يُحجز الإرسال ذرّياً قبل خروج الرسالة (معاملة تكتب mailLog وحده): نسختان على قاعدةٍ واحدة لا ترسلان الرسالة مرتين،
     وخطأٌ عابر لا يُغرق الشركة بالتكرار. الإرسال اليدوي (manual) صريحٌ فلا يُمنع بحجزٍ سابق. */
  const key = kind === "weekly" ? weekKey(today) : c.endDay;
  const claimed = await Repository.claimAdMail(c.id, kind, key, { weekly: weekKey(today), ...(kind === "renewal" ? { renewal: c.endDay } : {}) }, manual);
  dropCampaignCache();
  if (!claimed) return { ok: false, error: "سبق إرسال هذه الرسالة." };
  return sendMail(cfg, c.contactEmail, msg);
}

/** الإرسال التلقائي: تقريرٌ أسبوعي صباح الأحد، وتذكيرُ تجديدٍ مرةً واحدة قبل النهاية بأسبوع. لا يعمل بلا إعدادات البريد. */
export async function autoMailTick(origin: string, now = new Date()): Promise<number> {
  const cfg = mailConfig();
  if (!cfg) return 0;
  const today = kuwaitDay(now);
  const kuwaitHour = (now.getUTCHours() + 3) % 24;
  let sent = 0;
  for (const c of await campaigns()) {
    if (!c.contactEmail || c.status !== "approved" || !isLive(c, today)) continue;
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    if (!(dow === 0 && kuwaitHour >= 9) || c.mailLog?.weekly === weekKey(today)) continue;
    /* رسالةٌ واحدة في الأسبوع: تذكيرُ التجديد (في آخر أسبوع) يغني عن التقرير الأسبوعي ذاك الأحد. */
    const left = daysLeft(c, today);
    const kind = left <= 7 && left >= 0 && c.mailLog?.renewal !== c.endDay ? "renewal" : "weekly";
    if ((await mailCampaign(c, kind, origin, cfg, today)).ok) sent++;
  }
  return sent;
}

/* قراءاتُ اللوحة الثقيلة (ملفات الطلبة، وإجابات كل الفصول، وطلبات الأساتذة، وعدّادات الإعلانات) تُخزَّن مؤقتاً:
   اللوحة تتحدث كل دقيقة، وهذه الأرقام لا تتغير في دقيقة بما يستحق آلاف قراءات Firestore. الزيارات والحملات تُقرأ طازجةً. */
const HEAVY_TTL_MS = 5 * 60_000;
type Heavy = { at: number; terms: AdTerm[]; courses: AdCourse[]; profiles: StudentProfile[]; needsByTerm: Map<number, StudentNeed[]>; requests: Map<number, { at: number; rows: InstructorRequest[] }> };
let heavy: Heavy | null = null;
let adStatsCache: { at: number; rows: AdStatsDay[] } | null = null;

async function heavyInputs(): Promise<Heavy> {
  if (heavy && Date.now() - heavy.at < HEAVY_TTL_MS) return heavy;
  const [terms, profiles, courses] = await Promise.all([Repository.getTerms(), Repository.listStudentProfiles(), Repository.getCourses()]);
  const needsByTerm = new Map<number, StudentNeed[]>();
  /* كل الفصول، لا الأحدث فقط: إجمالي «عبر الفصول» يجب أن يشمل كل ما أجابه الطلبة. */
  await Promise.all(terms.map(async term => { needsByTerm.set(Number(term.AdTermId), await Repository.getStudentNeedsForTerm(Number(term.AdTermId))); }));
  heavy = { at: Date.now(), terms, courses, profiles, needsByTerm, requests: new Map() };
  return heavy;
}

async function audienceInputs(requestedTermId: number) {
  const h = await heavyInputs();
  const [days, camps] = await Promise.all([Repository.listAudienceDays(120), campaigns()]);
  if (!adStatsCache || Date.now() - adStatsCache.at > 60_000) adStatsCache = { at: Date.now(), rows: await Repository.listAdStats() };
  const recent = [...h.terms].sort((a, b) => Number(b.AdTermId) - Number(a.AdTermId)).slice(0, 12);
  const withAnswers = recent.find(term => (h.needsByTerm.get(Number(term.AdTermId)) || []).length > 0);
  const current = recent.find(term => Number(term.AdTermId) === requestedTermId) || withAnswers || recent[0];
  const currentTermId = current ? Number(current.AdTermId) : 0;
  let requests: InstructorRequest[] = [];
  if (currentTermId) {
    const hit = h.requests.get(currentTermId);
    if (hit && Date.now() - hit.at < HEAVY_TTL_MS) requests = hit.rows;
    else { requests = await Repository.getInstructorRequests(0, 0, currentTermId); h.requests.set(currentTermId, { at: Date.now(), rows: requests }); }
  }
  return {
    termChoices: recent.map(term => ({ id: Number(term.AdTermId), name: term.AdTermName })),
    input: { now: new Date(), terms: h.terms, currentTermId, needsByTerm: h.needsByTerm, instructorRequests: requests, profiles: h.profiles, courses: h.courses, days, campaigns: camps, adStats: adStatsCache.rows },
  };
}

/* ─────────────────────────── التسجيل ─────────────────────────── */

export function registerAdsRoutes(app: Express, deps: AdsDeps): void {
  const timer = setInterval(() => { sweepLimiters(); void flushAdsCounters(); }, 30_000);
  timer.unref?.();
  /* الإرسال التلقائي بالبريد: فحصٌ كل ساعة، ولا يفعل شيئاً ما لم يُفعَّل البريد بإعدادات البيئة. */
  const mailTimer = setInterval(() => { void autoMailTick(String(process.env.AD_PUBLIC_ORIGIN || "https://schedule.dr-alfailakawi.com")).catch(() => undefined); }, 3_600_000);
  mailTimer.unref?.();
  /* تسجيل مستمعٍ لـSIGTERM/SIGINT يُلغي إنهاء Node الافتراضي: كان المستمع يفرّغ العدّادات ولا ينهي العملية، فيبقى الخادم حيّاً
     بعد إيقافه (Ctrl-C، وإيقاف المنصة، وخوادم الاختبارات اليتيمة على المنفذ 3000). نفرّغ ثم ننهي، بمهلة تحمي من تعليق الكتابة. */
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => {
    const finish = () => process.exit(signal === "SIGINT" ? 130 : 0);
    const guard = setTimeout(finish, 4_000);
    guard.unref?.();
    flushAdsCounters().catch(() => { /* الإنهاءُ أهمّ من العدّاد */ }).finally(() => { clearTimeout(guard); finish(); });
  });

  /* ── العامة ── */
  app.get("/_ads/ad.js", (_req, res) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(AD_CLIENT_SCRIPT);
  });

  app.get("/_ads/serve", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const slotId = String(req.query.slot || "");
    const slot = slotById(slotId);
    if (!slot || slot.id === "sponsor") { res.json({ items: [], sponsor: null, rotateMs: 9000 }); return; }
    const today = kuwaitDay();
    /* صفحةٌ برمزٍ (جدولٌ أو حالة): لا إعلان إلا لرابطٍ معروفٍ من نوع جدولٍ للعرض. وبلا رمزٍ («مساري») يُعرض بلا سياق كلية. */
    const hasToken = Boolean(String(req.query.t || ""));
    const link = hasToken ? await linkInfo(req.query.t) : null;
    if (link && (!link.known || !AD_LINK_KINDS.has(link.kind))) { res.json({ items: [], sponsor: null, rotateMs: 9000 }); return; }
    /* «مساري» والاستراحة بلا رابط: الصفحةُ تعرف كلية الطالب بعد إكمال ملفه وترسلها رقماً مجرّداً (c). رقمٌ عامٌّ لا يدلّ على أحد،
       ولا يغيّر إلا أي إعلانٍ يراه صاحبُه هو. أما صفحات الروابط فكليتُها من الرابط نفسه لا من الطلب. */
    const claimed = Number.parseInt(String(req.query.c || ""), 10);
    const profileCollege = !hasToken && slot.wholeUniversity && Number.isInteger(claimed) && claimed > 0 && claimed < 100_000 ? claimed : undefined;
    const ctx = { today, seasons: await currentSeasons(), collegeId: link?.collegeId || profileCollege };
    const live = (await campaigns()).filter(c => eligibleNow(c, ctx));
    const heads = new Map((await Promise.all([...new Set(live.flatMap(c => c.creativeIds))].map(async id => [id, await Repository.getAdCreative(id)] as const))).filter(([, v]) => v).map(([k, v]) => [k, v!] as const));
    const itemFor = (c: AdCampaign) => {
      const ids = c.creativeIds.filter(id => heads.has(id));
      if (!ids.length) return null;
      const creativeId = ids[Math.floor(Math.random() * ids.length)];
      const spec = slotById(c.slot)!;
      return {
        c: c.id, k: creativeId, img: `/_ads/img/${creativeId}`, href: `/_ads/c/${c.id}/${creativeId}`,
        alt: `إعلان — ${c.company}`, coupon: c.coupon || "", w: spec.width, h: spec.height,
      };
    };
    const items = rotationOrder(live.filter(c => c.slot === slot.id).map(itemFor).filter(Boolean) as NonNullable<ReturnType<typeof itemFor>>[]);
    const sponsorCampaign = live.find(c => c.slot === "sponsor");
    res.json({ items, sponsor: sponsorCampaign ? itemFor(sponsorCampaign) : null, rotateMs: 9000 });
  });

  app.get("/_ads/img/:id", async (req, res) => {
    const image = await creativeImage(String(req.params.id));
    const owner = image ? (await campaigns()).find(c => c.id === image.campaignId) : undefined;
    if (!image || !owner || owner.status === "draft") { res.status(404).end(); return; }
    res.setHeader("Content-Type", image.mime);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    res.send(image.buf);
  });

  app.get("/_ads/c/:cid/:crid", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex");
    const today = kuwaitDay();
    const campaign = (await campaigns()).find(c => c.id === String(req.params.cid));
    const creativeId = String(req.params.crid);
    if (!campaign || !isLive(campaign, today) || !campaign.creativeIds.includes(creativeId)) { res.redirect(302, "/"); return; }
    const ip = String(req.ip || "?");
    const filtered = looksAutomated(req.headers["user-agent"]) || clickWasRepeat(`${ip}|${String(req.headers["user-agent"] || "").slice(0, 160)}|${campaign.id}`) || !underLimit(`click|${ip}`, 120);
    bumpStat(campaign.id, creativeId, filtered ? { filteredClicks: 1 } : { clicks: 1 });
    res.redirect(302, campaign.linkUrl);
  });

  app.post("/_ads/e", express.json({ limit: "8kb" }), async (req, res) => {
    res.status(204);
    const ip = String(req.ip || "?");
    if (looksAutomated(req.headers["user-agent"]) || !underLimit(`ev|${ip}`, 2400)) { res.end(); return; }
    const events = Array.isArray(req.body?.e) ? req.body.e.slice(0, 20) : [];
    if (events.length) {
      const today = kuwaitDay();
      const live = new Map((await campaigns()).filter(c => isLive(c, today)).map(c => [c.id, c] as const));
      for (const e of events) {
        const campaign = live.get(String(e?.c || ""));
        const creativeId = String(e?.k || "");
        if (!campaign || !campaign.creativeIds.includes(creativeId)) continue;
        bumpStat(campaign.id, creativeId, { impressions: 1, uniques: e?.u ? 1 : 0 });
      }
    }
    res.end();
  });

  app.post("/_pulse", express.json({ limit: "1kb" }), async (req, res) => {
    res.status(204);
    const ip = String(req.ip || "?");
    if (looksAutomated(req.headers["user-agent"]) || !underLimit(`pulse|${ip}`, 3000)) { res.end(); return; }
    let kind = String(req.body?.k || "");
    /* `/s/` تخدم جدول القسم وبطاقة الأستاذ والاستبيان: النبضُ يُنسب إلى نوع الرابط الحقيقي لا إلى المسار. */
    if (kind === "schedule" && req.body?.t) {
      const link = await linkInfo(req.body.t);
      if (link.known && (link.kind === "staff" || link.kind === "request")) kind = "staff";
      else if (link.known && link.kind === "survey") kind = "survey";
    }
    recordPulse({ kind, returning: Boolean(req.body?.r), mobile: Boolean(req.body?.m) });
    res.end();
  });

  /* ── صفحاتُ الشركاء ── */
  const noindex = (res: Response) => { res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("X-Robots-Tag", "noindex, nofollow"); };
  const missing = (res: Response) => { noindex(res); res.status(404).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>غير موجود</title><body style="font-family:system-ui;text-align:center;margin-top:80px" dir="rtl"><h2>الرابط غير صالح</h2><p>تحقق من الرابط الذي وصلك من الإدارة.</p></body>`); };

  /* سياسةُ القياس: عامةٌ بلا رمز، يصل إليها الطالب من السطر تحت الإعلان. */
  app.get("/measurement", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=600");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.send(measurementPage(deps.publicPageNonce(res)));
  });

  /* اشتراكُ تقويمٍ للشركة (تنبيهاتٌ بلا حساب): الرمزُ هو الهوية. بلا بياناتٍ تتجاوز اسمَ الشركة وتواريخَ حملتها وهي تعرفها. */
  app.get("/ad-report/:token/calendar.ics", async (req, res) => {
    const token = String(req.params.token || "");
    const campaign = token.length >= 20 ? (await Repository.listAdCampaigns()).find(c => c.reportToken === token) : undefined;
    if (!campaign) { missing(res); return; }
    noindex(res);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "private, max-age=600");
    if (req.query.dl) res.setHeader("Content-Disposition", 'attachment; filename="campaign.ics"');
    res.send(reportCalendar(campaign, `${req.protocol}://${req.get("host")}/ad-report/${token}`, kuwaitDay()));
  });

  app.get("/ad-report/:token", async (req, res) => {
    const token = String(req.params.token || "");
    const campaign = token.length >= 20 ? (await Repository.listAdCampaigns()).find(c => c.reportToken === token) : undefined;
    if (!campaign) { missing(res); return; }
    await flushAdsCounters();
    const [heads, stats, all] = await Promise.all([Repository.listAdCreativeHeads(campaign.id), Repository.listAdStats(campaign.id), campaigns()]);
    const today = kuwaitDay();
    noindex(res);
    const nonce = deps.publicPageNonce(res);
    const allStats = await Repository.listAdStats();
    res.send(campaignReportPage({
      campaign, creatives: heads, stats, nonce, today, origin: `${req.protocol}://${req.get("host")}`,
      weekly: weeklyCompare(stats, today), benchmarkCtr: slotBenchmarkCtr(campaign.id, campaign.slot, all, allStats),
      liveInSlot: Math.max(1, all.filter(x => x.slot === campaign.slot && isLive(x, today)).length),
    }));
  });

  app.get("/partners/:token", async (req, res) => {
    const token = String(req.params.token || "");
    const expected = await Repository.getPartnerKitToken();
    if (!expected || token.length < 20 || token !== expected) { missing(res); return; }
    await flushAdsCounters();
    const { input } = await audienceInputs(0);
    const today = kuwaitDay();
    const liveBySlot: Record<string, number> = {};
    for (const c of input.campaigns) if (isLive(c, today)) liveBySlot[c.slot] = (liveBySlot[c.slot] || 0) + 1;
    noindex(res);
    const nonce = deps.publicPageNonce(res);
    res.send(partnerKitPage({ stats: buildAudienceStats(input), liveBySlot, nonce, today, calendar: seasonCalendar(input.terms as any), activeSeasons: activeSeasons(input.terms as any) }));
  });

  /* ── الإدارة ── */
  const admin: express.RequestHandler[] = [deps.requireAuth as express.RequestHandler, deps.requireRootAdmin as express.RequestHandler];
  const fail = (res: Response, status: number, error: string, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
  /* سجلّ التدقيق: كل عملية كتابة تُسجَّل تلقائياً (middleware في server.ts)، وهنا نسمّي كيانها ونصف ما جرى بالعربية. */
  const audit = (res: Response, id: string, text: string) => { res.locals.auditEntity = "ads"; res.locals.auditEntityId = id; res.locals.auditChanges = text.slice(0, 400); };

  app.get("/api/admin/audience-stats", ...admin, async (req: Request, res: Response) => {
    await flushAdsCounters();
    const { input, termChoices } = await audienceInputs(Number(req.query.termId || 0));
    res.json({ ...buildAudienceStats(input), termChoices });
  });

  app.get("/api/admin/ads", ...admin, async (_req: Request, res: Response) => {
    await flushAdsCounters();
    dropCampaignCache();
    const [all, stats, heads, kit, terms, colleges] = await Promise.all([campaigns(), Repository.listAdStats(), Repository.listAdCreativeHeads(), Repository.getPartnerKitToken(), Repository.getTerms(), Repository.getColleges()]);
    const today = kuwaitDay();
    const rows = await Promise.all(all.map(c => campaignView(c, stats, heads, all, today)));
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const slots = activeSlots().map(slot => ({
      ...slot,
      live: all.filter(c => c.slot === slot.id && isLive(c, today)).length,
      nextFree: nextFreeDay(slot.id, all, today),
    }));
    res.json({
      today, mailEnabled: Boolean(mailConfig()), slots, categories: AD_CATEGORIES, rules: AD_RULES, maxBytes: AD_MAX_BYTES, maxCreatives: MAX_ROTATE_CREATIVES, campaigns: rows, partnerKit: kit ? `/partners/${kit}` : "",
      seasons: SEASONS, activeSeasons: activeSeasons(terms), calendar: seasonCalendar(terms),
      /* أسماء الكليات للأدمن وحده هنا (يختار منها استهداف الحملة)؛ لا تصل إلى أي صفحةٍ عامة. */
      colleges: colleges.map(c => ({ id: Number(c.AdCollegeId), name: c.AdCollegeName })),
    });
  });

  const readBody = (b: any) => ({
    ...(b && "contactEmail" in b ? { contactEmail: cleanEmail(b.contactEmail) ?? "\u0000bad" } : {}),
    company: str(b?.company, 80), category: str(b?.category, 40), slot: str(b?.slot, 20),
    startDay: str(b?.startDay, 10), endDay: str(b?.endDay, 10), coupon: cleanCoupon(b?.coupon),
    note: str(b?.note, 300), trial: Boolean(b?.trial),
    seasons: cleanSeasons(b?.seasons), colleges: cleanColleges(b?.colleges),
  });

  app.post("/api/admin/ads/campaigns", ...admin, async (req: Request, res: Response) => {
    const body = readBody(req.body);
    const link = cleanLink(req.body?.linkUrl);
    const id = str(req.body?.id, 60);
    const existing = id ? (await campaigns()).find(c => c.id === id) : undefined;
    if (id && !existing) { fail(res, 404, "الحملة غير موجودة."); return; }
    const trialRegistry = Object.fromEntries((await Repository.getTrialCompanies()).map(item => [item.name, item.campaignId]));
    if ((body as any).contactEmail === "\u0000bad") { fail(res, 400, "بريد الشركة غير صالح."); return; }
    const problems = [...campaignProblems({ id, ...body }), ...trialProblems({ id, ...body }, await campaigns(), trialRegistry), ...(link.problem ? [link.problem] : [])];
    if (problems.length) { fail(res, 400, problems[0], { problems }); return; }
    const now = new Date().toISOString();
    let row: AdCampaign;
    if (existing) {
      row = { ...existing, ...body, linkUrl: link.url, updatedAt: now };
      /* تغييرُ ما يمسّ الموقع أو الفئة أو التواريخ في حملةٍ معتمدة يعيدها مسودةً لتُعتمد من جديد. */
      const same = <T,>(a: readonly T[] | undefined, b: readonly T[] | undefined) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
      const moved = existing.slot !== row.slot || existing.category !== row.category || existing.startDay !== row.startDay || existing.endDay !== row.endDay
        || !same(existing.seasons, row.seasons) || !same(existing.colleges, row.colleges);
      /* تغييرُ الموقع أو الفئة أو التواريخ يعيدها مسودةً: لا تعمل بالمواصفات الجديدة إلا بعد اعتمادٍ جديد
         (يُفحص فيه التعارض وتُقرّ الشروط من جديد). */
      if (existing.status === "approved" && moved) row.status = "draft";
      if (existing.slot !== row.slot && row.creativeIds.length) {
        fail(res, 409, "لا يمكن تغيير الموقع بعد رفع صور؛ مقاس الصور مرتبطٌ بالموقع. أنشئ حملةً جديدة.");
        return;
      }
    } else {
      row = { id: randomUUID(), ...body, linkUrl: link.url, creativeIds: [], status: "draft", reportToken: newToken(), createdAt: now, updatedAt: now };
    }
    await Repository.saveAdCampaign(row);
    /* التجربة تُسجَّل في سجلٍّ دائم: فكّ وسمها أو حذف حملتها لا يعيد للشركة تجربتها. */
    if (row.trial) await Repository.addTrialCompany(normCompany(row.company), row.id);
    dropCampaignCache();
    audit(res, row.id, existing
      ? `تعديل حملة «${row.company}»${existing.status === "approved" && row.status === "draft" ? " — عادت مسودةً لتغيّر موقعها أو فئتها أو تواريخها" : ""} · ${row.startDay} ← ${row.endDay}`
      : `إنشاء حملة «${row.company}» · موقع ${slotById(row.slot)?.label || row.slot} · ${row.startDay} ← ${row.endDay}${row.trial ? " · تجريبية" : ""} · ${seasonsText(row.seasons)}${row.colleges?.length ? ` · ${countOf(row.colleges.length, AR.college)} مستهدفة` : ""}`);
    res.json({ ok: true, id: row.id });
  });

  /* إرسالٌ يدوي لتقرير الشركة أو تذكير تجديدها بالبريد (يعمل فقط إن فُعّل البريد وكان للحملة بريد). */
  app.post("/api/admin/ads/campaigns/:id/send-report", ...admin, async (req: Request, res: Response) => {
    const campaign = (await campaigns()).find(c => c.id === String(req.params.id));
    if (!campaign) { fail(res, 404, "الحملة غير موجودة."); return; }
    const cfg = mailConfig();
    if (!cfg) { fail(res, 503, "الإرسال بالبريد غير مفعّل بعد؛ يُفعَّل بإعدادات البيئة (AD_MAIL_API_KEY وAD_MAIL_FROM)."); return; }
    if (!campaign.contactEmail) { fail(res, 400, "لا بريد محفوظ لهذه الحملة؛ أضفه من «تعديل»."); return; }
    const kind = req.body?.kind === "renewal" ? "renewal" : "weekly";
    const out = await mailCampaign(campaign, kind, `${req.protocol}://${req.get("host")}`, cfg, kuwaitDay(), true);
    if (!out.ok) { fail(res, 502, out.error || "تعذّر الإرسال."); return; }
    audit(res, campaign.id, `إرسال ${kind === "renewal" ? "تذكير تجديد" : "التقرير الأسبوعي"} بالبريد لحملة «${campaign.company}»`);
    res.json({ ok: true });
  });

  app.post("/api/admin/ads/campaigns/:id/creatives", ...admin, express.raw({ type: () => true, limit: `${Math.ceil(AD_MAX_BYTES * 1.1)}b` }), async (req: Request, res: Response) => {
    const campaign = (await campaigns()).find(c => c.id === String(req.params.id));
    if (!campaign) { fail(res, 404, "الحملة غير موجودة."); return; }
    if (campaign.creativeIds.length >= MAX_ROTATE_CREATIVES) { fail(res, 409, `الحد الأقصى ${MAX_ROTATE_CREATIVES} صورتين للمقارنة.`); return; }
    /* جسمُ الطلب قد يكون أي نوعٍ يرسله العميل؛ لا يُقبل إلا بايتات حقيقية، وتُنسخ قبل أن تُقرأ. */
    const raw: unknown = req.body;
    const buf = raw instanceof Uint8Array ? Buffer.from(raw) : Buffer.alloc(0);
    const problem = creativeProblem(campaign.slot, buf.length, readImageInfo(buf));
    if (problem) { fail(res, 400, problem); return; }
    const info = readImageInfo(buf)!;
    /* جودةُ المحتوى: فراغ، شفافية، تباين، تفاصيل. للإدارة أن تتجاوز التحذير بقرارٍ صريح (يُسجَّل). */
    const quality = await analyzeCreative(buf);
    const override = String(req.headers["x-quality-override"] || "") === "1";
    if (quality.problems.length && !override) { fail(res, 422, quality.problems[0], { code: "quality", problems: quality.problems, metrics: quality.metrics }); return; }
    let label = campaign.creativeIds.length === 0 ? "الصورة أ" : "الصورة ب";
    try { label = str(decodeURIComponent(String(req.headers["x-label"] || "")), 40) || label; } catch { /* يبقى الافتراضي */ }
    const creative: AdCreative = {
      id: randomUUID(), campaignId: campaign.id, label, mime: info.mime, width: info.width, height: info.height,
      bytes: buf.length, data: buf.toString("base64"), createdAt: new Date().toISOString(),
      ...(quality.problems.length && override ? { qualityOverride: true } : {}),
    };
    await Repository.saveAdCreative(creative);
    await Repository.saveAdCampaign({ ...campaign, creativeIds: [...campaign.creativeIds, creative.id], updatedAt: creative.createdAt });
    dropCampaignCache();
    audit(res, campaign.id, `رفع صورة «${creative.label}» (${creative.width}×${creative.height}) لحملة «${campaign.company}»${creative.qualityOverride ? " — رغم تحذير فحص الجودة بقرار الإدارة" : ""}`);
    res.json({ ok: true, id: creative.id });
  });

  /* معاينةٌ للأدمن لصور المسودات (العامة لا تخدم المسودات). */
  app.get("/api/admin/ads/creatives/:id/img", ...admin, async (req: Request, res: Response) => {
    const image = await creativeImage(String(req.params.id));
    if (!image) { res.status(404).end(); return; }
    res.setHeader("Content-Type", image.mime);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(image.buf);
  });

  app.delete("/api/admin/ads/campaigns/:id/creatives/:crid", ...admin, async (req: Request, res: Response) => {
    const campaign = (await campaigns()).find(c => c.id === String(req.params.id));
    const crid = String(req.params.crid);
    if (!campaign || !campaign.creativeIds.includes(crid)) { fail(res, 404, "الصورة غير موجودة."); return; }
    if (campaign.status === "approved" && campaign.creativeIds.length <= 1) { fail(res, 409, "أوقف الحملة أو أعدها مسودةً قبل حذف صورتها الوحيدة."); return; }
    await Repository.deleteAdCreative(crid);
    imageCache.delete(crid);
    await Repository.saveAdCampaign({ ...campaign, creativeIds: campaign.creativeIds.filter(id => id !== crid), updatedAt: new Date().toISOString() });
    dropCampaignCache();
    audit(res, campaign.id, `حذف صورة من حملة «${campaign.company}»`);
    res.json({ ok: true });
  });

  app.post("/api/admin/ads/campaigns/:id/status", ...admin, async (req: Request, res: Response) => {
    const all = await campaigns();
    const campaign = all.find(c => c.id === String(req.params.id));
    if (!campaign) { fail(res, 404, "الحملة غير موجودة."); return; }
    const action = String(req.body?.action || "");
    const now = new Date().toISOString();
    if (action === "approve" || action === "resume") {
      if (!req.body?.rulesAccepted) { fail(res, 400, "أقرّ بشروط الإعلان قبل الاعتماد."); return; }
      if (!campaign.creativeIds.length) { fail(res, 409, "ارفع صورةً واحدةً على الأقل قبل الاعتماد."); return; }
      const problems = [
        ...campaignProblems(campaign),
        ...(cleanLink(campaign.linkUrl).problem ? [cleanLink(campaign.linkUrl).problem] : []),
        ...placementProblems(campaign, all.filter(c => c.id !== campaign.id)),
      ];
      if (problems.length) { fail(res, 409, problems[0], { problems }); return; }
      await Repository.saveAdCampaign({ ...campaign, status: "approved", approvedAt: campaign.approvedAt || now, updatedAt: now });
    } else if (action === "pause") {
      await Repository.saveAdCampaign({ ...campaign, status: "paused", updatedAt: now });
    } else if (action === "draft") {
      await Repository.saveAdCampaign({ ...campaign, status: "draft", updatedAt: now });
    } else { fail(res, 400, "إجراءٌ غير معروف."); return; }
    dropCampaignCache();
    audit(res, campaign.id, `حملة «${campaign.company}»: ${({ approve: "اعتماد", resume: "استئناف", pause: "إيقاف فوري", draft: "إعادة إلى مسودة" } as Record<string, string>)[action]}${action === "approve" || action === "resume" ? " بإقرار الشروط" : ""}`);
    res.json({ ok: true });
  });

  app.delete("/api/admin/ads/campaigns/:id", ...admin, async (req: Request, res: Response) => {
    const campaign = (await campaigns()).find(c => c.id === String(req.params.id));
    if (!campaign) { fail(res, 404, "الحملة غير موجودة."); return; }
    if (isLive(campaign)) { fail(res, 409, "الحملة تعمل الآن؛ أوقفها أولاً."); return; }
    await Repository.deleteAdCampaign(campaign.id);
    for (const id of campaign.creativeIds) imageCache.delete(id);
    dropCampaignCache();
    audit(res, campaign.id, `حذف حملة «${campaign.company}» نهائياً`);
    res.json({ ok: true });
  });

  app.post("/api/admin/ads/campaigns/:id/rotate-report", ...admin, async (req: Request, res: Response) => {
    const campaign = (await campaigns()).find(c => c.id === String(req.params.id));
    if (!campaign) { fail(res, 404, "الحملة غير موجودة."); return; }
    await Repository.saveAdCampaign({ ...campaign, reportToken: newToken(), updatedAt: new Date().toISOString() });
    dropCampaignCache();
    audit(res, campaign.id, `تجديد رابط تقرير حملة «${campaign.company}» (الرابط القديم لم يعد يعمل)`);
    res.json({ ok: true });
  });

  app.post("/api/admin/ads/partner-kit", ...admin, async (_req: Request, res: Response) => {
    const token = newToken();
    await Repository.setPartnerKitToken(token);
    audit(res, "partner-kit", "إنشاء أو تجديد رابط ملف الشراكة (الرابط القديم لم يعد يعمل)");
    res.json({ ok: true, url: `/partners/${token}` });
  });
}
