/**
 * Guessing the next academic term from the most recent one.
 *
 * Terms are free-text but follow a fixed rhythm in this data set:
 *   الفصل الأول 2017/2018 → الفصل الثاني 2017/2018 → الفصل الصيفي 2017/2018
 *   → الفصل الأول 2018/2019 → …
 *
 * So the summer term rolls the year forward and starts the cycle again. When the
 * latest name does not match the pattern we return "" and the form stays blank —
 * a wrong guess is worse than no guess.
 */

const SEASONS = ["الأول", "الثاني", "الصيفي"] as const;

export function suggestNextTermName(latest: string | undefined | null): string {
  const name = String(latest ?? "").trim();
  const seasonIndex = SEASONS.findIndex(season => name.includes(season));
  const years = name.match(/(\d{4})\s*\/\s*(\d{4})/);
  if (seasonIndex === -1 || !years) return "";

  let fromYear = Number(years[1]);
  let toYear = Number(years[2]);
  let nextSeason = seasonIndex + 1;

  // After the summer term the academic year advances and the cycle restarts.
  if (nextSeason >= SEASONS.length) {
    nextSeason = 0;
    fromYear += 1;
    toYear += 1;
  }

  return `الفصل ${SEASONS[nextSeason]} ${fromYear}/${toYear}`;
}

/**
 * The same season one academic year earlier — e.g. "الفصل الأول 2027/2028"
 * → "الفصل الأول 2026/2027". A brand-new term is almost always last year's same
 * semester with light edits, so this is the natural template to copy from.
 * Returns "" when the name does not parse.
 */
export function previousYearSameTermName(current: string | undefined | null): string {
  const name = String(current ?? "").trim();
  const seasonIndex = SEASONS.findIndex(season => name.includes(season));
  const years = name.match(/(\d{4})\s*\/\s*(\d{4})/);
  if (seasonIndex === -1 || !years) return "";
  return `الفصل ${SEASONS[seasonIndex]} ${Number(years[1]) - 1}/${Number(years[2]) - 1}`;
}

/** Loose equality for term names (ignores spacing) so a generated name matches a stored one. */
export function sameTermName(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, "").trim();
  return norm(a) !== "" && norm(a) === norm(b);
}


/** Chronological rank for an academic term name. Higher means newer. */
export function termChronology(term: { AdTermId?: number; AdTermName?: string } | undefined | null): number {
  if (!term) return Number.NEGATIVE_INFINITY;
  const name = String(term.AdTermName || "");
  const years = name.match(/(\d{4})\s*\/\s*(\d{4})/);
  const season = name.includes("الصيفي") ? 2 : name.includes("الثاني") ? 1 : name.includes("الأول") ? 0 : 0;
  return years ? Number(years[1]) * 10 + season : Number(term.AdTermId || 0);
}

/** Always show academic terms from newest to oldest, independent of database id order. */
export function sortTermsNewest<T extends { AdTermId?: number; AdTermName?: string }>(terms: readonly T[]): T[] {
  return [...terms].sort((a, b) =>
    termChronology(b) - termChronology(a) || Number(b.AdTermId || 0) - Number(a.AdTermId || 0)
  );
}

/**
 * Is this term over?
 *
 * A coordinator can say so outright, and that answer always wins. But ten years
 * of terms exist that pre-date the flag entirely, and treating "nobody said" as
 * "still running" is the wrong default: it offered room-borrowing between
 * departments on a term that finished in 2018, where nothing can be borrowed
 * because nothing is scheduled any more.
 *
 * So an unmarked term is judged by its position: the newest term in the list is
 * the live one, and everything behind it has been overtaken. The list is already
 * sorted newest-first everywhere it is served, but the order is verified here
 * rather than assumed — a caller passing an arbitrary array still gets a right
 * answer.
 */
export function isTermClosed(
  term: { AdTermId?: number; AdTermClosed?: boolean } | null | undefined,
  allTerms: ReadonlyArray<{ AdTermId?: number }> = [],
): boolean {
  if (!term) return false;
  if (typeof term.AdTermClosed === "boolean") return term.AdTermClosed;
  if (!allTerms.length) return false;
  const newestId = allTerms.reduce(
    (best, row) => (Number(row?.AdTermId || 0) > best ? Number(row?.AdTermId || 0) : best),
    0,
  );
  if (!newestId) return false;
  return Number(term.AdTermId || 0) !== newestId;
}
