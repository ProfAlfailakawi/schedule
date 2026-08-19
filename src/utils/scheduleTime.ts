/**
 * The single teaching-day contract shared by browser and server.
 * A view, suggestion and saved appointment must never disagree about it.
 */
export const SCHEDULE_DAY_START = 8 * 60;
export const SCHEDULE_DAY_END = 20 * 60;
export const SCHEDULE_DAY_SPAN = SCHEDULE_DAY_END - SCHEDULE_DAY_START;
export const SCHEDULE_SLOT_MINUTES = 30;

export const SCHEDULE_DAY_START_TIME = "08:00";
export const SCHEDULE_DAY_END_TIME = "20:00";

export function withinScheduleDay(start: number, end: number): boolean {
  return Number.isFinite(start) && Number.isFinite(end) &&
    start >= SCHEDULE_DAY_START && end <= SCHEDULE_DAY_END && end > start;
}


export function scheduleClockForDisplay(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  const hour = match[1].padStart(2, "0");
  const minute = match[2];
  // The stored value remains HH:MM for sorting, validation and APIs.
  // Only the visible Arabic clock is written in reading order: MM:HH.
  return `${minute}:${hour}`;
}

/**
 * Institutional time ranges are read right-to-left as end → start.
 * Keep that convention identical everywhere the schedule is displayed.
 */
export function formatScheduleTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const from = scheduleClockForDisplay(start);
  const to = scheduleClockForDisplay(end);
  if (from === "—" && to === "—") return "—";
  if (to === "—") return from;
  if (from === "—") return to;
  /*
   * A Latin time range embedded inside Arabic prose needs its own bidi island.
   * Without it, the browser may visually reorder the two clocks even though the
   * source string is already end → start. LRI/PDI keep the institutional RTL
   * convention visually stable everywhere, including plain text notices and
   * aria labels, while remaining invisible to the reader.
   */
  return `⁦${to} - ${from}⁩`;
}
