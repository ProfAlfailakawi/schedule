from pathlib import Path

path = Path('tests/instructor-request-server-audit.ts')
text = path.read_text()
old = '''check(server.includes("async function instructorRequestCourseOptions")
  && server.includes("authorityDraftForScope(scope.collegeId, scope.sectionId")
  && server.includes("authorityDraft.baselineRows || []")
  && server.includes("(baseline as any[]).forEach"),
  "وقائمة الإضافة تُستخرج كاملةً من الجدول الأصلي المعتمد، لا مما نُسخ إلى جدول العمل");'''
new = '''const requestCourseOptionsSource = server.slice(
  server.indexOf("async function instructorRequestCourseOptions"),
  server.indexOf("async function buildRequestContext", server.indexOf("async function instructorRequestCourseOptions")),
);
check(requestCourseOptionsSource.includes("instructorRequestSectionCourses(scope.sectionId)")
  && !requestCourseOptionsSource.includes("authorityDraftForScope")
  && !requestCourseOptionsSource.includes("authorityBaselineForScope"),
  "وقائمة الإضافة تأتي كاملةً من الكتالوج التشغيلي لكل كلية بلا إعادة بناء التاريخ عند فتح الرابط");'''
if old not in text:
    if new in text:
        raise SystemExit(0)
    raise SystemExit('stale audit contract not found')
path.write_text(text.replace(old, new))
