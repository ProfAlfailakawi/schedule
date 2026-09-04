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
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return raw;
  const hour = match[1].padStart(2, "0");
  const minute = match[2];
  // Time is stored and displayed in the same unambiguous 24-hour HH:MM order.
  // Arabic layout direction must never swap the hour and minute components.
  return `${hour}:${minute}`;
}

/**
 * Render the university-facing range in its approved visual order: END - START.
 * Internal data always remains start/end in chronological order; only the
 * presentation contract is reversed. The isolate prevents RTL bidi reordering.
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
  return `⁦${to} - ${from}⁩`;
}

/**
 * ── صيغة واحدة للوقت المخزَّن ───────────────────────────────────────────────
 *
 * "HH:MM", zero-padded, or "" when the value is not a clock at all. A typed
 * form already sends this shape; a spreadsheet sends whatever the sheet holds,
 * and the write path used to store it verbatim. One "9:00" was enough to make
 * every string comparison downstream answer wrongly, so the shape is settled
 * where rows enter rather than trusted at every place that reads them.
 */
export function normalizeClock(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return raw;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return raw;
  /* The minute field was taken verbatim: only the hour was ever range-checked.
     So "10:76" normalised to itself, and every reader downstream turned it into
     676 minutes — a quiet shift to 11:16 rather than a rejection. A typed form
     uses a picker and cannot produce it; a spreadsheet or an OCR'd page can.
     An impossible minute is not a clock, so it is left unrecognised — the same
     answer this function already gives to any other non-clock text — and
     `isValidClock` is what refuses the row before it is stored. */
  const minute = Number(match[2]);
  if (!Number.isFinite(minute) || minute > 59) return raw;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

/**
 * Is this a clock the timetable can actually mean?
 *
 * `timeToMinutes` is deliberately forgiving — it answers with a number for
 * anything — which is right for arithmetic and wrong for admission. This is the
 * admission test: the value must already be the settled "HH:MM" shape, which is
 * true only when `normalizeClock` recognised it. Impossible hours and minutes
 * fail here, once, instead of being re-derived at each validator.
 */
export function isValidClock(value: unknown): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalizeClock(value));
}

/**
 * Do two clock ranges share a minute?
 *
 * The one arithmetic answer, so nothing has to compare "9:00" and "10:00" as
 * words — where the first sorts after the second and two overlapping lectures
 * read as not overlapping. `findConflicts` has always compared minutes; the
 * hall-barter reservation, the room-freedom check and the swap-safety test
 * compared strings, and the two disagreed without saying so.
 */
export function clockRangesOverlap(aStart: unknown, aEnd: unknown, bStart: unknown, bEnd: unknown): boolean {
  const toMinutes = (value: unknown) => {
    const [hour, minute] = String(value ?? "").split(":").map(Number);
    return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
  };
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(aEnd) > toMinutes(bStart);
}


/** Arabic UI duration token. Keeps each number attached to its unit so RTL
 * layout can never split/reorder `10س 7د` into a corrupt visual sequence. */
export function formatCompactDurationArabic(minutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const nf = new Intl.NumberFormat("ar-KW-u-nu-latn", { maximumFractionDigits: 0 });
  const parts: string[] = [];
  if (hours) parts.push(`${nf.format(hours)}س`);
  if (mins || !hours) parts.push(`${nf.format(mins)}د`);
  return `⁧${parts.join(" ")}⁩`;
}

/** Standalone metric label for minutes: the number FIRST, then its unit —
 * «76 دقيقة». The logical order is what an RTL reader meets first, so putting
 * the unit first made every metric read «دقيقة 76». The isolate keeps the
 * Latin digits from tangling with whatever punctuation follows. */
export function formatMinuteMetricArabic(minutes: number | null | undefined): string {
  const value = new Intl.NumberFormat("ar-KW-u-nu-latn", { maximumFractionDigits: 1 }).format(Number(minutes) || 0);
  return `⁧${value}⁩ دقيقة`;
}


/** Generic numeric metric: the number FIRST, then its unit — «3 ساعات».
 * Use for compact value/unit UI, not grammatical prose. */
export function formatUnitMetricArabic(
  value: number | string | null | undefined,
  unit: string,
  maximumFractionDigits = 1,
): string {
  const raw = typeof value === "number"
    ? new Intl.NumberFormat("ar-KW-u-nu-latn", { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0)
    : String(value ?? "0").trim();
  return `⁧${raw || "0"}⁩ ${unit}`;
}
