import { termChronology } from "./termSequence";

/**
 * ── سجل الانتداب عبر السنوات: نموذج واحد للشاشة وللطباعة ────────────────────
 *
 * كان التقرير المطبوع وحده يعرف كيف تُصفّ السنوات: سنة أكاديمية واحدة = عمود
 * واحد، وداخله الفصل الأول ثم الثاني ثم الصيفي إن وُجد. أما الشاشة فكانت
 * بطاقات مرتّبة بالعدد، لا تُظهر «متى» كان الانتداب إلا بعد فتح كل اسم.
 * فمن يقارن أستاذين لا يستطيع أن يرى الفجوات — سنة انتُدب فيها هذا وغاب ذاك.
 *
 * لذلك صار الحساب هنا، مرة واحدة: الشاشة تقرأه فتعرض المصفوفة نفسها، والورقة
 * تقرأه فتطبعها. وأي تصحيح في ترتيب السنوات أو في اسم الفصل يصلح الاثنين معاً.
 *
 * ولأن الأرشيف يكبر — خمس عشرة سنة وأكثر — لا يجوز أن يتمدّد العرض إلى ما لا
 * نهاية. النموذج يقسم السنوات إلى «نافذة» أحدث ما يهم، و«ما قبلها» يُجمع في
 * عمود واحد يحمل مجموعه، فتبقى الصفحة واحدة مهما طال التاريخ.
 */

export interface VisitingHistoryTermEntry {
  termId: number;
  termName: string;
  rostered?: boolean;
  sections: number;
  courses: number;
  items?: Array<{ scheduleId: number; courseId: number; courseName?: string; sectionCode?: string }>;
}

export interface VisitingHistoryPerson {
  instructorId: number;
  name: string;
  civil?: string;
  times: number;
  sections: number;
  courses: number;
  terms: VisitingHistoryTermEntry[];
}

export interface VisitingHistoryTerm { termId: number; termName: string }

export interface VisitingHistorySlot {
  key: string;
  label: string;
  order: number;
  term: VisitingHistoryTerm | null;
}

export interface VisitingHistoryYear {
  key: string;
  label: string;
  chronology: number;
  slots: VisitingHistorySlot[];
  /** مجموع الشعب المسندة لكل المنتدبين في هذه السنة. */
  sections: number;
  /** عدد المنتدبين الذين ظهروا في هذه السنة. */
  people: number;
}

/** جزء الأرشيف الأقدم من النافذة، مطويًا في عمود واحد. */
export interface VisitingHistoryArchive {
  years: VisitingHistoryYear[];
  yearCount: number;
  label: string;
  /** مجموع شعب كل منتدب داخل هذا الجزء، مفهرسًا برقم المنتدب. */
  sectionsByPerson: Map<number, number>;
  termsByPerson: Map<number, number>;
}

