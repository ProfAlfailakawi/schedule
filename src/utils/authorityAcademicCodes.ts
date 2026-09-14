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

  /* كلية التربية الأساسية (01) هي المسار الذهبي القائم — بنات وبنين — فلا
     نعيد تفسير أي كود كامل فيها. هذا يحافظ حرفياً على السلوك الذي يعمل الآن. */
  if (college === "01") {
    if (section.length >= 4 && section.startsWith(college)) return section;
    if (section.length <= 2) return `${college}${section.padStart(2, "0")}`;
    return section;
  }

  /* في الكليات الأخرى قد يحتفظ كتالوج النظام بهوية القسم المشتركة كما أُنشئت
     أصلاً تحت كلية أخرى (مثال: 0101 للتربية الإسلامية)، بينما SWRSCHA يطبع
     هوية الوثيقة بحسب كلية التقرير نفسها: 02 + 01 => 0201، 04 + 01 => 0401.
     أول رقمين ملك للكلية، وآخر رقمين هما القسم العلمي المحلي؛ لذلك نعيد ربط
     الكود ذي الأربع خانات بالكلية المختارة فقط، من دون تغيير هوية القسم المحلية.
     هذا لا يوسّع المطابقة بين الأقسام: 0201 لا يمكن أن يطابق 0202. */
  if (college.length === 2 && section.length === 4) {
    return section.startsWith(college) ? section : `${college}${section.slice(-2)}`;
  }

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

/** Normalize a section value exactly as printed by SWRSCHA.
 *
 * Section numbering is not globally fixed. Older reports may print 501/502…
 * (and may legitimately skip a number), while newer reports can print 01/02…
 * or even 1 without a leading zero. The section cell is therefore source
 * identity, not a value that may be regenerated from row order.
 */
export function normalizeAuthoritySectionCode(value: unknown): string {
  const raw = String(value ?? "")
    .normalize("NFKC")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();
  if (!/^\d{1,4}$/.test(raw)) return "";
  if (Number(raw) <= 0) return "";
  return raw;
}

export function authoritySectionCodeLooksPlausible(value: unknown): boolean {
  return Boolean(normalizeAuthoritySectionCode(value));
}

/**
 * Source-preserving Authority section assignment.
 *
 * The PDF section cell wins whenever it is readable. This intentionally keeps
 * leading zeroes and real gaps (01, 02, 04 / 501, 502, 510). Missing section
 * evidence is never invented from row order.
 *
 * Migration rule: sourceSectionText outranks any value that an older build may
 * have generated. This repairs already-saved previews such as printed `01`
 * becoming `501`, while leaving the proven girls flow untouched because its
 * printed 5xx source value is already the same value users see. If an old row
 * has no source cell at all, its stored SCode is preserved rather than guessed.
 */
export function assignAuthoritySections<T extends {
  AdCourseId?: unknown;
  SCode?: unknown;
  sourceOrder?: unknown;
  sourceSectionText?: unknown;
  importEvidence?: { section?: { method?: unknown } } | unknown;
}>(input: readonly T[]): T[] {
  return input.map(original => {
    const row = { ...original } as T;
    const source = normalizeAuthoritySectionCode((row as any).sourceSectionText);
    const current = normalizeAuthoritySectionCode((row as any).SCode);
    (row as any).SCode = source || current || "";
    return row;
  });
}
