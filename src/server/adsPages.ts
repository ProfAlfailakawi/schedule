/**
 * ── صفحتا الشركاء: «تقرير الحملة» و«ملف الشراكة» ────────────────────────────────
 *
 * صفحتان عامتان بروابطَ سرّية، مكتوبتان هنا بالكامل (لا نصَّ من خارج الملف إلا ما
 * يُهرَّب)، بسكربتٍ واحد بنونس للطباعة. لا تعرضان اسماً ولا رقماً مدنياً؛ أرقامٌ فقط.
 *
 *   تقرير الحملة : ما تراه شركةٌ واحدة عن حملتها وحدها، وطريقةُ العدّ بصراحة.
 *   ملف الشراكة  : ما تراه شركةٌ قبل أن تتعاقد: حجم الجمهور، والمواقع، والشروط.
 */
import type { AdCampaign, AdCreative, AdStatsDay } from "../types";
import type { AudienceStats } from "../utils/audienceStats";
import { AD_RULES, TRIAL_DAYS, activeSlots, creativeBreakdown, dailySeries, daysLeft, expectedShare, kuwaitDay, phaseOf, slotById, totalsOf, type AdPhase, type WeeklyCompare } from "../utils/adsEngine";
import { conversionOf, hourAr, peakSummary, wrapUp, type WrapUp } from "../utils/adInsights";
import { AR, countOf } from "../utils/arabicCount";
import { SEASONS, seasonLabel, type CalendarItem } from "../utils/adSeasons";

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

const BASE_CSS = `
:root{--bg:#f6f4ef;--card:#fff;--ink:#17201c;--muted:#5f6b65;--line:#e4e0d6;--accent:#0f6b4f;--accent2:#c9822b;--soft:#e8f3ee;--shadow:0 1px 2px rgba(20,30,25,.06),0 14px 40px rgba(20,30,25,.07)}
@media (prefers-color-scheme:dark){:root{--bg:#0f1512;--card:#17201c;--ink:#eef3ef;--muted:#9baba3;--line:#27342e;--accent:#4fc29a;--accent2:#e3a557;--soft:#12261e;--shadow:0 1px 2px rgba(0,0,0,.4),0 14px 40px rgba(0,0,0,.35)}}
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

const page = (title: string, nonce: string, body: string): string => `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark">
<title>${esc(title)}</title><link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">
<style>${BASE_CSS}</style></head><body><div class="wrap">${body}</div>
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
<p style="margin:0 0 10px"><img src="${esc(reportPath)}/badge.svg" alt="شريك SCHEDULE" width="320" height="92" style="max-width:100%;height:auto;border-radius:16px"></p>
<p class="btnrow"><a class="btn" href="${esc(reportPath)}/badge.svg?dl=1">تنزيل الشارة</a></p>
<p class="note" style="margin:6px 0 4px">أو انسخوا هذا الكود:</p>
<textarea readonly rows="2" style="inline-size:100%;box-sizing:border-box;font:12px/1.5 ui-monospace,monospace;border:1px solid var(--line);border-radius:10px;padding:8px;direction:ltr">${esc(`<img src="${origin}${reportPath}/badge.svg" alt="شريك SCHEDULE" width="320">`)}</textarea></div>`;
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

/** تقويمُ المواسم: متى يكون الطالب في موسم التسجيل أو بدء الفصل أو نهايته، لتختار الشركةُ موسمَ منتجها. */
function seasonCalendarHtml(items: CalendarItem[], active: string[]): string {
  const upcoming = items.slice(0, 12);
  if (!upcoming.length) return "";
  const COLORS: Record<string, string> = { registration: "var(--accent)", start: "var(--accent2)", middle: "#6b7f8c", finals: "#a0522d", break: "#8a8f98" };
  return `<h2>تقويم المواسم</h2>
<div class="card"><p class="note" style="margin-top:0">اختر الموسم الأنسب لمنتجك؛ يمكن ربط إعلانك بموسمٍ أو أكثر فلا يظهر إلا فيه. الموسم الجاري الآن: <b>${active.length ? active.map(seasonLabel).map(esc).join("، ") : "—"}</b>.</p>
<div class="cal">${upcoming.map(i => `<div class="cal-i${i.now ? " now" : ""}" style="--c:${COLORS[i.season] || "var(--accent)"}"><b>${esc(i.label)}</b><span>${esc(i.term)}</span><small>${esc(dateAr(i.from))} ← ${esc(dateAr(i.to))}${i.now ? " · الآن" : ""}</small></div>`).join("")}</div>
<p class="note">${SEASONS.map(s => `<b>${esc(s.label)}:</b> ${esc(s.hint)}`).join(" · ")}</p></div>`;
}

export interface PartnerKitInput {
  stats: AudienceStats;
  calendar?: CalendarItem[];
  activeSeasons?: string[];
  liveBySlot: Record<string, number>;
  today?: string;
  nonce: string;
}

export function partnerKitPage(input: PartnerKitInput): string {
  const { stats: s, nonce } = input;
  const today = input.today || kuwaitDay();
  const reachStudents = s.reach.studentsMin;
  const hasVisits = s.visits.days > 0;
  const peak = hasVisits ? peakSummary(s.visits.heat) : null;
  const peakCard = peak ? `<h2>متى يفتح الطلبة البرنامج؟</h2>
<div class="card"><p style="margin:0 0 8px">ذروة الاستخدام <b>${esc(peak.topDays.map(d => d.name).join("، "))}</b>${peak.window ? `، وأقوى ساعاتها من <b>${esc(hourAr(peak.window.from))}</b> إلى <b>${esc(hourAr(peak.window.to))}</b> (نحو ${peak.window.share}٪ من الزيارات)` : ""}.</p>
${barChart(peak.hourTotals.map((v, h) => ({ day: hourAr(h), a: v })), "الزيارات حسب الساعة")}
<p class="note">بتوقيت الكويت، من زياراتٍ مجهولة ومجمّعة. اختر موسم إعلانك ووقت عرضك على هذا الأساس.</p></div>` : "";
  return page("ملف الشراكة · SCHEDULE", nonce, `
