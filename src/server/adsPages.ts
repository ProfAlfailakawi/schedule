/**
 * ── صفحتا الشركاء: «تقرير الحملة» و«ملف الشراكة» ────────────────────────────────
 *
 * صفحتان عامتان بروابطَ سرّية، مكتوبتان هنا بالكامل (لا نصَّ من خارج الملف إلا ما
 * يُهرَّب)، بسكربتٍ واحد بنونس للطباعة. لا تعرضان اسماً ولا رقماً مدنياً؛ أرقامٌ فقط.
 *
 *   تقرير الحملة : ما تراه شركةٌ واحدة عن حملتها وحدها، وطريقةُ العدّ بصراحة.
 *   ملف الشراكة  : ما تراه شركةٌ قبل أن تتعاقد: حجم الجمهور، والمواقع، والشروط.
 */
import { createHash } from "crypto";
import type { AdCampaign, AdCreative, AdStatsDay } from "../types";
import { headlineTotals, type AudienceStats } from "../utils/audienceStats";
import { AUDIENCE_BASELINE } from "../utils/audienceBaseline";
import { AD_RULES, TRIAL_DAYS, activeSlots, creativeBreakdown, dailySeries, daysLeft, expectedShare, kuwaitDay, phaseOf, slotById, totalsOf, type AdPhase, type WeeklyCompare } from "../utils/adsEngine";
import { conversionOf, hourAr, peakSummary, wrapUp, type WrapUp } from "../utils/adInsights";
import { AR, countOf } from "../utils/arabicCount";
import { SEASONS, seasonLabel, type CalendarItem } from "../utils/adSeasons";

/** معرّفٌ عام للشارة مشتقٌّ من رمز التقرير بتجزئةٍ لا تُعكس: يُنشر في موقع الشركة دون أن يكشف الرمز السري. */
export const badgeId = (reportToken: string): string => createHash("sha256").update(`badge:${reportToken}`).digest("hex").slice(0, 32);

export const esc = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const nf = new Intl.NumberFormat("ar-KW-u-nu-latn");
export const fmt = (n: number): string => nf.format(Math.round(n));
export const pct = (n: number): string => `${new Intl.NumberFormat("ar-KW-u-nu-latn", { maximumFractionDigits: 1 }).format(n)}٪`;
const dateAr = (day: string): string => {
  try { return new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)); }
  catch { return day; }
};
/** رقمٌ تقريبي للعرض الخارجي: لا نبالغ ولا نكشف دقةً زائدة. */
export const approx = (n: number): string => {
  if (n < 100) return fmt(n);
  const step = n < 1000 ? 50 : n < 10000 ? 100 : 500;
  return `<bdi dir="ltr">${fmt(Math.floor(n / step) * step)}+</bdi>`;
};

const PHASE_LABEL: Record<AdPhase, string> = { draft: "مسودة", paused: "موقوفة", scheduled: "مجدولة", live: "تعمل الآن", ended: "منتهية" };

const BASE_DARK = `@media (prefers-color-scheme:dark){:root{--bg:#0f1512;--card:#17201c;--ink:#eef3ef;--muted:#9baba3;--line:#27342e;--accent:#4fc29a;--accent2:#e3a557;--soft:#12261e;--shadow:0 1px 2px rgba(0,0,0,.4),0 14px 40px rgba(0,0,0,.35)}}`;
const BASE_CSS = `
:root{--bg:#f6f4ef;--card:#fff;--ink:#17201c;--muted:#5f6b65;--line:#e4e0d6;--accent:#0f6b4f;--accent2:#c9822b;--soft:#e8f3ee;--shadow:0 1px 2px rgba(20,30,25,.06),0 14px 40px rgba(20,30,25,.07)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Segoe UI",Tahoma,"Noto Sans Arabic",system-ui,sans-serif;line-height:1.75}
.wrap{max-width:980px;margin:0 auto;padding:22px 16px 60px}
.brand{font-size:12px;letter-spacing:.14em;color:var(--muted);margin:0 0 6px}
.hero{border-radius:26px;padding:30px 26px;background:radial-gradient(120% 140% at 100% 0%,var(--soft),transparent 60%),linear-gradient(135deg,var(--card),var(--card));border:1px solid var(--line);box-shadow:var(--shadow)}
h1{font-size:clamp(26px,5vw,40px);line-height:1.25;margin:4px 0 10px}
h2{font-size:19px;margin:34px 0 12px}
.lead{color:var(--muted);margin:0;max-width:60ch}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.chip{display:inline-flex;gap:6px;align-items:center;padding:4px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:13px}
.chip.live{background:var(--soft);color:var(--accent);border-color:transparent;font-weight:700}
.chip.warn{background:#fff3df;color:#8a5a12;border-color:transparent}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-top:18px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:16px 18px;box-shadow:var(--shadow)}
.kpi b{display:block;font-size:clamp(26px,4.5vw,36px);line-height:1.2;font-variant-numeric:tabular-nums}
.kpi span{color:var(--muted);font-size:13.5px}
.kpi small{display:block;color:var(--muted);font-size:12px;margin-top:4px}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:18px;box-shadow:var(--shadow)}
.chart{width:100%;height:auto;display:block}
.axis{display:flex;justify-content:space-between;gap:10px;color:var(--muted);font-size:12px;margin-top:6px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:start}
th{color:var(--muted);font-weight:600;font-size:12.5px}
td.n{font-variant-numeric:tabular-nums}
.note{color:var(--muted);font-size:13px;margin-top:10px}
.pre{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.pre figure{margin:0}.pre img{width:100%;height:auto;border-radius:12px;border:1px solid var(--line);display:block}
.pre figcaption{font-size:12.5px;color:var(--muted);margin-top:6px}
.btn{appearance:none;border:0;background:var(--accent);color:#fff;border-radius:12px;padding:10px 18px;font:inherit;font-weight:700;cursor:pointer}
.bar{display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.callout{display:grid;gap:4px;margin:0 0 12px;padding:14px 16px;border-radius:14px;background:var(--brand-soft,#e8f1ee);border:1px solid var(--line)}.callout b{color:var(--brand,#1f6b5a)}.callout span{font-size:.9rem;line-height:1.7}
a.btn{display:inline-block;text-decoration:none}.btnrow{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0}
.reach{color:var(--brand,#1f6b5a)}
.slot{display:grid;gap:10px;grid-template-columns:minmax(0,1fr) 190px;align-items:center}
.mock{border:1.5px dashed var(--accent);border-radius:10px;background:var(--soft);display:grid;place-items:center;color:var(--accent);font-size:12px;max-width:100%}
.cal{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}.cal-i{border:1px solid var(--line);border-inline-start:5px solid var(--c);border-radius:14px;padding:10px 12px;display:grid;gap:1px;background:var(--card)}.cal-i.now{background:var(--soft)}.cal-i span{color:var(--muted);font-size:12.5px}.cal-i small{color:var(--muted);font-size:12px}
.rules{margin:0;padding-inline-start:20px}.rules li{margin:6px 0}
footer{margin-top:40px;color:var(--muted);font-size:12.5px;text-align:center}
@media (max-width:560px){.slot{grid-template-columns:1fr}.hero{padding:22px 18px}}
@media print{body{background:#fff;color:#000}.btn,.noprint{display:none!important}.hero,.card,.kpi{box-shadow:none}.wrap{padding:0}}
`;

