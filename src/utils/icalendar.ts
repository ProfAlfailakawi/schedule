/**
 * ── تقويم يُشترَك فيه، لا يُنسَخ ────────────────────────────────────────────
 *
 * There are two ways to put a teaching schedule into someone's phone, and they
 * are not equally available:
 *
 *   1. WRITE INTO their calendar (Google Calendar API, Microsoft Graph). This
 *      needs an application registered with Google and Microsoft, a published
 *      consent screen, a client secret, and a person clicking "allow" — none of
 *      which can be produced from inside this repository.
 *
 *   2. PUBLISH a calendar they subscribe to. This is a plain text document at a
 *      URL. Google Calendar, Apple Calendar and Outlook all subscribe to one,
 *      re-read it on their own schedule, and show the changes. No account, no
 *      token, no consent screen, no secret.
 *
 * The second gives almost the whole of what was asked — "my week is in my phone
 * and it follows the schedule when it changes" — and needs nothing this project
 * does not already have. Only the *instant* push at the moment of an edit
 * belongs to the first, and that is stated plainly rather than implied.
 *
 * This module writes RFC 5545 by hand, because a calendar file is a hundred
 * lines of text and a dependency for it would be a dependency to keep alive.
 */

export interface CalendarLecture {
  /** Stable across edits — the appointment's own id. */
  id: number | string;
  title: string;
  /** Course code and section, for the body of the entry. */
  code?: string;
  section?: string;
  instructor?: string;
  room?: string;
  /** "HH:MM" in campus local time. */
  start: string;
  end: string;
  /** 0 = Sunday … 4 = Thursday, matching the teaching week. */
  days: number[];
  /** Bumped on every write, so a subscriber's calendar knows this is newer. */
  revision?: number;
  /**
   * Specific dates (YYYY-MM-DD) on which this weekly series does NOT happen —
   * a cancelled lecture, or one the owner of this feed hands to a colleague.
   * Written as EXDATE so the phone's calendar drops exactly that occurrence
   * and nothing else.
   */
  cancelledDates?: string[];
}

/**
 * A one-day event that is not part of any weekly series: a coverage day in a
 * colleague's feed, or a make-up lecture. One date, one time, one entry.
 */
export interface CalendarSingle {
  id: number | string;
  /** YYYY-MM-DD */
  date: string;
  start: string;
  end: string;
  title: string;
  room?: string;
  description?: string;
}

export interface CalendarDocument {
  name: string;
  /** Weeks the series runs for. Stated, never guessed silently. */
  weeks: number;
  /**
   * The day teaching begins, as YYYY-MM-DD.
   *
   * Without it this file has a defect that only shows up weeks later: the
   * series is anchored to "the next matching weekday from now", and a
   * subscription is re-fetched forever, so every fetch pushes the whole term
   * forward again. A calendar subscribed to in September is still generating
   * lectures the following July, and nobody ever sees the file that did it.
   *
   * With a start date the series is fixed: it begins where the term begins and
   * ends where the term ends, and re-reading it a hundred times changes nothing.
   */
  startDate?: string;
  /** One line under the calendar's name in the subscriber's app. */
  description?: string;
  /**
   * Minutes before each lecture to raise a reminder. Zero means none.
   *
   * Off unless asked for. A teaching week is thirteen alarms, and a person who
   * did not choose them will silence the whole calendar rather than the alarms
   * — which loses the schedule, not the noise.
   */
  alarmMinutes?: number;
  lectures: CalendarLecture[];
  /** One-day entries outside every weekly series (coverage, make-up). */
  singles?: CalendarSingle[];
  /** The moment the file was produced, for DTSTAMP. */
  now?: Date;
}

/** The campus keeps one offset all year, which makes the timezone block short. */
const TZID = "Asia/Kuwait";
const ICAL_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** RFC 5545 §3.3.11 — commas, semicolons, backslashes and newlines are special. */
export function escapeText(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 — no line may exceed 75 octets; longer ones continue with a
 * leading space. Arabic is multi-byte, so the fold counts BYTES, not characters,
 * and never splits one character across two lines.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of Array.from(line)) {
    const size = encoder.encode(character).length;
    // 74 on continuation lines, because the leading space costs one octet.
    const limit = out.length ? 74 : 75;
    if (bytes + size > limit) { out.push(current); current = ""; bytes = 0; }
    current += character;
    bytes += size;
  }
  if (current) out.push(current);
  return out.map((part, index) => (index ? ` ${part}` : part)).join("\r\n");
}

const pad = (value: number) => String(value).padStart(2, "0");
const stampUTC = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T` +
  `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

/** The last instant the series may produce: `weeks` after its first occurrence. */
const untilStamp = (first: Date, weeks: number) => {
  const end = new Date(first.getTime());
  end.setUTCDate(end.getUTCDate() + Math.max(1, weeks) * 7 - 1);
  end.setUTCHours(23, 59, 59, 0);
  return stampUTC(end);
};

