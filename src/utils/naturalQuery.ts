/**
 * Deterministic Arabic query parsing for the command palette.
 *
 * Coordinators ask the same handful of questions in the same handful of ways:
 * "قاعات فاضية الثلاثاء ١٠", "جدول د. أحمد", "فراغات نورة الأحد", "ب-101 الاثنين".
 * Those are answerable exactly from the schedule itself, so the parser is a set
 * of explicit rules rather than a model — same input always gives the same
 * answer, offline, with no data leaving the server.
 */

export type NaturalIntent = "freeRooms" | "instructor" | "gaps" | "room" | "time" | "unknown";

export interface NaturalQuery {
  intent: NaturalIntent;
  /** 0 = الأحد … 4 = الخميس */
  day: number | null;
  /** "HH:MM", 24h */
  time: string | null;
  name: string | null;
  room: string | null;
  raw: string;
}

// JavaScript word boundaries do not apply to Arabic letters, so these patterns
// match the word itself rather than relying on \b.
const DAY_WORDS: Array<[RegExp, number]> = [
  [/(?:ال)?[أا]حد/, 0],
  [/(?:ال)?[إا]ثنين/, 1],
  [/(?:ال)?ثلاثاء/, 2],
  [/(?:ال)?[أا]ربعاء/, 3],
  [/(?:ال)?خميس/, 4]
];

const FREE_ROOM_WORDS = /(قاع[ةه]|قاعات|غرف[ةه]|غرف)\s*(فاضي|فاضيه|فاضية|فارغ|فارغه|فارغة|متاح|متاحه|متاحة|شاغر|شاغره|شاغرة)|(فاضي|فارغ|متاح|شاغر)\w*\s*(قاع|غرف)/;
const GAP_WORDS = /(فراغ|فراغات|فجو[ةه]|فجوات|وقت\s*فاضي)/;
const SCHEDULE_WORDS = /(جدول|مواعيد|محاضرات|حص[ةص]|نصاب)/;
const ROOM_CODE = /([؀-ۿ]{1,3}|[A-Za-z]{1,3})\s*[-‑–]\s*(\d{1,4})/;

/** Arabic-Indic and Persian digits behave like ASCII digits everywhere here. */
export function toEnglishDigits(value: string): string {
  return String(value || "")
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function readTime(text: string): string | null {
  const explicit = text.match(/\b(\d{1,2})\s*:\s*(\d{2})\b/);
  if (explicit) {
    const hour = Math.min(23, Number(explicit[1]));
    return `${String(hour).padStart(2, "0")}:${explicit[2]}`;
  }
  // "الساعة 10", "10 الصبح", or a bare hour in a sentence that asks about time.
  const bare = text.match(/(?:الساع[ةه]\s*)?\b(\d{1,2})\b\s*(ص|صباح\w*|م|مساء\w*|عصر\w*)?/);
  if (!bare) return null;
  let hour = Number(bare[1]);
  if (hour < 1 || hour > 23) return null;
  const marker = bare[2] || "";
  // Campus days run 07:00–21:00, so a bare 1–6 means the afternoon.
  if (/^م|مساء|عصر/.test(marker) && hour < 12) hour += 12;
  else if (!marker && hour >= 1 && hour <= 6) hour += 12;
  return `${String(hour).padStart(2, "0")}:00`;
}

function readName(text: string): string | null {
  const cleaned = text
    .replace(/(جدول|مواعيد|محاضرات|فراغات|فراغ|فجوات|نصاب|حصص|عند|لـ|ل)\s*/g, " ")
    .replace(/\b(الدكتور|الدكتوره|الدكتورة|دكتور|أستاذ|استاذ|الأستاذ|الاستاذ|د|أ|ا|م)\s*\.?\s*/g, " ")
    .replace(/[0-9:]+/g, " ");
  for (const [pattern] of DAY_WORDS) cleaned.replace(pattern, " ");
  const words = cleaned
    .replace(/(?:ال)?[أا]حد|(?:ال)?[إا]ثنين|(?:ال)?ثلاثاء|(?:ال)?[أا]ربعاء|(?:ال)?خميس/g, " ")
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length > 1 && /[؀-ۿ]/.test(word));
  return words.length ? words.join(" ") : null;
}

export function parseNaturalQuery(input: string): NaturalQuery {
  const raw = String(input || "").trim();
  const text = toEnglishDigits(raw).replace(/[ً-ْـ]/g, "").toLowerCase();

  let day: number | null = null;
  for (const [pattern, index] of DAY_WORDS) {
    if (pattern.test(text)) { day = index; break; }
  }

  const roomMatch = text.match(ROOM_CODE);
  const room = roomMatch ? `${roomMatch[1]}-${roomMatch[2]}` : null;
  const time = readTime(text);

  if (FREE_ROOM_WORDS.test(text)) return { intent: "freeRooms", day, time, name: null, room, raw };
  if (GAP_WORDS.test(text)) return { intent: "gaps", day, time, name: readName(text), room, raw };
  if (room) return { intent: "room", day, time, name: null, room, raw };
  if (SCHEDULE_WORDS.test(text)) return { intent: "instructor", day, time, name: readName(text), room, raw };
  if (time || day !== null) return { intent: "time", day, time, name: readName(text), room, raw };
  return { intent: "unknown", day, time, name: readName(text), room, raw };
}

export const DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
export const DAY_FLAGS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
