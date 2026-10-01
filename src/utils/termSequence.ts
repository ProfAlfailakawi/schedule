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
 * ── التقويم الأكاديمي الافتراضي (مؤكَّد من صاحب النظام) ──────────────────────
 *
 * الفصل يبدأ يوم **أحد** وينتهي يوم **خميس** دائماً:
 *   نهاية = بداية + (الأسابيع − 1) × 7 + 4 أيام.
 *
 *   الأول   ١٤ أسبوعاً، أقرب أحدٍ إلى ١٣ سبتمبر (السنة الأولى من «YYYY/YYYY»)
 *   الثاني  ١٤ أسبوعاً، أقرب أحدٍ إلى ٣١ يناير (السنة الثانية)
 *   الصيفي  ٧ أسابيع،  أقرب أحدٍ إلى ١٣ يونيو (السنة الثانية)
 *
 * أمثلة: الأول 2026/2027 = الأحد 13/9/2026 ← الخميس 17/12/2026؛ الثاني
 * 2026/2027 = 31/1 ← 6/5/2027؛ الصيفي 2026/2027 = 13/6 ← 29/7/2027.
 *
 * الترتيب: ما أدخله المنسّق (AdTermStart + AdTermWeeks) أولاً، ثم هذا التقويم،
 * ثم لا شيء. والقاعدة نفسها (termEndDate) تحسب نهاية المُدخَل والافتراضي معاً.
 */
export type TermSeason = typeof SEASONS[number];

export const TERM_CALENDAR: Record<TermSeason, { anchor: [number, number]; weeks: number; yearOffset: 0 | 1 }> = {
  "الأول": { anchor: [9, 13], weeks: 14, yearOffset: 0 },
  "الثاني": { anchor: [1, 31], weeks: 14, yearOffset: 1 },
  "الصيفي": { anchor: [6, 13], weeks: 7, yearOffset: 1 },
};

const DAY_MS = 86400000;
const pad2 = (n: number) => String(n).padStart(2, "0");
/** تاريخ تقويمي بلا منطقة زمنية: حساب الأيام على UTC ثم عرضه YYYY-MM-DD. */
const ymdOfUtc = (at: number) => { const d = new Date(at); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
const utcOfYmd = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));

/** أقرب أحدٍ إلى تاريخ (الأربعاء فما قبله يرجع، الخميس فما بعده يتقدّم). */
export function sundayNearest(year: number, month: number, day: number): string {
  const at = Date.UTC(year, month - 1, day);
  const dow = new Date(at).getUTCDay();
  const shift = dow <= 3 ? -dow : 7 - dow;
  return ymdOfUtc(at + shift * DAY_MS);
}

/** آخر يوم في الفصل (خميس الأسبوع الأخير لبدايةٍ يوم أحد). */
export function termEndDate(start: string, weeks: number): string {
  return ymdOfUtc(utcOfYmd(start) + ((Math.max(1, weeks) - 1) * 7 + 4) * DAY_MS);
}

export function termSeasonOf(name: unknown): TermSeason | null {
  const text = String(name ?? "");
  return SEASONS.find(item => text.includes(item)) || null;
}

/** بداية الفصل وعدد أسابيعه ونهايته من اسمه وحده، أو null إن لم يُحلَّل. */
export function defaultTermDates(name: unknown): { start: string; weeks: number; end: string } | null {
  const season = termSeasonOf(name);
  const years = String(name ?? "").match(/(\d{4})\s*\/\s*(\d{4})/);
  if (!season || !years) return null;
  const shape = TERM_CALENDAR[season];
  const start = sundayNearest(Number(years[1]) + shape.yearOffset, shape.anchor[0], shape.anchor[1]);
  return { start, weeks: shape.weeks, end: termEndDate(start, shape.weeks) };
}

/**
 * ── الإنشاء التلقائي للفصل التالي ───────────────────────────────────────────
 * من ١ أكتوبر: الثاني Y/Y+1 · من ١ يناير: الصيفي (Y−1)/Y · من ١ أبريل: الأول Y/Y+1.
 * يعيد الفصل الواجب وجوده الآن مع تواريخه؛ والمنشئ يتخطّاه إن وُجد بالاسم نفسه.
 */
export function autoTermDue(now: number = Date.now()): { name: string; start: string; weeks: number } {
  const d = new Date(now);
  const year = d.getFullYear(), month = d.getMonth() + 1;
  const name = month >= 10 ? `الفصل الثاني ${year}/${year + 1}`
    : month <= 3 ? `الفصل الصيفي ${year - 1}/${year}`
    : `الفصل الأول ${year}/${year + 1}`;
  const dates = defaultTermDates(name)!;
  return { name, start: dates.start, weeks: dates.weeks };
}