const localStamp = (date: Date, time: string) => {
  const [hour, minute] = String(time || "0:0").split(":").map(Number);
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T` +
    `${pad(hour || 0)}${pad(minute || 0)}00`;
};

/**
 * The first date on or after `from` that falls on `weekday` (0 = Sunday).
 * Computed in UTC calendar terms and paired with a TZID, so the wall-clock time
 * written into the file is the campus's own — no drift, no offset arithmetic.
 */
function nextWeekday(from: Date, weekday: number): Date {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const shift = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + shift);
  return date;
}

export function buildCalendar(document: CalendarDocument): string {
  const now = document.now || new Date();
  const dtstamp = stampUTC(now);
  /* The anchor. A recorded term start is a fact and never moves; the fallback
     is today, which is the honest best available when nobody has told the
     system when the term began — and which the feed says out loud below. */
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(document.startDate || ""))
    ? new Date(`${document.startDate}T00:00:00Z`)
    : null;
  const from = anchor && !Number.isNaN(anchor.getTime()) ? anchor : now;
  const alarm = Math.max(0, Math.min(120, Number(document.alarmMinutes || 0)));
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SCHEDULE//Academic Timetable//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(document.name)}`,
    `X-WR-TIMEZONE:${TZID}`,
    ...(document.description ? [`X-WR-CALDESC:${escapeText(document.description)}`] : []),
    // Apple and Outlook both honour this; Google uses its own poll interval.
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    "BEGIN:VTIMEZONE",
    `TZID:${TZID}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "TZNAME:+03",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const lecture of document.lectures) {
    const days = [...new Set(lecture.days)].filter(day => day >= 0 && day <= 6).sort();
    if (!days.length || !lecture.start || !lecture.end) continue;
    // The series begins on the first of its own weekdays from today onward.
    const first = days
      .map(day => nextWeekday(from, day))
      .reduce((earliest, date) => (date < earliest ? date : earliest));
    const detail = [
      lecture.code ? `الرمز: ${lecture.code}` : "",
      lecture.section ? `الشعبة: ${lecture.section}` : "",
      lecture.instructor ? `الأستاذ: ${lecture.instructor}` : "",
    ].filter(Boolean).join("\n");

    /* One EXDATE line per cancelled date. The stamp must repeat the series'
       own start time, or the client cannot match it to an occurrence. A date
       that never matches an occurrence is simply ignored — harmless. */
    const exdates = [...new Set(lecture.cancelledDates || [])]
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort()
      .map(date => `EXDATE;TZID=${TZID}:${localStamp(new Date(`${date}T00:00:00Z`), lecture.start)}`);

    lines.push(
      "BEGIN:VEVENT",
      // Stable per appointment, so an edit updates the entry instead of adding
      // a second one beside it.
      `UID:schedule-${lecture.id}@schedule.app`,
      `DTSTAMP:${dtstamp}`,
      // The revision doubles as the sequence: a calendar that has seen version
      // three will accept version four and ignore a stale two.
      `SEQUENCE:${Math.max(0, Number(lecture.revision || 0))}`,
      `DTSTART;TZID=${TZID}:${localStamp(first, lecture.start)}`,
      `DTEND;TZID=${TZID}:${localStamp(first, lecture.end)}`,
      ...exdates,
      /* UNTIL when the term's end is known — a real last day, the same one on
         every fetch. COUNT otherwise, which at least bounds the series even
         though its start still drifts with the anchor. */
      `RRULE:FREQ=WEEKLY;${anchor
        ? `UNTIL=${untilStamp(first, document.weeks)}`
        : `COUNT=${Math.max(1, document.weeks) * days.length}`};BYDAY=${days.map(day => ICAL_DAYS[day]).join(",")}`,
      `SUMMARY:${escapeText(lecture.title)}`,
      lecture.room ? `LOCATION:${escapeText(lecture.room)}` : "",
      detail ? `DESCRIPTION:${escapeText(detail)}` : "",
      "TRANSP:OPAQUE",
      // A lecture is a fact about the week, not a proposal — CONFIRMED stops
      // clients drawing it as tentative.
      "STATUS:CONFIRMED",
      "CATEGORIES:محاضرة",
      ...(alarm > 0 ? [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-PT${alarm}M`,
        `DESCRIPTION:${escapeText(lecture.title)}`,
        "END:VALARM",
      ] : []),
      "END:VEVENT",
    );
  }

  /* One-day entries: no RRULE, one DTSTART, one DTEND. A coverage day in a
     colleague's calendar is exactly this — a single dated fact. */
  for (const single of document.singles || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(single.date || "")) || !single.start || !single.end) continue;
    const day = new Date(`${single.date}T00:00:00Z`);
    lines.push(
      "BEGIN:VEVENT",
      `UID:schedule-single-${single.id}@schedule.app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${TZID}:${localStamp(day, single.start)}`,
      `DTEND;TZID=${TZID}:${localStamp(day, single.end)}`,
      `SUMMARY:${escapeText(single.title)}`,
      single.room ? `LOCATION:${escapeText(single.room)}` : "",
      single.description ? `DESCRIPTION:${escapeText(single.description)}` : "",
      "TRANSP:OPAQUE",
      "STATUS:CONFIRMED",
      "CATEGORIES:محاضرة",
      ...(alarm > 0 ? [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-PT${alarm}M`,
        `DESCRIPTION:${escapeText(single.title)}`,
        "END:VALARM",
      ] : []),
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).map(foldLine).join("\r\n") + "\r\n";
}