/** `light`: صفحةٌ تبقى فاتحةً مهما كان تفضيل الجهاز (ملف الشراكة وثيقةٌ تُعرض وتُطبع). */
const page = (title: string, nonce: string, body: string, extraCss = "", light = false): string => `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="${light ? "light" : "light dark"}">
<title>${esc(title)}</title><link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">
<style>${BASE_CSS}${light ? "" : BASE_DARK}${extraCss}</style></head><body><div class="wrap">${body}</div>
<script nonce="${nonce}">(function(){var b=document.getElementById("print");if(b)b.addEventListener("click",function(){window.print()})})();</script>
</body></html>`;

/** رسمٌ بياني بالأعمدة: الظهور أعمدة، والنقرات خطٌّ فوقها. SVG خالصٌ بلا مكتبات. */
function barChart(series: Array<{ day: string; a: number; b?: number }>, labelA: string, labelB?: string): string {
  if (!series.length) return `<p class="note">لا بيانات بعد؛ تظهر الأرقام مع أول يومٍ من العرض.</p>`;
  const W = 760, H = 220, padL = 8, padB = 28, padT = 14;
  const max = Math.max(1, ...series.map(p => p.a));
  const maxB = Math.max(1, ...series.map(p => p.b || 0));
  const step = (W - padL * 2) / series.length;
  const bw = Math.max(2, Math.min(26, step * 0.66));
  const y = (v: number) => H - padB - (v / max) * (H - padB - padT);
  const bars = series.map((p, i) => {
    const x = W - padL - step * (i + 1) + (step - bw) / 2; // RTL: أحدث الأيام يساراً
    const h = Math.max(p.a > 0 ? 2 : 0, (p.a / max) * (H - padB - padT));
    return `<rect x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="var(--accent)" opacity=".85"><title>${esc(p.day)} · ${fmt(p.a)}</title></rect>`;
  }).join("");
  const line = labelB && series.some(p => p.b)
    ? `<polyline fill="none" stroke="var(--accent2)" stroke-width="2.2" stroke-linejoin="round" points="${series.map((p, i) => `${(W - padL - step * (i + 1) + step / 2).toFixed(1)},${(H - padB - ((p.b || 0) / maxB) * (H - padB - padT)).toFixed(1)}`).join(" ")}"/>`
    : "";
  const short = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(5) : d);
  const first = short(series[0].day), last = short(series[series.length - 1].day);
  /* التسميات خارج الـSVG: النصُّ داخله يُقصّ على الحواف في الاتجاه من اليمين إلى اليسار. */
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(labelA)}">
<line x1="${padL}" x2="${W - padL}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>
<line x1="${padL}" x2="${W - padL}" y1="${y(max / 2)}" y2="${y(max / 2)}" stroke="var(--line)" stroke-dasharray="3 5"/>
${bars}${line}</svg>
<div class="axis"><bdi dir="ltr">${esc(first)}</bdi><span>${esc(labelA)}: الذروة ${fmt(max)}${labelB ? ` · ${esc(labelB)} (الخط)` : ""}</span><bdi dir="ltr">${esc(last)}</bdi></div>`;
}

export interface CampaignReportInput {
  campaign: AdCampaign;
  creatives: ReadonlyArray<Omit<AdCreative, "data">>;
  stats: readonly AdStatsDay[];
  liveInSlot: number;
  today?: string;
  nonce: string;
  /** الأسبوع مقابل الماضي. */
  weekly?: WeeklyCompare;
  /** متوسط نسبة النقر لباقي حملات الموقع، أو null/undefined إن قلّت العيّنة. */
  benchmarkCtr?: number | null;
  /** أصلُ الموقع (https://المضيف) لرابط اشتراك التقويم. */
  origin?: string;
  /** نتيجة نموذج التبليغ عن التحويل: ok | bad. */
  redemptionResult?: string;
}

const arrow = (v: number | null): string => (v === null ? "—" : v > 0 ? `▲ ${pct(v)}` : v < 0 ? `▼ ${pct(Math.abs(v))}` : "ثابت");
const tone = (v: number | null): string => (v === null || v === 0 ? "var(--muted)" : v > 0 ? "var(--accent)" : "#b42318");

/** بطاقةُ الأسبوع: ما جرى في آخر ٧ أيام مقارنةً بالسبعة قبلها. */
function weeklyCard(w: WeeklyCompare): string {
  return `<h2>هذا الأسبوع مقابل الأسبوع الماضي</h2>
<div class="grid">
  <div class="kpi"><b>${fmt(w.thisWeek.impressions)}</b><span>ظهور مرئي</span><small style="color:${tone(w.impressionsChange)}">${w.hasLastWeek ? arrow(w.impressionsChange) : "لا أسبوع سابق للمقارنة"}</small></div>
  <div class="kpi"><b>${fmt(w.thisWeek.clicks)}</b><span>عدد النقرات الصحيحة</span><small style="color:${tone(w.clicksChange)}">${w.hasLastWeek ? arrow(w.clicksChange) : "—"}</small></div>
  <div class="kpi"><b>${pct(w.thisWeek.ctr)}</b><span>نسبة النقر</span><small>${w.hasLastWeek ? `الأسبوع الماضي ${pct(w.lastWeek.ctr)}` : "—"}</small></div>
</div>`;
}

/** خلاصةُ التجربة المجانية: أرقامها بعبارةٍ واحدة، وما بعدها. */
function trialCard(args: { phase: AdPhase; totals: ReturnType<typeof totalsOf>; benchmark: number | null | undefined; days: number }): string {
  const { totals: t, benchmark } = args;
  const verdict = benchmark == null ? "" : t.ctr >= benchmark
    ? `نسبة نقر إعلانك (${pct(t.ctr)}) أعلى من متوسط حملات هذا الموقع (${pct(benchmark)}).`
    : `نسبة نقر إعلانك (${pct(t.ctr)}) دون متوسط حملات هذا الموقع (${pct(benchmark)}) — جرّب صورةً أو عرضاً أوضح.`;
  const ended = args.phase === "ended";
  return `<h2>خلاصة التجربة المجانية</h2>
