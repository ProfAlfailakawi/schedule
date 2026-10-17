/**
 * ── قراءاتٌ تحليلية للحملات ───────────────────────────────────────────────────────────
 *
 * ثلاثُ دوالَّ نقيّة بلا قاعدة بيانات (تُختبر وحدها):
 *   wrapUp      خلاصةُ حملةٍ انتهت: أفضل يوم، وأقوى يومٍ في الأسبوع، وأقوى صورة، وأرقامها الكلية.
 *   abVerdict   هل يكفي ما ظهر لتقول إن صورةً أقوى من أختها؟ اختبارُ نسبتين (z) بحدٍّ أدنى للظهور؛ لا تطبيق تلقائي.
 *   peakSummary ذروةُ استخدام الطلبة من مصفوفة الزيارات (يوم × ساعة): أيامُها ونافذةُ ثلاث ساعاتٍ متصلة.
 * كلُّها تقديرية وتُعرض كما هي بلا ادّعاء يقين.
 */
import type { AdStatsDay } from "../types";
import { totalsOf, type CampaignTotals } from "./adsEngine";

const DAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const dayNameAr = (day: string): string => DAYS_AR[new Date(`${day}T00:00:00Z`).getUTCDay()];

/* ── خلاصة الحملة ── */
export interface WrapUp {
  days: number;
  totals: CampaignTotals;
  avgPerDay: number;
  bestDay: { day: string; impressions: number } | null;
  bestWeekday: { name: string; impressions: number; share: number } | null;
  bestCreative: { creativeId: string; ctr: number; impressions: number } | null;
}

export function wrapUp(rows: readonly AdStatsDay[], currentCreativeIds?: readonly string[]): WrapUp {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) || 0) + r.impressions);
  const totals = totalsOf(rows as AdStatsDay[]);
  const days = byDay.size;
  let bestDay: WrapUp["bestDay"] = null;
  for (const [day, impressions] of byDay) if (impressions > 0 && (!bestDay || impressions > bestDay.impressions)) bestDay = { day, impressions };
  const byDow = new Map<string, number>();
  for (const [day, n] of byDay) byDow.set(dayNameAr(day), (byDow.get(dayNameAr(day)) || 0) + n);
  const dowTotal = [...byDow.values()].reduce((a, b) => a + b, 0);
  const topDow = [...byDow].sort((a, b) => b[1] - a[1])[0];
  /* الأقوى صورةً: لا تُذكر إلا إن كان للمقارنة معنى (صورتان فأكثر بظهورٍ كافٍ لكلٍّ منهما). */
  const perCreative = [...new Set(rows.map(r => r.creativeId))].map(id => ({ creativeId: id, ...totalsOf(rows.filter(r => r.creativeId === id) as AdStatsDay[]) }));
  const eligible = perCreative.filter(c => c.impressions >= 200 && (!currentCreativeIds || currentCreativeIds.includes(c.creativeId)));
  const topCreative = eligible.length > 1 ? [...eligible].sort((a, b) => b.ctr - a.ctr)[0] : null;
  return {
    days, totals,
    avgPerDay: days ? Math.round(totals.impressions / days) : 0,
    bestDay,
    bestWeekday: topDow && dowTotal ? { name: topDow[0], impressions: topDow[1], share: Math.round((topDow[1] / dowTotal) * 100) } : null,
    bestCreative: topCreative ? { creativeId: topCreative.creativeId, ctr: topCreative.ctr, impressions: topCreative.impressions } : null,
  };
}

/* ── توصية A/B ── */
export const AB_MIN_IMPRESSIONS = 500;
export type AbVerdict =
  | { state: "single" }
  | { state: "collecting"; need: number }
  | { state: "tie"; z: number }
  | { state: "winner"; winner: string; loser: string; winnerCtr: number; loserCtr: number; z: number };

