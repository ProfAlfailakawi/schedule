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
import type { AdCampaign, AdCreative, AdStatsDay, AudienceDay, StudentNeed } from "../types";
import { PUBLIC_LINK_PAGE_PREFIXES, isDemoLinkToken } from "../utils/demoLinkToken";
import {
  AD_CATEGORIES, AD_MAX_BYTES, AD_RULES, AD_SLOTS, MAX_ROTATE_CREATIVES, campaignProblems, cleanCoupon, cleanLink,
  creativeBreakdown, creativeProblem, daysLeft, endingSoon, expectedShare, isLive, kuwaitDay, kuwaitHour,
  looksAutomated, nextFreeDay, phaseOf, placementProblems, readImageInfo, rotationOrder, slotById, totalsOf, dailySeries,
} from "../utils/adsEngine";
import { buildAudienceStats } from "../utils/audienceStats";
import { AD_CLIENT_SCRIPT } from "./adClientScript";
import { campaignReportPage, partnerKitPage } from "./adsPages";

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
        const back = pendingAudience.get(day);
        if (!back) pendingAudience.set(day, delta);
        console.error("[ads] audience flush failed:", error);
      }
    }
  }
}

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

/* ─────────────────────────── حدودٌ بسيطة ضد الإساءة ─────────────────────────── */

const windows = new Map<string, { n: number; at: number }>();
function underLimit(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  if (windows.size > 20_000) for (const [k, v] of windows) if (now - v.at > windowMs) windows.delete(k);
  const cur = windows.get(key);
  if (!cur || now - cur.at >= windowMs) { windows.set(key, { n: 1, at: now }); return true; }
  cur.n += 1;
  return cur.n <= max;
}
const lastClick = new Map<string, number>();
const clickWasRepeat = (key: string): boolean => {
  const now = Date.now();
  if (lastClick.size > 8000) for (const [k, t] of lastClick) if (now - t > 60_000) lastClick.delete(k);
  const prev = lastClick.get(key);
  lastClick.set(key, now);
  return prev !== undefined && now - prev < 10_000;
};

/* ─────────────────────────── حقنُ السكربت في الصفحات العامة ─────────────────────────── */

interface InjectPlan { pulse: string; slot: string }

/** أيُّ صفحةٍ تحمل نبضاً، وأيُّها تحمل إعلاناً. الاستبيانُ وبطاقةُ الأستاذ نبضٌ فقط: صفحاتُ هويةٍ لا إعلان فيها أبداً. */
export function injectPlanFor(path: string): InjectPlan | null {
  const clean = path.split("?")[0].split("#")[0];
  if (clean === "/me" || clean === "/me/") return { pulse: "me", slot: "me" };
  const head = PUBLIC_LINK_PAGE_PREFIXES.find(prefix => clean.startsWith(prefix));
  if (!head) return null;
  const token = decodeURIComponent(clean.slice(head.length).split("/")[0] || "");
  if (!token || isDemoLinkToken(token)) return null;
  const rest = clean.slice(head.length + token.length);
  switch (head) {
    case "/s/": return rest === "" || rest === "/" ? { pulse: "schedule", slot: "schedule" } : null;
    case "/t/": return rest === "" || rest === "/" ? { pulse: "schedule", slot: "schedule" } : null;
    case "/m/": return rest === "" || rest === "/" ? { pulse: "status", slot: "status" } : null;
    case "/q/": return rest === "" || rest === "/" ? { pulse: "survey", slot: "" } : null;
    case "/r/": return { pulse: "staff", slot: "" };
    default: return null;
  }
}

export function injectionSnippet(plan: InjectPlan, nonce: string): string {
  const box = plan.slot ? `<aside id="adx" aria-label="إعلان" dir="rtl"></aside>` : "";
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
    phase: phaseOf(c, today),
    daysLeft: daysLeft(c, today),
    endingSoon: endingSoon(c, today),
    creatives,
    totals: totalsOf(mine),
    breakdown: creativeBreakdown(mine),
    series: dailySeries(mine, c.startDay, c.endDay, today).slice(-30),
    sharePct: Math.round(expectedShare(c.slot, Math.max(1, live)) * 100),
    reportUrl: `/ad-report/${c.reportToken}`,
  };
}

