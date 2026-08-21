/**
 * Arabic-aware ordering.
 *
 * `Intl.Collator("ar")` already handles the alphabet, but Arabic names in this
 * data set carry academic titles ("د.", "أ.د.", "م.") and inconsistent hamza and
 * alef forms. Sorting the raw string puts every "أ.د." together instead of
 * ordering by the actual name, so the key is normalised before comparing.
 */

const collator = new Intl.Collator("ar", { numeric: true, sensitivity: "base", ignorePunctuation: true });

// A title is only a title when it is abbreviated with a period. Without that
// guard, "دلال" would lose its first letter to the "د." rule.
const TITLE_PREFIX = /^\s*(?:[أا]\s*\.\s*د|prof|dr|mr|ms|[أادم])\s*\.\s*/i;

/** Strips academic titles and unifies hamza/alef/taa-marbuta before comparing. */
export function sortKey(value: unknown): string {
  let text = String(value ?? "").trim();
  // A name may carry more than one title ("أ.د." then "د.").
  for (let pass = 0; pass < 2; pass++) {
    const stripped = text.replace(TITLE_PREFIX, "");
    if (stripped === text) break;
    text = stripped.trim();
  }
  return text
    .replace(/[ً-ْـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

/** Comparator for two raw names. */
export function byArabic(a: unknown, b: unknown): number {
  return collator.compare(sortKey(a), sortKey(b));
}

/** Returns a new array ordered by the chosen name field. */
export function sortByName<T>(rows: readonly T[], pick: (row: T) => unknown): T[] {
  return [...rows].sort((a, b) => byArabic(pick(a), pick(b)));
}

/**
 * ── ترتيب القاعات رقمياً ────────────────────────────────────────────────────
 *
 * A hall is not a word. «مبنى 7 قاعة 31» must come before «مبنى 8 قاعة 22»,
 * and «9» must come before «10» — but text ordering reads them letter by
 * letter, so it puts 10 before 9 and 31 before 8. Some screens also ordered by
 * the composed label ("9/F13") and the server ordered with a plain
 * `localeCompare` that had no numeric awareness at all, so the same estate
 * appeared in three different orders depending on where you looked.
 *
 * So a room is compared the way it is READ: building first, then hall, and
 * each of them split into its letters and its number — «F31» is F then 31 —
 * with numbers compared as numbers. A part that is purely numeric sorts before
 * a lettered one, which keeps numbered buildings ahead of named ones.
 */
const roomCollator = new Intl.Collator("ar", { numeric: true, sensitivity: "base" });

/** «F31» → ["F", 31] · «29» → [29] · «G10» → ["G", 10] */
function roomParts(value: unknown): Array<string | number> {
  const text = String(value ?? "")
    .replace(/[‎‏؜]/g, "")
    .trim();
  const parts: Array<string | number> = [];
  const scan = /(\d+)|([^\d]+)/g;
  let match: RegExpExecArray | null;
  while ((match = scan.exec(text))) {
    if (match[1] !== undefined) parts.push(Number(match[1]));
    else {
      const word = match[2].replace(/[\s/\\.-]+/g, " ").trim();
      if (word) parts.push(word);
    }
  }
  return parts;
}

/** One side of a room address: a building code, or a hall code. */
export function byRoomPart(a: unknown, b: unknown): number {
  const left = roomParts(a);
  const right = roomParts(b);
  const depth = Math.max(left.length, right.length);
  for (let index = 0; index < depth; index++) {
    const x = left[index];
    const y = right[index];
    // A shorter address comes first: «7» before «7A».
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNumber = typeof x === "number";
    const yNumber = typeof y === "number";
    if (xNumber && yNumber) {
      if (x !== y) return (x as number) - (y as number);
      continue;
    }
    if (xNumber !== yNumber) return xNumber ? -1 : 1;
    const compared = roomCollator.compare(String(x), String(y));
    if (compared) return compared;
  }
  return 0;
}

/** Building first, then hall — the order a person reads an address in. */
export function byRoom(
  aBuilding: unknown, aHall: unknown,
  bBuilding: unknown, bHall: unknown,
): number {
  return byRoomPart(aBuilding, bBuilding) || byRoomPart(aHall, bHall);
}

/** The same ordering for an already-composed label such as «9/F13». */
export function byRoomLabel(a: unknown, b: unknown): number {
  const split = (value: unknown) => {
    const text = String(value ?? "").trim();
    const at = text.indexOf("/");
    return at < 0 ? [text, ""] : [text.slice(0, at).trim(), text.slice(at + 1).trim()];
  };
  const [aBuilding, aHall] = split(a);
  const [bBuilding, bHall] = split(b);
  return byRoom(aBuilding, aHall, bBuilding, bHall);
}
