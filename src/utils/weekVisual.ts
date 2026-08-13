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
 * Membership is per-card, not per-chain: a card qualifies when it sits in
 * five-plus lanes AND holds two lanes or fewer itself, so the solitary
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
