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
import { AD_RULES, AD_SLOTS, creativeBreakdown, dailySeries, daysLeft, expectedShare, kuwaitDay, phaseOf, slotById, totalsOf, type AdPhase } from "../utils/adsEngine";
import { AR, countOf } from "../utils/arabicCount";

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
  return `${fmt(Math.floor(n / step) * step)}+`;
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
.chart text{fill:var(--muted);font-size:11px}
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
.slot{display:grid;gap:10px;grid-template-columns:minmax(0,1fr) 190px;align-items:center}
.mock{border:1.5px dashed var(--accent);border-radius:10px;background:var(--soft);display:grid;place-items:center;color:var(--accent);font-size:12px;max-width:100%}
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
  const first = series[0].day.slice(5), last = series[series.length - 1].day.slice(5);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(labelA)}">
<line x1="${padL}" x2="${W - padL}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>
<line x1="${padL}" x2="${W - padL}" y1="${y(max / 2)}" y2="${y(max / 2)}" stroke="var(--line)" stroke-dasharray="3 5"/>
${bars}${line}
<text x="${W - padL}" y="${H - 8}" text-anchor="end">${esc(first)}</text><text x="${padL}" y="${H - 8}" text-anchor="start">${esc(last)}</text>
<text x="${W - padL}" y="${padT - 2}" text-anchor="end">${esc(labelA)}: الذروة ${fmt(max)}${labelB ? ` · ${esc(labelB)} (الخط)` : ""}</text></svg>`;
}

export interface CampaignReportInput {
  campaign: AdCampaign;
  creatives: ReadonlyArray<Omit<AdCreative, "data">>;
  stats: readonly AdStatsDay[];
  liveInSlot: number;
  today?: string;
  nonce: string;
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
<h2>الأداء اليومي</h2>
<div class="card">${barChart(series.map(p => ({ day: p.day, a: p.impressions, b: p.clicks })), "الظهور", "النقرات")}</div>
${input.liveInSlot > 1 ? `<p class="note">يتناوب في هذا الموقع ${countOf(input.liveInSlot, AR.campaign)}، فحصتك المتوقعة من الظهور نحو ${pct(share * 100)}.</p>` : ""}
${c.coupon ? `<h2>كود الخصم</h2><div class="card"><b style="font-size:22px;letter-spacing:.04em" dir="ltr">${esc(c.coupon)}</b><p class="note">يظهر تحت إعلانك؛ تابع استخدامه عندكم لمعرفة التحويل الفعلي.</p></div>` : ""}
${breakdown.length > 1 ? `<h2>مقارنة الصورتين (A/B)</h2><div class="card"><table><thead><tr><th>الصورة</th><th>ظهور</th><th>نقرات</th><th>نسبة النقر</th></tr></thead><tbody>${breakdown.map(r => `<tr><td>${esc(labelOf(r.creativeId))}${best && best.creativeId === r.creativeId ? " ⭐" : ""}</td><td class="n">${fmt(r.impressions)}</td><td class="n">${fmt(r.clicks)}</td><td class="n">${pct(r.ctr)}</td></tr>`).join("")}</tbody></table>${best ? `<p class="note">الأعلى نقراً حتى الآن: «${esc(labelOf(best.creativeId))}».</p>` : ""}</div>` : ""}
<h2>تصميم الإعلان</h2>
<div class="pre">${creatives.map(cr => `<figure><img src="/_ads/img/${esc(cr.id)}" alt="${esc(cr.label)}" width="${cr.width}" height="${cr.height}" loading="lazy"><figcaption>${esc(cr.label)} · ${cr.width}×${cr.height}</figcaption></figure>`).join("")}</div>
<h2>كيف نعدّ؟</h2>
<div class="card"><ul class="rules">
  <li><b>الظهور المرئي:</b> يُحتسب بعد أن يبقى نصف الإعلان على الأقل ظاهراً على الشاشة ثانيةً كاملة والصفحة مفتوحة.</li>
  <li><b>المشاهدون:</b> تقديرٌ بعدد المتصفحات الفريدة في اليوم، بلا أي هوية؛ فمن يمسح بيانات متصفحه قد يُعدّ مرتين.</li>
  <li><b>النقرات:</b> نستبعد الزيارات الآلية والنقرات المتكررة من المصدر نفسه خلال ثوانٍ${totals.filteredClicks ? ` (استُبعد ${countOf(totals.filteredClicks, AR.click)} في حملتك)` : ""}.</li>
  <li>لا نخزّن أسماء ولا أرقاماً مدنية ولا عناوين في القياس.</li>
</ul></div>
<footer>SCHEDULE · تقريرٌ سرّي بين الإدارة والشركة · ${esc(dateAr(today))}</footer>`);
}

export interface PartnerKitInput {
  stats: AudienceStats;
  liveBySlot: Record<string, number>;
  today?: string;
  nonce: string;
}

export function partnerKitPage(input: PartnerKitInput): string {
  const { stats: s, nonce } = input;
  const today = input.today || kuwaitDay();
  const reachStudents = s.reach.studentsMin;
  const hasVisits = s.visits.days > 0;
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
<h2>أين يظهر إعلانك</h2>
<div class="card">${AD_SLOTS.map(slot => {
  const live = input.liveBySlot[slot.id] || 0;
  const free = slot.exclusive ? (live ? 0 : 1) : Math.max(0, slot.capacity - live);
  const maxW = Math.min(180, slot.width / 3.6);
  return `<div class="slot" style="padding:10px 0;border-bottom:1px solid var(--line)"><div><b>${esc(slot.label)}</b> <span class="note">· ${esc(slot.where)}</span><br><span class="note">المقاس <bdi dir="ltr">${slot.width}×${slot.height}</bdi> · ${slot.exclusive ? "حصري لشركة واحدة" : `يتناوب فيه حتى ${countOf(slot.capacity, AR.campaign)}`} · ${free ? `متاح` : `ممتلئ حالياً`}</span></div><div class="mock" style="width:${maxW}px;aspect-ratio:${slot.width}/${slot.height}"><bdi dir="ltr">${slot.width}×${slot.height}</bdi></div></div>`;
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