export interface TermWindow {
  from: number;
  /** أول لحظة بعد انتهاء الفصل — الحدّ الأعلى غير شامل. */
  to: number;
  /** هل جاء من بيانات مُدخلة أم من العادة؟ */
  source: "declared" | "default";
}

/** بداية محلية لليوم، ونهاية = بداية اليوم التالي لآخر يوم. */
function windowOf(start: string, weeks: number, source: TermWindow["source"]): TermWindow | null {
  const from = Date.parse(`${start}T00:00:00`);
  const to = Date.parse(`${termEndDate(start, weeks)}T00:00:00`) + DAY_MS;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { from, to, source };
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && weeks > 0 && Number.isFinite(Date.parse(`${start}T00:00:00`))) {
    return windowOf(start, weeks, "declared");
  }

  const dates = defaultTermDates(term.AdTermName);
  return dates ? windowOf(dates.start, dates.weeks, "default") : null;
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

/**
 * ── فصلٌ صار أرشيفاً ────────────────────────────────────────────────────────
 *
 * قاعدةُ صاحب النظام: «إذا فصلٌ منتهٍ لا تضع له توقيع… لا استبيان ولا شي، إلا
 * تعديل الجدول — هذا شأن لجنة الجدول». فالفصلُ الذي أُغلق صراحةً أو انقضت
 * نافذتُه، وليس هو الجاري تشغيلياً، لا يعرض دورةَ الاعتماد ولا مواعيدَ التسليم
 * ولا الاستبيانَ ولا روابطَ النشر. الجاري لا يصير أرشيفاً بتقويمٍ افتراضي تجاوز
 * يوماً تقريبياً (`currentTermId` يحترم العلامة الصريحة).
 */
export function termIsArchive(
  term: { AdTermId?: number; AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean } | null | undefined,
  terms: ReadonlyArray<{ AdTermId?: number; AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean }>,
  now: number = Date.now(),
): boolean {
  if (!term || !Number(term.AdTermId || 0)) return false;
  if (Number(term.AdTermId) === currentTermId(terms, now)) return false;
  return term.AdTermClosed === true || termHasEnded(term, now);
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
 * ── موقعُ فصلٍ من الزمن، كما تقوله بطاقة الأستاذ ────────────────────────────
 *
 * كانت البطاقة تقول «فصل سابق» عن كل فصلٍ ليس الجاري — ومنه الفصلُ القادم
 * الذي أُرسل للأستاذ جدولُه للتوّ — وتُخفي عنه التقويم. «سابق» لا يُقال إلا
 * لفصلٍ انقضت نهايته (`termHasEnded`)؛ وما لم يبدأ ولم ينتهِ فهو «قادم».
 */
export type TermPhase = "current" | "past" | "upcoming";

export function termPhase(
  term: (Parameters<typeof termWindow>[0] & { AdTermId?: number }) | null | undefined,
  liveTermId: number,
  now: number = Date.now(),
): TermPhase {
  if (term && Number(term.AdTermId || 0) && Number(term.AdTermId) === Number(liveTermId || 0)) return "current";
  const ended = termHasEnded(term, now);
  return ended ? "past" : "upcoming";
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

/**
 * ── حالةُ الفصل كما تُعرض في شاشة الفصول ─────────────────────────────────────
 * مُغلقٌ صراحةً ← منتهٍ · الجاري تشغيلياً ← جارٍ · انقضت نهايته (termHasEnded)
 * ← منتهٍ تلقائياً · وإلا غير منتهٍ. قاعدةٌ واحدة للبطاقة والمفتّش.
 */
export type TermStatus = "closed" | "current" | "ended" | "open";

export function termStatus(
  term: { AdTermId?: number; AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean },
  terms: ReadonlyArray<{ AdTermId?: number; AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean }>,
  now: number = Date.now(),
): TermStatus {
  if (isTermClosed(term, terms)) return "closed";
  if (Number(term.AdTermId || 0) === currentTermId(terms, now)) return "current";
  if (termHasEnded(term, now)) return "ended";
  return "open";
}

export const TERM_STATUS_LABEL: Record<TermStatus, { pill: string; line: string }> = {
  closed: { pill: "منتهٍ", line: "فصل منتهٍ · للقراءة والتقارير" },
  current: { pill: "جارٍ", line: "الفصل الجاري · مرجع الجداول" },
  ended: { pill: "منتهٍ", line: "انقضى تاريخ نهايته · منتهٍ تلقائياً" },
  open: { pill: "غير منتهٍ", line: "فصل غير منتهٍ · جاهز للتخطيط" },
};