export interface VisitingHistoryModel {
  people: VisitingHistoryPerson[];
  years: VisitingHistoryYear[];
  /** كل السنوات، بما فيها المطوية. */
  allYears: VisitingHistoryYear[];
  archive: VisitingHistoryArchive | null;
  totals: { people: number; terms: number; sections: number; years: number };
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** الأرقام العربية والفارسية تُقرأ كما تُقرأ اللاتينية عند استخراج السنة. */
export function normalizeYearDigits(value: string): string {
  return String(value || "")
    .replace(/[٠-٩]/g, digit => String(ARABIC_INDIC.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(EASTERN_INDIC.indexOf(digit)));
}

export function seasonOf(name: string): { key: string; label: string; order: number } {
  const text = String(name || "");
  if (/الأول|الاول/.test(text)) return { key: "first", label: "الأول", order: 1 };
  if (/الثاني/.test(text)) return { key: "second", label: "الثاني", order: 2 };
  if (/الصيف/.test(text)) return { key: "summer", label: "الصيفي", order: 3 };
  return { key: `other-${text}`, label: "فصل", order: 9 };
}

const byArabicName = (a: string, b: string) => String(a || "").localeCompare(String(b || ""), "ar");

/** ترتيب المنتدبين: الأكثر فصولًا، ثم الأكثر شعبًا، ثم أبجديًا. */
export function sortVisitingPeople(people: readonly VisitingHistoryPerson[]): VisitingHistoryPerson[] {
  return [...people].sort((a, b) =>
    Number(b.times || 0) - Number(a.times || 0)
    || Number(b.sections || 0) - Number(a.sections || 0)
    || byArabicName(a.name, b.name)
  );
}

/** فصول المنتدب من الأحدث إلى الأقدم. */
export function sortVisitingTerms(terms: readonly VisitingHistoryTermEntry[]): VisitingHistoryTermEntry[] {
  return [...terms].sort((a, b) =>
    termChronology({ AdTermId: b.termId, AdTermName: b.termName })
    - termChronology({ AdTermId: a.termId, AdTermName: a.termName })
  );
}

/**
 * يبني المصفوفة الكاملة ثم يطويها إلى نافذة.
 *
 * @param windowYears عدد السنوات المعروضة مفصّلة. أي رقم غير موجب = كل السنوات.
 */
export function buildVisitingHistoryModel(
  source: { terms?: readonly VisitingHistoryTerm[]; people?: readonly VisitingHistoryPerson[] } | null | undefined,
  windowYears = 0
): VisitingHistoryModel {
  const people = sortVisitingPeople(source?.people || []);

  /* الفصل الذي لا منتدب فيه ليس عمودًا: لا يُقارن به أحد ولا يحمل رقمًا. */
  const activeTermIds = new Set(
    people.flatMap(person => person.terms.map(term => Number(term.termId))).filter(Boolean)
  );
  const knownTerms = (source?.terms || []).filter(term => activeTermIds.has(Number(term.termId)));
  const knownIds = new Set(knownTerms.map(term => Number(term.termId)));
  /* فصل ظهر في سجل منتدب دون أن يرد في قائمة الفصول لا يجوز أن يختفي. */
  const orphanTerms: VisitingHistoryTerm[] = [];
  people.forEach(person => person.terms.forEach(term => {
    const id = Number(term.termId);
    if (!id || knownIds.has(id)) return;
    knownIds.add(id);
    orphanTerms.push({ termId: id, termName: term.termName });
  }));

  const sectionsByTerm = new Map<number, number>();
  const peopleByTerm = new Map<number, Set<number>>();
  people.forEach(person => person.terms.forEach(term => {
    const id = Number(term.termId);
    sectionsByTerm.set(id, (sectionsByTerm.get(id) || 0) + Number(term.sections || 0));
    const seen = peopleByTerm.get(id) || new Set<number>();
    seen.add(Number(person.instructorId));
    peopleByTerm.set(id, seen);
  }));

  type YearDraft = { key: string; label: string; chronology: number; terms: Array<VisitingHistoryTerm & { season: ReturnType<typeof seasonOf> }> };
  const yearMap = new Map<string, YearDraft>();
  [...knownTerms, ...orphanTerms].forEach(term => {
    const termName = String(term.termName || "");
    const match = normalizeYearDigits(termName).match(/(\d{4})\s*\/\s*(\d{4})/);
    const key = match ? `${match[1]}/${match[2]}` : `term-${term.termId}`;
    const label = match ? `${match[1]}/${match[2]}` : termName;
    const chronology = termChronology({ AdTermId: term.termId, AdTermName: term.termName });
    const draft = yearMap.get(key) || { key, label, chronology, terms: [] };
    draft.chronology = Math.max(draft.chronology, chronology);
    draft.terms.push({ ...term, season: seasonOf(termName) });
    yearMap.set(key, draft);
  });

  const allYears: VisitingHistoryYear[] = [...yearMap.values()]
    .sort((a, b) => b.chronology - a.chronology)
    .map(year => {
      const bySeason = new Map(year.terms.map(term => [term.season.key, term]));
      const slots: VisitingHistorySlot[] = [
        { key: "first", label: "الأول", term: bySeason.get("first") || null, order: 1 },
        { key: "second", label: "الثاني", term: bySeason.get("second") || null, order: 2 },
      ];
      /* الصيفي عمودٌ يُفتح عند وجوده وحده، فلا تدفع كل سنة ثمن خانة فارغة. */
      if (bySeason.has("summer")) slots.push({ key: "summer", label: "الصيفي", term: bySeason.get("summer") || null, order: 3 });
      year.terms
        .filter(term => !["first", "second", "summer"].includes(term.season.key))
        .sort((a, b) => a.season.order - b.season.order || Number(a.termId) - Number(b.termId))
        .forEach((term, index) => slots.push({ key: `other-${term.termId}`, label: term.season.label || `فصل ${index + 1}`, term, order: 9 + index }));

      const yearTermIds = year.terms.map(term => Number(term.termId));
      const yearPeople = new Set<number>();
      yearTermIds.forEach(id => peopleByTerm.get(id)?.forEach(personId => yearPeople.add(personId)));
      return {
        key: year.key,
        label: year.label,
        chronology: year.chronology,
        slots,
        sections: yearTermIds.reduce((sum, id) => sum + (sectionsByTerm.get(id) || 0), 0),
        people: yearPeople.size,
      };
    });

  const limit = windowYears > 0 ? Math.min(windowYears, allYears.length) : allYears.length;
  const years = allYears.slice(0, limit);
  const older = allYears.slice(limit);
  const archive: VisitingHistoryArchive | null = older.length ? (() => {
    const olderTermIds = new Set(older.flatMap(year => year.slots.map(slot => Number(slot.term?.termId || 0)).filter(Boolean)));
    const sectionsByPerson = new Map<number, number>();
    const termsByPerson = new Map<number, number>();
    people.forEach(person => {
      let sections = 0, terms = 0;
      person.terms.forEach(term => {
        if (!olderTermIds.has(Number(term.termId))) return;
        sections += Number(term.sections || 0);
        terms += 1;
      });
      if (sections || terms) { sectionsByPerson.set(Number(person.instructorId), sections); termsByPerson.set(Number(person.instructorId), terms); }
    });
    const oldest = older[older.length - 1]?.label || "";
    const newest = older[0]?.label || "";
    return {
      years: older,
      yearCount: older.length,
      label: oldest && newest && oldest !== newest ? `${oldest} — ${newest}` : (newest || oldest || "سنوات سابقة"),
      sectionsByPerson,
      termsByPerson,
    };
  })() : null;

  return {
    people,
    years,
    allYears,
    archive,
    totals: {
      people: people.length,
      terms: people.reduce((sum, person) => sum + Number(person.times || 0), 0),
      sections: people.reduce((sum, person) => sum + Number(person.sections || 0), 0),
      years: allYears.length,
    },
  };
}

/** درجة تظليل الخانة: صفر = فارغة، وأربع درجات تكفي لتمييز الكثافة دون ضجيج. */
export function visitingHeatLevel(sections: number): number {
  const value = Number(sections || 0);
  return value ? Math.min(4, Math.max(1, value)) : 0;
}
