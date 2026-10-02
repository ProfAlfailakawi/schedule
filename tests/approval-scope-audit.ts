/**
 * مراجعةُ الاعتماد مربوطةٌ بالكلية والقسم المختارين وحدهما — سلوكاً لا نصّاً.
 *
 * - عائلةُ القسم (الدراسات الإسلامية في ثلاث كليات) تجمع المنتدَبين، لكنّ
 *   صفوفَ الاعتماد وسجلَّه لكل قسمٍ في كليته وحده (الصندوق التجريبي).
 * - صفٌّ من قسمٍ شقيق لا يدخل المراجعة ولو وصل في القائمة (rowsInApprovalScope).
 * - جوابٌ وصل لنطاقٍ سابق أو بعد قراءةٍ أحدث يُرمى (createScopeGuard).
 * - وثيقةُ الهيئة المحفوظة عند موقعٍ شقيق لا تصير أساساً لقسمٍ لا صفوفَ له فيها.
 * - المقارنةُ تُظهر المضاف والمعدَّل والمحذوف، وأساسُ الوثيقة اسمُه «منذ الجدول المعتمد».
 */
import { Repository } from "../src/db/repository";
import { departmentFamily } from "../src/utils/sectionLabel";
import { diffSchedules } from "../src/utils/scheduleDiff";
import {
  approvalScopeKey, authorityBaselineLabel, AUTHORITY_BASELINE_LABEL, authorityRowsForScope,
  createScopeGuard, rowsInApprovalScope,
} from "../src/utils/approvalScope";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

/* ── الحارس ─────────────────────────────────────────────────────────── */
{
  const guard = createScopeGuard();
  const a = approvalScopeKey({ collegeId: 1, sectionId: 10, termId: 5 });
  const b = approvalScopeKey({ collegeId: 2, sectionId: 20, termId: 5 });
  check(a !== b, "مفتاح النطاق يفرّق قسمين شقيقين في كليتين");
  guard.setScope(a);
  const first = guard.begin(a);
  check(guard.accepts(first), "قراءةُ النطاق المعروض تُقبل");
  guard.setScope(b);
  check(!guard.accepts(first), "تبدّل القسم: جوابُ القسم السابق يُرمى ولو وصل متأخراً");
  const older = guard.begin(b), newer = guard.begin(b);
  check(!guard.accepts(older) && guard.accepts(newer), "قراءتان للنطاق نفسه: الأحدث وحدها تُقبل");
  guard.setScope(b);
  check(guard.accepts(newer), "إعادةُ ضبط النطاق نفسه لا تُبطل قراءته");
}

/* ── وثيقة الهيئة عند موقعٍ شقيق ───────────────────────────────────────── */
{
  const rows = [{ id: 1 }, { id: 2 }];
  const draft = { AdCollegeId: 2, AdSectionId: 20 };
  const siblingOnly = { groups: [{ scope: { collegeId: 2, sectionId: 20, isBase: true }, rows }], unplaced: [] };
  check(authorityRowsForScope(rows, siblingOnly, draft, 1, 10).length === 0, "وثيقةُ الموقع الشقيق بصفوفه وحده لا تصير أساس قسمٍ آخر");
  check(authorityRowsForScope(rows, siblingOnly, draft, 2, 20).length === 2, "وتبقى أساسَ قسمها");
  const mixed = { groups: [
    { scope: { collegeId: 2, sectionId: 20, isBase: true }, rows: [rows[0]] },
    { scope: { collegeId: 1, sectionId: 10 }, rows: [rows[1]] },
  ], unplaced: [{ rows: [{ id: 3 }] }] };
  check(JSON.stringify(authorityRowsForScope(mixed.groups.flatMap(g => g.rows), mixed, draft, 1, 10)) === JSON.stringify([{ id: 2 }]), "وثيقةٌ لموقعين: لكل قسمٍ صفوفُه، وغيرُ المعروف لموضع الاستيراد");
  check(authorityRowsForScope([{ id: 9 }], { groups: [], unplaced: [] }, draft, 1, 10).length === 0, "وثيقةٌ لا موقعَ لصفوفها لا تُعار لقسمٍ آخر");
}