<div class="card"><p style="margin:0 0 8px"><b>${ended ? "انتهت تجربتك" : "تجربتك جارية"}</b> (${countOf(TRIAL_DAYS, AR.day)} كحدٍّ أقصى): وصل إعلانك إلى نحو <b>${fmt(t.uniques)}</b> مشاهدٍ، وظهر <b>${countOf(t.impressions, AR.visit)}</b>، ونقر عليه <b>${fmt(t.clicks)}</b>.</p>
${verdict ? `<p style="margin:0 0 8px">${esc(verdict)}</p>` : ""}
<p class="note" style="margin:0">${ended ? "لمواصلة الظهور في مساحةٍ ثابتة بعد التجربة، تواصل مع الإدارة التي أرسلت لك هذا الرابط." : "عند انتهاء التجربة يتوقف الإعلان تلقائياً، وتبقى أرقامك في هذه الصفحة."}</p></div>`;
}

/** خلاصةُ الحملة المنتهية: ما حققته بعبارةٍ واحدة، وأقوى يومٍ وصورة، ثم دعوةُ التجديد. */
/** أيامٌ متتالية من from إلى to (شاملة) بصيغة YYYY-MM-DD. */
function daysList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); t <= end && out.length < 400; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function wrapUpCard(w: WrapUp, args: { company: string; labelOf: (id: string) => string; benchmark: number | null | undefined }): string {
  const t = w.totals;
  const lines: string[] = [
    `خلال <b>${esc(countOf(w.days, AR.day))}</b> بلغ عدد مشاهدي إعلانكم نحو <b>${fmt(t.uniques)}</b>، وبلغ ظهوره <b>${fmt(t.impressions)}</b>، وبلغت نقراته الصحيحة <b>${fmt(t.clicks)}</b> (${pct(t.ctr)}).`,
  ];
  if (w.bestDay) lines.push(`أقوى يومٍ: <b>${esc(dateAr(w.bestDay.day))}</b> بـ${fmt(w.bestDay.impressions)} ظهور.`);
  if (w.bestWeekday && w.bestWeekday.share >= 20) lines.push(`أكثر ما شاهدكم الطلبة يوم <b>${esc(w.bestWeekday.name)}</b> (${w.bestWeekday.share}٪ من ظهوركم).`);
  if (w.bestCreative) lines.push(`الأعلى نقراً: <b>${esc(args.labelOf(w.bestCreative.creativeId))}</b> (${pct(w.bestCreative.ctr)}).`);
  if (args.benchmark != null && t.impressions >= 200) lines.push(t.ctr >= args.benchmark ? `نسبة نقركم أعلى من متوسط حملات هذا الموقع (${pct(args.benchmark)}).` : `نسبة نقركم دون متوسط حملات هذا الموقع (${pct(args.benchmark)}) — صورةٌ أو عرضٌ أوضح يرفعها.`);
  return `<h2>خلاصة حملتكم</h2>
<div class="card" style="margin-block-end:12px">${lines.map(l => `<p style="margin:0 0 8px">${l}</p>`).join("")}</div>
<div class="callout"><b>يسعدنا تثبيت مكان ${esc(args.company)} في الفصل القادم</b><span>راجعوا الأرقام أعلاه ثم تواصلوا مع إدارة البرنامج للتجديد؛ نحجز لكم الموقع نفسه قبل أن يمتلئ.</span></div>`;
}

export function campaignReportPage(input: CampaignReportInput): string {
  const { campaign: c, creatives, stats, nonce } = input;
  const today = input.today || kuwaitDay();
  const slot = slotById(c.slot);
  const phase = phaseOf(c, today);
  const totals = totalsOf(stats);
  const series = dailySeries(stats, c.startDay, c.endDay, today);
  const breakdown = creativeBreakdown(stats);
  const share = expectedShare(c.slot, input.liveInSlot);
  const left = daysLeft(c, today);
  const best = breakdown.length > 1 ? [...breakdown].sort((a, b) => b.ctr - a.ctr)[0] : null;
  const labelOf = (id: string) => creatives.find(x => x.id === id)?.label || "صورة";

  const phaseNote = phase === "live" ? `ينتهي العرض بعد ${countOf(Math.max(0, left), AR.day)}`
    : phase === "ended" ? `انتهى العرض في ${dateAr(c.endDay)}`
    : phase === "scheduled" ? `يبدأ العرض في ${dateAr(c.startDay)}` : "";

  const reportPath = `/ad-report/${encodeURIComponent(c.reportToken)}`;
  const origin = (input.origin || "").replace(/\/$/, "");
  const endingBanner = phase === "live" && left <= 7
    ? `<div class="callout"><b>حملتكم تنتهي بعد ${esc(countOf(Math.max(0, left), AR.day))}</b><span>للتجديد أو تثبيت مكانكم في الفصل القادم تواصلوا مع إدارة البرنامج قبل الانتهاء.</span></div>` : "";
  /* التحويل: تُبلِّغ الشركةُ بنفسها كم استعمل الكود؛ يُعرض لها بوسم «مُبلَّغ منكم» لا بوسم «موثَّق»، ولا يدخل أي مجموعٍ آخر. */
  const conv = conversionOf(c.redemptions, totals.clicks);
  const convCard = !c.coupon || phase === "scheduled" || phase === "draft" ? "" : (() => {
    const days = daysList(c.startDay, c.endDay < today ? c.endDay : today).slice(-14).reverse();
    const msg = input.redemptionResult === "ok" ? `<p class="note" style="color:var(--accent)">سُجِّل رقمكم. شكراً.</p>` : input.redemptionResult === "bad" ? `<p class="note" style="color:#b42318">تعذّر التسجيل: اختر يوماً ضمن الحملة (لا بعد اليوم) وأدخل عدداً صحيحاً.</p>` : "";
    const rows = (c.redemptions || []).slice(-10).reverse().map(r => `<tr><td>${esc(dateAr(r.day))}</td><td class="n">${fmt(r.count)}</td></tr>`).join("");
    return `<h2 id="redemptions">استعمال كود الخصم عندكم</h2>
