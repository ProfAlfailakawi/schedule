/**
 * ── من المنتدب «الآن»؟ — قاعدة واحدة ─────────────────────────────────────────
 *
 * منتدبُ قسمٍ في فصلٍ = اسمٌ في روستر ذلك الفصل للقسم، وهو في دليل منتدبي
 * القسم نفسه، وله سجلٌّ في الأساتذة. كان الخادم يقرؤها قسماً قسماً
 * (readLiveVisitingRoster)؛ و«متى نلتقي؟» يحتاجها للفصل كله عبر الكليات.
 * كلاهما يسأل هذه الدالة.
 */
export function liveVisitingIds(roster: Iterable<unknown>, directory: Iterable<unknown>, known: (id: number) => boolean): number[] {
  const inDirectory = new Set([...directory].map(Number));
  return [...new Set([...roster].map(Number)
    .filter(id => Number.isFinite(id) && id > 0 && inDirectory.has(id) && known(id)))];
}

type Affiliation = { collegeId: number; sectionId: number; instructorIds: number[]; kind: "directory" | "roster"; termId?: number };

/**
 * منتدبو الفصل كله، في كل الكليات والأقسام: القاعدة نفسها لكل قسم ثم الاتحاد.
 * والقسم عائلةٌ عبر كلياته (departmentFamilyResolver في sectionLabel): روسترُ
 * قسمٍ في كلية يُقرأ مع دليل أخته في كليةٍ أخرى، كما يقرؤه الخادم للقسم الواحد.
 */
export function termVisitingIds(
  affiliations: Affiliation[], termId: number, known: (id: number) => boolean,
  familyOf: (collegeId: number, sectionId: number) => string = (c, s) => `${c}:${s}`,
): number[] {
  const directories = new Map<string, number[]>();
  for (const row of affiliations) if (row.kind === "directory") {
    const key = familyOf(row.collegeId, row.sectionId);
    directories.set(key, [...(directories.get(key) || []), ...row.instructorIds]);
  }
  const out = new Set<number>();
  for (const row of affiliations) {
    if (row.kind !== "roster" || Number(row.termId) !== Number(termId)) continue;
    liveVisitingIds(row.instructorIds, directories.get(familyOf(row.collegeId, row.sectionId)) || [], known).forEach(id => out.add(id));
  }
  return [...out];
}

/**
 * من لا يجلس في «متى نلتقي؟» لأنه منتدب: كلُّ من في دليل منتدبي أي قسم،
 * في أي كلية — لا من في روستر الفصل وحده. المنتدب ليس عضو هيئة تدريس، دُرِّس
 * هذا الفصل أم لا (قرار المالك ٢٠٢٦/١٠/١: «أمثال العيفان» ظهرت لأنها في الدليل
 * بلا روستر للفصل).
 */
export function directoryVisitingIds(affiliations: Affiliation[], known: (id: number) => boolean): number[] {
  const out = new Set<number>();
  for (const row of affiliations) if (row.kind === "directory")
    for (const raw of row.instructorIds) { const id = Number(raw); if (Number.isFinite(id) && id > 0 && known(id)) out.add(id); }
  return [...out];
}
