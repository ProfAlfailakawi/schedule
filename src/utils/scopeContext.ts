import type { AdCollege, AdSection } from "../types";

export interface ScopeAssignmentLike {
  AdCollegeId?: number | string;
  AdSectionId?: number | string;
  /** The server expands a college-wide row (section 0) into one row per
   *  department for display, and marks each expanded row with this flag. */
  AdCollegeWide?: boolean;
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
 * ── قسمٌ واحد: لا منتقيَ للقسم ─────────────────────────────────────────────
 *
 * الحساب الذي لا يملك في الكلية المختارة إلا قسماً واحداً لا يُسأل عن القسم:
 * يُختار له ويُخفى المنتقي، فيبقى أمامه «الكلية + الفصل» في كل شاشة — كما في
 * لوحة الجدول. هذه الدالة هي الموضع الوحيد الذي يقرّر ذلك؛ كل شاشةٍ ترسم
 * منتقي قسمٍ مربوطاً بنطاق القارئ تسألها، ولا تكتب شرطها بنفسها.
 *
 * تُرجع رقم القسم الوحيد، أو null حين يجب أن يبقى المنتقي:
 *   - الإدارة (isAdmin) دائماً null.
 *   - الكلية المطلوبة خارج النطاق → null. وبلا كلية مطلوبة تُعتمد الكلية
 *     الوحيدة إن كانت واحدة، وإلا null.
 *   - صفُّ «الكلية كلها» (قسم صفر، أو صفٌّ موسومٌ AdCollegeWide بعد بسطه) يعني
 *     كل أقسام الكلية — عميد، عميد مساعد، أدوار التسجيل — فلا يُعامل قسماً
 *     واحداً ولو كانت الكلية لا تضمّ اليوم إلا قسماً.
 *   - غير ذلك: القسم إن كان واحداً بعينه، وإلا null.
 */
export function singleDepartmentOf(
  scopes: ScopeAssignmentLike[] = [],
  collegeId: number | string = 0,
  isAdmin = false,
): number | null {
  if (isAdmin || !Array.isArray(scopes) || !scopes.length) return null;
  const rows = scopes
    .map((scope) => ({
      college: Number(scope?.AdCollegeId || 0),
      section: Number(scope?.AdSectionId || 0),
      wide: Boolean(scope?.AdCollegeWide),
    }))
    .filter((row) => row.college);
  const colleges = [...new Set(rows.map((row) => row.college))];
  const requested = Number(collegeId || 0);
  const active = requested
    ? (colleges.includes(requested) ? requested : 0)
    : (colleges.length === 1 ? colleges[0] : 0);
  if (!active) return null;
  const inCollege = rows.filter((row) => row.college === active);
  if (inCollege.some((row) => row.wide || !row.section)) return null;
  const sections = [...new Set(inCollege.map((row) => row.section))];
  return sections.length === 1 ? sections[0] : null;
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
    /* القرار نفسه في موضعه الواحد — لا نسخةَ ثانية تفترق عنه. */
    lockSection: singleDepartmentOf(scopes, activeCollegeId) !== null,
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