<div class="card"><p style="margin:0 0 8px">النقرات التي نقيسها نحن <b>موثَّقة</b>. أما استعمال الكود فلا نراه نحن، فإن أخبرتمونا به رسمنا لكم التحويل، ويبقى هذا الرقم <b>«مُبلَّغاً منكم»</b> ولا نعتمده في أي تقريرٍ آخر ولا نعرضه لغيركم.</p>
${conv.total ? `<p style="margin:0 0 8px">عدد استعمالات الكود المُبلَّغة: <b>${fmt(conv.total)}</b>${conv.perClick != null ? ` (${pct(conv.perClick)} من نقراتكم الموثَّقة)` : ""}.${conv.note === "above-clicks" ? " ملاحظة: يفوق عدد النقرات؛ طبيعيٌّ إن شُورك الكود خارج الإعلان." : ""}</p>` : ""}
${rows ? `<table><thead><tr><th>اليوم</th><th>استعمالات الكود</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
${msg}
<form method="post" action="${esc(reportPath)}/redemptions" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-top:10px">
<label style="display:grid;gap:4px;font-size:13px">اليوم<select name="day" required style="padding:8px;border-radius:10px;border:1px solid var(--line);font:inherit">${days.map(d => `<option value="${d}">${esc(dateAr(d))}</option>`).join("")}</select></label>
<label style="display:grid;gap:4px;font-size:13px">عدد الاستعمالات<input name="count" type="number" min="0" max="100000" step="1" required style="padding:8px;border-radius:10px;border:1px solid var(--line);font:inherit;inline-size:120px"></label>
<button class="btn" type="submit">سجّل</button></form>
<p class="note">اختياري تماماً. وروابطُ نقراتكم تحمل وسم <bdi dir="ltr">utm_source=schedule</bdi> لتتحققوا من أرقامنا في تحليلاتكم أنتم.</p></div>`;
  })();
  const badgeCard = c.status === "draft" || c.startDay > today || !origin ? "" : `
<h2>شارة الشراكة</h2>
<div class="card"><p style="margin:0 0 10px">ضعوها في موقعكم أو متجركم: تعلن أنكم شركاء SCHEDULE.</p>
<p style="margin:0 0 10px"><img src="/partner-badge/${badgeId(c.reportToken)}.svg" alt="شريك SCHEDULE" width="320" height="92" style="max-width:100%;height:auto;border-radius:16px"></p>
<p class="btnrow"><a class="btn" href="/partner-badge/${badgeId(c.reportToken)}.svg?dl=1">تنزيل الشارة</a></p>
<p class="note" style="margin:6px 0 4px">أو انسخوا هذا الكود:</p>
<textarea readonly rows="2" style="inline-size:100%;box-sizing:border-box;font:12px/1.5 ui-monospace,monospace;border:1px solid var(--line);border-radius:10px;padding:8px;direction:ltr">${esc(`<img src="${origin}/partner-badge/${badgeId(c.reportToken)}.svg" alt="شريك SCHEDULE" width="320">`)}</textarea></div>`;
  const calendarCard = phase === "ended" || c.endDay < today ? "" : `
<h2>تنبيهاتٌ تصلك بلا حساب</h2>
<div class="card"><p>لا حاجة لإنشاء حساب: اشترك بهذا الرابط في تقويم جوالك فيذكّرك بنفسه قبل انتهاء الحملة بأسبوع وفي يوم انتهائها، وكل أحدٍ بتقريرك الأسبوعي. وإن تغيّرت تواريخ الحملة يتحدّث وحده.</p>
<p class="btnrow">${origin ? `<a class="btn" href="${esc(origin.replace(/^https?:/, "webcal:") + reportPath)}/calendar.ics">اشترك في تقويمي</a>` : ""}<a class="btn" style="background:transparent;color:var(--accent);border:1px solid var(--line)" href="${esc(reportPath)}/calendar.ics?dl=1">تنزيل الملف</a></p>
<p class="note">يعمل مع تقويم آيفون وجوجل وأوتلوك. لا نجمع بريداً ولا رقماً، والتقويم يقرأ الرابط وحده.</p></div>`;
  return page(`تقرير حملة ${c.company}`, nonce, `
<div class="bar noprint"><p class="brand">SCHEDULE · تقرير الحملة</p><button class="btn" id="print" type="button">طباعة / حفظ PDF</button></div>
<section class="hero">
  <p class="brand">SCHEDULE · نظام القرار الأكاديمي</p>
  <h1>حملة ${esc(c.company)}</h1>
  <p class="lead">هذه أرقام حملتك وحدها، تتحدث تلقائياً كل ما زار الطلبة أو الكادر الموقع الإعلاني.</p>
  <div class="chips">
    <span class="chip ${phase === "live" ? "live" : ""}">${esc(PHASE_LABEL[phase])}</span>
    ${c.trial ? `<span class="chip warn">حملة تجريبية</span>` : ""}
    <span class="chip">الموقع: ${esc(slot?.label || c.slot)}</span>
    ${slot?.wholeUniversity && !c.colleges?.length ? `<span class="chip">يصل كل طلبة الجامعة</span>` : ""}
    <span class="chip">من ${esc(dateAr(c.startDay))} إلى ${esc(dateAr(c.endDay))}</span>
    ${phaseNote ? `<span class="chip">${esc(phaseNote)}</span>` : ""}
  </div>
</section>
<div class="grid">
  <div class="kpi"><b>${fmt(totals.impressions)}</b><span>ظهور مرئي</span><small>إعلانك كان على الشاشة فعلاً</small></div>
  <div class="kpi"><b>${fmt(totals.uniques)}</b><span>مشاهدون (تقدير)</span><small>متصفحٌ واحد = مرة في اليوم</small></div>
  <div class="kpi"><b>${fmt(totals.clicks)}</b><span>عدد النقرات الصحيحة</span><small>بعد استبعاد الروبوتات والتكرار</small></div>
  <div class="kpi"><b>${pct(totals.ctr)}</b><span>نسبة النقر</span><small>النقرات ÷ الظهور</small></div>
</div>
${c.trial ? trialCard({ phase, totals, benchmark: input.benchmarkCtr, days: series.length }) : ""}
${phase === "ended" && totals.impressions > 0 ? wrapUpCard(wrapUp(stats, creatives.map(x => x.id)), { company: c.company, labelOf, benchmark: input.benchmarkCtr }) : ""}
${endingBanner}${convCard}${input.weekly && (input.weekly.hasLastWeek || input.weekly.thisWeek.impressions > 0) ? weeklyCard(input.weekly) : ""}${calendarCard}
<h2>الأداء اليومي</h2>
<div class="card">${barChart(series.map(p => ({ day: p.day, a: p.impressions, b: p.clicks })), "الظهور", "النقرات")}</div>
${input.liveInSlot > 1 ? `<p class="note">يتناوب في هذا الموقع ${countOf(input.liveInSlot, AR.campaign)}، فحصتك المتوقعة من الظهور نحو ${pct(share * 100)}.</p>` : ""}
${c.coupon ? `<h2>كود الخصم</h2><div class="card"><b style="font-size:22px;letter-spacing:.04em" dir="ltr">${esc(c.coupon)}</b><p class="note">يظهر تحت إعلانك؛ تابع استخدامه عندكم لمعرفة التحويل الفعلي.</p></div>` : ""}
${breakdown.length > 1 ? `<h2>مقارنة الصورتين (A/B)</h2><div class="card"><table><thead><tr><th>الصورة</th><th>ظهور</th><th>نقرات</th><th>نسبة النقر</th></tr></thead><tbody>${breakdown.map(r => `<tr><td>${esc(labelOf(r.creativeId))}${best && best.creativeId === r.creativeId ? " ⭐" : ""}</td><td class="n">${fmt(r.impressions)}</td><td class="n">${fmt(r.clicks)}</td><td class="n">${pct(r.ctr)}</td></tr>`).join("")}</tbody></table>${best ? `<p class="note">الأعلى نقراً حتى الآن: «${esc(labelOf(best.creativeId))}».</p>` : ""}</div>` : ""}
<h2>تصميم الإعلان</h2>
<div class="pre">${creatives.map(cr => `<figure><img src="/_ads/img/${esc(cr.id)}" alt="${esc(cr.label)}" width="${cr.width}" height="${cr.height}" loading="lazy"><figcaption>${esc(cr.label)} · <bdi dir="ltr">${cr.width}×${cr.height}</bdi></figcaption></figure>`).join("")}</div>
${badgeCard}
<h2>كيف نعدّ؟</h2>
<div class="card"><ul class="rules">
  <li><b>الظهور المرئي:</b> يُحتسب بعد أن يبقى نصف الإعلان على الأقل ظاهراً على الشاشة ثانيةً كاملة والصفحة مفتوحة.</li>
  <li><b>المشاهدون:</b> تقديرٌ بعدد المتصفحات الفريدة في اليوم، بلا أي هوية؛ فمن يمسح بيانات متصفحه قد يُعدّ مرتين.</li>
  <li><b>النقرات:</b> نستبعد الزيارات الآلية والنقرات المتكررة من المصدر نفسه خلال ثوانٍ${totals.filteredClicks ? ` (استُبعد ${countOf(totals.filteredClicks, AR.click)} في حملتك)` : ""}.</li>
  <li>لا نخزّن أسماء ولا أرقاماً مدنية ولا عناوين في القياس.</li>
</ul></div>
<footer>SCHEDULE · تقريرٌ سرّي بين الإدارة والشركة · ${esc(dateAr(today))}</footer>`);
}