export function abVerdict(rows: ReadonlyArray<{ creativeId: string; impressions: number; clicks: number }>): AbVerdict {
  if (rows.length < 2) return { state: "single" };
  const [a, b] = [...rows].sort((x, y) => y.impressions - x.impressions);
  const short = Math.max(0, AB_MIN_IMPRESSIONS - Math.min(a.impressions, b.impressions));
  if (short > 0) return { state: "collecting", need: short };
  const pa = a.clicks / a.impressions, pb = b.clicks / b.impressions;
  const pooled = (a.clicks + b.clicks) / (a.impressions + b.impressions);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.impressions + 1 / b.impressions));
  const z = se > 0 ? (pa - pb) / se : 0;
  if (Math.abs(z) < 1.96) return { state: "tie", z: Math.round(z * 100) / 100 };
  const [win, lose] = z > 0 ? [a, b] : [b, a];
  const ctr = (r: { impressions: number; clicks: number }) => Math.round((r.clicks / r.impressions) * 1000) / 10;
  return { state: "winner", winner: win.creativeId, loser: lose.creativeId, winnerCtr: ctr(win), loserCtr: ctr(lose), z: Math.round(Math.abs(z) * 100) / 100 };
}

/* ── ذروة الاستخدام ── */
export interface PeakSummary {
  total: number;
  /** نصيب كل يومٍ من أحدٍ إلى سبت (٪). */
  dayShare: number[];
  topDays: Array<{ name: string; share: number }>;
  hourTotals: number[];
  /** أقوى نافذةٍ من ثلاث ساعاتٍ متصلة. */
  window: { from: number; to: number; share: number } | null;
}

export function peakSummary(heat: readonly (readonly number[])[], minTotal = 200): PeakSummary | null {
  if (heat.length !== 7 || heat.some(r => r.length !== 24)) return null;
  const hourTotals = Array.from({ length: 24 }, (_, h) => heat.reduce((s, row) => s + (Number(row[h]) || 0), 0));
  const dayTotals = heat.map(row => row.reduce((s, v) => s + (Number(v) || 0), 0));
  const total = dayTotals.reduce((a, b) => a + b, 0);
  if (total < minTotal) return null;
  const dayShare = dayTotals.map(v => Math.round((v / total) * 100));
  const topDays = dayTotals.map((v, i) => ({ name: DAYS_AR[i], share: dayShare[i], v })).sort((a, b) => b.v - a.v).slice(0, 3).map(({ name, share }) => ({ name, share }));
  let best = -1, from = 0;
  for (let h = 0; h <= 21; h++) {
    const sum = hourTotals[h] + hourTotals[h + 1] + hourTotals[h + 2];
    if (sum > best) { best = sum; from = h; }
  }
  return { total, dayShare, topDays, hourTotals, window: { from, to: from + 3, share: Math.round((best / total) * 100) } };
}

/** ساعةٌ بنظام ١٢: «١٠ ص» / «٢ م». */
export const hourAr = (h: number): string => {
  const hh = ((h % 24) + 24) % 24;
  const n = hh % 12 === 0 ? 12 : hh % 12;
  return `${n} ${hh < 12 ? "ص" : "م"}`;
};

/* ── التحويل المُبلَّغ من الشركة ──
   تُدخله الشركةُ بنفسها (كم استعمل الكود) فلا نعدّه موثَّقاً: يُعرض في تقريرها ولمديرها بوسم «مُبلَّغ»، ولا يدخل ملفَّ الشراكة
   ولا أي مجموعٍ تسويقي. إن غابت الأرقام أو بُولغ فيها لا يتأثر شيءٌ مما نقيسه نحن (الظهور والنقر)؛ ونكتفي بتنبيهٍ محايد. */
export interface Redemption { day: string; count: number; at: string }
export interface Conversion { total: number; days: number; perClick: number | null; note: "none" | "ok" | "above-clicks" }

export function conversionOf(reports: readonly Redemption[] | undefined, clicks: number): Conversion {
  const list = reports || [];
  const total = list.reduce((s, r) => s + (Number(r.count) || 0), 0);
  if (!list.length) return { total: 0, days: 0, perClick: null, note: "none" };
  const perClick = clicks > 0 ? Math.round((total / clicks) * 1000) / 10 : null;
  /* الكود ظاهرٌ في الإعلان ويُشارَك، فقد يفوق عددُ استعماله النقرات بلا كذب؛ لذا ملاحظةٌ لا اتهام. */
  return { total, days: list.length, perClick, note: clicks > 0 && total > clicks ? "above-clicks" : "ok" };
}
