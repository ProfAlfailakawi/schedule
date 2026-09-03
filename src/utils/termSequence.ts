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
/**
 * ── التقويم الأكاديمي الافتراضي ────────────────────────────────────────────
 *
 * عشر سنوات من الفصول تحمل اسماً فقط: «الفصل الأول 2026/2027». لا تاريخ بداية
 * ولا عدد أسابيع. فكان كل ما يسأل «أي فصل جارٍ الآن؟» يُجيب بترتيب الأرقام:
 * الأحدث رقماً هو الجاري — وهذا يبقى صحيحاً إلى أن ينتهي زمنه فعلاً، فيظل
 * النظام يعامله كجارٍ إلى أن يُنشئ أحدهم الفصل التالي يدوياً.
 *
 * هذه هي العادة المعتادة في هذه الجامعة. تقريبية عمداً — «يزيد شوي وينقص شوي»
 * — ولذلك هي آخر ما يُسأل: تاريخ البداية وعدد الأسابيع المُدخَلان في شاشة
 * الفصول يسبقانها دائماً. هي جواب حين لا يوجد جواب، لا بديل عن البيانات.
 *
 * السنة في «YYYY/YYYY»: الفصل الأول يقع في السنة الأولى، والثاني والصيفي في
 * الثانية. فـ«الصيفي 2025/2026» صيف 2026، و«الأول 2026/2027» خريف 2026.
 */
const DEFAULT_WINDOWS: Record<string, {
  from: [number, number]; to: [number, number]; yearOffset: 0 | 1;
}> = {
  /* بعد ١٠ سبتمبر ← آخر ديسمبر */
  "الأول": { from: [9, 10], to: [12, 31], yearOffset: 0 },
  /* بعد آخر يناير ← منتصف مايو */
  "الثاني": { from: [1, 31], to: [5, 15], yearOffset: 1 },
  /* منتصف يونيو ← آخر يوليو */
  "الصيفي": { from: [6, 15], to: [7, 31], yearOffset: 1 },
};

export interface TermWindow {
  from: number;
  /** أول لحظة بعد انتهاء الفصل — الحدّ الأعلى غير شامل. */
  to: number;
  /** هل جاء من بيانات مُدخلة أم من العادة؟ */
  source: "declared" | "default";
}

/**
 * متى يبدأ هذا الفصل ومتى ينتهي.
 *
 * الترتيب مقصود: ما أدخله المنسّق أولاً، ثم العادة، ثم لا شيء. فمن ملأ تاريخ
 * البداية وعدد الأسابيع لا يُنقض عليه بتقويم افتراضي.
 */
export function termWindow(
  term: { AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number } | null | undefined,
): TermWindow | null {
  if (!term) return null;

  const start = String(term.AdTermStart || "");
  const weeks = Number(term.AdTermWeeks || 0);
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && weeks > 0) {
    const from = Date.parse(`${start}T00:00:00`);
    if (Number.isFinite(from)) {
      return { from, to: from + weeks * 7 * 86400000, source: "declared" };
    }
  }

  const name = String(term.AdTermName || "");
  const season = SEASONS.find(item => name.includes(item));
  const years = name.match(/(\d{4})\s*\/\s*(\d{4})/);
  if (!season || !years) return null;
  const shape = DEFAULT_WINDOWS[season];
  if (!shape) return null;

  const year = Number(years[1]) + shape.yearOffset;
  const from = new Date(year, shape.from[0] - 1, shape.from[1]).getTime();
  /* اليوم التالي لآخر يوم: «ينتهي آخر ديسمبر» تعني أن ٣١ ديسمبر منه. */
  const to = new Date(year, shape.to[0] - 1, shape.to[1] + 1).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { from, to, source: "default" };
}

/** هل انقضى زمن هذا الفصل؟ */
export function termHasEnded(
  term: Parameters<typeof termWindow>[0],
  now: number = Date.now(),
): boolean {
  const window = termWindow(term);
  return Boolean(window && now >= window.to);
}

