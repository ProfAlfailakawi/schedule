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
  /* ── A14: التحليلات (خلاصة الحملة وA/B وذروة الاستخدام) والبريد الاختياري ── */
  {
    const INS = await import("../src/utils/adInsights");
    const MAIL = await import("../src/server/adMailer");
    const row = (day: string, creativeId: string, impressions: number, clicks: number): any => ({ id: day + creativeId, campaignId: "c", creativeId, day, impressions, uniques: impressions / 2, clicks, filteredClicks: 0 });
    const rows = [row("2026-11-01", "a", 300, 12), row("2026-11-02", "a", 900, 40), row("2026-11-03", "b", 300, 3), row("2026-11-08", "a", 400, 20)];
    const w = INS.wrapUp(rows);
    check(w.days === 4 && w.totals.impressions === 1900 && w.avgPerDay === 475, "A14 خلاصة الحملة: أيامٌ وإجماليٌّ ومتوسط", w);
    check(w.bestDay?.day === "2026-11-02" && w.bestDay.impressions === 900, "A14 خلاصة الحملة: أقوى يوم", w.bestDay);
    check(w.bestWeekday?.name === "الإثنين" && w.bestWeekday.share === 47, "A14 خلاصة الحملة: أقوى يومٍ في الأسبوع (الإثنين ٩٠٠ من ١٩٠٠)", w.bestWeekday);
    check(w.bestCreative?.creativeId === "a", "A14 خلاصة الحملة: الأقوى صورةً بشرط ظهورٍ كافٍ لكلٍّ منهما", w.bestCreative);
    check(INS.wrapUp([row("2026-11-01", "a", 900, 40)]).bestCreative === null, "A14 صورةٌ واحدة: لا «أقوى صورة»");
    check(INS.abVerdict([{ creativeId: "a", impressions: 900, clicks: 40 }]).state === "single", "A14 A/B: صورةٌ واحدة");
    const coll = INS.abVerdict([{ creativeId: "a", impressions: 900, clicks: 40 }, { creativeId: "b", impressions: 100, clicks: 9 }]);
    check(coll.state === "collecting" && (coll as any).need === 400, "A14 A/B: ظهورٌ غير كافٍ يُعلَن ويُقال كم ينقص", coll);
    check(INS.abVerdict([{ creativeId: "a", impressions: 1000, clicks: 30 }, { creativeId: "b", impressions: 1000, clicks: 27 }]).state === "tie", "A14 A/B: فرقٌ صغير = لا فرق معنوي");
    const win = INS.abVerdict([{ creativeId: "a", impressions: 2000, clicks: 40 }, { creativeId: "b", impressions: 2000, clicks: 100 }]);
    check(win.state === "winner" && (win as any).winner === "b" && (win as any).loser === "a" && (win as any).winnerCtr === 5, "A14 A/B: فرقٌ معنوي يسمّي الفائز", win);
    const onlyB = INS.wrapUp([row("2026-11-01", "a", 900, 40), row("2026-11-02", "b", 900, 10), row("2026-11-03", "c", 900, 80)], ["a", "b"]);
    check(onlyB.bestCreative?.creativeId === "a", "A14 خلاصة الحملة: تُقارن الصور الحالية وحدها (المحذوفة لا تُرشَّح)", onlyB.bestCreative);
    const endedMail = MAIL.renewalMail({ company: "ش", endDay: "2026-10-01" }, -12, "https://x.test/r");
    const todayMail = MAIL.renewalMail({ company: "ش", endDay: "2026-10-01" }, 0, "https://x.test/r");
    const soonMail = MAIL.renewalMail({ company: "ش", endDay: "2026-10-01" }, 3, "https://x.test/r");
    check(endedMail.text.includes("انتهت حملة «ش» قبل") && !endedMail.text.includes("اليوم") && todayMail.text.includes("اليوم") && soonMail.text.includes("بعد"), "A14 تذكير التجديد: صياغةٌ صادقة للمنتهية واليوم والقادمة", endedMail.text);
    const { AD_CLIENT_SCRIPT: adScript } = await import("../src/server/adClientScript");
    check(adScript.includes('var sponsor=slot==="break"?null:'), "A14 محطة الاستراحة لا تكرر شريط الراعي (يظهر مرةً مع إعلان «مساري»)");
    /* A15: الرابط المتتبَّع، والتحويل المُبلَّغ، والشارة، وسقف الظهور اليومي */
    const tl = (url: string) => E.trackedLink(url, { id: "ABCD-1234-xyz", slot: "me" } as any);
    check(tl("https://a.example.com/x?y=1") === "https://a.example.com/x?y=1&utm_source=schedule&utm_medium=banner&utm_campaign=ad-abcd1234&utm_content=me", "A15 رابط متتبَّع: يُضاف utm مع بقاء بارامترات الشركة");
    check(tl("https://a.example.com/x?UTM_source=mine") === "https://a.example.com/x?UTM_source=mine" && tl("not a url") === "not a url", "A15 رابط متتبَّع: وسوم الشركة تُحترم، والفاسد يُترك");
    check(tl("https://a.example.com/p#frag").endsWith("#frag") && tl("https://a.example.com/p#frag").includes("utm_source=schedule"), "A15 رابط متتبَّع: الجزء # محفوظ");
    const cv0 = INS.conversionOf(undefined, 100), cv1 = INS.conversionOf([{ day: "2026-11-01", count: 10, at: "" }, { day: "2026-11-02", count: 5, at: "" }], 100), cv2 = INS.conversionOf([{ day: "2026-11-01", count: 300, at: "" }], 100), cv3 = INS.conversionOf([{ day: "2026-11-01", count: 4, at: "" }], 0);
    check(cv0.note === "none" && cv0.total === 0 && cv0.perClick === null, "A15 التحويل: بلا تبليغ لا ادّعاء");
    check(cv1.total === 15 && cv1.perClick === 15 && cv1.note === "ok" && cv1.days === 2, "A15 التحويل: مجموعٌ ونسبةٌ من النقرات", cv1);
    check(cv2.note === "above-clicks" && cv3.perClick === null && cv3.note === "ok", "A15 التحويل: ملاحظةٌ محايدة إن فاق النقرات، ولا نسبة بلا نقرات");
    const BG = await import("../src/utils/adBadge");
    const badge = BG.partnerBadgeSvg({ company: `<script>alert(1)</script>"&'شركة`, startDay: "2026-11-01", endDay: "2026-12-01" });
    check(badge.startsWith("<?xml") && badge.includes("<svg") && !badge.includes("<script") && !/href=|xlink|onload|javascript:/i.test(badge) && badge.includes("&lt;script&gt;") && badge.includes("1 نوفمبر 2026") && badge.includes("\u2067"), "A15 الشارة: SVG بلا سكربت ولا مراجع، والنص مُهرَّب، والتاريخ بالعربية");
    check(BG.partnerBadgeSvg({ company: "ش".repeat(80), startDay: "2026-11-01", endDay: "2026-12-01" }).includes("…"), "A15 الشارة: الاسم الطويل يُقتطع");
    /* سقف الظهور اليومي: السكربت الحقيقي في بيئة وهمية؛ عند ٦٠ لا طلبَ خدمة، وتحته يُطلب */
    {
      const elStub = (): any => new Proxy({ style: {}, classList: { add() {}, remove() {}, toggle() {} } } as any, { get: (t: any, p: string) => (p in t ? t[p] : typeof p === "string" ? () => elStub() : undefined), set: () => true });
      const run = (stored: string | null) => {
        const store: Record<string, string> = {}; const todayK = new Date(Date.now() + 10800000).toISOString().slice(0, 10);
        if (stored !== null) store["adx:t:" + todayK] = stored;
        let fetched = 0;
        const box: any = { classList: { add() {} } };
        const ctx: any = {
          document: new Proxy({ currentScript: { getAttribute: () => "" }, hidden: false, readyState: "complete", head: elStub(), body: elStub(), documentElement: Object.assign(elStub(), { contains: () => true }), createElement: () => elStub() } as any, { get: (target: any, prop: string) => (prop in target ? target[prop] : () => null) }),
          localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = String(v); }, removeItem: (k: string) => { delete store[k]; } },
          fetch: () => { fetched++; return new Promise(() => undefined); },
          navigator: {}, location: { pathname: "/me", search: "" }, setTimeout, clearTimeout, Date, parseInt, JSON, Blob: function () {}, Promise,
          matchMedia: () => ({ matches: false }), addEventListener() {}, IntersectionObserver: undefined,
        };
        ctx.window = ctx; vm.createContext(ctx);
        try { vm.runInContext(adScript, ctx); ctx.window.AdxMount(box, "me"); } catch (e: any) { return { fetched: -1, err: String(e?.message || e) } as any; }
        return { fetched };
      };
      const capped = run("60"), under = run("59"), fresh = run(null);
      check(capped.fetched === 0, "A15 سقف الظهور: بعد ٦٠ ظهوراً في اليوم لا يُطلب إعلان", capped);
      check(under.fetched === 1 && fresh.fetched === 1, "A15 سقف الظهور: تحت السقف يُطلب الإعلان", { under, fresh });
    }
    const heat = Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d === 0 || d === 1 ? 10 : 2) * (h >= 10 && h <= 12 ? 5 : 1)));
    const pk = INS.peakSummary(heat)!;
    check(pk.topDays[0].name === "الأحد" && pk.window?.from === 10 && pk.window.to === 13 && pk.hourTotals.length === 24, "A14 الذروة: أيامٌ ونافذةٌ ١٠–١٣", pk);
    check(INS.peakSummary(heat.map(r => r.map(() => 0))) === null && INS.peakSummary([[1]]) === null, "A14 الذروة: عيّنةٌ ضئيلة أو شكلٌ فاسد: لا ادّعاء");
    check(INS.hourAr(0) === "12 ص" && INS.hourAr(12) === "12 م" && INS.hourAr(15) === "3 م", "A14 الساعة بنظام ١٢");
    check(MAIL.cleanEmail("a@b.co") === "a@b.co" && MAIL.cleanEmail(" A@B.CO ") === "a@b.co" && MAIL.cleanEmail("") === "" && MAIL.cleanEmail("x@y") === null && MAIL.cleanEmail("a b@c.com") === null, "A14 صحة البريد");
    check(MAIL.mailConfig({}) === null && MAIL.mailConfig({ AD_MAIL_API_KEY: "k" } as any) === null && MAIL.mailConfig({ AD_MAIL_API_KEY: "k", AD_MAIL_FROM: "f@x.co" } as any)?.url.startsWith("https://"), "A14 البريد معطَّل ما لم تُضبط الإعدادات");
    check(MAIL.weekKey("2026-11-08") === "2026-11-08" && MAIL.weekKey("2026-11-11") === "2026-11-08", "A14 مفتاح الأسبوع: الأحد أوله");
    const wm = MAIL.weeklyMail({ company: "ش", endDay: "2026-12-01" }, { thisWeek: { impressions: 1000, uniques: 0, clicks: 30, ctr: 3 }, lastWeek: { impressions: 800, uniques: 0, clicks: 0, ctr: 0 }, impressionsChange: 25, clicksChange: null, hasLastWeek: true }, "https://x.test/r");
    check(wm.text.split("\n").pop() === "تقريركم الحي: https://x.test/r" && wm.text.includes("ارتفاع") && !wm.text.includes("@"), "A14 رسالة الأسبوع: رابطٌ وتغيّر ولا بريد", wm.text);
    // إرسالٌ حقيقي إلى خادمٍ وهمي: الترويسة والجسم والخطأ
    const seen: any[] = [];
    const stub = http.createServer((req, res) => { let b = ""; req.on("data", d => (b += d)); req.on("end", () => { seen.push({ auth: req.headers.authorization, body: JSON.parse(b || "{}"), url: req.url }); res.statusCode = (req.url || "").includes("fail") ? 500 : 200; res.end("{}"); }); });
    await new Promise<void>(r => stub.listen(0, "127.0.0.1", () => r()));
    const stubUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
    const okSend = await MAIL.sendMail({ key: "K1", from: "no@x.co", url: stubUrl + "/ok" }, "c@x.co", { subject: "s", text: "t" });
    const badSend = await MAIL.sendMail({ key: "K1", from: "no@x.co", url: stubUrl + "/fail" }, "c@x.co", { subject: "s", text: "t" });
    check(okSend.ok && seen[0].auth === "Bearer K1" && seen[0].body.to[0] === "c@x.co" && seen[0].body.from === "no@x.co", "A14 الإرسال: ترويسة Bearer والمستلم", seen[0]);
    check(!badSend.ok && String(badSend.error).includes("500") && !String(badSend.error).includes("K1"), "A14 الإرسال: خطأ المزوّد يُعاد بلا كشف المفتاح", badSend);
    (globalThis as any).__adStub = { stub, stubUrl, seen };
    // صفحات الشركاء: خلاصة الحملة المنتهية وذروة الاستخدام
    const P = await import("../src/server/adsPages");
    const camp: any = { id: "c1", company: "مطعم الخلاصة", category: "مطاعم وكافيهات", slot: "me", creativeIds: ["a", "b"], linkUrl: "https://x.example.com", startDay: "2026-11-01", endDay: "2026-11-08", status: "approved", reportToken: "t".repeat(24), createdAt: "", updatedAt: "" };
    const heads: any[] = [{ id: "a", campaignId: "c1", label: "الصورة أ", width: 640, height: 200, bytes: 1, mime: "image/png", createdAt: "" }, { id: "b", campaignId: "c1", label: "الصورة ب", width: 640, height: 200, bytes: 1, mime: "image/png", createdAt: "" }];
    const endedPage = P.campaignReportPage({ campaign: camp, creatives: heads, stats: rows, liveInSlot: 1, today: "2026-11-20", nonce: "N", benchmarkCtr: 2 });
    check(endedPage.includes("خلاصة حملتكم") && endedPage.includes("أقوى يومٍ") && endedPage.includes("تثبيت مكان مطعم الخلاصة"), "A14 تقرير حملةٍ منتهية: خلاصةٌ ودعوة تجديد");
    check(!P.campaignReportPage({ campaign: camp, creatives: heads, stats: rows, liveInSlot: 1, today: "2026-11-05", nonce: "N" }).includes("خلاصة حملتكم"), "A14 حملةٌ جارية: لا خلاصة نهائية");
    const kitStats: any = { generatedAt: "", term: null, students: { profiles: 0, active7: 0, active30: 0, byCollege: [] }, survey: { allTimeAnswers: 0, allTimeStudents: 0, terms: [], current: { answers: 0, students: 0, byType: {}, byCollege: [], byDay: [] } }, instructors: { invited: 0, opened: 0, submitted: 0, openRate: 0, submitRate: 0, byCollege: [] }, visits: { since: "2026-10-01", days: 10, series: [], today: 0, last7: 0, last30: 0, total: 9000, bySource: [], returningRate: 0, mobileRate: 0, installs: 0, heat, peakDay: "الأحد" }, ads: {}, demand: { top: [], hidden: 0, minStudents: 10 }, reach: { studentsMin: 0, instructors: 0 } };
    const kit = P.partnerKitPage({ stats: kitStats, liveBySlot: {}, today: "2026-11-20", nonce: "N" });
    check(kit.includes("متى يفتح الطلبة البرنامج") && kit.includes("10 ص") && kit.includes("1 م"), "A14 ملف الشراكة: ذروة الاستخدام");
    kitStats.visits.heat = heat.map(r => r.map(() => 0));
    check(!P.partnerKitPage({ stats: kitStats, liveBySlot: {}, today: "2026-11-20", nonce: "N" }).includes("متى يفتح الطلبة البرنامج"), "A14 ملف الشراكة: بلا عيّنةٍ كافية لا قسم ذروة");
  }
  {
    const ics = CAL.reportCalendar({ id: "c9", company: "شركة, الأمل; للتقنية", startDay: "2026-11-01", endDay: "2026-12-01" }, "https://x.test/ad-report/abc", "2026-11-10", new Date("2026-11-10T00:00:00Z"));
    const lines = ics.split("\r\n");
    check(lines.every(l => new TextEncoder().encode(l).length <= 75), "A6 iCal: لا سطر يتجاوز ٧٥ بايتاً (طيٌّ سليم لا يقطع حرفاً عربياً)");
    const unfolded = ics.replace(/\r\n /g, "");
    check(unfolded.includes("SUMMARY:تنتهي حملة شركة\\, الأمل\\; للتقنية بعد أسبوع"), "A6 iCal: الفاصلة والفاصلة المنقوطة تُهرَّبان");
    check(unfolded.includes("DTSTART;VALUE=DATE:20261124") && unfolded.includes("DTSTART;VALUE=DATE:20261201") && unfolded.includes("DTSTART;VALUE=DATE:20261115") && unfolded.includes("UNTIL=20261201"), "A6 iCal: تذكير قبل أسبوع (٢٤ نوفمبر) ويوم الانتهاء وأول أحدٍ قادم (١٥ نوفمبر)");
    const late = CAL.reportCalendar({ id: "c9", company: "ش", startDay: "2026-11-01", endDay: "2026-12-01" }, "https://x.test/r", "2026-11-28").replace(/\r\n /g, "");
    check(late.includes("SUMMARY:تنتهي حملة ش بعد") && !late.includes("بعد أسبوع") && late.includes("DTSTART;VALUE=DATE:20261128"), "A6 iCal: مشتركٌ بعد موعد التحذير: تذكير اليوم بالأيام الفعلية لا «أسبوع»");
    const lastDay = CAL.reportCalendar({ id: "c9", company: "ش", startDay: "2026-11-01", endDay: "2026-12-01" }, "https://x.test/r", "2026-12-01").replace(/\r\n /g, "");
    check(!lastDay.includes(`UID:c9-renew@`) && lastDay.includes("UID:c9-end@"), "A6 iCal: يوم الانتهاء نفسه: حدثُ الانتهاء وحده");
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
    check(r.status === 302 && String(r.headers.get("location")).startsWith("https://oasis.example.com/offer?utm_source=schedule&utm_medium=banner&utm_campaign=ad-") && String(r.headers.get("location")).includes("utm_content=me"), "A6 النقر يحوّل إلى رابط الشركة موسوماً بـutm لتتحقق من أرقامنا", r.headers.get("location"));
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
    check(!report.text.includes("curl") && !report.text.replace(/(?:webcal|https?):\/\/127\.0\.0\.1:\d+/g, "").includes("127.0.0.1"), "A6 التقرير لا يكشف عناوين ولا وكلاء مستخدمين");
    // تنبيهات الشركة بلا حساب: اشتراك تقويم برمز التقرير نفسه
    const repToken = String(mine.reportUrl).split("/").pop();
    const ics = await call("GET", `/ad-report/${repToken}/calendar.ics`);
    check(ics.status === 200 && String(ics.headers.get("content-type")).startsWith("text/calendar") && ics.text.startsWith("BEGIN:VCALENDAR") && ics.text.trimEnd().endsWith("END:VCALENDAR"), "A6 اشتراك التقويم: ملف iCalendar صالح");
    check(ics.text.includes(`DTSTART;VALUE=DATE:${mine.endDay.replace(/-/g, "")}`) && ics.text.includes("RRULE:FREQ=WEEKLY;BYDAY=SU") && ics.text.includes("TRIGGER;RELATED=START:PT9H"), "A6 اشتراك التقويم: يوم الانتهاء وتذكيرٌ أسبوعي وتنبيه");
    check(ics.text.split("\r\n").every(l => Buffer.byteLength(l) <= 75), "A6 اشتراك التقويم: الأسطر ≤٧٥ بايتاً");
    check(report.text.includes("calendar.ics") && report.text.includes("webcal://"), "A6 صفحة التقرير تعرض زر الاشتراك");
    /* A15: شارة الشراكة والتحويل المُبلَّغ (غير موثَّق) عبر مسارات الخادم */
    check(report.text.includes("استعمال كود الخصم عندكم") && report.text.includes("مُبلَّغاً منكم") && report.text.includes("/partner-badge/") && !report.text.includes(`${repToken}/badge`) && report.text.includes("utm_source=schedule"), "A15 صفحة التقرير: نموذج التحويل والشارة ووسم utm");
    const badgePath = String(report.text.match(/\/partner-badge\/[0-9a-f]{32}\.svg/)?.[0]);
    const bd = await call("GET", badgePath);
    const bdText = await (await fetch(base + badgePath, { headers: { "User-Agent": UA } })).text();
    check(bd.status === 200 && String(bd.headers.get("content-type")).startsWith("image/svg+xml") && String(bd.headers.get("content-security-policy")).includes("default-src 'none'") && bd.headers.get("x-content-type-options") === "nosniff" && bdText.includes("<svg") && bdText.includes("مطعم الواحة"), "A15 الشارة: SVG بترويسات أمان واسم الشركة");
    check(String((await call("GET", badgePath + "?dl=1")).headers.get("content-disposition")).includes("attachment"), "A15 الشارة: تنزيل");
    check((await call("GET", "/partner-badge/" + "a".repeat(32) + ".svg")).status === 404, "A15 الشارة برمزٍ خاطئ: ٤٠٤");
    const draftC = await call("POST", "/api/admin/ads/campaigns", { company: "مسودة الشارة", category: "ترفيه", slot: "dashboard", startDay: today, endDay: dayPlus(3), linkUrl: "https://draft-badge.example.com" });
    const draftBadgeId = (await import("../src/server/adsPages")).badgeId(String((await call("GET", "/api/admin/ads")).json.campaigns.find((x: any) => x.id === draftC.json.id)?.reportUrl).split("/").pop());
    check((await call("GET", "/partner-badge/" + draftBadgeId + ".svg")).status === 404, "A15 الشارة: لا تُصدَر لمسودة");
    const form = (tok: string, body: Record<string, string>) => fetch(base + `/ad-report/${tok}/redemptions`, { method: "POST", redirect: "manual", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
    const conv = async () => (await call("GET", "/api/admin/ads")).json.campaigns.find((x: any) => x.id === id).conversion;
    check((await conv()).total === 0 && (await conv()).note === "none", "A15 التحويل: يبدأ بلا تبليغ");
    const r1 = await form(String(repToken), { day: today, count: "7" });
    check(r1.status === 303 && String(r1.headers.get("location")).includes("red=ok"), "A15 التبليغ: يُسجَّل ويعود لصفحة التقرير", r1.headers.get("location"));
    check((await conv()).total === 7 && (await conv()).days === 1, "A15 التبليغ: ظهر للإدارة مجموعاً", await conv());
    await form(String(repToken), { day: today, count: "9" });
    check((await conv()).total === 9 && (await conv()).days === 1, "A15 التبليغ: إدخالٌ واحدٌ لكل يوم يُستبدل", await conv());
    const badInputs: Array<Record<string, string>> = [{ day: dayPlus(2), count: "5" }, { day: E.addDays(today, -400), count: "5" }, { day: today, count: "-1" }, { day: today, count: "1.5" }, { day: today, count: "abc" }, { day: today, count: "100001" }, { day: "nope", count: "3" }];
    const badResults = await Promise.all(badInputs.map(async b => { const r = await form(String(repToken), b); return r.status === 303 && String(r.headers.get("location")).includes("red=bad"); }));
    check(badResults.every(Boolean) && (await conv()).total === 9, "A15 التبليغ: المستقبل وخارج الحملة والسالب والكسر والنص والفلكي كلها تُرفض ولا تغيّر شيئاً", badResults);
    check((await form("z".repeat(32), { day: today, count: "1" })).status === 404, "A15 التبليغ برمزٍ خاطئ: ٤٠٤");
    const afterReport = await call("GET", `${mine.reportUrl}?red=ok`);
    check(afterReport.text.includes("سُجِّل رقمكم") && afterReport.text.includes("المُبلَّغة") && afterReport.text.includes("(9)") === false && afterReport.text.includes(">9<"), "A15 صفحة التقرير تعرض ما بلّغته الشركة بوسم «مُبلَّغ»", afterReport.status);
    const kitTok = (await call("POST", "/api/admin/ads/partner-kit")).json.url;
    const kitHtml = (await call("GET", kitTok)).text;
    const serveJson = JSON.stringify((await call("GET", "/_ads/serve?slot=me")).json);
    check(!kitHtml.includes("مُبلَّغ") && !kitHtml.includes("استعمالات الكود") && !serveJson.includes("redemptions") && !serveJson.includes("conversion"), "A15 التحويل المُبلَّغ لا يدخل ملف الشراكة ولا خدمة الإعلانات");
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
    /* A14: بريد الشركة (إداريٌّ فقط) والإرسال */
    const bad = await call("POST", "/api/admin/ads/campaigns", { company: "بريدٌ فاسد", category: "ترفيه", slot: "dashboard", startDay: today, endDay: dayPlus(5), linkUrl: "https://bad-mail.example.com", contactEmail: "not-an-email" });
    check(bad.status === 400 && String(bad.json?.error).includes("بريد"), "A14 بريدٌ غير صالح يُرفض ٤٠٠", bad.json);
    /* نهايتها بعيدة: الأحد التالي لا يقع في «آخر أسبوع» فيُرسل تذكير تجديد بدل التقرير الأسبوعي، أياً كان يوم التشغيل. */
    const mailed = await mkTargeted("شركة البريد", "ترفيه", { contactEmail: "Owner@Company.co", endDay: dayPlus(40) }, "dashboard", 480, 160);
    check(mailed.ap.status === 200, "A14 اعتماد حملةٍ لها بريد", mailed.ap.json);
    const adminNow2 = (await call("GET", "/api/admin/ads")).json;
    const mc = adminNow2.campaigns.find((x: any) => x.id === mailed.id);
    check(mc.contactEmail === "owner@company.co" && adminNow2.mailEnabled === false && mc.ab?.state === "single", "A14 الإدارة ترى البريد (مطبَّعاً) والبريد معطَّل والمقارنة single", { e: mc.contactEmail, m: adminNow2.mailEnabled });
    const pubReport = await call("GET", mc.reportUrl);
    const pubServe = await call("GET", "/_ads/serve?slot=dashboard");
    check(!pubReport.text.includes("owner@company.co") && !JSON.stringify(pubServe.json).includes("owner@company.co"), "A14 البريد لا يظهر في صفحةٍ عامة ولا في الخدمة");
    const keep = await call("POST", "/api/admin/ads/campaigns", { id: mailed.id, company: mc.company, category: mc.category, slot: mc.slot, startDay: mc.startDay, endDay: mc.endDay, linkUrl: mc.linkUrl });
    check(keep.status === 200 && (await call("GET", "/api/admin/ads")).json.campaigns.find((x: any) => x.id === mailed.id).contactEmail === "owner@company.co", "A14 تعديلٌ لا يرسل حقل البريد لا يمسحه");
    const c1 = await Repository.claimAdMail(mailed.id, "weekly", "K-1", { weekly: "K-1" });
    const c2 = await Repository.claimAdMail(mailed.id, "weekly", "K-1", { weekly: "K-1" });
    const c3 = await Repository.claimAdMail(mailed.id, "weekly", "K-1", { weekly: "K-1" }, true);
    const afterClaim = (await Repository.listAdCampaigns()).find(x => x.id === mailed.id)!;
    check(c1 === true && c2 === false && c3 === true && afterClaim.mailLog?.weekly === "K-1" && afterClaim.contactEmail === "owner@company.co" && afterClaim.company === mc.company, "A14 حجز الإرسال: الأول يفوز والثاني يُمنع واليدوي يتجاوز ولا يمسّ بقية الحقول", afterClaim.mailLog);
    check(await Repository.claimAdMail("no-such", "weekly", "K", {}) === false, "A14 حجز حملةٍ غير موجودة: false");
    const off = await call("POST", `/api/admin/ads/campaigns/${mailed.id}/send-report`, { kind: "weekly" });
    check(off.status === 503 && String(off.json?.error).includes("غير مفعّل"), "A14 الإرسال بلا إعدادات: ٥٠٣ واضح", off.json);
    const stubState = (globalThis as any).__adStub;
    process.env.AD_MAIL_API_KEY = "TESTKEY"; process.env.AD_MAIL_FROM = "no-reply@x.co"; process.env.AD_MAIL_API_URL = stubState.stubUrl + "/send";
    try {
      check((await call("GET", "/api/admin/ads")).json.mailEnabled === true, "A14 البريد يُعدّ مفعّلاً بإعداداتٍ كاملة");
      const before = stubState.seen.length;
      const sent = await call("POST", `/api/admin/ads/campaigns/${mailed.id}/send-report`, { kind: "weekly" });
      const got = stubState.seen[stubState.seen.length - 1];
      check(sent.status === 200 && stubState.seen.length === before + 1 && got.body.to[0] === "owner@company.co" && got.body.text.includes(`/ad-report/${mc.reportUrl.split("/").pop()}`), "A14 الإرسال اليدوي يصل برابط التقرير", sent.json);
      /* التلقائي: أحد صباحاً مرةً واحدة في الأسبوع، وتذكير تجديد لا يتكرر */
      /* الأحد التالي لليوم لا اليوم نفسه: الإرسال اليدوي أعلاه سجّل «أسبوع اليوم»، فلو كان اليوم أحداً لتُخطّي التلقائي. */
      let sunday = E.addDays(today, 1); while (new Date(`${sunday}T00:00:00Z`).getUTCDay() !== 0) sunday = E.addDays(sunday, 1);
      const sundayMorning = new Date(`${sunday}T07:00:00Z`);
      const prior = stubState.seen.length;
      await R.autoMailTick("https://x.test", sundayMorning);
      const afterFirst = stubState.seen.length;
      await R.autoMailTick("https://x.test", sundayMorning);
      check(afterFirst === prior + 1 && stubState.seen.length === afterFirst, "A14 الإرسال التلقائي: رسالةٌ واحدة صباح الأحد ولا تتكرر في الأسبوع نفسه", { prior, afterFirst, now: stubState.seen.length, sunday });
      const mlog = (await call("GET", "/api/admin/ads")).json.campaigns.find((x: any) => x.id === mailed.id).mailLog;
      check(mlog?.weekly === sunday, "A14 سجلّ ما أُرسل محفوظ: أحدُ هذا الأسبوع", mlog);
    } finally { delete process.env.AD_MAIL_API_KEY; delete process.env.AD_MAIL_FROM; delete process.env.AD_MAIL_API_URL; }
    check(!(await call("GET", "/api/admin/ads")).json.mailEnabled, "A14 إزالة الإعدادات تُعطّل البريد");
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

  /* الرصيد الافتتاحي: كل رقمٍ يزيد بما يأتي بعد تاريخه، ولا يعدّ القديم مرتين. */
  {
    const { AUDIENCE_BASELINE: B } = await import("../src/utils/audienceBaseline");
    const nd = (fp: string, day: string) => ({ fingerprint: fp, createdAt: `${day}T08:00:00Z`, courseIds: [], requestType: "new-course", AdCollegeId: 1 });
    const stats = buildAudienceStats({
      now: new Date("2026-11-05T09:00:00Z"), terms: [{ AdTermId: 9, AdTermName: "ف" }] as any[], currentTermId: 9,
      needsByTerm: new Map([[9, [nd("old", "2026-09-01"), nd("old", "2026-10-25"), nd("new1", "2026-10-20"), nd("new1", "2026-10-21")] as any[]]]),
      profiles: [{ fingerprint: "new2", createdAt: "2026-11-01T00:00:00Z", lastSeenAt: "2026-11-02T00:00:00Z", AdCollegeId: 1 }, { fingerprint: "old", createdAt: "2026-08-01T00:00:00Z", lastSeenAt: "2026-11-02T00:00:00Z", AdCollegeId: 1 }] as any[],
      instructorRequests: [{ AdCollegeId: 1, status: "sent", createdAt: "2026-09-01T00:00:00Z", linkOpenedAt: "2026-09-05T00:00:00Z" }, { AdCollegeId: 1, status: "sent", createdAt: "2026-10-01T00:00:00Z", linkOpenedAt: "2026-10-30T00:00:00Z" }, { AdCollegeId: 1, status: "sent", createdAt: "2026-10-01T00:00:00Z" }] as any[],
      days: [{ day: B.asOf, visits: { me: 100 } }, { day: "2026-10-18", visits: { me: 40, schedule: 10 } }, { day: "2026-10-19", visits: { me: 5 } }] as any[],
    });
    check(stats.reach.newSinceBaseline === 2, "الرصيد: طالبان جديدان فقط بعد التاريخ (القديم لا يُعدّ مرتين)", stats.reach.newSinceBaseline);
    check(B.students + stats.reach.newSinceBaseline === B.students + 2, "الرصيد: الطلبة = الرصيد + الجدد");
    check(stats.visits.afterBaseline === 55, "الرصيد: الزيارات بعد التاريخ فقط (يوم الرصيد نفسه لا يُعاد)", stats.visits.afterBaseline);
    check(stats.instructors.openedAfterBaseline === 1, "الرصيد: بطاقة واحدة فُتحت بعد التاريخ", stats.instructors.openedAfterBaseline);
    const crossTerm = buildAudienceStats({ now: new Date("2026-11-05T09:00:00Z"), terms: [{ AdTermId: 9, AdTermName: "ف" }] as any[], currentTermId: 9, needsByTerm: new Map(), profiles: [], instructorRequests: [],
      openRequests: [{ AdCollegeId: 1, status: "sent", createdAt: "2026-10-01T00:00:00Z", linkOpenedAt: "2026-10-19T00:00:00Z" }, { AdCollegeId: 1, status: "sent", createdAt: "2026-10-01T00:00:00Z", linkOpenedAt: "2026-11-02T00:00:00Z" }] as any[] });
    check(crossTerm.instructors.openedAfterBaseline === 2, "الرصيد: مرّات الفتح تُعدّ من كل فصلٍ بعد التاريخ لا من الفصل المعروض وحده", crossTerm.instructors.openedAfterBaseline);
    /* مرّات الفتح من سجلّ الأيام: يومٌ قبل التاريخ لا يُعدّ، وبعده يُعدّ بعدد مرّاته. */
    const withMap = buildAudienceStats({ now: new Date("2026-11-05T09:00:00Z"), terms: [{ AdTermId: 9, AdTermName: "ف" }] as any[], currentTermId: 9, needsByTerm: new Map(), profiles: [], instructorRequests: [],
      openRequests: [{ AdCollegeId: 1, status: "sent", createdAt: "2026-09-01T00:00:00Z", linkOpenedAt: "2026-09-02T00:00:00Z", linkOpenDays: { "2026-09-02": 4, [B.asOf]: 9, "2026-10-18": 3, "2026-11-01": 2 } }] as any[] });
    check(withMap.instructors.openedAfterBaseline === 5, "الرصيد: مرّات الفتح من سجلّ الأيام بعد التاريخ فقط", withMap.instructors.openedAfterBaseline);
    const { headlineTotals } = await import("../src/utils/audienceStats");
    const head = headlineTotals(stats);
    check(head.students === B.students + 2 && head.visits === B.visits + 55 && head.instructorOpens === B.instructorOpens + 1 && head.instructorOpenRate === 90, "الرصيد: headlineTotals = الرصيد + ما بعده، والنسبة حدٌّ أدنى 90", head);
    const fmtN = (n: number) => new Intl.NumberFormat("ar-KW-u-nu-latn").format(n);
    const kitPage = (await import("../src/server/adsPages")).partnerKitPage({ stats: stats as any, liveBySlot: {}, today: "2026-11-20", nonce: "N" });
    check(kitPage.includes(fmtN(B.students + 2)) && kitPage.includes(fmtN(B.visits + 55)) && kitPage.includes(fmtN(B.instructors)) && kitPage.includes(fmtN(B.instructorOpens + 1)) && kitPage.includes("90%") && kitPage.includes("إجمالي الطلبة المستفيدين") && kitPage.includes("إجمالي دخول أعضاء هيئة التدريس"), "ملف الشراكة يأخذ أرقام لوحة الجمهور وعناوينها نفسها");
    check(kitPage.includes("بحسب إدارة النظام حتى") && !kitPage.includes("تقديراتٌ تقريبية") && !kitPage.includes("الأرقام تقريبية"), "الرصيد: ملف الشراكة ينسب الإجماليات إلى إدارة النظام في ذيله (بلا وصفها بالتقدير)");
    const fp = (n: number, pre: string) => Array.from({ length: n }, (_, i) => nd(`${pre}${i}`, "2026-05-01"));
    const t1 = [...fp(20, "a"), ...fp(20, "b")], t2 = [...fp(20, "a"), ...fp(5, "c")].map(r => ({ ...r, createdAt: "2026-10-01T08:00:00Z" }));
    const cont = buildAudienceStats({ now: new Date("2026-11-05T09:00:00Z"), terms: [{ AdTermId: 1, AdTermName: "خريف" }, { AdTermId: 2, AdTermName: "ربيع" }] as any[], currentTermId: 2, profiles: [], instructorRequests: [],
      needsByTerm: new Map([[1, t1 as any[]], [2, t2 as any[]]]) });
    check(cont.continuity.length === 1 && cont.continuity[0].before === 40 && cont.continuity[0].stayed === 20 && cont.continuity[0].rate === 50, "الاستمرارية: 20 من 40 = 50% بين فصلين متتاليين", cont.continuity);
    const tiny = buildAudienceStats({ now: new Date("2026-11-05T09:00:00Z"), terms: [{ AdTermId: 1, AdTermName: "خريف" }, { AdTermId: 2, AdTermName: "ربيع" }] as any[], currentTermId: 2, profiles: [], instructorRequests: [],
      needsByTerm: new Map([[1, fp(10, "a") as any[]], [2, fp(10, "a").map(r => ({ ...r, createdAt: "2026-10-01T08:00:00Z" })) as any[]]]) });
    check(tiny.continuity.length === 0, "الاستمرارية: عيّنة أقل من 30 طالباً لا تُنتج نسبة (لا 0% من طالبٍ واحد)", tiny.continuity);
    const gap = buildAudienceStats({ now: new Date("2026-11-05T09:00:00Z"), terms: [{ AdTermId: 1, AdTermName: "خريف" }, { AdTermId: 2, AdTermName: "ربيع" }, { AdTermId: 3, AdTermName: "صيف" }] as any[], currentTermId: 3, profiles: [], instructorRequests: [],
      needsByTerm: new Map([[1, fp(40, "a") as any[]], [3, fp(40, "a").map(r => ({ ...r, createdAt: "2026-10-01T08:00:00Z" })) as any[]]]) });
    check(gap.continuity.length === 0, "الاستمرارية: فصلٌ بلا إجابات بينهما يقطع التتالي فلا تُقارَن فصلان غير متتاليين", gap.continuity);
    /* ترتيب الفصول أكاديمي لا برقم المعرّف: A(1) ثم B(3) ثم C(2) — لا يقطع C الفارغ التتالي بين A وB */
    const termsOutOfOrder = [{ AdTermId: 1, AdTermName: "الفصل الأول 2020/2021" }, { AdTermId: 3, AdTermName: "الفصل الثاني 2020/2021" }, { AdTermId: 2, AdTermName: "الفصل الأول 2021/2022" }];
    const chrono = buildAudienceStats({ now: new Date("2026-11-05T09:00:00Z"), terms: termsOutOfOrder as any[], currentTermId: 2, profiles: [], instructorRequests: [],
      needsByTerm: new Map([[1, fp(40, "a") as any[]], [3, fp(40, "a").map(r => ({ ...r, createdAt: "2021-02-01T08:00:00Z" })) as any[]]]) });
    check(chrono.continuity.length === 1 && chrono.continuity[0].fromTerm === "الفصل الأول 2020/2021" && chrono.continuity[0].toTerm === "الفصل الثاني 2020/2021" && chrono.continuity[0].rate === 100, "الاستمرارية: الترتيب بالتسلسل الأكاديمي لا برقم المعرّف", chrono.continuity);
    const { pickDashboardTerm } = await import("../src/utils/audienceStats");
    const dashTerms = [{ AdTermId: 1, AdTermName: "الفصل الأول 2025/2026", AdTermClosed: true }, { AdTermId: 2, AdTermName: "الفصل الثاني 2025/2026", AdTermClosed: true }, { AdTermId: 3, AdTermName: "الفصل الأول 2026/2027", AdTermClosed: false }, { AdTermId: 4, AdTermName: "الفصل الثاني 2026/2027" }] as any[];
    const newestFirst = [...dashTerms].reverse();
    check(pickDashboardTerm(newestFirst, dashTerms, 0, Date.parse("2026-10-17T00:00:00Z"))?.AdTermId === 3, "اللوحة: الافتراضي هو الفصل الجاري تشغيلياً (غير المنتهي) لا الأحدث ولا آخر فصلٍ فيه إجابات");
    check(pickDashboardTerm(newestFirst, dashTerms, 2)?.AdTermId === 2, "اللوحة: الفصل المطلوب صراحةً يُقدَّم على الافتراضي");
    const adSlotStats = buildAudienceStats({ now: new Date("2026-11-05T09:00:00Z"), terms: [], currentTermId: 0, needsByTerm: new Map(), profiles: [], instructorRequests: [],
      campaigns: [{ id: "c1", slot: "me", status: "approved", startDay: "2026-10-01", endDay: "2026-12-01" }, { id: "c2", slot: "schedule", status: "approved", startDay: "2026-10-01", endDay: "2026-12-01" }] as any[],
      adStats: [{ id: "1", campaignId: "c1", creativeId: "x", day: "2026-10-05", impressions: 1000, uniques: 500, clicks: 30, filteredClicks: 0 }, { id: "2", campaignId: "c2", creativeId: "x", day: "2026-10-05", impressions: 400, uniques: 300, clicks: 4, filteredClicks: 0 }, { id: "3", campaignId: "gone", creativeId: "x", day: "2026-10-05", impressions: 99, uniques: 9, clicks: 9, filteredClicks: 0 }] as any[] });
    check(adSlotStats.adsBySlot.length === 2 && adSlotStats.adsBySlot[0].slot === "me" && adSlotStats.adsBySlot[0].ctr === 3 && adSlotStats.adsBySlot[1].ctr === 1, "أداء المواقع: نسبة النقر لكل موقع، وحملةٌ محذوفة لا تُنسب لأحد", adSlotStats.adsBySlot);
    const { recordLinkOpen } = await import("../src/utils/linkOpens");
    const o1 = recordLinkOpen({}, "2026-10-20T21:30:00Z");
    check(!!o1 && o1.linkOpenedAt === "2026-10-20T21:30:00Z" && o1.linkOpenDays?.["2026-10-21"] === 1, "عدّ الفتح: الفتح الأول يضع linkOpenedAt ويحسب اليوم بتوقيت الكويت (21:30 UTC = اليوم التالي)", o1);
    check(recordLinkOpen({ ...o1! }, "2026-10-20T21:50:00Z") === null, "عدّ الفتح: إعادة التحميل خلال نصف ساعة لا تُعدّ");
    const o2 = recordLinkOpen({ ...o1! }, "2026-10-20T22:05:00Z");
    check(o2?.linkOpenDays?.["2026-10-21"] === 2 && o2?.linkOpenedAt === "2026-10-20T21:30:00Z", "عدّ الفتح: العودة بعد نصف ساعة تُعدّ، والفتح الأول يبقى", o2);
    const legacy = recordLinkOpen({ linkOpenedAt: "2026-09-01T00:00:00Z" }, "2026-10-20T10:00:00Z");
    check(legacy?.linkOpenedAt === "2026-09-01T00:00:00Z" && legacy?.linkOpenDays?.["2026-10-20"] === 1, "عدّ الفتح: بطاقةٌ قديمة بلا سجلّ تبدأ سجلّها دون المساس بفتحها الأول", legacy);
    const { Repository: Repo } = await import("../src/db/repository");
    const req: any = await Repo.createInstructorRequest({ AdCollegeId: 1, AdSectionId: 1, AdTermId: 9, AdInstructorId: 1, linkId: "l1", window: { opensAt: "2026-10-01T00:00:00Z", closesAt: "2026-12-01T00:00:00Z" }, source: "draft", status: "sent", items: [], timeline: [] } as any);
    const r1 = await Repo.recordInstructorRequestOpen(req.id, "2026-10-20T10:00:00Z");
    const r2 = await Repo.recordInstructorRequestOpen(req.id, "2026-10-20T10:10:00Z");
    const r3 = await Repo.recordInstructorRequestOpen(req.id, "2026-10-20T11:00:00Z");
    const saved: any = await Repo.getInstructorRequest(req.id);
    check(!!r1?.first && r2 === null && !!r3 && !r3.first, "عدّ الفتح في المخزن: الأول first، وإعادة التحميل null، والعودة بعد نصف ساعة تُعدّ", { r1, r2, r3 });
    check(saved.linkOpenDays["2026-10-20"] === 2 && saved.timeline.filter((e: any) => e.kind === "link-opened").length === 1 && saved.status === "sent", "عدّ الفتح في المخزن: عدّان في اليوم، وحدثٌ واحد في الخط الزمني، وحالة الطلب لم تُمسّ", saved);
    check(await Repo.recordInstructorRequestOpen("missing", "2026-10-20T11:00:00Z") === null, "عدّ الفتح في المخزن: طلبٌ غير موجود لا يُنشأ");
    const { cleanLead, cleanPhone, whatsappPhone } = await import("../src/utils/adLeads");
    const lead1 = cleanLead({ company: "  شركة  النور ", name: "سالم", phone: "٩٩٨٨ 7766", email: "A@B.com", slots: ["me", "me", "bogus"], season: "nope", note: "x\n\ny" });
    check(!lead1.error && lead1.lead!.company === "شركة النور" && lead1.lead!.phone === "99887766" && lead1.lead!.email === "a@b.com" && lead1.lead!.slots.length === 1 && lead1.lead!.season === "" && lead1.lead!.note === "x y", "طلب حملة: تنظيف الحقول (مسافات، أرقام هندية، موقعٌ مكرر/مجهول يسقط)", lead1);
    check(cleanLead({ company: "", name: "س", phone: "99887766" }).error === "اكتب اسم الشركة." && cleanLead({ company: "شركة", name: "سالم", phone: "12" }).error === "اكتب رقم جوّالٍ صحيحاً." && cleanLead({ company: "شركة", name: "سالم", phone: "99887766", email: "bad" }).error === "البريد غير صحيح.", "طلب حملة: الاسم والجوّال مطلوبان، والبريد اختياري لكن يُتحقَّق منه");
    check(cleanPhone("+965 9988-7766") === "96599887766" && whatsappPhone("99887766") === "96599887766" && whatsappPhone("0096599887766") === "96599887766", "طلب حملة: أرقام الجوّال وواتساب");
    const lead = await Repo.createAdLead({ ...lead1.lead!, email: lead1.lead!.email || undefined } as any);
    check((await Repo.listAdLeads()).some((l: any) => l.id === lead.id && l.status === "new"), "طلب حملة: يُحفظ جديداً");
    check(await Repo.markAdLeadContacted(lead.id, "2026-10-20T10:00:00Z") === true && await Repo.markAdLeadContacted("missing", "2026-10-20T10:00:00Z") === false, "طلب حملة: تسجيل التواصل ينجح، وطلبٌ غير موجود false");
    const after: any = (await Repo.listAdLeads()).find((l: any) => l.id === lead.id);
    check(after.status === "contacted" && !!after.contactedAt && after.phone === "99887766", "طلب حملة: تم التواصل يغيّر الحالة وحدها");
    const leadForm = (await import("../src/server/adsPages")).partnerKitPage({ stats: stats as any, liveBySlot: {}, today: "2026-11-20", nonce: "N", token: "tok/1", leadResult: "ok" });
    check(leadForm.includes('action="/partners/tok%2F1/lead"') && leadForm.includes('name="website"') && leadForm.includes('href="#new"') && leadForm.includes("وصلنا طلبك"), "ملف الشراكة: زر «حملة جديدة» ونموذجٌ يُرسل إلى مسار الطلب مع حقل الفخ ورسالة النجاح");
    check(B.instructorOpens === 75_000 && B.instructors === 786 && B.students === 80_000 && B.visits === 5_300_000 && B.instructorOpenRate === 90, "الرصيد: الأرقام المُقرَّة كما أُعطيت");
  }

  console.log(`\n${failed ? "\x1b[31m" : "\x1b[32m"}${passed} نجح، ${failed} فشل\x1b[0m`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(1); });
