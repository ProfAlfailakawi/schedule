/**
 * أنواعٌ ومكوّناتٌ صغيرة مشتركة بين أجزاء شاشة الإعلانات: القائمة والدرج والمعالج وخريطة المواضع.
 */
import React from "react";

export interface Slot { id: string; label: string; where: string; audience: string; width: number; height: number; capacity: number; exclusive?: boolean; wholeUniversity?: boolean; live: number; nextFree: string }
export interface Totals { impressions: number; uniques: number; clicks: number; filteredClicks: number; ctr: number }
export interface Creative { id: string; label: string; width: number; height: number; bytes: number; qualityOverride?: boolean }
export interface WeekTotals { impressions: number; uniques: number; clicks: number; ctr: number }
export type AbVerdict =
  | { state: "single" }
  | { state: "collecting"; need: number }
  | { state: "tie"; z: number }
  | { state: "winner"; winner: string; loser: string; winnerCtr: number; loserCtr: number; z: number };
export type Phase = "draft" | "paused" | "scheduled" | "live" | "ended";
export interface Campaign {
  id: string; company: string; category: string; slot: string; slotLabel?: string; linkUrl: string; coupon?: string; startDay: string; endDay: string; note?: string;
  status: "draft" | "approved" | "paused"; trial?: boolean; phase: Phase; daysLeft: number; endingSoon: boolean;
  creatives: Creative[]; totals: Totals; breakdown: Array<{ creativeId: string } & Totals>; sharePct: number; reportUrl: string;
  seasons?: string[]; colleges?: number[]; series: Array<{ day: string; impressions: number; clicks: number }>;
  weekly?: { thisWeek: WeekTotals; lastWeek: WeekTotals; impressionsChange: number | null; clicksChange: number | null; hasLastWeek: boolean };
  ab?: AbVerdict; conversion?: { total: number; days: number; perClick: number | null; note: "none" | "ok" | "above-clicks" }; contactEmail?: string; mailLog?: { weekly?: string; renewal?: string };
  createdAt: string;
}
export interface Season { id: string; label: string; hint: string }
export interface CalendarItem { season: string; label: string; term: string; from: string; to: string; now: boolean }
export interface Lead { id: string; createdAt: string; company: string; name: string; phone: string; email?: string; slots: string[]; season?: string; note?: string; status: "new" | "contacted"; contactedAt?: string }
export interface Payload {
  today: string; mailEnabled?: boolean; slots: Slot[]; categories: string[]; rules: string[]; maxBytes: number; campaigns: Campaign[]; partnerKit: string;
  leads: Lead[];
  seasons: Season[]; activeSeasons: string[]; calendar: CalendarItem[]; colleges: Array<{ id: number; name: string }>;
}

export const nf = new Intl.NumberFormat("ar-KW-u-nu-latn");
export const fmt = (n: number) => nf.format(Math.round(n));
export const pct1 = (n: number) => `${new Intl.NumberFormat("ar-KW-u-nu-latn", { maximumFractionDigits: 1 }).format(n)}٪`;
export const arrowOf = (v: number | null | undefined) => (v == null ? "—" : v > 0 ? `▲ ${pct1(v)}` : v < 0 ? `▼ ${pct1(Math.abs(v))}` : "ثابت");
export const dateShort = (day: string) => {
  try { return new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)); } catch { return day; }
};
export const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || "تعذّر تنفيذ الطلب."), { problems: body.problems as string[] | undefined, code: body.code as string | undefined });
  return body as T;
}

export const PHASE_INFO: Record<Phase, { label: string; tone: "live" | "wait" | "off" | "draft" | "pause" }> = {
  live: { label: "تعمل الآن", tone: "live" }, scheduled: { label: "مجدولة", tone: "wait" }, ended: { label: "منتهية", tone: "off" },
  paused: { label: "موقوفة", tone: "pause" }, draft: { label: "مسودة", tone: "draft" },
};

export function StatusPill({ phase }: { phase: Phase }) {
  const info = PHASE_INFO[phase];
  return <span className={`ad-pill ad-pill-${info.tone}`}><i aria-hidden="true" />{info.label}</span>;
}

/** دائرةٌ بحرف الشركة الأول ولونٍ ثابتٌ من اسمها: هويةٌ بصرية بلا شعارٍ مرفوع. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const letter = [...name.trim()][0] || "؟";
  return <span className="ad-avatar" style={{ inlineSize: size, blockSize: size, fontSize: size * 0.44, background: `linear-gradient(135deg,hsl(${h} 58% 38%),hsl(${(h + 40) % 360} 62% 52%))` }} aria-hidden="true">{letter}</span>;
}

/** رسمٌ مصغّر لآخر الأيام: خطٌّ ومساحة، بلا محاور. */
export function Sparkline({ values, width = 96, height = 30, label }: { values: number[]; width?: number; height?: number; label: string }) {
  if (values.length < 2 || Math.max(...values) === 0) return <span className="ad-spark-empty" aria-label={label}>—</span>;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const step = width / (values.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / Math.max(1, max - min)) * (height - 6);
  // اتجاه RTL: أحدث الأيام على اليسار
  const pts = values.map((v, i) => [width - i * step, y(v)] as const).reverse();
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  return (
    <svg className="ad-spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      <path d={`${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`} fill="currentColor" opacity=".12" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill="currentColor" />
    </svg>
  );
}

/** أيامٌ مرّت من عمر الحملة ÷ مدتها، لشريط التقدّم. */
export function progressOf(c: Pick<Campaign, "startDay" | "endDay">, today: string): number {
  const total = (Date.parse(`${c.endDay}T00:00:00Z`) - Date.parse(`${c.startDay}T00:00:00Z`)) / 86_400_000 + 1;
  const done = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.startDay}T00:00:00Z`)) / 86_400_000 + 1;
  return Math.max(0, Math.min(100, (done / Math.max(1, total)) * 100));
}
