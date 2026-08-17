/**
 * The week's visual arithmetic, extracted where tests can reach it.
 *
 * Everything here is pure: colour assignment, the clustering that decides
 * when crushed lanes become a woven hour, the taught-minutes share behind
 * the day-load meters, and the "running now / next" pick for the agenda.
 * The component supplies rows and the clock; nothing here touches state.
 */
import {
  scheduleDays as days,
  scheduleMinutes as mins,
  type DayKey,
} from "../components/scheduleWorkspace";

/* Ten hues tuned to stay harmonious in both themes. Red is never assigned —
   it belongs to conflicts alone. */
export const COURSE_HUES = [158, 200, 262, 320, 38, 96, 178, 226, 288, 18];

/**
 * FNV-1a over code AND name. A multiply-by-31 over the code alone turned one
 * department's short numeric codes — 112, 113, 491 — into a single violet
 * family and the grid went monochrome. Mixing every byte and folding the
 * course's own name in spreads neighbours across the wheel, and the same
 * input always lands on the same hue, which is the whole point of colour
 * as identity.
 */
export const courseHue = (code: string, name = "") => {
  const text = `${String(code || "")}·${String(name || "")}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return COURSE_HUES[(hash >>> 0) % COURSE_HUES.length];
};

/* The two teaching rhythms this university actually runs: Sunday-Tuesday-
   Thursday, and Monday-Wednesday. A lecture lives in one or the other. */
export const DAY_PATTERN_135: DayKey[] = ["fsunday", "ftuesday", "fthursday"];
export const DAY_PATTERN_24: DayKey[] = ["fmonday", "fwednesday"];

/**
 * The standard pattern that contains a given day.
 *
 * Dropping a Sunday-Tuesday-Thursday lecture on a Monday column is not a
 * request to teach it four days a week — it is a request to move it to the
 * other rhythm. This answers which rhythm the target day belongs to, and the
 * caller asks the human before committing the switch.
 */
export function patternForDay(day: DayKey): DayKey[] {
  return (DAY_PATTERN_24 as string[]).includes(day) ? DAY_PATTERN_24 : DAY_PATTERN_135;
}

/**
 * A person's name, cut to what a small card can afford: the honorific if one
 * leads, then the first and last names only. "د. عبدالرحمن ربل سليمان الشراد"
 * reads as "د. عبدالرحمن الشراد" — still unmistakably him, half the width.
 */
export function firstLast(name: string): string {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.join(" ");
  const HONORIFICS = new Set(["د", "أ", "م", "أد", "الدكتور", "الدكتورة", "الأستاذ", "الأستاذة", "المهندس"]);
  const lead = words[0].replace(/[.٫]/g, "");
  const honorific = HONORIFICS.has(lead) ? words.shift()! : "";
  if (words.length <= 2) return [honorific, ...words].filter(Boolean).join(" ");
  // «عبد الرحمن» and «عبد العزيز» are one given name in Arabic; dropping the
  // second word turns the person into somebody else. Keep the compound before
  // adding the family name.
  const given = words[0] === "عبد" && words.length >= 3 ? `${words[0]} ${words[1]}` : words[0];
  return [honorific, given, words[words.length - 1]].filter(Boolean).join(" ");
}

/**
 * The real peak: how many of these lectures actually run at the same moment.
 *
 * A cluster of nine spread across a morning and a cluster of nine all at ten
 * o'clock both say "9" — but only one of them is a wall. Classic sweep: +1 at
 * every start, −1 at every end, the answer is the highest the counter gets.
 */
export function peakConcurrency(spans: Array<{ start: number; end: number }>): number {
  const events: Array<[number, number]> = [];
  spans.forEach(span => {
    if (!Number.isFinite(span.start) || !Number.isFinite(span.end) || span.end <= span.start) return;
    events.push([span.start, 1], [span.end, -1]);
  });
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0, peak = 0;
  for (const [, delta] of events) { now += delta; if (now > peak) peak = now; }
  return peak;
}

/**
 * The visual width one day needs before its lecture cards stop being cards.
 *
 * The compact V4 experiment proved that 84px of painted width is too little
 * for Arabic course + instructor + catalogue number: the whole week fitted,
 * but the information did not.  The compromise is a hard reading floor rather
 * than a percentage scale.  Every concurrent lane receives 112px of paper;
 * laneStyle spends only 2px on separation, leaving a 110px painted card.
 * Quiet one-lane days stay compact so the extra paper goes only to the days
 * that actually need it.
 */
export function readableWeekDayWidth(peak: number): number {
  const concurrency = Math.max(1, Math.floor(Number.isFinite(peak) ? peak : 1));
  if (concurrency === 1) return 164;
  return concurrency * 112;
}


/**
 * The hour width used by the dense-week strip view.
 *
 * In the transposed view concurrency consumes vertical paper, not horizontal
 * paper, so the horizontal scale can finally mean time again. The scale is
 * chosen from the shortest real appointment on screen: a normal 50-minute
 * lecture lands around 150px, while a 30-minute appointment can widen the
 * ruler enough to keep course / instructor / code readable. The upper clamp
 * prevents one pathological tiny appointment from turning the week into an
 * endless canvas.
 */
export function readableWeekStripHourWidth(minDurationMinutes: number): number {
  const duration = Number.isFinite(minDurationMinutes) && minDurationMinutes > 0
    ? minDurationMinutes
    : 50;
  // Adaptive Identity now carries the readability burden: normal cards stay on
  // one line when they can, and compact ones become two-line nameplates. That
  // lets the time ruler tighten once more without shrinking the typography.
  return Math.round(Math.min(174, Math.max(118, (78 * 60) / duration)));
}

/**
 * Decide when the classic five-column week has stopped being the right
 * projection of the data.
 *
 * This is a data breakpoint, not a device breakpoint. Once the five day
 * columns together need roughly a desktop-and-a-half of paper, or one moment
 * reaches extreme concurrency, continuing to widen the same projection only
 * creates a panorama. The dense projection turns the week ninety degrees:
 * time runs horizontally and concurrency grows vertically.
 */
export function shouldUseWeekStrips(
  peaks: Array<{ peak: number }>,
  classicWidth: number,
): boolean {
  const clean = peaks.map(item => Math.max(1, Math.floor(Number.isFinite(item.peak) ? item.peak : 1)));
  const maxPeak = clean.length ? Math.max(...clean) : 1;
  const pressure = clean.reduce((sum, peak) => sum + Math.max(0, peak - 3), 0);
  return classicWidth >= 1700 || maxPeak >= 8 || pressure >= 9;
}

export interface WeekDensityPlanDay {
  key: DayKey;
  peak: number;
  width: number;
  mode: "cards" | "summary";
  /** Concurrency at which a local time block folds into one density summary. */
  bundleThreshold: number;
}

/**
 * Allocate literal horizontal paper to the week.
 *
 * The overview never substitutes a cluster, summary or micro-card for a real
 * lecture.  Every day receives enough width for its true peak concurrency at
 * the readable lane floor above.  On a dense dataset the canvas therefore
 * becomes wider and is navigated horizontally; the information itself remains
 * unchanged and every card keeps its course, instructor and catalogue number.
 *
 * `budget` and `summaryWidth` remain accepted for source compatibility with
 * older callers, but they deliberately do not collapse information anymore.
 */
export function buildWeekDensityPlan(
  peaks: Array<{ key: DayKey; peak: number }>,
  options: { budget?: number; gutter?: number; summaryWidth?: number } = {},
): { days: WeekDensityPlanDay[]; totalWidth: number } {
  const gutter = options.gutter ?? 54;
  const planned: WeekDensityPlanDay[] = peaks.map(({ key, peak }) => {
    const cleanPeak = Math.max(1, Math.floor(Number.isFinite(peak) ? peak : 1));
    return {
      key,
      peak: cleanPeak,
      width: readableWeekDayWidth(cleanPeak),
      mode: "cards",
      bundleThreshold: Number.MAX_SAFE_INTEGER,
    };
  });
  return {
    days: planned,
    totalWidth: gutter + planned.reduce((sum, day) => sum + day.width, 0),
  };
}

export interface SqueezedCandidate {
  id: number;
  top: number;
  height: number;
  lanes: number;
  span: number;
}
export interface SqueezedCluster {
  ids: number[];
  top: number;
  bottom: number;
}

/**
 * Which crushed cards belong to one woven hour.
 *
 * Membership is per-card, not per-chain: a card qualifies when it reaches the
 * caller's lane threshold AND holds two lanes or fewer itself, so the solitary
 * lecture at a long chain's tail — which spans its lanes in full — stays an
 * ordinary readable card. Qualifiers are then clustered by vertical overlap,
 * and only a cluster with five or more members becomes a bundle.
 */
export function clusterSqueezed(
  candidates: SqueezedCandidate[],
  minLanes = 5,
): SqueezedCluster[] {
  const squeezed = candidates
    .filter(item => item.lanes >= minLanes && item.span <= 2)
    .slice()
    .sort((a, b) => a.top - b.top);
  const clusters: SqueezedCandidate[][] = [];
  let cluster: SqueezedCandidate[] = [];
  let clusterBottom = -1;
  for (const item of squeezed) {
    if (cluster.length && item.top < clusterBottom) {
      cluster.push(item);
      clusterBottom = Math.max(clusterBottom, item.top + item.height);
    } else {
      if (cluster.length) clusters.push(cluster);
      cluster = [item];
      clusterBottom = item.top + item.height;
    }
  }
  if (cluster.length) clusters.push(cluster);
  return clusters
    .filter(group => group.length >= minLanes)
    .map(group => ({
      ids: group.map(item => item.id),
      top: Math.min(...group.map(item => item.top)),
      bottom: Math.max(...group.map(item => item.top + item.height)),
    }));
}

/**
 * Taught minutes per day, as a share of the heaviest day.
 *
 * A count answers "how many" and stops there — six lectures spread across a
 * morning and six stacked into ninety minutes are the same number and not
 * remotely the same day. Minutes say which is which.
 */
export function dayLoad(rows: Array<Record<string, unknown>>) {
  const minutesByDay: Record<string, number> = {};
  days.forEach(day => { minutesByDay[day.key] = 0; });
  rows.forEach(row => {
    const span = mins(String(row.fendtime || "")) - mins(String(row.fstarttime || ""));
    if (!Number.isFinite(span) || span <= 0) return;
    days.forEach(day => { if (row[day.key]) minutesByDay[day.key] += span; });
  });
  const heaviest = Math.max(1, ...days.map(day => minutesByDay[day.key]));
  const share: Record<string, number> = {};
  days.forEach(day => { share[day.key] = Math.round((minutesByDay[day.key] / heaviest) * 100); });
  return { minutesByDay, share };
}

/**
 * The two appointments the hour cares about: the set under way, and the one
 * next to start. Start is inclusive, end exclusive — a lecture is "running"
 * at its first minute and not at its last. On a weekend both answers are
 * empty, which is how the marks take Friday off.
 */
export function pickLive(
  rows: Array<Record<string, unknown> & { id: number }>,
  todayKey: DayKey | null,
  nowMinutes: number,
) {
  const running = new Set<number>();
  if (!todayKey) return { running, next: null as number | null };
  let next: { id: number; start: number } | null = null;
  rows.forEach(row => {
    if (!row[todayKey]) return;
    const start = mins(String(row.fstarttime || ""));
    const end = mins(String(row.fendtime || ""));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    if (nowMinutes >= start && nowMinutes < end) { running.add(row.id); return; }
    if (start > nowMinutes && (!next || start < next.start)) next = { id: row.id, start };
  });
  return { running, next: next ? (next as { id: number }).id : null };
}
