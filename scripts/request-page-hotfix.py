from pathlib import Path

server_path = Path("server.ts")
text = server_path.read_text()
start_marker = "async function instructorRequestCourseOptions(request: InstructorRequest): Promise<InstructorRequestCourseOption[]> {"
start = text.index(start_marker)
build = text.index("async function buildRequestContext(request: InstructorRequest)", start)
comment = text.rfind("\n/**", start, build)
if comment <= start:
    raise SystemExit("could not locate end of instructorRequestCourseOptions")

replacement = '''async function instructorRequestCourseOptions(request: InstructorRequest): Promise<InstructorRequestCourseOption[]> {
  const scopes = await instructorRequestDepartmentScopes(request);
  const groups = await Promise.all(scopes.map(async scope => {
    /* Opening the professor request must stay cheap. The operational catalogue
     * is already the source of truth for additions; rebuilding historical
     * authority baselines for every sibling college made the public page wait
     * on heavyweight history reads before it could paint. */
    const catalogue = await instructorRequestSectionCourses(scope.sectionId);
    return (catalogue as any[]).map(row => ({
      id: Number(row.AdCourseId || 0),
      name: String(row.CourseName || row.AdCourseName || "").trim(),
      code: String(row.CourseCode || row.AdCourseCode || "").trim(),
      collegeId: scope.collegeId,
      collegeName: scope.collegeName,
      sectionId: scope.sectionId,
    })).filter(option => option.id && option.name);
  }));
  const options = new Map<string, InstructorRequestCourseOption>();
  groups.flat().forEach(option => options.set(`${option.collegeId}:${option.sectionId}:${option.id}`, option));
  return [...options.values()].sort((a, b) =>
    a.collegeId === b.collegeId
      ? courseNameCollator.compare(a.name, b.name)
      : arabicUiCollator.compare(a.collegeName, b.collegeName));
}
'''
server_path.write_text(text[:start] + replacement + text[comment:])

audit_path = Path("tests/instructor-request-cross-college-audit.ts")
audit = audit_path.read_text()
guard = '''
const courseOptionBlock = server.slice(
  server.indexOf("async function instructorRequestCourseOptions"),
  server.indexOf("async function buildRequestContext", server.indexOf("async function instructorRequestCourseOptions")),
);
check(!courseOptionBlock.includes("authorityDraftForScope") && !courseOptionBlock.includes("authorityBaselineForScope"),
  "فتح رابط الأستاذ لا يعيد بناء تاريخ الجداول لكل كلية قبل عرض الصفحة");
check(courseOptionBlock.includes("instructorRequestSectionCourses(scope.sectionId)"),
  "خيارات الإضافة تأتي مباشرة من الكتالوج التشغيلي لكل كلية");
'''
if guard.strip() not in audit:
    needle = "\nconsole.log(`\\nCross-college instructor request audit:"
    pos = audit.index(needle)
    audit_path.write_text(audit[:pos] + guard + audit[pos:])