/* ── ملف الشراكة: إنفوجرافيك، أيقونات، كلامٌ قليل ─────────────────────────────── */

/** أيقوناتٌ خطّية مضمّنة (SVG خالص، بلا مكتبات ولا طلبات خارجية — سياسة المحتوى لا تسمح بها). */
const ICONS: Record<string, string> = {
  students: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
  visits: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  staff: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h3M15 12h3M6 16h12"/>',
  tap: '<path d="M9 11V5a2 2 0 0 1 4 0v6"/><path d="M13 10a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v4a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-3l-3-5a2 2 0 0 1 3-2l2 2"/>',
  repeat: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-7M2 20h20"/>',
  ab: '<rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/>',
  ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4Z"/><path d="M14 7v10"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M4 19V5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  send: '<path d="m22 2-11 11"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
};
/** نصٌّ واحد لزرّ «حملة جديدة» وعنوان نموذجها. */
const NEW_CAMPAIGN = "حملة جديدة";
const icon = (name: string): string => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

const KIT_CSS = `
.k-hero{position:relative;overflow:hidden;border-radius:28px;padding:34px 28px;color:#fff;background:radial-gradient(90% 120% at 0% 0%,#1f8f6a 0%,transparent 60%),linear-gradient(135deg,#0b4f3a,#0f6b4f 55%,#13805e);box-shadow:var(--shadow)}
.k-hero:after{content:"";position:absolute;inset-inline-start:-60px;bottom:-80px;width:240px;height:240px;border-radius:50%;background:rgba(255,255,255,.07)}
.k-hero .brand{color:rgba(255,255,255,.72)}
.k-hero h1{margin:6px 0 8px;color:#fff}
.k-hero p{margin:0;color:rgba(255,255,255,.86);font-size:16px}
.k-hero .btn{position:absolute;inset-inline-end:22px;top:22px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3)}
.ic{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.k-stats{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:-26px;position:relative;z-index:1;padding:0 12px}
.k-stat{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:var(--shadow);display:grid;gap:6px;justify-items:start}
.k-stat .badge{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:var(--soft);color:var(--accent)}
.k-stat b{font-size:clamp(26px,4vw,34px);line-height:1.15;font-variant-numeric:tabular-nums}
.k-stat span{color:var(--muted);font-size:14px}
.k-why{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:22px}
.k-why div{display:flex;gap:10px;align-items:center;padding:14px 16px;border-radius:18px;background:var(--soft);color:var(--accent);font-weight:700}
.k-why .ic{width:28px;height:28px;flex:none}
.k-h2{display:flex;align-items:center;gap:10px;font-size:19px;margin:34px 0 12px}
.k-h2 .ic{color:var(--accent)}
.k-peak{display:grid;gap:14px;grid-template-columns:auto 1fr;align-items:center}
.k-peak .big{font-size:24px;font-weight:800;color:var(--accent)}
.k-days{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
.k-days span{padding:3px 12px;border-radius:999px;background:var(--soft);color:var(--accent);font-size:13px;font-weight:700}
.k-hours{display:flex;align-items:flex-end;gap:3px;height:56px;direction:ltr;margin-top:10px}
.k-hours i{flex:1;border-radius:3px 3px 0 0;background:var(--line);min-height:2px}
.k-hours i.on{background:var(--accent)}
.k-bars{display:grid;gap:10px}
.k-bars div{display:grid;grid-template-columns:minmax(0,1.3fr) 2fr auto;gap:10px;align-items:center;font-size:14px}
.k-bars em{height:10px;border-radius:99px;background:var(--line);overflow:hidden}
.k-bars em i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.k-cal{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x mandatory}
.k-cal div{flex:0 0 auto;min-width:150px;scroll-snap-align:start;border-radius:16px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-top:5px solid var(--c);display:grid;gap:2px}
.k-cal div.now{background:var(--soft);box-shadow:0 0 0 2px var(--accent) inset}
.k-cal b{font-size:15px}.k-cal small{color:var(--muted);font-size:12px}
.k-cal .live{color:var(--accent);font-weight:800;font-size:12px}
.k-slots{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.k-slot{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:14px;box-shadow:var(--shadow);display:grid;gap:10px}
.k-screen{border:1.5px solid var(--line);border-radius:14px;padding:10px;display:grid;gap:6px;background:var(--bg);aspect-ratio:16/10;align-content:start}
.k-screen i{display:block;height:8px;border-radius:4px;background:var(--line)}
.k-screen i.s{width:60%}
.k-screen .ad{border-radius:6px;background:linear-gradient(135deg,var(--accent),#1f8f6a);box-shadow:0 4px 14px rgba(15,107,79,.35)}
.k-slot b{font-size:15px}
.k-tags{display:flex;gap:6px;flex-wrap:wrap}
.k-tags span{font-size:12px;padding:2px 10px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.k-tags .ok{border-color:transparent;background:var(--soft);color:var(--accent);font-weight:700}
.k-tags .full{border-color:transparent;background:#f1ece2;color:#8a6a3a}
.k-tags .wide{border-color:transparent;background:#fff3df;color:#8a5a12;font-weight:700}
.k-tools{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.k-tools div{display:grid;justify-items:center;gap:8px;text-align:center;padding:18px 12px;border-radius:20px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);font-weight:700}
.k-tools .ic{width:34px;height:34px;color:var(--accent)}
.k-rules{display:grid;gap:8px 18px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin:0;padding:0;list-style:none;font-size:13.5px;color:var(--muted)}
.k-rules li{display:flex;gap:8px;align-items:flex-start}
.k-rules .ic{width:18px;height:18px;flex:none;color:var(--accent);margin-top:4px}
@media (max-width:560px){.k-stat{padding:14px}.k-stat .badge{width:38px;height:38px}.k-stat b{font-size:24px}.k-hero{padding:26px 20px}.k-hero .btn{position:static;margin-top:14px}.k-stats{margin-top:14px;padding:0}.k-peak{grid-template-columns:1fr}}
.k-cta{display:inline-flex;gap:8px;align-items:center;margin-top:16px;background:#fff;color:#0b4f3a;font-weight:800;padding:12px 22px;border-radius:14px;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.18)}
.k-cta .ic{width:20px;height:20px}
.k-new{display:none;position:fixed;inset:0;z-index:20;overflow-y:auto;padding:16px;background:rgba(10,25,19,.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.k-new:target{display:flex}
.k-back{position:fixed;inset:0}
.k-modal{position:relative;z-index:1;inline-size:min(640px,100%);margin:auto;background:var(--card);border-radius:26px;padding:24px 22px 22px;box-shadow:0 30px 80px rgba(0,0,0,.35)}
.k-modal .k-h2{margin:0 0 14px;padding-inline-end:44px}
.k-x{position:absolute;inset-block-start:16px;inset-inline-end:16px;display:grid;place-items:center;inline-size:38px;block-size:38px;border-radius:50%;background:var(--bg);color:var(--ink);text-decoration:none;font-size:22px;line-height:1}
.k-form{display:grid;gap:14px}
.k-fields{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.k-f{display:grid;gap:6px;font-size:13px;color:var(--muted);font-weight:600}
.k-f>span{display:flex;gap:6px;align-items:center}.k-f .ic{width:16px;height:16px;color:var(--accent)}
.k-f input,.k-f select{min-height:46px;border-radius:14px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:8px 14px;font:inherit;font-weight:400}
.k-f input:focus,.k-f select:focus{outline:2px solid var(--accent);outline-offset:1px}
.k-f small{font-weight:400}
.k-pick{display:flex;flex-wrap:wrap;gap:8px}
.k-pick label{cursor:pointer}
.k-pick input{position:absolute;opacity:0;pointer-events:none}
.k-pick span{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--bg);font-size:13.5px}
.k-pick input:checked+span{background:var(--soft);border-color:var(--accent);color:var(--accent);font-weight:800}
.k-pick input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
.k-send{display:inline-flex;gap:8px;align-items:center;justify-content:center;min-height:50px;border:0;border-radius:16px;background:var(--accent);color:#fff;font:inherit;font-weight:800;font-size:16px;cursor:pointer;padding:0 26px;justify-self:start}
.k-send .ic{width:20px;height:20px}
.k-ok,.k-bad{display:flex;gap:10px;align-items:center;padding:14px 16px;border-radius:16px;font-weight:700;margin-bottom:12px}
.k-ok{background:var(--soft);color:var(--accent)}.k-bad{background:#fff3df;color:#8a5a12}
.k-ok .ic,.k-bad .ic{width:22px;height:22px;flex:none}
.k-hp{position:absolute;inset-inline-start:-9999px;width:1px;height:1px;overflow:hidden}
.k-fab{display:none}
@media (max-width:560px){.k-fab{display:inline-flex;position:fixed;inset-inline:16px;bottom:14px;z-index:5;justify-content:center;gap:8px;align-items:center;min-height:52px;border-radius:18px;background:var(--accent);color:#fff;font-weight:800;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.28)}.k-fab .ic{width:20px;height:20px}.wrap{padding-bottom:90px}.k-send{justify-self:stretch}}
@media print{.k-fab,.k-new,.k-cta{display:none!important}}
@media print{.k-hero,.k-screen .ad,.k-bars em i{-webkit-print-color-adjust:exact;print-color-adjust:exact}.k-stat,.k-slot,.k-tools div{box-shadow:none}.k-cal{flex-wrap:wrap;overflow:visible}}
`;