/** هل نحن داخل هذا الفصل الآن؟ */
export function termIsRunningNow(
  term: Parameters<typeof termWindow>[0],
  now: number = Date.now(),
): boolean {
  const window = termWindow(term);
  return Boolean(window && now >= window.from && now < window.to);
}

/**
 * أي فصل نحن فيه الآن.
 *
 * الجواب هو الفصل الذي **لم تنتهِ نافذته بعد وأقربها انتهاءً**. لا شيء غيره.
 *
 * البديل الذي كان مستعملاً — «الأحدث رقماً» — يكسر في الحالة التي بُني لها
 * فحص «الفصل المعتمد» نفسه: أن يُنشأ الفصل التالي مبكراً للتخطيط بينما الحالي
 * ما زال يُدرَّس. عندها يصير الفصل الذي يبدأ في فبراير «الأحدث»، فيأخذ خط
 * «الآن» ويفقده الفصل الذي يُدرَّس فعلاً — ساعتان كلتاهما كاذبة.
 *
 * وهذه القاعدة تُغلق الفجوة بين الفصول أيضاً: في منتصف أغسطس لم يبدأ الفصل
 * الأول بعد بحسب العادة، لكن أقرب نهاية قادمة هي نهايته، فهو الجواب. الفصول
 * تُغطّي السنة بلا ثقوب، وهو ما يعنيه «يزيد شوي وينقص شوي» عملياً: النهاية
 * هي الحدّ، والبداية تتبعها.
 *
 * فصول بلا نافذة (اسم لا يُحلَّل) لا تشارك؛ وإن لم يكن لأيٍّ منها نافذة رجعنا
 * إلى الأحدث رقماً، لأن جواباً تقريبياً خير من لا جواب.
 */
export function currentTermId(
  terms: ReadonlyArray<{ AdTermId?: number; AdTermName?: string;
                         AdTermStart?: string; AdTermWeeks?: number }>,
  now: number = Date.now(),
): number {
  let best = 0;
  let bestEnd = Infinity;
  let sawWindow = false;
  for (const term of terms) {
    const window = termWindow(term);
    if (!window) continue;
    sawWindow = true;
    if (now >= window.to) continue;          // انقضى
    if (window.to < bestEnd) { bestEnd = window.to; best = Number(term.AdTermId || 0); }
  }
  if (best) return best;
  if (sawWindow) return 0;                   // كلها انقضت: لا فصل جارٍ
  return terms.reduce(
    (top, term) => (Number(term?.AdTermId || 0) > top ? Number(term?.AdTermId || 0) : top),
    0,
  );
}

export function isTermClosed(
  term: { AdTermId?: number; AdTermClosed?: boolean; AdTermName?: string;
          AdTermStart?: string; AdTermWeeks?: number } | null | undefined,
  allTerms: ReadonlyArray<{ AdTermId?: number }> = [],
): boolean {
  if (!term) return false;
  /* ما أعلنه المنسّق صراحةً يسبق كل شيء. */
  if (typeof term.AdTermClosed === "boolean") return term.AdTermClosed;
  /* ثم الزمن: فصلٌ انقضى زمنه منتهٍ وإن لم يُنشأ بعده فصل. هذا ما كان يجعل
     النظام يعامل فصلاً انتهى في ديسمبر كأنه جارٍ طوال يناير — إلى أن يتذكّر
     أحدهم إنشاء الفصل التالي. */
  if (termHasEnded(term as Parameters<typeof termWindow>[0])) return true;
  if (!allTerms.length) return false;
  const newestId = allTerms.reduce(
    (best, row) => (Number(row?.AdTermId || 0) > best ? Number(row?.AdTermId || 0) : best),
    0,
  );
  if (!newestId) return false;
  return Number(term.AdTermId || 0) !== newestId;
}
