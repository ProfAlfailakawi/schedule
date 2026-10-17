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
function png(width: number, height: number, lo = 0x14, hi = 0xe6): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  /* لوحةُ مربعاتٍ بين داكنٍ وفاتح: صورةٌ بتباينٍ وتفاصيلَ تمرّ فحصَ الجودة. `lo`/`hi` يتحكمان بالتباين. */
  const rowOf = (y: number) => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width * 3 }, (_, i) => (((Math.floor(i / 3 / 16) + Math.floor(y / 16)) % 2) ? hi : lo)))]);
  const raw = Buffer.concat(Array.from({ length: height }, (_, y) => rowOf(y)));
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
  const CAL = await import("../src/utils/adCalendar");
  {
    const ics = CAL.reportCalendar({ id: "c9", company: "شركة, الأمل; للتقنية", startDay: "2026-11-01", endDay: "2026-12-01" }, "https://x.test/ad-report/abc", "2026-11-10", new Date("2026-11-10T00:00:00Z"));
    const lines = ics.split("\r\n");
    check(lines.every(l => new TextEncoder().encode(l).length <= 75), "A6 iCal: لا سطر يتجاوز ٧٥ بايتاً (طيٌّ سليم لا يقطع حرفاً عربياً)");
    const unfolded = ics.replace(/\r\n /g, "");
    check(unfolded.includes("SUMMARY:تنتهي حملة شركة\\, الأمل\\; للتقنية بعد أسبوع"), "A6 iCal: الفاصلة والفاصلة المنقوطة تُهرَّبان");
    check(unfolded.includes("DTSTART;VALUE=DATE:20261124") && unfolded.includes("DTSTART;VALUE=DATE:20261201") && unfolded.includes("DTSTART;VALUE=DATE:20261115") && unfolded.includes("UNTIL=20261201"), "A6 iCal: تذكير قبل أسبوع (٢٤ نوفمبر) ويوم الانتهاء وأول أحدٍ قادم (١٥ نوفمبر)");
    const ended = CAL.reportCalendar({ id: "c9", company: "ش", startDay: "2026-01-01", endDay: "2026-02-01" }, "https://x.test/r", "2026-11-10");
    check(!ended.includes("BEGIN:VEVENT"), "A6 iCal: حملةٌ منتهية بلا أحداث");
  }
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
  check(R.injectPlanFor("/me")?.slot === "" && R.injectPlanFor("/me")?.pulse === "me" && R.injectPlanFor("/t/abc")?.slot === "schedule" && R.injectPlanFor("/s/abc")?.slot === "schedule" && R.injectPlanFor("/m/abc")?.slot === "" && R.injectPlanFor("/m/abc")?.pulse === "status", "A5 مواضع الإعلان في الصفحات: الجدولان فقط؛ «مساري» وحالة الطلب نبضٌ فقط (الأولى تطلب الرقم المدني قبل الدخول)");
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

  const { buildAudienceStats } = await import("../src/utils/audienceStats");
  /* ── محطة الاستراحة: دالةُ الفراغ في صفحة «مساري» تُستخرج من المصدر وتُجرَّب ── */
  const homeSrc = fs.readFileSync(path.join(process.cwd(), "src", "server", "studentHomePage.ts"), "utf8");
  const gapCode = homeSrc.slice(homeSrc.indexOf("function tkClock"), homeSrc.indexOf("function tkGrid("));
  const gapFns = new Function(`${gapCode};return {tkClock,tkLongestGap}`)() as { tkClock: (m: number) => string; tkLongestGap: (items: any[]) => any };
  const gapItems = [{ timesVisible: true, slots: [{ day: 0, start: 480, end: 570 }, { day: 2, start: 480, end: 570 }] }, { timesVisible: true, slots: [{ day: 0, start: 660, end: 750 }, { day: 2, start: 600, end: 690 }] }];
  const gapBest = gapFns.tkLongestGap(gapItems);
  check(gapBest?.day === 0 && gapBest.min === 90 && gapFns.tkClock(gapBest.from) === "9:30" && gapFns.tkClock(gapBest.to) === "11:00", "A13 أطول فراغٍ في أسبوع الطالب: الأحد من ٩:٣٠ إلى ١١:٠٠ (٩٠ دقيقة)", gapBest);
  check(gapFns.tkLongestGap([{ timesVisible: true, slots: [{ day: 1, start: 480, end: 540 }, { day: 1, start: 560, end: 620 }] }]) === null, "A13 فراغٌ أقل من ساعة لا يُعرض فيه إعلان");
  check(gapFns.tkLongestGap([{ timesVisible: false, slots: [{ day: 1, start: 480, end: 540 }, { day: 1, start: 700, end: 760 }] }]) === null, "A13 مواعيدٌ غير ظاهرة للطالب: لا استراحة");
  check(homeSrc.includes('adxMountLater("adx-break-box","break",') && homeSrc.includes('adxMountLater("adx-me-box","me",'), "A13 «مساري» تركّب موقعَي «مساري» و«محطة الاستراحة» من داخلها بعد الدخول");
  const gateStart = homeSrc.indexOf("function viewGate()"), gateEnd = homeSrc.indexOf("\n}", gateStart);
  check(gateStart > 0 && !homeSrc.slice(gateStart, gateEnd).includes("adxMount"), "A13 شاشة الدخول (الرقم المدني) لا تركّب أي إعلان");
  const { AD_CLIENT_SCRIPT: adjs } = await import("../src/server/adClientScript");
  check(adjs.includes("__adxPending") && homeSrc.includes("__adxPending"), "A13 الطلب المؤجَّل: إن سبقت التذكرةُ السكربتَ العام يُنفَّذ التركيب حين يجهز");

  /* ── اتجاهات الطلب: مجمّعة، وبحد خصوصية ── */
  const fp = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `fp-${tag}-${i}`);
  const dCourses = [
    { AdCourseId: 1, CourseCode: "CS101", CourseName: "مقدمة في الحاسوب" }, { AdCourseId: 2, CourseCode: "CS101", CourseName: "مقدمة في الحاسوب" },
    { AdCourseId: 3, CourseCode: "ENG1", CourseName: "اللغة الإنجليزية" }, { AdCourseId: 4, CourseCode: "RARE", CourseName: "مقرر نادر" },
  ] as any[];
  const wishOf = (fingerprint: string, courseIds: number[]) => ({ fingerprint, AdCollegeId: 1, lastSeenAt: "2026-01-02T00:00:00Z", wishes: { termId: 5, targetUnits: 15, courseIds, constraints: {}, updatedAt: "" } }) as any;
  const dProfiles = [
    ...fp(7, "a").map(f => wishOf(f, [1])), ...fp(6, "b").map(f => wishOf(f, [2])),   // 13 طالباً يريدون CS101 (بقسمين مختلفين برمزٍ واحد)
    ...fp(11, "c").map(f => wishOf(f, [3])),                                            // 11 للإنجليزية
    ...fp(9, "d").map(f => wishOf(f, [4])),                                             // 9 فقط: تحت الحد
  ];
  const dNeeds = new Map<number, any[]>([[5, [{ fingerprint: "fp-a-0", AdCollegeId: 1, requestType: "new-course", courseIds: [1], createdAt: "2026-01-01T00:00:00Z" }]]]);
  const dem = buildAudienceStats({ now: new Date("2026-02-01T00:00:00Z"), terms: [{ AdTermId: 5, AdTermName: "ف" }] as any[], currentTermId: 5, needsByTerm: dNeeds, instructorRequests: [], profiles: dProfiles, courses: dCourses });
  check(dem.demand.top[0]?.name === "مقدمة في الحاسوب" && dem.demand.top[0]?.students === 13, "A12 المقرر نفسه في قسمين برمزٍ واحد يُجمَّع، والطالب المكرَّر يُعدّ مرة (١٣)", dem.demand);
  check(dem.demand.top.length === 2 && dem.demand.top[1].students === 11, "A12 الإنجليزية ١١ طالباً تظهر", dem.demand);
  check(!dem.demand.top.some(d => d.name === "مقرر نادر") && dem.demand.hidden === 1, "A12 مقررٌ بتسعة طلاب لا يظهر ويُعدّ مخفياً (حد الخصوصية ١٠)", dem.demand);
  check(!JSON.stringify(dem).includes("fp-"), "A12 لا بصمةَ طالبٍ في المخرجات");

  /* ── التجربة والأسبوع والمقارنة ── */
  check(E.trialProblems({ company: "أ", trial: true, startDay: "2026-11-01", endDay: "2026-11-07" }, []).length === 0, "A11 تجربةٌ من ٧ أيام تُقبل");
  check(E.trialProblems({ company: "أ", trial: true, startDay: "2026-11-01", endDay: "2026-11-08" }, []).some(p => p.includes("سبعة أيام")), "A11 تجربةٌ من ٨ أيام تُرفض");
  check(E.trialProblems({ company: "  شركة   الواحة ", trial: true, startDay: "2026-11-01", endDay: "2026-11-05" }, [camp({ company: "شركة الواحة", trial: true })]).some(p => p.includes("من قبل")), "A11 تجربةٌ ثانية لشركةٍ نفسها (ولو اختلفت المسافات) تُرفض");
  check(E.trialProblems({ company: "أ", trial: false, startDay: "2026-01-01", endDay: "2026-12-30" }, []).length === 0, "A11 الحملة العادية لا تخضع لقيد التجربة");
  const wk = E.weeklyCompare([
    { id: "1", campaignId: "c", creativeId: "a", day: "2026-11-10", impressions: 100, uniques: 50, clicks: 5, filteredClicks: 0 },
    { id: "2", campaignId: "c", creativeId: "a", day: "2026-11-03", impressions: 50, uniques: 30, clicks: 5, filteredClicks: 0 },
  ], "2026-11-10");
  check(wk.thisWeek.impressions === 100 && wk.lastWeek.impressions === 50 && wk.impressionsChange === 100 && wk.clicksChange === 0 && wk.hasLastWeek, "A11 الأسبوع مقابل الماضي: +١٠٠٪ ظهور، والنقرات ثابتة");
  check(E.weeklyCompare([], "2026-11-10").impressionsChange === null && !E.weeklyCompare([], "2026-11-10").hasLastWeek, "A11 بلا أسبوعٍ سابق: لا نسبة");
  const bc = [camp({ id: "a", slot: "me" }), camp({ id: "b", slot: "me" }), camp({ id: "c", slot: "me" })];
  const bs = (id: string, imp: number, clk: number) => ({ id: id, campaignId: id, creativeId: "x", day: "2026-11-10", impressions: imp, uniques: imp, clicks: clk, filteredClicks: 0 });
  check(E.slotBenchmarkCtr("a", "me", bc, [bs("b", 1000, 20), bs("c", 1000, 40)]) === 3, "A11 متوسط نقر الحملات الأخرى في الموقع (٢٪ و٤٪ ← ٣٪)");
  check(E.slotBenchmarkCtr("a", "me", bc, [bs("b", 1000, 20)]) === null && E.slotBenchmarkCtr("a", "me", bc, [bs("b", 100, 20), bs("c", 100, 5)]) === null, "A11 عيّنةٌ صغيرة: لا مقارنة");

  /* ── جودة الصورة: من البكسلات ── */
  const Q = await import("../src/utils/adQuality");
  const fill = (w: number, h: number, px: (x: number, y: number) => [number, number, number, number]) => {
    const a = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b, al] = px(x, y); const i = (y * w + x) * 4; a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = al; }
    return a;
  };
  const checker = (lo: number, hi: number, alpha = 255) => fill(120, 60, (x, y) => { const v = ((x >> 3) + (y >> 3)) % 2 ? hi : lo; return [v, v, v, alpha]; });
  check(Q.qualityProblems(Q.measureQuality(checker(0x14, 0xe6), 120, 60)).length === 0, "A10 صورةٌ بتباينٍ وتفاصيل تمرّ فحص الجودة");
  check(Q.qualityProblems(Q.measureQuality(fill(120, 60, () => [250, 250, 250, 255]), 120, 60)).some(p => p.includes("شبه فارغة")), "A10 صورةٌ بيضاء فارغة: «شبه فارغة»");
  check(Q.qualityProblems(Q.measureQuality(checker(0x60, 0x90), 120, 60)).some(p => p.includes("التباين")), "A10 تباينٌ ضعيف (رماديان متقاربان) يُرفض");
  check(Q.qualityProblems(Q.measureQuality(checker(0x14, 0xe6, 40), 120, 60)).some(p => p.includes("شفافة")), "A10 صورةٌ شفافةٌ في معظمها تُرفض");
  check(Q.qualityProblems(Q.measureQuality(fill(120, 60, (x) => { const v = Math.round((x / 120) * 255); return [v, v, v, 255]; }), 120, 60)).some(p => p.includes("لا تفاصيل")), "A10 تدرّجٌ ناعم بلا نصٍّ ولا أشكال: «لا تفاصيل»");
  check(Q.qualityProblems(Q.measureQuality(new Uint8ClampedArray(0), 0, 0)).length > 0, "A10 صورةٌ بلا بكسلات لا تمرّ");

  /* ── المواسم والاستهداف ── */
  const SE = await import("../src/utils/adSeasons");
  const DAY = 86_400_000;
  const T0 = Date.parse("2026-09-13T00:00:00");
  const term = { AdTermId: 1, AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 14, AdTermClosed: false } as any;
  check(SE.activeSeasons([term], T0 + 2 * DAY).join() === "start", "A8 أول أيام الفصل: «بدء الفصل»");
  check(SE.activeSeasons([term], T0 + 40 * DAY).join() === "middle", "A8 منتصف الفصل");
  check(SE.activeSeasons([term], T0 + 14 * 7 * DAY - 10 * DAY).join() === "finals", "A8 آخر الأسابيع: «نهاية الفصل»");
  check(SE.activeSeasons([term], T0 + 200 * DAY).join() === "break", "A8 بعد الفصل ولا فصل جارٍ: «بين الفصول»");
  const withPhases = { ...term, AdTermStudentPhases: { wishesOpen: "2026-11-01", wishesClose: "2026-11-10", requestsClose: "2026-12-20", rounds: [{ id: "r1", name: "مبكر", start: "2026-11-15", end: "2026-11-20" }] } } as any;
  const inWishes = Date.parse("2026-11-05T09:00:00+03:00");
  check(SE.activeSeasons([withPhases], inWishes).includes("registration") && SE.activeSeasons([withPhases], inWishes).includes("middle"), "A8 الرغبات مفتوحة: «التسجيل» مع موسم الفصل معاً");
  check(!SE.activeSeasons([withPhases], Date.parse("2026-12-25T09:00:00+03:00")).includes("registration"), "A8 بعد إغلاق الطلبات: لا «تسجيل»");
  const cal = SE.seasonCalendar([withPhases], Date.parse("2026-09-01T00:00:00+03:00"), "2026-09-01");
  const kinds = cal.map(i => i.season);
  check(kinds.includes("start") && kinds.includes("middle") && kinds.includes("finals") && kinds.includes("registration"), "A8 التقويم يحوي البدء والمنتصف والنهاية والتسجيل", kinds);
  const sFinals = cal.find(i => i.season === "finals")!, sMid = cal.find(i => i.season === "middle")!, sStart = cal.find(i => i.season === "start")!;
  check(sStart.to < sMid.from && sMid.to < sFinals.from && sFinals.to === "2026-12-17", "A8 المواسم متتالية بلا تداخل، والنهاية الخميس 17/12/2026", { sStart, sMid, sFinals });

  const tgt = (over: Partial<import("../src/types").AdCampaign>) => camp({ ...over });
  check(E.eligibleNow(tgt({ seasons: ["start"] }), { today: "2026-11-10", seasons: ["start"] }), "A8 الموسم يطابق فتُعرض");
  check(!E.eligibleNow(tgt({ seasons: ["finals"] }), { today: "2026-11-10", seasons: ["start", "registration"] }), "A8 موسمٌ لم يحن: لا تُعرض");
  check(E.eligibleNow(tgt({}), { today: "2026-11-10", seasons: [] }), "A8 بلا استهداف: تُعرض دائماً");
  check(!E.eligibleNow(tgt({ colleges: [3] }), { today: "2026-11-10", seasons: [] }), "A8 مستهدفةٌ بكلية ولا سياق (مساري): لا تُعرض");
  check(E.campaignProblems({ company: "أ", category: "ج", slot: "me", startDay: "2026-11-05", endDay: "2026-11-20", colleges: [3] }).length === 0, "A8 «مساري» يقبل الاستهداف بكلية (يعرفها من ملف الطالب)");
  check(E.eligibleNow(tgt({ colleges: [3] }), { today: "2026-11-10", seasons: [], collegeId: 3 }) && !E.eligibleNow(tgt({ colleges: [3] }), { today: "2026-11-10", seasons: [], collegeId: 4 }), "A8 الكلية تطابق أو لا");
  check(E.cleanSeasons(["start", "hack", "start", 5]).join() === "start" && E.cleanColleges(["3", 3, -1, 2.5, "x", 7]).join() === "3,7", "A8 تنظيف قوائم الاستهداف");
  /* السعة تُحسب على من يتقاطع جمهورُهم: ٥ حملات في «مساري» لكلٍّ موسمُها لا تملأ الموقع. */
  const bySeason = ["registration", "start", "middle", "finals", "break"].map((se, i) => camp({ slot: "me", seasons: [se], category: `ف${i}` }));
  check(E.placementProblems({ company: "س", category: "جديدة", slot: "me", startDay: "2026-11-05", endDay: "2026-11-20", seasons: ["start"] }, [...bySeason, ...bySeason.slice(0, 4).map((c, i) => ({ ...c, id: `x${i}`, category: `ز${i}` }))].filter(c => c.seasons?.[0] !== "start" || false)).length === 0, "A8 موقعٌ مزدحم بحملاتٍ لمواسم أخرى يقبل موسماً جديداً");
  const sameSeason = Array.from({ length: 5 }, (_, i) => camp({ slot: "me", seasons: ["start"], category: `ك${i}` }));
  check(E.placementProblems({ company: "س", category: "جديدة", slot: "me", startDay: "2026-11-05", endDay: "2026-11-20", seasons: ["start"] }, sameSeason).some(p => p.includes("ممتلئ")), "A8 خمس حملات لموسمٍ واحد تملأ الموقع لذلك الموسم");
  check(E.placementProblems({ company: "س", category: "ك0", slot: "me", startDay: "2026-11-05", endDay: "2026-11-20", seasons: ["finals"] }, [camp({ slot: "me", seasons: ["start"], category: "ك0" })]).length === 0, "A8 منافسان من فئةٍ واحدة لموسمين مختلفين لا يتعارضان");
  /* السعة لكل شريحة: ٣ حملات «بدء» و٣ «نهاية» تتعايشان ويقبل الموقع حملةً تستهدف الموسمين معاً. */
  const startThree = [1, 2, 3].map(i => camp({ slot: "me", seasons: ["start"], category: `س${i}` }));
  const finalsThree = [1, 2, 3].map(i => camp({ slot: "me", seasons: ["finals"], category: `ن${i}` }));
  check(E.placementProblems({ company: "ب", category: "ج", slot: "me", startDay: "2026-11-05", endDay: "2026-11-20", seasons: ["start", "finals"] }, [...startThree, ...finalsThree]).length === 0, "A8 حملةٌ لموسمين تُقبل حين لا يتجاوز أيُّ موسمٍ سعته (٣+١ ≤ ٥)");
  const startFive = [1, 2, 3, 4, 5].map(i => camp({ slot: "me", seasons: ["start"], category: `ب${i}` }));
  check(E.placementProblems({ company: "ب", category: "ج", slot: "me", startDay: "2026-11-05", endDay: "2026-11-20", seasons: ["start", "finals"] }, startFive).some(p => p.includes("ممتلئ") && p.includes("بدء الفصل")), "A8 ويُرفض حين يمتلئ أحد موسميها، مع ذكر الموسم", E.placementProblems({ company: "ب", category: "ج", slot: "me", startDay: "2026-11-05", endDay: "2026-11-20", seasons: ["start", "finals"] }, startFive));
  const byCollege = [camp({ slot: "schedule", colleges: [1], category: "ك1" }), camp({ slot: "schedule", colleges: [1], category: "ك2" }), camp({ slot: "schedule", colleges: [1], category: "ك3" })];
  check(E.placementProblems({ company: "ب", category: "ج", slot: "schedule", startDay: "2026-11-05", endDay: "2026-11-20", colleges: [2] }, byCollege).length === 0, "A8 السعة لكل كلية: ٣ حملات للكلية ١ لا تملأ موقع الكلية ٢");
  check(E.placementProblems({ company: "ب", category: "ج", slot: "schedule", startDay: "2026-11-05", endDay: "2026-11-20" }, byCollege).some(p => p.includes("ممتلئ")), "A8 وحملةٌ بلا كلية (تُعرض أيضاً حيث لا سياق وللكلية ١) تُرفض لامتلاء شريحة الكلية ١");
  check(E.slotById("break")?.width === 480 && E.slotById("break")?.audience === "students", "A8 موقع «محطة الاستراحة» معرَّف");

  /* فشلُ كتابة النبض لا يُسقط الدفعة: تُدمج في ما وصل بعدها. */
  const merged = R.mergeAudience(
    { visits: { me: 2 }, returning: 1, fresh: 1, mobile: 2, desktop: 0, installed: 0, hours: { "9": 2 } },
    { visits: { me: 3, status: 1 }, returning: 2, fresh: 2, mobile: 1, desktop: 3, installed: 1, hours: { "9": 1, "10": 3 } });
  check(merged.visits.me === 5 && merged.visits.status === 1 && merged.hours["9"] === 3 && merged.hours["10"] === 3 && merged.installed === 1 && merged.returning === 3, "A5 دمج دفعة النبض الفاشلة في الجديدة بلا فقد");

  /* إجمالي «كل الفصول» يشمل أكثر من ١٢ فصلاً، والرسم لآخر ١٢ فقط. */
  const manyTerms = Array.from({ length: 15 }, (_, i) => ({ AdTermId: i + 1, AdTermName: `ف${i + 1}` })) as any[];
  const needs = new Map<number, any[]>(manyTerms.map(t => [t.AdTermId, [{ fingerprint: `fp-${t.AdTermId}`, AdCollegeId: 1, requestType: "new-course", createdAt: "2026-01-01T00:00:00Z" }]]));
  const all = buildAudienceStats({ now: new Date("2026-02-01T00:00:00Z"), terms: manyTerms, currentTermId: 15, needsByTerm: needs, instructorRequests: [], profiles: [] });
  check(all.survey.allTimeStudents === 15 && all.survey.allTimeAnswers === 15 && all.survey.terms.length === 12, "A7 الإجمالي عبر ١٥ فصلاً والرسم لآخر ١٢");

  const sw = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");
  check(sw.includes('"/_ads/"') && sw.includes('"/_pulse"') && sw.includes('"/ad-report/"') && sw.includes('"/partners/"') && sw.includes('"/measurement"'), "A5 الـ service worker يتجاوز الإعلانات والنبض وصفحتي الشركاء");

  /* ── A6: المسارات الحقيقية على خادمٍ مصغَّر ── */
  const express = (await import("express")).default;
  const { Repository } = await import("../src/db/repository");
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const allow = (_q: any, _r: any, next: any) => next();
  /* يحاكي middleware التدقيق في server.ts: يقرأ ما سمّته المعالجات عند انتهاء الرد. */
  const audited: Array<{ entity?: string; id?: string; text?: string; path: string; status: number }> = [];
  app.use((req, res, next) => { res.on("finish", () => { if (req.method !== "GET") audited.push({ entity: res.locals.auditEntity, id: res.locals.auditEntityId, text: res.locals.auditChanges, path: req.path, status: res.statusCode }); }); next(); });
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
    const lastAudit = () => audited[audited.length - 1];
    check(lastAudit()?.entity === "ads" && lastAudit()?.id === id && String(lastAudit()?.text).includes("إنشاء حملة «مطعم الواحة»"), "A6 سجلّ التدقيق: إنشاء الحملة يُسمّى بالعربية", lastAudit());

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
    check(String(audited[audited.length - 1]?.text).includes("حملة «مطعم الواحة»: اعتماد بإقرار الشروط"), "A6 سجلّ التدقيق: الاعتماد يذكر إقرار الشروط", audited[audited.length - 1]);

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
    check(!report.text.includes("curl") && !report.text.replace(/webcal:\/\/127\.0\.0\.1:\d+/g, "").includes("127.0.0.1"), "A6 التقرير لا يكشف عناوين ولا وكلاء مستخدمين");
    // تنبيهات الشركة بلا حساب: اشتراك تقويم برمز التقرير نفسه
    const repToken = String(mine.reportUrl).split("/").pop();
    const ics = await call("GET", `/ad-report/${repToken}/calendar.ics`);
    check(ics.status === 200 && String(ics.headers.get("content-type")).startsWith("text/calendar") && ics.text.startsWith("BEGIN:VCALENDAR") && ics.text.trimEnd().endsWith("END:VCALENDAR"), "A6 اشتراك التقويم: ملف iCalendar صالح");
    check(ics.text.includes(`DTSTART;VALUE=DATE:${mine.endDay.replace(/-/g, "")}`) && ics.text.includes("RRULE:FREQ=WEEKLY;BYDAY=SU") && ics.text.includes("TRIGGER;RELATED=START:PT9H"), "A6 اشتراك التقويم: يوم الانتهاء وتذكيرٌ أسبوعي وتنبيه");
    check(ics.text.split("\r\n").every(l => Buffer.byteLength(l) <= 75), "A6 اشتراك التقويم: الأسطر ≤٧٥ بايتاً");
    check(report.text.includes("calendar.ics") && report.text.includes("webcal://"), "A6 صفحة التقرير تعرض زر الاشتراك");
    check((await call("GET", "/ad-report/" + "z".repeat(32) + "/calendar.ics")).status === 404 && (await call("GET", "/ad-report/short/calendar.ics")).status === 404, "A6 اشتراك التقويم برمزٍ خاطئ: ٤٠٤");
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

    // التجربة المجانية عبر المسارات
    r = await call("POST", "/api/admin/ads/campaigns", { company: "تجريبية أ", category: "تعليم ودورات", slot: "break", startDay: today, endDay: dayPlus(9), trial: true, linkUrl: "https://t1.example.com" });
    check(r.status === 400 && String(r.json.error).includes("سبعة أيام"), "A11 تجربةٌ أطول من أسبوع تُرفض", r.json);
    const tr1 = await call("POST", "/api/admin/ads/campaigns", { company: "تجريبية أ", category: "تعليم ودورات", slot: "break", startDay: today, endDay: dayPlus(6), trial: true, linkUrl: "https://t1.example.com" });
    check(tr1.status === 200, "A11 تجربة ٧ أيام تُقبل", tr1.json);
    r = await call("POST", "/api/admin/ads/campaigns", { company: "تجريبية  أ", category: "تعليم ودورات", slot: "break", startDay: dayPlus(20), endDay: dayPlus(24), trial: true, linkUrl: "https://t1.example.com" });
    check(r.status === 400 && String(r.json.error).includes("من قبل"), "A11 التجربة الثانية للشركة نفسها تُرفض عبر المسار", r.json);
    await call("POST", `/api/admin/ads/campaigns/${tr1.json.id}/creatives`, png(480, 160), { "Content-Type": "image/png" });
    await call("POST", `/api/admin/ads/campaigns/${tr1.json.id}/status`, { action: "approve", rulesAccepted: true });
    const trRep = await call("GET", (await call("GET", "/api/admin/ads")).json.campaigns.find((x: any) => x.id === tr1.json.id).reportUrl);
    check(trRep.status === 200 && trRep.text.includes("خلاصة التجربة المجانية") && trRep.text.includes("حملة تجريبية"), "A11 تقرير التجربة يحوي خلاصتها ووسمها");
    const normalRep = await call("GET", (await call("GET", "/api/admin/ads")).json.campaigns.find((x: any) => x.id === id).reportUrl);
    check(!normalRep.text.includes("خلاصة التجربة المجانية"), "A11 التقرير العادي بلا خلاصة التجربة");
    // الجرس: حملةٌ تنتهي قريباً
    const soon = await call("POST", "/api/admin/ads/campaigns", { company: "قاربت", category: "مواصلات", slot: "dashboard", startDay: dayPlus(-3), endDay: dayPlus(2), linkUrl: "https://soon.example.com" });
    await call("POST", `/api/admin/ads/campaigns/${soon.json.id}/creatives`, png(480, 160), { "Content-Type": "image/png" });
    await call("POST", `/api/admin/ads/campaigns/${soon.json.id}/status`, { action: "approve", rulesAccepted: true });
    const bell = await R.adNotifications();
    check(bell.some(n => n.id.startsWith(`ad-ending:${soon.json.id}`) && n.title.includes("قاربت") && n.view === "ads" && n.tone === "action"), "A11 الجرس ينبّه قبل انتهاء الحملة", bell);
    check(bell.every(n => !n.title.includes("undefined") && !/NaN/.test(n.title + n.detail)), "A11 نصوص الجرس سليمة");

    // سياسة القياس: صفحةٌ عامة تصف ما يحدث فعلاً
    const meas = await call("GET", "/measurement");
    check(meas.status === 200 && meas.text.includes("لا نخزّن عنوان الاتصال") && meas.text.includes("دقيقتين") && meas.text.includes("adx:") && meas.text.includes("TESTNONCE"), "A12 صفحة «كيف نقيس» تعمل وتذكر ما يُحفظ وما لا يُحفظ");
    check(!/https?:\/\/[^"' ]*(google|facebook|doubleclick)/i.test(meas.text), "A12 الصفحة لا تشير إلى أي أداة تتبّعٍ خارجية");
    check(!meas.text.includes("الفيلكاوي") && !meas.text.includes("العنزي"), "A12 لا اسم مؤلفٍ في صفحةٍ عامة تخص القياس");
    check(!trRep.text.includes("الفيلكاوي") && !trRep.text.includes("العنزي"), "A12 لا اسمَ في صفحة تقرير الحملة");

    // فحص الجودة عبر المسار: فارغة تُرفض بـ٤٢٢ وأسبابها، والإدارة تتجاوز بقرارٍ صريح يُسجَّل.
    const qc = await call("POST", "/api/admin/ads/campaigns", { company: "جودة", category: "كتب وقرطاسية", slot: "break", startDay: today, endDay: dayPlus(5), linkUrl: "https://q.example.com" });
    const solid = png(480, 160, 0xf0, 0xf0);
    r = await call("POST", `/api/admin/ads/campaigns/${qc.json.id}/creatives`, solid, { "Content-Type": "image/png" });
    check(r.status === 422 && r.json.code === "quality" && Array.isArray(r.json.problems) && r.json.problems.length > 0, "A10 صورةٌ فارغة: ٤٢٢ مع الأسباب", r.json);
    check((await call("GET", "/api/admin/ads")).json.campaigns.find((x: any) => x.id === qc.json.id).creatives.length === 0, "A10 الصورة المرفوضة لم تُحفظ");
    r = await call("POST", `/api/admin/ads/campaigns/${qc.json.id}/creatives`, solid, { "Content-Type": "image/png", "X-Quality-Override": "1" });
    check(r.status === 200 && String(audited[audited.length - 1]?.text).includes("رغم تحذير فحص الجودة"), "A10 التجاوز بقرار الإدارة يرفع الصورة ويُسجَّل", r.json);
    check((await call("GET", "/api/admin/ads")).json.campaigns.find((x: any) => x.id === qc.json.id).creatives.length === 1, "A10 الصورة المتجاوَزة محفوظة");

    // الاستهداف بالموسم عبر المسارات: موسمٌ فاعل الآن يُعرض، وموسمٌ غيرُ فاعلٍ لا يُعرض، والكلية تحتاج رابطاً يعرفها.
    const adminNow = (await call("GET", "/api/admin/ads")).json;
    const activeNow: string[] = adminNow.activeSeasons;
    const inactive = (adminNow.seasons as any[]).map(x => x.id).find((x: string) => !activeNow.includes(x));
    check(Array.isArray(adminNow.seasons) && adminNow.seasons.length === 5 && Array.isArray(adminNow.calendar) && Array.isArray(adminNow.colleges), "A9 الشاشة تستلم المواسم والتقويم والكليات");
    const mkTargeted = async (company: string, category: string, extra: any, slot = "schedule", w = 640, h = 160) => {
      const c1 = await call("POST", "/api/admin/ads/campaigns", { company, category, slot, startDay: today, endDay: dayPlus(10), linkUrl: `https://c${Math.floor(Math.random() * 1e9)}.example.com`, ...extra });
      await call("POST", `/api/admin/ads/campaigns/${c1.json.id}/creatives`, png(w, h), { "Content-Type": "image/png" });
      const ap = await call("POST", `/api/admin/ads/campaigns/${c1.json.id}/status`, { action: "approve", rulesAccepted: true });
      return { id: c1.json.id as string, ap };
    };
    const inSeason = await mkTargeted("موسمي", "سفر وسياحة", { seasons: [activeNow[0]] });
    const offSeason = inactive ? await mkTargeted("خارج الموسم", "ترفيه", { seasons: [inactive] }) : null;
    check(inSeason.ap.status === 200, "A9 اعتماد حملةٍ لموسمٍ فاعل", inSeason.ap.json);
    let sched = (await call("GET", "/_ads/serve?slot=schedule")).json.items.map((x: any) => x.c);
    check(sched.includes(inSeason.id), "A9 حملة الموسم الفاعل تُعرض");
    if (offSeason) check(!sched.includes(offSeason.id), "A9 حملة الموسم غير الفاعل لا تُعرض");
    const link = await Repository.createShareLink({ AdCollegeId: 3, AdSectionId: 1, AdTermId: 1, label: "اختبار", expiresAt: new Date(Date.now() + 86400000).toISOString(), SystemUserId: 1, userName: "t", showInstructors: false });
    const college3 = await mkTargeted("كلية٣", "صحة ولياقة", { colleges: [3] });
    sched = (await call("GET", "/_ads/serve?slot=schedule")).json.items.map((x: any) => x.c);
    check(!sched.includes(college3.id), "A9 حملة بكلية بلا رابطٍ يعرفها (مساري): لا تُعرض");
    sched = (await call("GET", `/_ads/serve?slot=schedule&t=${encodeURIComponent(link.id)}`)).json.items.map((x: any) => x.c);
    check(sched.includes(college3.id), "A9 الرابطُ الذي كليتُه ٣ يعرض حملة الكلية ٣");
    const meCollege3 = await mkTargeted("مساري كلية٣", "مواصلات", { colleges: [3] }, "break", 480, 160);
    check(meCollege3.ap.status === 200, "A9 اعتماد حملةٍ في محطة الاستراحة محصورةٍ بكلية", meCollege3.ap.json);
    const meIds = async (q: string) => (await call("GET", `/_ads/serve?slot=break${q}`)).json.items.map((x: any) => x.c);
    check(!(await meIds("")).includes(meCollege3.id), "A9 الاستراحة بلا كلية معروفة: الحملة المحصورة لا تُعرض");
    check((await meIds("&c=3")).includes(meCollege3.id), "A9 الاستراحة لطالبٍ كليتُه ٣: تُعرض");
    check(!(await meIds("&c=4")).includes(meCollege3.id), "A9 الاستراحة لطالبٍ كليتُه ٤: لا تُعرض");
    check(!(await meIds("&c=abc")).includes(meCollege3.id) && !(await meIds("&c=-3")).includes(meCollege3.id), "A9 قيمة كلية فاسدة تُتجاهل");
    const link4 = await Repository.createShareLink({ AdCollegeId: 4, AdSectionId: 1, AdTermId: 1, label: "اختبار٤", expiresAt: new Date(Date.now() + 86400000).toISOString(), SystemUserId: 1, userName: "t", showInstructors: false });
    sched = (await call("GET", `/_ads/serve?slot=schedule&t=${encodeURIComponent(link4.id)}`)).json.items.map((x: any) => x.c);
    check(!sched.includes(college3.id), "A9 رابطُ كلية ٤ لا يعرض حملة الكلية ٣");
    sched = (await call("GET", `/_ads/serve?slot=schedule&t=${encodeURIComponent("demo.xyz")}`)).json.items.map((x: any) => x.c);
    check(!sched.includes(college3.id), "A9 الرمز التجريبي لا يُنتج سياقاً");
    // تعديل موسم حملةٍ معتمدة يعيدها مسودة
    const re = await call("POST", "/api/admin/ads/campaigns", { id: inSeason.id, company: "موسمي", category: "سفر وسياحة", slot: "schedule", startDay: today, endDay: dayPlus(10), linkUrl: "https://moseme.example.com", seasons: activeNow.length > 1 ? [activeNow[1]] : ["registration", "start"] });
    check(re.status === 200 && (await call("GET", "/api/admin/ads")).json.campaigns.find((x: any) => x.id === inSeason.id).status === "draft", "A9 تغيير موسم حملةٍ معتمدة يعيدها مسودة");
    check(String(audited[audited.length - 1]?.text).includes("عادت مسودةً"), "A9 سجلّ التدقيق يذكر عودتها مسودةً");
    const partnerPage = await call("GET", (await call("POST", "/api/admin/ads/partner-kit")).json.url);
    check(partnerPage.text.includes("تقويم المواسم") || adminNow.calendar.length === 0, "A9 ملف الشراكة يعرض تقويم المواسم عند وجود تواريخ فصل");
    check(!partnerPage.text.includes("الفيلكاوي") && !partnerPage.text.includes("العنزي"), "A12 لا اسمَ في ملف الشراكة");

    // الموقع المتوقف: حملةٌ جديدة عليه تُرفض، والمواقع الفاعلة وحدها تُعرض للإدارة
    r = await call("POST", "/api/admin/ads/campaigns", { company: "على متوقف", category: "ترفيه", slot: "status", startDay: today, endDay: dayPlus(5), linkUrl: "https://r.example.com" });
    check(r.status === 400 && String(r.json.error).includes("متوقف"), "A14 موقع «حالة الطلب» متوقف: لا حملة جديدة عليه", r.json);
    check(!(await call("GET", "/api/admin/ads")).json.slots.some((x: any) => x.id === "status") && (await call("GET", "/api/admin/ads")).json.slots.some((x: any) => x.id === "break"), "A14 الإدارة ترى المواقع الفاعلة فقط");

    // نوع الرابط يقرّر: الجدول للعرض يحمل إعلاناً؛ البطاقة والاستبيان وطلب الجدول (هوية) لا تحمل
    const mkLink = (kind: string, college = 7) => Repository.createShareLink({ AdCollegeId: college, AdSectionId: 1, AdTermId: 1, label: kind, expiresAt: new Date(Date.now() + 86400000).toISOString(), SystemUserId: 1, userName: "t", showInstructors: false, kind: kind as any });
    const links = { department: await mkLink("department"), students: await mkLink("students"), staff: await mkLink("staff"), survey: await mkLink("survey"), request: await mkLink("request") };
    const withAds = await mkTargeted("لكل الأنواع", "مواصلات", {});
    check(withAds.ap.status === 200, "A14 اعتماد حملةٍ عامة في الجدول العام", { ap: withAds.ap.json, id: withAds.id });
    const items = async (t?: string) => (await call("GET", `/_ads/serve?slot=schedule${t ? `&t=${encodeURIComponent(t)}` : ""}`)).json.items.map((x: any) => x.c);
    check((await items(links.department.id)).includes(withAds.id) && (await items(links.students.id)).includes(withAds.id), "A14 رابط جدول القسم وجدول الطلبة يحملان الإعلان");
    for (const kind of ["staff", "survey", "request"] as const) check((await items((links as any)[kind].id)).length === 0, `A14 رابط «${kind}» (يطلب هوية) لا يحمل أي إعلان`);
    check((await items("no-such-token-xyz")).length === 0, "A14 رمزٌ غير معروف: لا إعلان");
    check((await (await call("GET", `/_ads/serve?slot=schedule&t=${encodeURIComponent(links.staff.id)}`)).json).sponsor === null, "A14 ولا راعٍ في صفحةٍ تطلب هوية");

    // سجلّ التجربة دائم: فكّ الوسم أو الحذف لا يعيدان التجربة
    const t1 = await call("POST", "/api/admin/ads/campaigns", { company: "شركة دائمة", category: "سفر وسياحة", slot: "dashboard", startDay: today, endDay: dayPlus(5), trial: true, linkUrl: "https://perm.example.com" });
    check(t1.status === 200, "A14 تجربة أولى لشركة", t1.json);
    r = await call("POST", "/api/admin/ads/campaigns", { id: t1.json.id, company: "شركة دائمة", category: "سفر وسياحة", slot: "dashboard", startDay: today, endDay: dayPlus(5), trial: false, linkUrl: "https://perm.example.com" });
    check(r.status === 200, "A14 فكّ وسم التجربة عن الحملة نفسها مسموح");
    r = await call("POST", "/api/admin/ads/campaigns", { company: "شركة دائمة", category: "سفر وسياحة", slot: "dashboard", startDay: dayPlus(10), endDay: dayPlus(14), trial: true, linkUrl: "https://perm.example.com" });
    check(r.status === 400 && String(r.json.error).includes("من قبل"), "A14 بعد فكّ الوسم لا تجربة ثانية للشركة (السجل دائم)", r.json);
    await call("DELETE", `/api/admin/ads/campaigns/${t1.json.id}`);
    r = await call("POST", "/api/admin/ads/campaigns", { company: "شركة دائمة", category: "سفر وسياحة", slot: "dashboard", startDay: dayPlus(10), endDay: dayPlus(14), trial: true, linkUrl: "https://perm.example.com" });
    check(r.status === 400, "A14 وبعد حذف الحملة الأولى أيضاً لا تجربة ثانية", r.json);
    r = await call("POST", "/api/admin/ads/campaigns", { id: t1.json.id, company: "شركة دائمة", category: "سفر وسياحة", slot: "dashboard", startDay: today, endDay: dayPlus(5), trial: true, linkUrl: "https://perm.example.com" });

    // مفاتيح الحدّ (فيها العنوان) تُمحى فعلاً بعد نافذتها، كما تعد صفحة «كيف نقيس؟»
    const sizes0 = R.limiterSizes();
    check(sizes0.windows > 0, "A14 توجد مفاتيح حدٍّ بعد الطلبات", sizes0);
    R.sweepLimiters(Date.now() + 3 * 60_000);
    check(R.limiterSizes().windows === 0 && R.limiterSizes().clicks === 0, "A14 المسح بعد دقيقتين يفرّغ مفاتيح الحدّ كلها", R.limiterSizes());

    // الإيقاف الفوري والانتهاء
    r = await call("POST", `/api/admin/ads/campaigns/${id}/status`, { action: "pause" });
    check(String(audited[audited.length - 1]?.text).includes("إيقاف فوري"), "A6 سجلّ التدقيق: الإيقاف الفوري", audited[audited.length - 1]);
    serve = await call("GET", "/_ads/serve?slot=me");
    check(serve.json.items.length === 4 && !serve.json.items.some((x: any) => x.c === id), "A6 الإيقاف يسحب الحملة فوراً", serve.json.items.length);
    check((await call("GET", item.href)).headers.get("location") === "/", "A6 النقر على حملةٍ موقوفة لا يحوّل");
    check((await call("DELETE", `/api/admin/ads/campaigns/${id}`)).status === 200, "A6 حذف الحملة الموقوفة");

    // مرحلة قديمة: حملةٌ منتهية لا تُعرض ولو معتمدة
    const old = await call("POST", "/api/admin/ads/campaigns", { company: "قديمة", category: "سفر وسياحة", slot: "break", startDay: dayPlus(-30), endDay: dayPlus(-1), linkUrl: "https://old.example.com" });
    await call("POST", `/api/admin/ads/campaigns/${old.json.id}/creatives`, png(480, 160), { "Content-Type": "image/png" });
    await call("POST", `/api/admin/ads/campaigns/${old.json.id}/status`, { action: "approve", rulesAccepted: true });
    check(!(await call("GET", "/_ads/serve?slot=break")).json.items.some((x: any) => x.c === old.json.id), "A6 الحملة المنتهية لا تُعرض ولو كانت معتمدة");

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
    // النبض يُنسب إلى نوع الرابط الحقيقي لا إلى المسار
    const sources = async () => { await R.flushAdsCounters(); const v = (await call("GET", "/api/admin/audience-stats")).json.visits.bySource as Array<{ source: string; count: number }>; return Object.fromEntries(v.map(x => [x.source, x.count])) as Record<string, number>; };
    const visitsBefore = await sources();
    await call("POST", "/_pulse", { k: "schedule", r: 0, m: 0, t: links.staff.id });
    await call("POST", "/_pulse", { k: "schedule", r: 0, m: 0, t: links.survey.id });
    await call("POST", "/_pulse", { k: "schedule", r: 0, m: 0, t: links.department.id });
    const visitsAfter = await sources();
    check((visitsAfter.staff || 0) - (visitsBefore.staff || 0) === 1 && (visitsAfter.survey || 0) - (visitsBefore.survey || 0) === 1 && (visitsAfter.schedule || 0) - (visitsBefore.schedule || 0) === 1, "A14 زيارة بطاقة الأستاذ تُحسب «بطاقة» والاستبيان «استبيان» والجدول «جدول»", { visitsBefore, visitsAfter });


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