async function audienceInputs(requestedTermId: number) {
  const [terms, profiles, days, camps, adStats] = await Promise.all([
    Repository.getTerms(), Repository.listStudentProfiles(), Repository.listAudienceDays(120), campaigns(), Repository.listAdStats(),
  ]);
  const recent = [...terms].sort((a, b) => Number(b.AdTermId) - Number(a.AdTermId)).slice(0, 12);
  const needsByTerm = new Map<number, StudentNeed[]>();
  await Promise.all(recent.map(async term => { needsByTerm.set(Number(term.AdTermId), await Repository.getStudentNeedsForTerm(Number(term.AdTermId))); }));
  const withAnswers = recent.find(term => (needsByTerm.get(Number(term.AdTermId)) || []).length > 0);
  const current = recent.find(term => Number(term.AdTermId) === requestedTermId) || withAnswers || recent[0];
  const currentTermId = current ? Number(current.AdTermId) : 0;
  const instructorRequests = currentTermId ? await Repository.getInstructorRequests(0, 0, currentTermId) : [];
  return {
    termChoices: recent.map(term => ({ id: Number(term.AdTermId), name: term.AdTermName })),
    input: { now: new Date(), terms: recent, currentTermId, needsByTerm, instructorRequests, profiles, days, campaigns: camps, adStats },
  };
}

/* ─────────────────────────── التسجيل ─────────────────────────── */