<div class="bar noprint"><p class="brand">SCHEDULE · ملف الشراكة</p><button class="btn" id="print" type="button">طباعة / حفظ PDF</button></div>
<section class="hero">
  <p class="brand">SCHEDULE · نظام القرار الأكاديمي</p>
  <h1>اصل إلى الطلبة والأساتذة<br>في اللحظة التي يحتاجون فيها جدولهم</h1>
  <p class="lead">منصةٌ يستخدمها الطلبة والكادر في كل فصل لمعرفة جداولهم وتسجيلهم وحالة طلباتهم. إعلانك يظهر في صفحاتٍ يفتحونها بأنفسهم، وبأرقامٍ تراها أنت حيةً.</p>
</section>
<div class="grid">
  <div class="kpi"><b>${approx(reachStudents)}</b><span>الطلبة المؤكَّدون (أجابوا الاستبيان أو أنشأوا ملفّهم)</span><small>حدٌّ أدنى مؤكد، بلا تكرار</small></div>
  <div class="kpi"><b>${approx(s.instructors.opened)}</b><span>عضو هيئة تدريس فتح بطاقته</span><small>في الفصل الجاري</small></div>
  <div class="kpi"><b>${pct(s.instructors.openRate)}</b><span>نسبة فتح بطاقات الأساتذة</span><small>التزامٌ يقيس جدّية الجمهور</small></div>
  ${hasVisits ? `<div class="kpi"><b>${approx(s.visits.last30)}</b><span>زيارة في آخر ٣٠ يوماً</span><small>مقيسة منذ ${esc(dateAr(s.visits.since))}</small></div>` : ""}
</div>
${hasVisits ? `<h2>الزيارات اليومية (آخر ٣٠ يوماً)</h2><div class="card">${barChart(s.visits.series.map(p => ({ day: p.day, a: p.count })), "الزيارات")}<p class="note">الذروة تأتي غالباً يوم ${esc(s.visits.peakDay || "—")}؛ ونسبة الجوال ${pct(s.visits.mobileRate)} ونسبة العائدين ${pct(s.visits.returningRate)}.</p></div>` : `<p class="note">قياس الزيارات اليومية فعّالٌ ويتراكم يوماً بعد يوم، وتظهر أرقامه هنا فور توفر بياناتٍ كافية.</p>`}
${s.demand.top.length >= 3 ? `<h2>ما يبحث عنه الطلبة هذا الفصل</h2><div class="card"><table><thead><tr><th>المقرر</th><th>طلبةٌ يريدونه</th></tr></thead><tbody>${s.demand.top.slice(0, 6).map(d => `<tr><td>${esc(d.name)}</td><td class="n">${approx(d.students)}</td></tr>`).join("")}</tbody></table><p class="note">أعدادٌ تقريبية مجمّعة، ولا يظهر مقررٌ يطلبه أقل من ${countOf(s.demand.minStudents, AR.student)} مختلفين.</p></div>` : ""}
${seasonCalendarHtml(input.calendar || [], input.activeSeasons || [])}
${peakCard}
<h2>أين يظهر إعلانك</h2>
<div class="callout"><b>«مساري» لكل الجامعة</b><span>إعلانك في «مساري» ومحطة الاستراحة يراه كل طالبٍ يدخل، من كل الكليات، دون أي تخصيص؛ وإن أردتَ كليةً بعينها فيمكن حصر الحملة بها (لمن أكمل ملفه الشخصي).</span></div>
<div class="card">${activeSlots().map(slot => {
  const live = input.liveBySlot[slot.id] || 0;
  const free = slot.exclusive ? (live ? 0 : 1) : Math.max(0, slot.capacity - live);
  const maxW = Math.min(180, slot.width / 3.6);
  return `<div class="slot" style="padding:10px 0;border-bottom:1px solid var(--line)"><div><b>${esc(slot.label)}</b> <span class="note">· ${esc(slot.where)}</span><br><span class="note">المقاس <bdi dir="ltr">${slot.width}×${slot.height}</bdi> · ${slot.wholeUniversity ? `<b class="reach">يصل كل طلبة الجامعة</b> · ` : ""}${slot.exclusive ? "حصري لشركة واحدة" : `يتناوب فيه حتى ${countOf(slot.capacity, AR.campaign)}`} · ${free ? `متاح` : `ممتلئ حالياً`}</span></div><div class="mock" style="width:${maxW}px;aspect-ratio:${slot.width}/${slot.height}"><bdi dir="ltr">${slot.width}×${slot.height}</bdi></div></div>`;
}).join("")}</div>
<h2>شروطنا</h2>
<div class="card"><ul class="rules">${AD_RULES.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
<h2>كيف تتابع نتائجك؟</h2>
<div class="card"><ul class="rules">
  <li>لكل حملةٍ رابط تقرير خاص بها يتحدث حياً: ظهور مرئي، مشاهدون، نقرات، ونسبة النقر.</li>
  <li>اختبار A/B بصورتين لمعرفة أيهما أقوى.</li>
  <li>كود خصم خاص بشركتك لقياس التحويل عندكم.</li>
  <li>حملةٌ تجريبية قصيرة بتقريرٍ كامل لتجرّب قبل أن تلتزم.</li>
</ul></div>
<footer>SCHEDULE · ${esc(dateAr(today))} · الأرقام تقريبية ومجمّعة ولا تحمل أي هوية</footer>`);
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
