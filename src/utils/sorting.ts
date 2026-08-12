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
