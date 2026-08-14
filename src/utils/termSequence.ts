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
