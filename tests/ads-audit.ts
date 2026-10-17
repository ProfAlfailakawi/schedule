/**
 * ── الإعلانات والجمهور: القواعد والمسارات والخصوصية ──────────────────────────────
 *
 *   A1  الصورة: أبعاد PNG/JPEG/WebP من الرأس، ورفض المقاس والوزن والنوع الخاطئ
 *   A2  الرابط: https فقط، بلا دخول ولا مضيفٍ محلي
 *   A3  الحملة: التواريخ، والسعة، والحصرية، وفئة المنافس، وأقرب موعدٍ فارغ
 *   A4  الحالة: متى تعمل حملةٌ ومتى تنتهي (حدود اليوم بتوقيت الكويت)
 *   A5  السكربت المحقون: صالحٌ نحوياً، بلا تتبّعٍ خارجي، ولا يُحقن في صفحات الهوية
 *   A6  المسارات الحقيقية: إنشاء ← صورة ← اعتماد ← عرض ← ظهور ← نقر ← تقرير
 *   A7  الخصوصية: لوحة الجمهور بلا أسماء ولا بصمات، وصفحات الشركاء تُهرّب النص
 */
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import zlib from "zlib";
import http from "http";
import type { AddressInfo } from "net";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ads-audit-"));
process.env.SCHEDULE_PRIVATE_DIR = dir;
process.env.DATA_MODE = "demo";
process.env.NODE_ENV = "development";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};

/* صورةُ PNG صحيحة بمقاسٍ محدّد (لونٌ واحد) تُبنى بلا مكتبات. */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x2a)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function jpeg(width: number, height: number): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe0, 0x00, 0x04, 0, 0]), sof, Buffer.from([0xff, 0xd9])]);
}
function webpX(width: number, height: number): Buffer {
  const b = Buffer.alloc(30); b.write("RIFF", 0, "ascii"); b.writeUInt32LE(22, 4); b.write("WEBP", 8, "ascii"); b.write("VP8X", 12, "ascii"); b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3); b.writeUIntLE(height - 1, 27, 3);
  return b;
}