export function registerAdsRoutes(app: Express, deps: AdsDeps): void {
  const timer = setInterval(() => { void flushAdsCounters(); }, 30_000);
  timer.unref?.();
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => { void flushAdsCounters(); });

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
    const live = (await campaigns()).filter(c => isLive(c, today));
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
    const filtered = looksAutomated(req.headers["user-agent"]) || clickWasRepeat(`${ip}|${campaign.id}`) || !underLimit(`click|${ip}`, 120);
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

  app.post("/_pulse", express.json({ limit: "1kb" }), (req, res) => {
    res.status(204);
    const ip = String(req.ip || "?");
    if (looksAutomated(req.headers["user-agent"]) || !underLimit(`pulse|${ip}`, 3000)) { res.end(); return; }
    recordPulse({ kind: String(req.body?.k || ""), returning: Boolean(req.body?.r), mobile: Boolean(req.body?.m) });
    res.end();
  });

  /* ── صفحاتُ الشركاء ── */
  const noindex = (res: Response) => { res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("X-Robots-Tag", "noindex, nofollow"); };
  const missing = (res: Response) => { noindex(res); res.status(404).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>غير موجود</title><body style="font-family:system-ui;text-align:center;margin-top:80px" dir="rtl"><h2>الرابط غير صالح</h2><p>تحقق من الرابط الذي وصلك من الإدارة.</p></body>`); };

  app.get("/ad-report/:token", async (req, res) => {
    const token = String(req.params.token || "");
    const campaign = token.length >= 20 ? (await Repository.listAdCampaigns()).find(c => c.reportToken === token) : undefined;
    if (!campaign) { missing(res); return; }
    await flushAdsCounters();
    const [heads, stats, all] = await Promise.all([Repository.listAdCreativeHeads(campaign.id), Repository.listAdStats(campaign.id), campaigns()]);
    const today = kuwaitDay();
    noindex(res);
    const nonce = deps.publicPageNonce(res);
    res.send(campaignReportPage({
      campaign, creatives: heads, stats, nonce, today,
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
    res.send(partnerKitPage({ stats: buildAudienceStats(input), liveBySlot, nonce, today }));
  });

  /* ── الإدارة ── */
  const admin: express.RequestHandler[] = [deps.requireAuth as express.RequestHandler, deps.requireRootAdmin as express.RequestHandler];
  const fail = (res: Response, status: number, error: string, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });

  app.get("/api/admin/audience-stats", ...admin, async (req: Request, res: Response) => {
    await flushAdsCounters();
    const { input, termChoices } = await audienceInputs(Number(req.query.termId || 0));
    res.json({ ...buildAudienceStats(input), termChoices });
  });

  app.get("/api/admin/ads", ...admin, async (_req: Request, res: Response) => {
    await flushAdsCounters();
    dropCampaignCache();
    const [all, stats, heads, kit] = await Promise.all([campaigns(), Repository.listAdStats(), Repository.listAdCreativeHeads(), Repository.getPartnerKitToken()]);
    const today = kuwaitDay();
    const rows = await Promise.all(all.map(c => campaignView(c, stats, heads, all, today)));
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const slots = AD_SLOTS.map(slot => ({
      ...slot,
      live: all.filter(c => c.slot === slot.id && isLive(c, today)).length,
      nextFree: nextFreeDay(slot.id, all, today),
    }));
    res.json({ today, slots, categories: AD_CATEGORIES, rules: AD_RULES, maxBytes: AD_MAX_BYTES, maxCreatives: MAX_ROTATE_CREATIVES, campaigns: rows, partnerKit: kit ? `/partners/${kit}` : "" });
  });

  const readBody = (b: any) => ({
    company: str(b?.company, 80), category: str(b?.category, 40), slot: str(b?.slot, 20),
    startDay: str(b?.startDay, 10), endDay: str(b?.endDay, 10), coupon: cleanCoupon(b?.coupon),
    note: str(b?.note, 300), trial: Boolean(b?.trial),
  });

  app.post("/api/admin/ads/campaigns", ...admin, async (req: Request, res: Response) => {
    const body = readBody(req.body);
    const link = cleanLink(req.body?.linkUrl);
    const id = str(req.body?.id, 60);
    const existing = id ? (await campaigns()).find(c => c.id === id) : undefined;
    if (id && !existing) { fail(res, 404, "الحملة غير موجودة."); return; }
    const problems = [...campaignProblems({ id, ...body }), ...(link.problem ? [link.problem] : [])];
    if (problems.length) { fail(res, 400, problems[0], { problems }); return; }
    const now = new Date().toISOString();
    let row: AdCampaign;
    if (existing) {
      row = { ...existing, ...body, linkUrl: link.url, updatedAt: now };
      /* تغييرُ ما يمسّ الموقع أو الفئة أو التواريخ في حملةٍ معتمدة يعيدها مسودةً لتُعتمد من جديد. */
      const moved = existing.slot !== row.slot || existing.category !== row.category || existing.startDay !== row.startDay || existing.endDay !== row.endDay;
      if (existing.status === "approved" && moved) {
        const all = (await campaigns()).filter(c => c.id !== existing.id);
        const clash = placementProblems({ id: existing.id, ...body }, all);
        if (clash.length) { fail(res, 409, clash[0], { problems: clash }); return; }
      }
      if (existing.slot !== row.slot && row.creativeIds.length) {
        fail(res, 409, "لا يمكن تغيير الموقع بعد رفع صور؛ مقاس الصور مرتبطٌ بالموقع. أنشئ حملةً جديدة.");
        return;
      }
    } else {
      row = { id: randomUUID(), ...body, linkUrl: link.url, creativeIds: [], status: "draft", reportToken: newToken(), createdAt: now, updatedAt: now };
    }
    await Repository.saveAdCampaign(row);
    dropCampaignCache();
    res.json({ ok: true, id: row.id });
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
    let label = campaign.creativeIds.length === 0 ? "الصورة أ" : "الصورة ب";
    try { label = str(decodeURIComponent(String(req.headers["x-label"] || "")), 40) || label; } catch { /* يبقى الافتراضي */ }
    const creative: AdCreative = {
      id: randomUUID(), campaignId: campaign.id, label, mime: info.mime, width: info.width, height: info.height,
      bytes: buf.length, data: buf.toString("base64"), createdAt: new Date().toISOString(),
    };
    await Repository.saveAdCreative(creative);
    await Repository.saveAdCampaign({ ...campaign, creativeIds: [...campaign.creativeIds, creative.id], updatedAt: creative.createdAt });
    dropCampaignCache();
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
    res.json({ ok: true });
  });

  app.delete("/api/admin/ads/campaigns/:id", ...admin, async (req: Request, res: Response) => {
    const campaign = (await campaigns()).find(c => c.id === String(req.params.id));
    if (!campaign) { fail(res, 404, "الحملة غير موجودة."); return; }
    if (isLive(campaign)) { fail(res, 409, "الحملة تعمل الآن؛ أوقفها أولاً."); return; }
    await Repository.deleteAdCampaign(campaign.id);
    for (const id of campaign.creativeIds) imageCache.delete(id);
    dropCampaignCache();
    res.json({ ok: true });
  });

  app.post("/api/admin/ads/campaigns/:id/rotate-report", ...admin, async (req: Request, res: Response) => {
    const campaign = (await campaigns()).find(c => c.id === String(req.params.id));
    if (!campaign) { fail(res, 404, "الحملة غير موجودة."); return; }
    await Repository.saveAdCampaign({ ...campaign, reportToken: newToken(), updatedAt: new Date().toISOString() });
    dropCampaignCache();
    res.json({ ok: true });
  });

  app.post("/api/admin/ads/partner-kit", ...admin, async (_req: Request, res: Response) => {
    const token = newToken();
    await Repository.setPartnerKitToken(token);
    res.json({ ok: true, url: `/partners/${token}` });
  });
}