/** شاشةٌ مصغّرة تبيّن موضع الإعلان وحجمه النسبي في صفحته. */
function slotScreen(slot: { id: string; width: number; height: number }): string {
  const w = Math.round(Math.min(100, (slot.width / 640) * 100));
  const h = Math.max(10, Math.round((slot.height / slot.width) * 100 * (w / 100) * 0.62));
  const ad = `<span class="ad" style="width:${w}%;height:${h}px"></span>`;
  const lines = `<i></i><i class="s"></i>`;
  return `<div class="k-screen">${slot.id === "sponsor" ? ad + lines + lines : lines + ad + lines}</div>`;
}

/** تقويمُ المواسم: خطٌّ زمني أفقي بألوان المواسم، والموسم الجاري مُضاء. */
function seasonCalendarHtml(items: CalendarItem[], active: string[]): string {
  const upcoming = items.slice(0, 8);
  if (!upcoming.length) return "";
  const COLORS: Record<string, string> = { registration: "var(--accent)", start: "var(--accent2)", middle: "#6b7f8c", finals: "#a0522d", break: "#8a8f98" };
  const short = (d: string) => esc(dateAr(d).replace(/\\s*\\d{4}$/, ""));
  return `<h2 class="k-h2">${icon("calendar")}تقويم المواسم${active.length ? ` <small class="note" style="margin:0">· الآن: ${active.map(seasonLabel).map(esc).join("، ")}</small>` : ""}</h2>
<div class="k-cal">${upcoming.map(i => `<div class="${i.now ? "now" : ""}" style="--c:${COLORS[i.season] || "var(--accent)"}">${i.now ? `<span class="live">● الآن</span>` : ""}<b>${esc(i.label)}</b><small>${esc(i.term)}</small><small>${short(i.from)} ← ${short(i.to)}</small></div>`).join("")}</div>`;
}

