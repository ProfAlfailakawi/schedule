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
 * الجواب التشغيلي هو أقدم فصل معلن صراحةً أنه غير منتهٍ. لذلك لا يزيح فصلٌ
 * مستقبلي أُنشئ للتخطيط الفصلَ الذي يُدرَّس الآن. بعد إغلاقه صراحةً ينتقل
 * الاختيار إلى المفتوح التالي. والرجوع إلى الأحدث غير المغلق يخص البيانات
 * القديمة التي لا تحمل العلامة بعد.
 */
export function currentTermId(
  terms: ReadonlyArray<{ AdTermId?: number; AdTermName?: string;
                         AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean }>,
  now: number = Date.now(),
): number {
  /* «الجاري» قرارٌ تشغيلي، لا تخمينٌ من التاريخ. إذا أثبت المنسّق أن فصلاً
     غير منتهٍ (`AdTermClosed === false`) فهو الجاري حتى يضغط «انتهى هذا
     الفصل». هذا يمنع بطاقة الأستاذ وشاشات العمل من تحويل الفصل الأول الجاري
     إلى «سابق» لمجرد أن تقويماً افتراضياً تجاوز يوماً تقريبياً. */
  const ordered = sortTermsNewest(terms);
  /* قد يُنشأ الفصل التالي للتخطيط قبل إنهاء الجاري. وإذا حفظت شاشة الفصول
     كليهما بعلم `false` فلا يجوز للأحدث أن يزيح الجاري. أقدم فصل أُعلن صراحةً
     أنه غير منتهٍ يبقى التشغيلي حتى يُغلق؛ بعد إغلاقه ينتقل الاختيار إلى
     المفتوح التالي. */
  const declaredOpenTerms = ordered.filter(term => term.AdTermClosed === false);
  /* إذا بقي علم false خطأً على فصل تاريخي، ووجد بين المفتوحة فصل تقع نافذته
     الآن، فهو المرشح الأدق. هذه مفاضلة بين فصول كلها غير مغلقة صراحةً؛ لا
     تجعل التاريخ أي فصلٍ مغلقاً ولا تنقل الحالي إلى المستقبل تلقائياً. */
  const runningDeclared = declaredOpenTerms.find(term => termIsRunningNow(term, now));
  const declaredOpen = runningDeclared || declaredOpenTerms
    .sort((a, b) => termChronology(a) - termChronology(b)
      || Number(a.AdTermId || 0) - Number(b.AdTermId || 0))[0];
  if (declaredOpen) return Number(declaredOpen.AdTermId || 0);

  /* ── بلا علامةٍ صريحة: أحدثُ فصلٍ بدأ فعلاً، لا أحدثُ فصلٍ أُنشئ ─────────
     كان الرجوعُ «أحدث فصلٍ غير مغلق»، فإذا أُنشئ الفصلُ التالي للتخطيط —
     وكلاهما بلا علامة، وهي حالُ البيانات القديمة — صار المستقبليُّ «الجاري»،
     وقالت بطاقتي للأستاذ عن فصله الذي يُدرّسه الآن «فصل سابق». فيُقرأ ما بعد
     آخر فصلٍ أُغلق صراحةً، ويُختار منه أحدثُ ما بدأ؛ فصلٌ لم يبدأ لا يصير جارياً
     لأنه أحدث، وفصلٌ بدأ لا يصير سابقاً لأن تقويمه الافتراضي انقضى. */
  const ascending = [...ordered].reverse();
  let lastClosed = -1;
  ascending.forEach((term, index) => { if (term.AdTermClosed === true) lastClosed = index; });
  const pool = ascending.slice(lastClosed + 1).filter(term => term.AdTermClosed !== true);
  const started = [...pool].reverse().find(term => {
    const window = termWindow(term as any);
    return Boolean(window && window.from <= now);
  });
  if (started) return Number(started.AdTermId || 0);
  /* لم يبدأ شيءٌ بعد آخر مغلق: الفصلُ التشغيلي هو التالي له مباشرةً. وبلا أيِّ
     إغلاقٍ ولا نافذةٍ معروفة يبقى الرجوعُ القديم: أحدثُ غير مغلق. */
  const next = lastClosed >= 0 ? pool[0] : pool[pool.length - 1];
  return Number(next?.AdTermId || 0);
}

export function isTermClosed(
  term: { AdTermId?: number; AdTermClosed?: boolean; AdTermName?: string;
          AdTermStart?: string; AdTermWeeks?: number } | null | undefined,
  allTerms: ReadonlyArray<{ AdTermId?: number }> = [],
): boolean {
  if (!term) return false;
  void allTerms;
  /* الانتهاء حالة تشغيلية يعلنها صاحب الصلاحية. التاريخ، ووجود فصل أحدث،
     وترتيب المعرّفات معلومات مساعدة للتقويم والفرز فقط، ولا تحوّل الجدول إلى
     سجل للقراءة وحدها. */
  return term.AdTermClosed === true;
}

/**
 * ── فصلُ التخطيط ────────────────────────────────────────────────────────────
 *
 * الجرسُ والعدّاد كانا يقرآن الفصلَ الجاري وحده. لكنّ دورة الاعتماد تجري في
 * الغالب على الفصل التالي — يُبنى جدولُه ويُرسَل ويُرجَع والجاري يُدرَّس. فكان
 * القسمُ يُرجَع جدولُه للفصل القادم ولا يرنّ له شيء.
 *
 * فصلُ التخطيط هو أحدثُ فصلٍ لم ينتهِ (لم يُغلق ولم تنقضِ نافذته)، غيرُ
 * الجاري، وفيه نشاطٌ فعلاً (مواعيد أو سجلُّ اعتماد). وبلا نشاطٍ لا فصلَ
 * تخطيط: فصلٌ أُنشئ اسماً لا يُنبّه أحداً. صفرٌ حين لا يوجد.
 */
export function planningTermCandidates(
  terms: ReadonlyArray<{ AdTermId?: number; AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean }>,
  now: number = Date.now(),
): number[] {
  const current = currentTermId(terms, now);
  const currentRank = termChronology(terms.find(item => Number(item.AdTermId) === current));
  return sortTermsNewest(terms)
    .filter(term => {
      const id = Number(term.AdTermId || 0);
      return Boolean(id) && id !== current && term.AdTermClosed !== true && !termHasEnded(term, now)
        && termChronology(term) >= currentRank;
    })
    .map(term => Number(term.AdTermId));
}

export function planningTermId(
  terms: ReadonlyArray<{ AdTermId?: number; AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean }>,
  hasActivity: (termId: number) => boolean,
  now: number = Date.now(),
): number {
  return planningTermCandidates(terms, now).find(hasActivity) || 0;
}