async function main() {
  const E = await import("../src/utils/adsEngine");
  const { AR, countOf } = await import("../src/utils/arabicCount");

  /* ── A1 ── */
  check(E.readImageInfo(png(640, 200))?.width === 640 && E.readImageInfo(png(640, 200))?.height === 200, "A1 PNG: الأبعاد من الرأس");
  check(E.readImageInfo(jpeg(640, 160))?.mime === "image/jpeg" && E.readImageInfo(jpeg(640, 160))?.height === 160, "A1 JPEG: الأبعاد من علامة SOF");
  check(E.readImageInfo(webpX(600, 250))?.mime === "image/webp" && E.readImageInfo(webpX(600, 250))?.width === 600, "A1 WebP VP8X");
  check(E.readImageInfo(Buffer.from("GIF89a....................................")) === null, "A1 GIF/نصّ: غير مدعوم");
  check(E.creativeProblem("me", 1000, E.readImageInfo(png(640, 200))) === "", "A1 مقاسٌ صحيح لموقع «مساري» يُقبل");
  check(E.creativeProblem("me", 1000, E.readImageInfo(png(640, 160))).includes("640×200"), "A1 مقاسٌ خاطئ يُرفض ويُذكر المطلوب");
  check(E.creativeProblem("me", E.AD_MAX_BYTES + 1, E.readImageInfo(png(640, 200))).includes("كيلوبايت"), "A1 وزنٌ زائد يُرفض");
  check(E.creativeProblem("nowhere", 10, E.readImageInfo(png(640, 200))) !== "", "A1 موقعٌ مجهول يُرفض");

  /* ── A2 ── */
  check(E.cleanLink("https://shop.example.com/offer?x=1").problem === "", "A2 https عام يُقبل");
  for (const bad of ["http://shop.example.com", "javascript:alert(1)", "https://u:p@shop.example.com", "https://localhost/x", "https://127.0.0.1/x", "https://intranet/x", "", "not a url"]) {
    check(E.cleanLink(bad).problem !== "", `A2 يُرفض: ${bad || "(فارغ)"}`);
  }

  /* ── A3 ── */
  const camp = (over: Partial<import("../src/types").AdCampaign>): import("../src/types").AdCampaign => ({
    id: Math.random().toString(36).slice(2), company: "ش", category: "مطاعم وكافيهات", slot: "me", creativeIds: ["x"], linkUrl: "https://a.example.com",
    startDay: "2026-11-01", endDay: "2026-11-30", status: "approved", reportToken: "t".repeat(24), createdAt: "", updatedAt: "", ...over,
  });
  check(E.campaignProblems({ company: "أ", category: "ب", slot: "me", startDay: "2026-11-10", endDay: "2026-11-01" }).length === 1, "A3 النهاية قبل البداية تُرفض");
  check(E.campaignProblems({ company: "أ", category: "ب", slot: "me", startDay: "2026-02-30", endDay: "2026-03-05" }).length === 1, "A3 تاريخٌ غير موجود (٣٠ فبراير) يُرفض");
  check(E.campaignProblems({ company: "أ", category: "ب", slot: "me", startDay: "2026-01-01", endDay: "2028-01-01" }).length === 1, "A3 أكثر من سنة تُرفض");

  const five = ["مطاعم وكافيهات", "تقنية وإلكترونيات", "كتب وقرطاسية", "تعليم ودورات", "صحة ولياقة"].map(category => camp({ category }));
  check(E.placementProblems({ company: "ز", category: "ترفيه", slot: "me", startDay: "2026-11-05", endDay: "2026-11-20" }, five.slice(0, 4)).length === 0, "A3 «مساري» يقبل الحملة الخامسة");
  check(E.placementProblems({ company: "ز", category: "ترفيه", slot: "me", startDay: "2026-11-05", endDay: "2026-11-20" }, five).some(p => p.includes("ممتلئ")), "A3 الحملة السادسة تُرفض: الموقع ممتلئ");
  check(E.placementProblems({ company: "ز", category: "ترفيه", slot: "me", startDay: "2026-12-01", endDay: "2026-12-20" }, five).length === 0, "A3 بعد انتهاء الحملات الخمس تُقبل (لا تقاطع)");
  check(E.placementProblems({ company: "ز", category: "مطاعم وكافيهات", slot: "me", startDay: "2026-11-05", endDay: "2026-11-20" }, five.slice(0, 2)).some(p => p.includes("الفئة نفسها")), "A3 منافسٌ من الفئة نفسها في الموقع نفسه يُرفض");
  check(E.placementProblems({ company: "ز", category: "مطاعم وكافيهات", slot: "schedule", startDay: "2026-11-05", endDay: "2026-11-20" }, five.slice(0, 2)).length === 0, "A3 الفئة نفسها في موقعٍ آخر مسموحة");
  const sponsor = camp({ slot: "sponsor", category: "تقنية وإلكترونيات", startDay: "2026-11-01", endDay: "2026-12-31" });
  check(E.placementProblems({ company: "ك", category: "كتب وقرطاسية", slot: "sponsor", startDay: "2026-12-15", endDay: "2027-01-15" }, [sponsor]).some(p => p.includes("حصري")), "A3 «شريك الفصل» حصري: التقاطع يُرفض");
  check(E.placementProblems({ company: "ك", category: "كتب وقرطاسية", slot: "sponsor", startDay: "2027-01-01", endDay: "2027-02-01" }, [sponsor]).length === 0, "A3 «شريك الفصل» يُقبل بعد انتهاء الأول");
  check(E.placementProblems({ id: sponsor.id, company: "ت", category: "تقنية وإلكترونيات", slot: "sponsor", startDay: "2026-11-01", endDay: "2026-12-31" }, [sponsor]).length === 0, "A3 تعديل الحملة نفسها لا يعارض نفسها");
  check(E.nextFreeDay("me", five, "2026-11-10") === "2026-12-01", "A3 أقرب يومٍ فارغ بعد امتلاء «مساري»");
  check(E.expectedShare("me", 4) === 0.25 && E.expectedShare("sponsor", 1) === 1, "A3 الحصة المتوقعة: ربع عند أربع حملات، وكاملة للراعي");

  /* ── A4 ── */
  const c = camp({});
  check(E.isLive(c, "2026-11-01") && E.isLive(c, "2026-11-30"), "A4 اليومان الأول والأخير شاملان");
  check(!E.isLive(c, "2026-10-31") && !E.isLive(c, "2026-12-01"), "A4 قبل البداية وبعد النهاية: لا تعمل");
  check(!E.isLive(camp({ status: "paused" }), "2026-11-10") && !E.isLive(camp({ status: "draft" }), "2026-11-10"), "A4 الموقوفة والمسودة لا تعملان");
  check(E.phaseOf(c, "2026-12-05") === "ended" && E.phaseOf(c, "2026-10-01") === "scheduled" && E.phaseOf(c, "2026-11-15") === "live", "A4 مراحل الحملة");
  check(E.endingSoon(c, "2026-11-25") && !E.endingSoon(c, "2026-11-10") && !E.endingSoon(c, "2026-12-02"), "A4 تنبيه الانتهاء خلال ٧ أيام");
  check(E.kuwaitDay(Date.parse("2026-11-01T21:30:00Z")) === "2026-11-02", "A4 اليوم بتوقيت الكويت (٢١:٣٠ UTC = اليوم التالي)");
  check(E.kuwaitHour(Date.parse("2026-11-01T21:30:00Z")) === 0, "A4 ساعة الكويت");
  const order = E.rotationOrder([1, 2, 3, 4, 5], () => 0);
  check(order.length === 5 && [...order].sort().join() === "1,2,3,4,5", "A4 الترتيب العشوائي تبديلٌ كامل لا يفقد عنصراً");
  const firsts = new Set(Array.from({ length: 200 }, () => E.rotationOrder([1, 2, 3, 4, 5])[0]));
  check(firsts.size === 5, "A4 كل شركةٍ تأخذ أول موضعٍ أحياناً (لا احتكار)");
  check(E.looksAutomated("Googlebot/2.1") && E.looksAutomated("") && !E.looksAutomated("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), "A4 فلترة الروبوتات");
  const rows = [
    { id: "1", campaignId: "c", creativeId: "a", day: "2026-11-01", impressions: 100, uniques: 60, clicks: 5, filteredClicks: 1 },
    { id: "2", campaignId: "c", creativeId: "b", day: "2026-11-03", impressions: 100, uniques: 70, clicks: 10, filteredClicks: 0 },
  ];
  check(E.totalsOf(rows).ctr === 7.5 && E.totalsOf(rows).clicks === 15, "A4 المجاميع ونسبة النقر");
  const series = E.dailySeries(rows, "2026-11-01", "2026-11-30", "2026-11-04");
  check(series.length === 4 && series[1].impressions === 0 && series[2].impressions === 100, "A4 السلسلة اليومية تملأ الأيام الفارغة وتتوقف عند اليوم");
  check(E.creativeBreakdown(rows).length === 2, "A4 مقارنة A/B تفصل الصورتين");
  check(E.cleanCoupon("ab-12 !@#") === "AB-12" && E.cleanCoupon("خصم10") === "خصم10", "A4 كود الخصم منظَّف");

  /* ── A5 ── */
  const { AD_CLIENT_SCRIPT } = await import("../src/server/adClientScript");
  let syntax = "";
  try { new vm.Script(AD_CLIENT_SCRIPT); } catch (e: any) { syntax = String(e?.message || e); }
  check(!syntax, "A5 السكربت المحقون سليم نحوياً", syntax);
  check(!/https?:\/\//.test(AD_CLIENT_SCRIPT), "A5 السكربت لا يتصل بأي أصلٍ خارجي");
  check(!/innerHTML|document\.write|eval\(/.test(AD_CLIENT_SCRIPT), "A5 لا innerHTML ولا eval ولا document.write");
  check(/prefers-reduced-motion/.test(AD_CLIENT_SCRIPT) && /adx-pp/.test(AD_CLIENT_SCRIPT), "A5 يحترم تقليل الحركة وفيه زر إيقاف");

  const R = await import("../src/server/adsRoutes");
  check(R.injectPlanFor("/me")?.slot === "me" && R.injectPlanFor("/t/abc")?.slot === "schedule" && R.injectPlanFor("/s/abc")?.slot === "schedule" && R.injectPlanFor("/m/abc")?.slot === "status", "A5 مواضع الإعلان: مساري والجدولان وحالة الطلب");
  check(R.injectPlanFor("/q/abc")?.slot === "" && R.injectPlanFor("/q/abc")?.pulse === "survey", "A5 الاستبيان: نبضٌ بلا إعلان");
  check(R.injectPlanFor("/r/abc")?.slot === "" && R.injectPlanFor("/r/abc/proposal/3")?.slot === "", "A5 بطاقة الأستاذ: نبضٌ بلا إعلان");
  check(R.injectPlanFor("/s/demo.abc") === null && R.injectPlanFor("/api/public/schedule/x") === null && R.injectPlanFor("/") === null, "A5 الرموز التجريبية والواجهات والجذر: لا حقن");
  check(R.injectPlanFor("/s/abc/extra") === null, "A5 مسارٌ فرعي غير معروف: لا حقن");
  const snippet = R.injectionSnippet({ pulse: "me", slot: "me" }, "NONCE123");
  check(snippet.includes('nonce="NONCE123"') && snippet.includes('id="adx"') && snippet.includes("/_ads/ad.js"), "A5 المقطع المحقون يحمل النونس ويحمّل السكربت من الأصل نفسه");
  check(!R.injectionSnippet({ pulse: "survey", slot: "" }, "N").includes('id="adx"'), "A5 صفحة الاستبيان لا تحمل حاوية إعلان");

  /* وسيطُ الحقن: يلفّ HTML بنونس فقط، ويترك JSON والأخطاء وما لا نونس له. */
  const run = (reqPath: string, status: number, type: string, csp: string, body: string) => {
    let sent: any;
    const headers: Record<string, string> = { "content-type": type, "content-security-policy": csp };
    const res: any = {
      statusCode: status, getHeader: (n: string) => headers[n.toLowerCase()], send(b: any) { sent = b; return this; },
    };
    R.adInjection()({ method: "GET", path: reqPath } as any, res, () => undefined);
    res.send(body);
    return sent as string;
  };
  const html = "<html><body><main>x</main></body></html>";
  const ok = run("/me", 200, "text/html; charset=utf-8", "script-src 'nonce-ABC'", html);
  check(ok.includes('nonce="ABC"') && ok.indexOf("<aside") < ok.lastIndexOf("</body>"), "A5 الوسيط يُدخل الإعلان قبل </body> بنونس الصفحة");
  check(run("/me", 404, "text/html", "script-src 'nonce-ABC'", html) === html, "A5 صفحة الخطأ لا تُحقن");
  check(run("/me", 200, "application/json", "script-src 'nonce-ABC'", html) === html, "A5 غير HTML لا يُحقن");
  check(run("/me", 200, "text/html", "default-src 'none'", html) === html, "A5 بلا نونس لا حقن");

  /* فشلُ كتابة النبض لا يُسقط الدفعة: تُدمج في ما وصل بعدها. */
  const merged = R.mergeAudience(
    { visits: { me: 2 }, returning: 1, fresh: 1, mobile: 2, desktop: 0, installed: 0, hours: { "9": 2 } },
    { visits: { me: 3, status: 1 }, returning: 2, fresh: 2, mobile: 1, desktop: 3, installed: 1, hours: { "9": 1, "10": 3 } });
  check(merged.visits.me === 5 && merged.visits.status === 1 && merged.hours["9"] === 3 && merged.hours["10"] === 3 && merged.installed === 1 && merged.returning === 3, "A5 دمج دفعة النبض الفاشلة في الجديدة بلا فقد");

  /* إجمالي «كل الفصول» يشمل أكثر من ١٢ فصلاً، والرسم لآخر ١٢ فقط. */
  const { buildAudienceStats } = await import("../src/utils/audienceStats");
  const manyTerms = Array.from({ length: 15 }, (_, i) => ({ AdTermId: i + 1, AdTermName: `ف${i + 1}` })) as any[];
  const needs = new Map<number, any[]>(manyTerms.map(t => [t.AdTermId, [{ fingerprint: `fp-${t.AdTermId}`, AdCollegeId: 1, requestType: "new-course", createdAt: "2026-01-01T00:00:00Z" }]]));
  const all = buildAudienceStats({ now: new Date("2026-02-01T00:00:00Z"), terms: manyTerms, currentTermId: 15, needsByTerm: needs, instructorRequests: [], profiles: [] });
  check(all.survey.allTimeStudents === 15 && all.survey.allTimeAnswers === 15 && all.survey.terms.length === 12, "A7 الإجمالي عبر ١٥ فصلاً والرسم لآخر ١٢");

  const sw = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");
  check(sw.includes('"/_ads/"') && sw.includes('"/_pulse"') && sw.includes('"/ad-report/"') && sw.includes('"/partners/"'), "A5 الـ service worker يتجاوز الإعلانات والنبض وصفحتي الشركاء");

  /* ── A6: المسارات الحقيقية على خادمٍ مصغَّر ── */
  const express = (await import("express")).default;
  const { Repository } = await import("../src/db/repository");
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const allow = (_q: any, _r: any, next: any) => next();
  R.registerAdsRoutes(app, { requireAuth: allow, requireRootAdmin: allow, publicPageNonce: () => "TESTNONCE" });
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
  const call = async (method: string, url: string, body?: any, headers: Record<string, string> = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const res = await fetch(base + url, { method, redirect: "manual", headers: { "User-Agent": UA, ...(body && !isBuf ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? (isBuf ? body : JSON.stringify(body)) : undefined });
    const type = res.headers.get("content-type") || "";
    const text = type.includes("image") ? "" : await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  const today = E.kuwaitDay();
  const dayPlus = (n: number) => E.addDays(today, n);

  try {
    let r = await call("POST", "/api/admin/ads/campaigns", { company: "مطعم الواحة", category: "مطاعم وكافيهات", slot: "me", startDay: today, endDay: dayPlus(10), linkUrl: "http://bad.example.com" });
    check(r.status === 400, "A6 رابط http يُرفض عند الإنشاء", r.json);
    r = await call("POST", "/api/admin/ads/campaigns", { company: "مطعم الواحة", category: "مطاعم وكافيهات", slot: "me", startDay: today, endDay: dayPlus(10), linkUrl: "https://oasis.example.com/offer", coupon: "oasis10" });
    check(r.status === 200 && r.json.id, "A6 إنشاء حملة (مسودة)", r.json);
    const id = r.json.id as string;

    r = await call("POST", `/api/admin/ads/campaigns/${id}/status`, { action: "approve", rulesAccepted: true });
    check(r.status === 409, "A6 الاعتماد بلا صورةٍ يُرفض", r.json);
    r = await call("POST", `/api/admin/ads/campaigns/${id}/creatives`, png(640, 160), { "Content-Type": "image/png" });
    check(r.status === 400 && String(r.json?.error).includes("640×200"), "A6 صورةٌ بمقاسٍ خاطئ تُرفض", r.json);
    r = await call("POST", `/api/admin/ads/campaigns/${id}/creatives`, png(640, 200), { "Content-Type": "image/png", "X-Label": encodeURIComponent("الصورة أ") });
    check(r.status === 200, "A6 صورةٌ بالمقاس الصحيح تُقبل", r.json);
    const crA = r.json.id as string;
    r = await call("POST", `/api/admin/ads/campaigns/${id}/creatives`, png(640, 200), { "Content-Type": "image/png" });
    r = await call("POST", `/api/admin/ads/campaigns/${id}/creatives`, png(640, 200), { "Content-Type": "image/png" });
    check(r.status === 409, "A6 أكثر من صورتين للمقارنة تُرفض", r.json);

    let serve = await call("GET", "/_ads/serve?slot=me");
    check(serve.json.items.length === 0, "A6 المسودة لا تُعرض");
    r = await call("POST", `/api/admin/ads/campaigns/${id}/status`, { action: "approve" });
    check(r.status === 400, "A6 الاعتماد بلا إقرار الشروط يُرفض", r.json);
    r = await call("POST", `/api/admin/ads/campaigns/${id}/status`, { action: "approve", rulesAccepted: true });
    check(r.status === 200, "A6 الاعتماد بعد الصورة والإقرار", r.json);

    // الذاكرة المؤقتة للحملات عمرها ١٥ ثانية؛ مسارات الإدارة تسقطها عند كل تعديل، فيظهر الاعتماد فوراً.
    serve = await call("GET", "/_ads/serve?slot=me");
    check(serve.json.items.length === 1 && serve.json.items[0].coupon === "OASIS10" && serve.json.items[0].alt.includes("مطعم الواحة"), "A6 الحملة المعتمدة تُعرض في موقعها", serve.json);
    check((await call("GET", "/_ads/serve?slot=schedule")).json.items.length === 0, "A6 ولا تظهر في موقعٍ آخر");
    check((await call("GET", "/_ads/serve?slot=nope")).json.items.length === 0, "A6 موقعٌ مجهول: لا شيء");
    const item = serve.json.items[0];
    const imgRes = await fetch(base + item.img);
    check(imgRes.status === 200 && imgRes.headers.get("content-type") === "image/png" && (await imgRes.arrayBuffer()).byteLength > 100, "A6 الصورة تُخدم من الأصل نفسه بنوعها الصحيح");

    // الظهور: حدثان لنفس الحملة (أحدهما فريد)، وحدثٌ مزيَّف لحملةٍ غير موجودة يُتجاهل.
    r = await call("POST", "/_ads/e", { e: [{ c: item.c, k: item.k, u: 1 }, { c: item.c, k: item.k, u: 0 }, { c: "ghost", k: "x", u: 1 }, { c: item.c, k: "wrong-creative", u: 1 }] });
    check(r.status === 204, "A6 استقبال الظهور");
    r = await call("POST", "/_ads/e", { e: [{ c: item.c, k: item.k, u: 1 }] }, { "User-Agent": "Googlebot/2.1" });
    check(r.status === 204, "A6 الروبوت: يُقبل الطلب ويُتجاهل");

    // النقر: الأول صحيح، والمتكرر خلال ثوانٍ يُرشَّح، والروبوت يُرشَّح.
    r = await call("GET", item.href);
    check(r.status === 302 && r.headers.get("location") === "https://oasis.example.com/offer", "A6 النقر يحوّل إلى رابط الشركة", r.headers.get("location"));
    r = await call("GET", item.href);
    r = await call("GET", item.href, undefined, { "User-Agent": "curl/8.0" });
    // مستخدمٌ آخر خلف العنوان نفسه (وكيل متصفحٍ مختلف) ينقر فوراً: نقرةٌ صحيحة لا مكرَّرة (شبكة الجامعة عنوانٌ واحد).
    r = await call("GET", item.href, undefined, { "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36" });
    check((await call("GET", "/_ads/c/ghost/x")).headers.get("location") === "/", "A6 نقرٌ على حملةٍ مجهولة يعود إلى الرئيسية");

    await R.flushAdsCounters();
    const list = await call("GET", "/api/admin/ads");
    const mine = list.json.campaigns.find((x: any) => x.id === id);
    check(mine.totals.impressions === 2 && mine.totals.uniques === 1, "A6 الظهور: ٢ والفريد ١ (والمزيَّف والروبوت لم يُحتسبا)", mine.totals);
    check(mine.totals.clicks === 2 && mine.totals.filteredClicks === 2, "A6 النقر: ٢ صحيحان (مستخدمان خلف عنوانٍ واحد) و٢ مُرشَّحان (تكرار وروبوت)", mine.totals);
    check(mine.phase === "live" && mine.sharePct === 100 && mine.daysLeft === 10, "A6 المرحلة والحصة وأيام المتبقي");
    check(list.json.slots.find((s: any) => s.id === "me").live === 1, "A6 عدد الحملات الحية في الموقع");

    // تقرير الشركة
    const report = await call("GET", mine.reportUrl);
    check(report.status === 200 && report.text.includes("مطعم الواحة") && report.text.includes("النقرات الصحيحة") && report.text.includes('nonce="TESTNONCE"'), "A6 صفحة تقرير الشركة تعمل بنونس");
    check(!report.text.includes("curl") && !report.text.includes("127.0.0.1"), "A6 التقرير لا يكشف عناوين ولا وكلاء مستخدمين");
    check((await call("GET", "/ad-report/short")).status === 404 && (await call("GET", "/ad-report/" + "z".repeat(32))).status === 404, "A6 رمزٌ خاطئ: ٤٠٤");

    // تعدد الشركات: خمس في «مساري» والسادسة تُرفض، ومنافس الفئة نفسها يُرفض
    const makeLive = async (company: string, category: string) => {
      const c1 = await call("POST", "/api/admin/ads/campaigns", { company, category, slot: "me", startDay: today, endDay: dayPlus(10), linkUrl: `https://${company}.example.com` });
      await call("POST", `/api/admin/ads/campaigns/${c1.json.id}/creatives`, png(640, 200), { "Content-Type": "image/png" });
      return { id: c1.json.id as string, res: await call("POST", `/api/admin/ads/campaigns/${c1.json.id}/status`, { action: "approve", rulesAccepted: true }) };
    };
    const rival = await makeLive("rival", "مطاعم وكافيهات");
    check(rival.res.status === 409 && String(rival.res.json.error).includes("الفئة نفسها"), "A6 منافس الفئة نفسها لا يُعتمد", rival.res.json);
    const cats = ["تقنية وإلكترونيات", "كتب وقرطاسية", "تعليم ودورات", "صحة ولياقة"];
    for (const [i, cat] of cats.entries()) check((await makeLive(`co${i}`, cat)).res.status === 200, `A6 الشركة ${i + 2} تُعتمد في «مساري»`);
    const sixth = await makeLive("sixth", "ترفيه");
    check(sixth.res.status === 409 && String(sixth.res.json.error).includes("ممتلئ"), "A6 الشركة السادسة تُرفض: الموقع ممتلئ", sixth.res.json);
    serve = await call("GET", "/_ads/serve?slot=me");
    check(serve.json.items.length === 5, "A6 خمس شركات تتناوب في «مساري»", serve.json.items.length);
    const leaders = new Set<string>();
    for (let i = 0; i < 60; i++) leaders.add((await call("GET", "/_ads/serve?slot=me")).json.items[0].c);
    check(leaders.size >= 4, "A6 أول موضعٍ يدور بين الشركات", leaders.size);

    // تعديلُ موقعٍ أو فئةٍ أو تواريخَ حملةٍ معتمدة يعيدها مسودةً فلا تُعرض حتى تُعتمد من جديد.
    const editId = (await call("GET", "/_ads/serve?slot=me")).json.items.find((x: any) => x.c !== id)?.c as string;
    const before = list.json.campaigns.find((x: any) => x.id === editId) || (await call("GET", "/api/admin/ads")).json.campaigns.find((x: any) => x.id === editId);
    r = await call("POST", "/api/admin/ads/campaigns", { id: editId, company: before.company, category: before.category, slot: before.slot, startDay: before.startDay, endDay: E.addDays(before.endDay, 3), linkUrl: before.linkUrl });
    check(r.status === 200, "A6 تعديل تاريخ نهاية حملة معتمدة", r.json);
    serve = await call("GET", "/_ads/serve?slot=me");
    check(!serve.json.items.some((x: any) => x.c === editId), "A6 الحملة المعدَّلة عادت مسودةً ولم تعد تُعرض");
    check((await call("GET", "/api/admin/ads")).json.campaigns.find((x: any) => x.id === editId).status === "draft", "A6 حالتها مسودة");
    r = await call("POST", `/api/admin/ads/campaigns/${editId}/status`, { action: "approve", rulesAccepted: true });
    check(r.status === 200, "A6 تُعتمد من جديد بعد المراجعة", r.json);

    // الإيقاف الفوري والانتهاء
    r = await call("POST", `/api/admin/ads/campaigns/${id}/status`, { action: "pause" });
    serve = await call("GET", "/_ads/serve?slot=me");
    check(serve.json.items.length === 4 && !serve.json.items.some((x: any) => x.c === id), "A6 الإيقاف يسحب الحملة فوراً", serve.json.items.length);
    check((await call("GET", item.href)).headers.get("location") === "/", "A6 النقر على حملةٍ موقوفة لا يحوّل");
    check((await call("DELETE", `/api/admin/ads/campaigns/${id}`)).status === 200, "A6 حذف الحملة الموقوفة");

    // مرحلة قديمة: حملةٌ منتهية لا تُعرض ولو معتمدة
    const old = await call("POST", "/api/admin/ads/campaigns", { company: "قديمة", category: "سفر وسياحة", slot: "status", startDay: dayPlus(-30), endDay: dayPlus(-1), linkUrl: "https://old.example.com" });
    await call("POST", `/api/admin/ads/campaigns/${old.json.id}/creatives`, png(600, 250), { "Content-Type": "image/png" });
    await call("POST", `/api/admin/ads/campaigns/${old.json.id}/status`, { action: "approve", rulesAccepted: true });
    check((await call("GET", "/_ads/serve?slot=status")).json.items.length === 0, "A6 الحملة المنتهية لا تُعرض ولو كانت معتمدة");

    // شريك الفصل
    const sp = await call("POST", "/api/admin/ads/campaigns", { company: "الراعي", category: "خدمات مصرفية", slot: "sponsor", startDay: today, endDay: dayPlus(60), linkUrl: "https://sponsor.example.com" });
    await call("POST", `/api/admin/ads/campaigns/${sp.json.id}/creatives`, png(640, 80), { "Content-Type": "image/png" });
    check((await call("POST", `/api/admin/ads/campaigns/${sp.json.id}/status`, { action: "approve", rulesAccepted: true })).status === 200, "A6 اعتماد شريك الفصل");
    check((await call("GET", "/_ads/serve?slot=schedule")).json.sponsor?.alt?.includes("الراعي"), "A6 الراعي يظهر مع كل موقع");

    // النبض المجهول
    check((await call("POST", "/_pulse", { k: "me", r: 0, m: 1 })).status === 204, "A6 نبضٌ صحيح");
    check((await call("POST", "/_pulse", { k: "hack", r: 0, m: 0 })).status === 204, "A6 نوعٌ مجهول يُتجاهل");
    await call("POST", "/_pulse", { k: "me", r: 1, m: 0 });
    await call("POST", "/_pulse", { k: "install" });
    await R.flushAdsCounters();
    const stats = await call("GET", "/api/admin/audience-stats");
    check(stats.json.visits.today === 2 && stats.json.visits.bySource.find((s: any) => s.source === "me")?.count === 2, "A6 زيارتان مقيستان اليوم", stats.json.visits);
    check(stats.json.visits.installs === 1 && stats.json.visits.mobileRate === 50 && stats.json.visits.returningRate === 50, "A6 التثبيت ونسبة الجوال والعائدين", stats.json.visits);
    check(stats.json.ads.live >= 5, "A6 ملخص الإعلانات في لوحة الجمهور", stats.json.ads);

    // ملف الشراكة
    check((await call("GET", "/partners/" + "q".repeat(32))).status === 404, "A6 ملف الشراكة: لا رابط بلا إنشاء");
    const kit = await call("POST", "/api/admin/ads/partner-kit");
    const kitPage = await call("GET", kit.json.url);
    check(kitPage.status === 200 && kitPage.text.includes("شروطنا") && kitPage.text.includes("640×200") && kitPage.text.includes("TESTNONCE"), "A6 ملف الشراكة يُعرض بالشروط والمقاسات");

    /* ── A7 ── */
    const blob = JSON.stringify(stats.json);
    check(!/fingerprint|nameCipher|civil|"name":"[^"]*كلية\s?[^0-9١٢٣٤٥٦٧٨٩ ]/.test(blob), "A7 لوحة الجمهور لا تحمل بصماتٍ ولا أرقاماً مدنية");
    for (const group of [stats.json.students.byCollege, stats.json.survey.current.byCollege, stats.json.instructors.byCollege]) {
      check(group.every((x: any) => /^كلية \d+$/.test(x.label) && !("name" in x) && !("collegeId" in x)), "A7 الكليات بلا أسماء ولا معرّفات");
    }
    const evil = await Repository.saveAdCampaign({ ...(await Repository.listAdCampaigns())[0], company: `<script>alert(1)</script>`, reportToken: "e".repeat(32) });
    void evil;
    const evilPage = await call("GET", "/ad-report/" + "e".repeat(32));
    check(evilPage.status === 200 && !evilPage.text.includes("<script>alert(1)") && evilPage.text.includes("&lt;script&gt;"), "A7 اسم الشركة يُهرَّب في صفحة التقرير");
    check(countOf(3, AR.campaign) === "٣ حملات" || countOf(3, AR.campaign).includes("حملات"), "A7 عدّاد الحملات بالعربية الصحيحة");
  } finally {
    await new Promise<void>(r => server.close(() => r()));
  }

  console.log(`\n${failed ? "\x1b[31m" : "\x1b[32m"}${passed} نجح، ${failed} فشل\x1b[0m`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(1); });
