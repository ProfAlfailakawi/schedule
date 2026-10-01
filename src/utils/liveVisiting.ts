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

/** منتدبو الفصل كله، في كل الكليات والأقسام: القاعدة نفسها لكل قسم ثم الاتحاد. */
export function termVisitingIds(affiliations: Affiliation[], termId: number, known: (id: number) => boolean): number[] {
  const directories = new Map<string, number[]>();
  for (const row of affiliations) if (row.kind === "directory") {
    const key = `${row.collegeId}:${row.sectionId}`;
    directories.set(key, [...(directories.get(key) || []), ...row.instructorIds]);
  }
  const out = new Set<number>();
  for (const row of affiliations) {
    if (row.kind !== "roster" || Number(row.termId) !== Number(termId)) continue;
    liveVisitingIds(row.instructorIds, directories.get(`${row.collegeId}:${row.sectionId}`) || [], known).forEach(id => out.add(id));
  }
  return [...out];
}
