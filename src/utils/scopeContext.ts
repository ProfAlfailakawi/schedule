import type { AdCollege, AdSection } from "../types";

export interface ScopeAssignmentLike {
  AdCollegeId?: number | string;
  AdSectionId?: number | string;
}

const unique = (values: Array<number | string | undefined | null>) =>
  [...new Set(values.map((value) => Number(value || 0)).filter(Boolean))];

export function normalizeScopeAssignments(scopes: ScopeAssignmentLike[] = []) {
  const seen = new Set<string>();
  return scopes
    .map((scope) => ({
      AdCollegeId: Number(scope?.AdCollegeId || 0),
      AdSectionId: Number(scope?.AdSectionId || 0),
    }))
    .filter((scope) => scope.AdCollegeId && scope.AdSectionId)
    .filter((scope) => {
      const key = `${scope.AdCollegeId}:${scope.AdSectionId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * UI scope resolver.
 * Admin is deliberately never auto-locked: admin must always see the complete
 * college/section selectors. Normal users only see a selector when there is a
 * real choice to make.
 */
export function resolveScopeSelection(
  scopes: ScopeAssignmentLike[] = [],
  currentCollegeId = 0,
  isAdmin = false,
) {
  if (isAdmin) {
    return {
      defaultCollegeId: 0,
      defaultSectionId: 0,
      lockCollege: false,
      lockSection: false,
      collegeIds: [] as number[],
      sectionIds: [] as number[],
    };
  }

  const normalized = normalizeScopeAssignments(scopes);
  const collegeIds = unique(normalized.map((scope) => scope.AdCollegeId));
  const defaultCollegeId = collegeIds.length === 1 ? collegeIds[0] : 0;
  const requestedCollegeId = Number(currentCollegeId || 0);
  const activeCollegeId = collegeIds.includes(requestedCollegeId)
    ? requestedCollegeId
    : defaultCollegeId;
  const sectionIds = unique(
    normalized
      .filter(
        (scope) => !activeCollegeId || scope.AdCollegeId === activeCollegeId,
      )
      .map((scope) => scope.AdSectionId),
  );

  return {
    defaultCollegeId,
    defaultSectionId: sectionIds.length === 1 ? sectionIds[0] : 0,
    lockCollege: collegeIds.length === 1,
    lockSection: Boolean(activeCollegeId) && sectionIds.length === 1,
    collegeIds,
    sectionIds,
  };
}

/** Coerces stale saved preferences back inside the user's actual scope. */
export function coerceScopeValues(
  scopes: ScopeAssignmentLike[] = [],
  collegeId = 0,
  sectionId = 0,
  isAdmin = false,
) {
  if (isAdmin) return { collegeId: Number(collegeId || 0), sectionId: Number(sectionId || 0) };

  const normalized = normalizeScopeAssignments(scopes);
  const collegeIds = unique(normalized.map((scope) => scope.AdCollegeId));
  let nextCollegeId = Number(collegeId || 0);
  if (!collegeIds.includes(nextCollegeId)) {
    nextCollegeId = collegeIds.length === 1 ? collegeIds[0] : 0;
  }

  const sectionIds = unique(
    normalized
      .filter((scope) => !nextCollegeId || scope.AdCollegeId === nextCollegeId)
      .map((scope) => scope.AdSectionId),
  );
  let nextSectionId = Number(sectionId || 0);
  if (!sectionIds.includes(nextSectionId)) {
    nextSectionId = sectionIds.length === 1 ? sectionIds[0] : 0;
  }

  return { collegeId: nextCollegeId, sectionId: nextSectionId };
}

export function describeScopeSelection(
  colleges: AdCollege[] = [],
  sections: AdSection[] = [],
  collegeId = 0,
  sectionId = 0,
) {
  const college = colleges.find((item) => item.AdCollegeId === collegeId);
  const section = sections.find((item) => item.AdSectionId === sectionId);
  if (college && section) return `${college.AdCollegeName} · ${section.AdSectionName}`;
  return section?.AdSectionName || college?.AdCollegeName || "";
}