/* ── المقارنة وأساسها ───────────────────────────────────────────────── */
{
  const base = [
    { id: 1, AdCourseId: 1, SCode: "1", fstarttime: "08:00", fendtime: "09:00", fsunday: true, AdInstructorId: 1 },
    { id: 2, AdCourseId: 2, SCode: "1", fstarttime: "10:00", fendtime: "11:00", fmonday: true, AdInstructorId: 1 },
    { id: 3, AdCourseId: 3, SCode: "1", fstarttime: "12:00", fendtime: "13:00", ftuesday: true, AdInstructorId: 2 },
  ] as any[];
  const live = [base[0], { ...base[1], fstarttime: "11:00", fendtime: "12:00" }, { id: 4, AdCourseId: 4, SCode: "2", fstarttime: "08:00", fendtime: "09:00", fthursday: true, AdInstructorId: 2 }] as any[];
  const diff = diffSchedules(base, live);
  check(diff.counts.added === 1 && diff.counts.changed === 1 && diff.counts.removed === 1 && diff.counts.unchanged === 1,
    `الفرق الحقيقي: مضاف ١ ومعدَّل ١ ومحذوف ١ وثابت ١ (${JSON.stringify(diff.counts)})`);
  check(diffSchedules(live, live).entries.length === 0, "جدولٌ لم يتحرّك لا فرقَ فيه");
  check(AUTHORITY_BASELINE_LABEL === "منذ الجدول المعتمد", "اسمُ الأساس «منذ الجدول المعتمد» بلفظه");
  const line = authorityBaselineLabel({ sourceFileName: "هيئة-٢٠٢٦.pdf", importedAt: "2026-09-01T10:00:00Z", publishedAt: "2026-09-03T08:00:00Z" });
  check(line.startsWith("منذ الجدول المعتمد") && line.includes("هيئة-٢٠٢٦.pdf") && line.includes("2026-09-03") && line.includes("اعتُمدت"), `مصدر المقارنة معلن: ${line}`);
  check(authorityBaselineLabel({ sourceFileName: "x.pdf", importedAt: "2026-09-01" }).includes("استُوردت 2026-09-01"), "وثيقةٌ لم تُنشر تُذكر بتاريخ استيرادها");
}

/* ── الصندوق التجريبي: العائلة لا تتسرّب إلى الاعتماد ──────────────────── */
async function behaviour() {
  const id = `demo_approval_scope_${Date.now()}`;
  Repository.createDemoSandbox(id, 60_000);
  await Repository.withDemoSandbox(id, async () => {
    const sections = await Repository.getSections();
    const isl = sections.filter(s => String(s.AdSectionCode) === "ISL");
    check(isl.length === 3, "قسم الدراسات الإسلامية في الكليات الثلاث");
    const [a, b] = isl.map(s => ({ collegeId: Number(s.AdCollegeId), sectionId: Number(s.AdSectionId) }));
    check(departmentFamily(sections as any, a.collegeId, a.sectionId).length === 3, "والعائلة تجمعها للمنتدَبين");
    const termId = 1;
    const courses = await Repository.getCourses();
    const courseOf = (sectionId: number) => courses.find(c => Number(c.AdSectionId) === sectionId);
    const ca = courseOf(a.sectionId), cb = courseOf(b.sectionId);
    check(Boolean(ca && cb), "لكل قسمٍ شقيق مقرّرٌ في الصندوق");
    if (!ca || !cb) return;
    const mk = (course: any) => ({ AdCourseId: course.AdCourseId, AdTermId: termId, SCode: "77", fstarttime: "08:00", fendtime: "09:00", fsunday: true, AdInstructorId: 0 } as any);
    const rowA = await Repository.createSchedule(mk(ca));
    const rowB = await Repository.createSchedule(mk(cb));
    const scopeA = await Repository.getSchedulesByScope({ ...a, termId });
    const scopeB = await Repository.getSchedulesByScope({ ...b, termId });
    check(scopeA.some(r => Number(r.id) === Number(rowA.id)) && !scopeA.some(r => Number(r.id) === Number(rowB.id)), "صفوفُ اعتماد القسم من كليته وحدها، لا من أخته");
    check(scopeB.some(r => Number(r.id) === Number(rowB.id)) && !scopeB.some(r => Number(r.id) === Number(rowA.id)), "وكذلك العكس");
    check(scopeA.every(r => Number((r as any).AdCollegeId) === a.collegeId && Number((r as any).AdSectionId) === a.sectionId), "كلُّ صفٍّ يحمل كليته وقسمه");
    const union = [...scopeA, ...scopeB];
    const filtered = rowsInApprovalScope(union as any[], { ...a, termId });
    check(filtered.length === scopeA.length && !filtered.some(r => Number(r.id) === Number(rowB.id)), "المراجعة تُسقط صفَّ القسم الشقيق لو وصل في القائمة");
    const approvalA = await Repository.getScheduleApproval(a.collegeId, a.sectionId, termId);
    const approvalB = await Repository.getScheduleApproval(b.collegeId, b.sectionId, termId);
    check(!approvalA || approvalA.scopeKey === `${a.collegeId}:${a.sectionId}:${termId}`, "سجلُّ الاعتماد يُقرأ بمفتاح نطاقه");
    check(!approvalA || !approvalB || approvalA.scopeKey !== approvalB.scopeKey, "ولا يُشارك القسمُ الشقيق سجلَّه");
  });
}

behaviour().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}).catch(error => { console.error(error); process.exit(1); });