export interface PartnerKitInput {
  stats: AudienceStats;
  calendar?: CalendarItem[];
  activeSeasons?: string[];
  liveBySlot: Record<string, number>;
  today?: string;
  nonce: string;
  /** رمز الرابط ليكون هدفَ النموذج. */
  token?: string;
  /** نتيجة آخر إرسال لنموذج «حملة جديدة». */
  leadResult?: "ok" | "bad" | "rate";
  leadError?: string;
}

export function partnerKitPage(input: PartnerKitInput): string {
  const { stats: s, nonce } = input;
  const today = input.today || kuwaitDay();
  const head = headlineTotals(s);
  const hasVisits = s.visits.days > 0;
  const peak = hasVisits ? peakSummary(s.visits.heat) : null;

  const peakCard = peak ? `<h2 class="k-h2">${icon("clock")}متى يفتح الطلبة البرنامج؟</h2>
<div class="card k-peak"><div class="big">${peak.window ? `${esc(hourAr(peak.window.from))} – ${esc(hourAr(peak.window.to))}` : ""}</div>
<div><div class="k-days">${peak.topDays.map(d => `<span>${esc(d.name)}</span>`).join("")}</div>
<div class="k-hours" role="img" aria-label="الزيارات حسب الساعة">${peak.hourTotals.map((v, h) => `<i class="${peak.window && h >= peak.window.from && h < peak.window.to ? "on" : ""}" style="height:${Math.max(4, Math.round((v / Math.max(1, ...peak.hourTotals)) * 100))}%" title="${esc(hourAr(h))}"></i>`).join("")}</div></div></div>` : "";

  const demand = s.demand.top.length >= 3 ? (() => {
    const top = s.demand.top.slice(0, 6), max = Math.max(1, ...top.map(d => d.students));
    return `<h2 class="k-h2">${icon("book")}ما يبحث عنه الطلبة</h2>
<div class="card k-bars">${top.map(d => `<div><span>${esc(d.name)}</span><em><i style="width:${Math.round((d.students / max) * 100)}%"></i></em><b>${approx(d.students)}</b></div>`).join("")}</div>`;
  })() : "";

  const slots = activeSlots().map(slot => {
    const live = input.liveBySlot[slot.id] || 0;
    const free = slot.exclusive ? (live ? 0 : 1) : Math.max(0, slot.capacity - live);
    return `<div class="k-slot" title="${esc(slot.where)}">${slotScreen(slot)}<b>${esc(slot.label)}</b>
<div class="k-tags"><span><bdi dir="ltr">${slot.width}×${slot.height}</bdi></span>${slot.wholeUniversity ? `<span class="wide">كل الجامعة</span>` : ""}${slot.exclusive ? `<span>حصري</span>` : ""}<span class="${free ? "ok" : "full"}">${free ? "متاح" : "محجوز"}</span></div></div>`;
  }).join("");

  const banner = input.leadResult === "ok" ? `<div class="k-ok" role="status">${icon("check")}<span>وصلنا طلبك. نتواصل معك قريباً.</span></div>`
    : input.leadResult === "rate" ? `<div class="k-bad" role="alert">${icon("clock")}<span>أعد المحاولة بعد قليل.</span></div>`
    : input.leadResult === "bad" ? `<div class="k-bad" role="alert">${icon("shield")}<span>${esc(input.leadError || "راجع الحقول وأعد الإرسال.")}</span></div>` : "";
  /* نافذةٌ فوق الصفحة بلا JavaScript: الرابط #new يفتحها عبر :target، والإغلاق رابطٌ إلى # (الخلفية أو الزر ×). */
  const lead = `<section class="k-new" id="new" role="dialog" aria-modal="true" aria-labelledby="new-h">
<a class="k-back" href="#" aria-label="إغلاق"></a>
<div class="k-modal">
<a class="k-x" href="#" aria-label="إغلاق">×</a>
<h2 class="k-h2" id="new-h">${icon("plus")}${NEW_CAMPAIGN}</h2>
${banner}
<form class="k-form" method="post" action="/partners/${encodeURIComponent(input.token || "")}/lead" autocomplete="on">
  <div class="k-fields">
    <label class="k-f"><span>${icon("building")}الشركة</span><input name="company" required minlength="2" maxlength="80" autocomplete="organization"></label>
    <label class="k-f"><span>${icon("user")}الاسم</span><input name="name" required minlength="2" maxlength="60" autocomplete="name"></label>
    <label class="k-f"><span>${icon("phone")}الجوال</span><input name="phone" required type="tel" inputmode="tel" dir="ltr" maxlength="20" autocomplete="tel"></label>
    <label class="k-f"><span>${icon("mail")}البريد <small>(اختياري)</small></span><input name="email" type="email" dir="ltr" maxlength="120" autocomplete="email"></label>
  </div>
  <div class="k-f"><span>${icon("globe")}أين تريد ظهور إعلانك؟</span>
    <div class="k-pick" role="group" aria-label="المواقع">${activeSlots().map(slot => `<label><input type="checkbox" name="slots" value="${esc(slot.id)}"><span>${esc(slot.label)}</span></label>`).join("")}</div></div>
  <label class="k-f"><span>${icon("calendar")}متى؟</span><select name="season"><option value="">في أي وقت</option>${SEASONS.map(se => `<option value="${esc(se.id)}">${esc(se.label)}</option>`).join("")}</select></label>
  <label class="k-f"><span>${icon("send")}كلمة لنا <small>(اختياري)</small></span><input name="note" maxlength="300"></label>
  <div class="k-hp" aria-hidden="true"><label>لا تملأ هذا الحقل<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <button class="k-send" type="submit">${icon("send")}أرسل الطلب</button>
  <small class="note" style="margin:0">نتواصل معك قريباً. بياناتك لا يراها غيرنا.</small>
</form></div></section>`;
  return page("ملف الشراكة · SCHEDULE", nonce, `
<section class="k-hero">
  <p class="brand">SCHEDULE · ملف الشراكة</p>
  <h1>جمهورك في لحظة الجدول</h1>
  <p>طلبةٌ وأساتذة يفتحون جداولهم بأنفسهم، كل فصل.</p>
  <a class="k-cta noprint" href="#new">${icon("plus")}${NEW_CAMPAIGN}</a>
</section>
<div class="k-stats">
  <div class="k-stat"><span class="badge">${icon("students")}</span><small class="note" style="margin:0">حوالي</small><b>${fmt(head.students)}</b><span>إجمالي الطلبة المستفيدين</span></div>
  <div class="k-stat"><span class="badge">${icon("visits")}</span><small class="note" style="margin:0">حوالي</small><b>${fmt(head.visits)}</b><span>إجمالي دخول الطلبة</span></div>
  <div class="k-stat"><span class="badge">${icon("staff")}</span><small class="note" style="margin:0">حوالي</small><b>${fmt(AUDIENCE_BASELINE.instructors)}</b><span>أعضاء هيئة التدريس</span></div>
  <div class="k-stat"><span class="badge">${icon("tap")}</span><small class="note" style="margin:0">حوالي</small><b>${fmt(head.instructorOpens)}</b><span>إجمالي دخول أعضاء هيئة التدريس</span></div>
</div>
<div class="k-why"><div>${icon("tap")}<span>يفتحونه بأنفسهم</span></div><div>${icon("repeat")}<span>كل فصل</span></div><div>${icon("shield")}<span>بلا بيانات شخصية</span></div></div>
${peakCard}
${demand}
${seasonCalendarHtml(input.calendar || [], input.activeSeasons || [])}
<h2 class="k-h2">${icon("globe")}أين يظهر إعلانك</h2>
<div class="k-slots">${slots}</div>
${lead}
<h2 class="k-h2">${icon("chart")}تتابع نتائجك حيّة</h2>
<div class="k-tools"><div>${icon("chart")}<span>تقرير حيّ</span></div><div>${icon("ab")}<span>اختبار A/B</span></div><div>${icon("ticket")}<span>كود خصم</span></div><div>${icon("flask")}<span>تجربة قبل الالتزام</span></div></div>
<h2 class="k-h2">${icon("shield")}شروطنا</h2>
<ul class="k-rules">${AD_RULES.map(r => `<li>${icon("check")}<span>${esc(r)}</span></li>`).join("")}</ul>
<a class="k-fab noprint" href="#new">${icon("plus")}${NEW_CAMPAIGN}</a>`, KIT_CSS, true);
}

