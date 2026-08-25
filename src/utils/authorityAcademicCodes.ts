/**
 * Academic number rules for the Authority (SWRSCHA) timetable.
 *
 * The document's scientific-department key is NOT the local AdSectionCode by
 * itself. It is the college code followed by the local department code:
 *   college 01 + department 01 => 0101
 * and a course key is that four-digit department key + the three-digit course
 * number:
 *   0101 + 102 => 0101102
 *
 * The catalogue remains the authority. These helpers only reconcile the
 * document representation with the already-stored college/department/course
 * codes; they never invent a college, department or course identity.
 */
export const academicDigits = (value: unknown): string => String(value ?? "")
  .normalize("NFKC")
  .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
  .replace(/\D/g, "");

/** Return the document-level department key represented by this catalogue row. */
export function authorityDepartmentCode(collegeCode: unknown, sectionCode: unknown): string {
  const collegeRaw = academicDigits(collegeCode);
  const college = collegeRaw && collegeRaw.length <= 2 ? collegeRaw.padStart(2, "0") : collegeRaw;
  const section = academicDigits(sectionCode);
  if (!section) return "";

  // Some installations already store the complete document key in AdSectionCode.
  if (section.length >= 4 && (!college || section.startsWith(college))) return section;

  // SWRSCHA uses two digits for college + two digits for the scientific dept.
  // The live catalogue may store 1 instead of 01, so padding happens only at
  // the representation boundary; no catalogue identity is invented here.
  if (college.length === 2 && section.length <= 2) return `${college}${section.padStart(2, "0")}`;

  // Fail closed for unusual legacy codes: compare only the exact stored code.
  return section;
}

/** Compare a document department key to the current catalogue scope. */
export function authorityDepartmentMatches(sourceCode: unknown, collegeCode: unknown, sectionCode: unknown): boolean {
  const source = academicDigits(sourceCode);
  const local = academicDigits(sectionCode);
  const college = academicDigits(collegeCode);
  const composite = authorityDepartmentCode(collegeCode, sectionCode);
  if (!source) return false;

  // When the college is known, SWRSCHA's department identity is the composite
  // key (college + local scientific department). Accepting local `01` beside
  // expected `0101` would recreate the exact ambiguity that broke PDF import.
  if (college && composite) return source === composite;
  return source === local;
}

/**
 * Exact course-key reconciliation. The Arabic course name is intentionally not
 * accepted as identity evidence. The source number must identify the catalogue
 * row either in its stored representation or in SWRSCHA's full 7-digit form.
 */
export function authorityCourseCodeMatches(sourceCode: unknown, catalogueCourseCode: unknown, departmentCode: unknown): boolean {
  const source = academicDigits(sourceCode);
  const course = academicDigits(catalogueCourseCode);
  const department = academicDigits(departmentCode);
  if (!source || !course) return false;
  if (source === course) return true;

  // Catalogue frequently stores only the three-digit course number (e.g. 102),
  // while SWRSCHA prints the complete key (e.g. 0101102).
  const tail = course.length >= 3 ? course.slice(-3) : course.padStart(3, "0");
  if (department && source === `${department}${tail}`) return true;

  // A clean three-digit source is acceptable only against the same three-digit
  // catalogue number; uniqueness inside the selected department is checked by
  // the caller before a canonical row is chosen.
  return source.length === 3 && source === tail;
}

/**
 * Canonical section numbering for an Authority-PDF import.
 *
 * Section identity is derived from the canonical course identity, never copied
 * from OCR. Every course starts at 501 and advances in source-row order. An
 * unresolved course deliberately receives no canonical section number; the
 * original printed value remains available separately as sourceSectionText.
 */
export function assignAuthoritySections<T extends { AdCourseId?: unknown; SCode?: unknown; sourceOrder?: unknown }>(input: readonly T[]): T[] {
  const rows = input.map(row => ({ ...row })) as T[];
  const ordered = rows.map((row, index) => {
    const numericOrder = Number(row.sourceOrder);
    return { row, index, order: Number.isFinite(numericOrder) ? numericOrder : index };
  }).sort((a, b) => a.order - b.order || a.index - b.index);

  const nextByCourse = new Map<number, number>();
  for (const item of ordered) {
    const courseId = Number(item.row.AdCourseId || 0);
    if (!Number.isFinite(courseId) || courseId <= 0) {
      item.row.SCode = "";
      continue;
    }
    const next = (nextByCourse.get(courseId) || 500) + 1;
    nextByCourse.set(courseId, next);
    item.row.SCode = String(next);
  }
  return rows;
}
