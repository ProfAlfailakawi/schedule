/**
 * The name a timetable can actually carry.
 *
 * A column in a week grid is sixty pixels wide and a course is called
 * "مقدمة في تكنولوجيا التعليم". Letting the browser solve that produces
 * "مقدمة في تكنولوج|يا التعليم" — a word cut in half, which in Arabic is not a
 * truncation but a spelling mistake. And an ellipsis after "مقدمة في…" is worse
 * than useless: it spends the whole card on the two words that identify nothing,
 * because every third course in a department begins with them.
 *
 * So the shortening is editorial rather than mechanical. It removes what a
 * person would remove when writing the same timetable on a whiteboard: the
 * academic opener, then the generic qualifier at the end, and never anything in
 * the middle of a word. What survives is the part that distinguishes this course
 * from the one beside it. The full name is always one hover away.
 */

/** Openers that classify a course rather than name it. */
const OPENERS = [
  "مقدمة في", "مقدمه في", "مدخل إلى", "مدخل الى", "مدخل في",
  "أساسيات", "اساسيات", "مبادئ", "مباديء", "أسس", "اسس",
  "موضوعات في", "موضوعات فى", "دراسات في", "قضايا في",
  "تمهيدي في", "عام في", "منهجية", "المدخل إلى", "المدخل الى",
];

/** Qualifiers that repeat across a whole department's catalogue. */
const TRAILING = [
  "التعليمية", "التعليمي", "التربوية", "التربوي",
  "التطبيقية", "التطبيقي", "العملية", "العملي",
  "النظرية", "النظري", "المتقدمة", "المتقدم",
  "الأساسية", "الاساسية", "الحديثة", "المعاصرة",
];

const tidy = (value: string) => String(value || "").replace(/\s+/g, " ").trim();

/** Arabic differs in ways that should never defeat a prefix match. */
const fold = (value: string) =>
  value.replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

function dropOpener(name: string): string {
  const folded = fold(name);
  for (const opener of OPENERS) {
    const probe = fold(opener);
    if (folded.startsWith(probe + " ")) {
      const rest = tidy(name.slice(opener.length));
      // Never shorten into something too thin to identify a course.
      if (rest.split(" ").length >= 2 || rest.length >= 6) return rest;
    }
  }
  return name;
}

function dropTrailing(name: string): string {
  const words = name.split(" ");
  if (words.length < 3) return name;
  const last = fold(words[words.length - 1]);
  if (TRAILING.some(word => fold(word) === last)) return words.slice(0, -1).join(" ");
  return name;
}

export interface CourseLabel {
  /** What the card prints. */
  text: string;
  /** True when something was removed, so the card can say so quietly. */
  shortened: boolean;
}

/**
 * `room` is how much width the card actually has, as a share of its column.
 * A card with the column to itself prints the name as written.
 */
export function courseLabel(name: string, room = 1): CourseLabel {
  const full = tidy(name);
  if (!full) return { text: "", shortened: false };
  if (room >= 0.85 && full.length <= 26) return { text: full, shortened: false };

  let text = dropOpener(full);
  if (room <= 0.5 || text.length > 30) text = dropTrailing(text);
  return { text, shortened: text !== full };
}

/**
 * The initials of a course, for the places that have no room for words at all —
 * a rail turned on its side, a dense print cell, a legend swatch.
 */
export function courseInitials(name: string): string {
  const words = tidy(dropOpener(tidy(name)))
    .split(" ")
    .filter(word => word.length > 2 && !/^(في|إلى|الى|على|من|عن|مع|و|أو|او|بين|ال)$/.test(word));
  return words.slice(0, 3).map(word => word.replace(/^ال/, "").charAt(0)).join("‌");
}

/**
 * How a colleague is named on a timetable.
 *
 * Nobody writes "د. عبدالعزيز مبارك العنزي" in a sixty-pixel column, and nobody
 * needs to: within a department the family name and the title identify a person
 * completely, and that is exactly how they are referred to in the corridor. The
 * given name stays available on hover, where there is room for it.
 */
const TITLES = ["أ.د.", "ا.د.", "أ.د", "ا.د", "د.", "أ.", "ا.", "م.", "prof.", "dr."];

export function instructorLabel(name: string, room = 1): string {
  const full = tidy(name);
  if (!full) return "";
  if (room >= 0.85 && full.length <= 20) return full;

  let title = "";
  let rest = full;
  for (const candidate of TITLES) {
    if (rest.toLowerCase().startsWith(candidate)) {
      title = rest.slice(0, candidate.length);
      rest = tidy(rest.slice(candidate.length));
      break;
    }
  }
  const words = rest.split(" ").filter(Boolean);
  if (words.length < 2) return full;
  // The family name is the last word unless it is a lone particle.
  const family = words[words.length - 1];
  const surname = /^(بن|بنت|آل|ال)$/.test(family) && words.length > 2
    ? `${family} ${words[words.length - 1]}`
    : family;
  return tidy(`${title} ${surname}`);
}