/** سياسةُ القياس والإعلانات: صفحةٌ عامة بلا رمز، يصل إليها الطالب من السطر تحت كل إعلان. كلُّ سطرٍ فيها يصف ما يفعله الكود فعلاً. */
export function measurementPage(nonce: string): string {
  const li = (items: string[]) => `<ul class="rules">${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
  return page("كيف نقيس الزيارات ونعرض الإعلانات", nonce, `
<section class="hero">
  <p class="brand">SCHEDULE · نظام القرار الأكاديمي</p>
  <h1>كيف نقيس الزيارات ونعرض الإعلانات</h1>
  <p class="lead">باختصار: نعدّ كم شخصاً زار الصفحة وكم مرةً ظهر إعلان، ولا نعرف من أنت ولا نتتبّعك.</p>
</section>
<h2>ما الذي نقيسه؟</h2>
<div class="card">${li([
  "<b>زيارةٌ واحدة في اليوم</b> لكل نوع صفحة (مثل «مساري» أو الجدول العام) من كل متصفح، لنعرف حجم من يستعمل البرنامج.",
  "هل هذه أول زيارةٍ لك أم عدتَ، وهل تتصفح من جوالٍ أم حاسوب، وفي أي ساعةٍ من اليوم.",
  "<b>ظهور الإعلان:</b> يُحتسب بعد أن يبقى نصفه ظاهراً على شاشتك ثانيةً كاملة. و<b>نقرته</b> عند فتحه.",
  "عددُ الطلبة الذين يريدون كل مقرر، <b>مجمّعاً</b>، ولا يظهر مقررٌ يطلبه أقل من عشرة طلابٍ مختلفين.",
])}</div>
<h2>وما الذي لا نقيسه؟</h2>
<div class="card">${li([
  "لا اسمك ولا رقمك المدني ولا بريدك ولا موقعك الجغرافي.",
  "لا نربط زيارتك بحسابٍ أو بملفّك، ولا نبني سجلَّ تصفّحٍ ولا «بصمةً» لجهازك.",
  "لا نخزّن عنوان الاتصال (IP): يُستعمل في ذاكرة الخادم وحدها لمنع الإساءة وتكرار النقر، ويُمحى منها خلال دقيقتين كحدٍّ أقصى.",
  "لا نستعمل شبكات إعلانٍ ولا أدوات تتبّعٍ خارجية؛ الإعلانات صورٌ تُخدم من الموقع نفسه.",
])}</div>
<h2>ما الذي يُحفظ في متصفحك؟</h2>
<div class="card">${li([
  "مفاتيح صغيرة في التخزين المحلي (تبدأ بـ <bdi dir=\"ltr\">adx:</bdi>) تُخبر متصفحك أنك زرتَ اليوم فلا تُعدّ مرتين، وتحدّ عدد مرات ظهور الإعلان نفسه لك في اليوم.",
  "يمكنك مسحها في أي وقتٍ من إعدادات المتصفح؛ لا يتأثر عملك في البرنامج بذلك.",
  "إن منعتَ التخزين لن نعرف أنك زرتَ اليوم، فقد تُحتسب كل زيارة؛ لا شيء آخر يتغيّر.",
])}</div>
<h2>عن الإعلانات</h2>
<div class="card">${li([
  "كل إعلانٍ موسومٌ بكلمة «إعلان» أو «برعاية». لا يظهر في أي صفحةٍ تطلب رقمك المدني أو وثائقك (دخول «مساري»، الاستبيان، حالة الطلب، بطاقة الأستاذ)، ولا في صفحات الاعتماد والطباعة والتقويم؛ ويظهر في جدول القسم وجدول الطلبة، وداخل «مساري» بعد دخولك.",
  "عند الضغط على إعلانٍ تنتقل إلى موقع المعلن، وله سياسته الخاصة.",
  "لا يُعرض إعلانٌ إلا بعد مراجعته واعتماده من إدارة النظام، ولها إيقافه فوراً.",
  "تُوقف الإعلانات تلقائياً في موعد انتهاء كل حملة.",
])}</div>
<footer>SCHEDULE · هذه الصفحة تصف ما يفعله البرنامج فعلاً؛ وتتغيّر معه إن تغيّر.</footer>`);
}
