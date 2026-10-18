/**
 * ── كلُّ صفةٍ في البيئة التجريبية تفتح على بيانات ────────────────────────────
 *
 * جولةٌ حيّة على «تجربة النظام» بكل صفة وكل عدسة وجدت العميدَ ومساعدَه يفتحان
 * لوحتهما على «0 محاضرات» وميزاناً بلا رقم وعدسةَ «لا جدول معتمد بعد» في كل
 * تبويب: هما يقرآن النهائيَّ وحده، وأقسامُ كليتهما كلُّها في دورة الاعتماد.
 * ووجدت شاشةَ «السجل» على سطرٍ واحد، وعدسةَ «المنتدبون» فارغةً لكل صفة.
 *
 * هذا التدقيق يثبت أن لكل صفةٍ ما تقرؤه — بالقاعدة نفسها التي يقرأ بها الخادم.
 */

import fs from "fs";
import path from "path";
import {
  createDemoSandboxState, DEMO_ROLE_ACCOUNTS, DEMO_VISITING_INSTRUCTOR_IDS,
  DEMO_REGULATION_SECTION_ID, DEMO_REGULATION_RUN_INSTRUCTOR_ID,
} from "../src/db/demoSandbox";
import { reviewSchedule } from "../src/utils/scheduleRegulations";
import { roleDefinition } from "../src/utils/academicRoles";
import { AR, countOf } from "../src/utils/arabicCount";
import { finalSourceFor } from "../src/utils/finality";
import { approvalBlockerCount, placeholderInstructorIds } from "../src/utils/scheduleBlockers";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const state = createDemoSandboxState();
const current = state.schedules.filter(row => Number(row.AdTermId) === 1);
const assignsOf = (userId: number) => state.collegeUserAssign.filter(row => row.SystemUserId === userId);
const inScope = (userId: number) => {
  const assigns = assignsOf(userId);
  return (row: any) => assigns.some(a => a.AdCollegeId === Number(row.AdCollegeId) && (Number(a.AdSectionId) === 0 || a.AdSectionId === Number(row.AdSectionId)));
};

/* ── 1: كلُّ صفةٍ ترى مواعيدَ الفصل الجاري في نطاقها ─────────────────────── */
for (const account of DEMO_ROLE_ACCOUNTS) {
  const rows = current.filter(inScope(account.SystemUserId));
  check(rows.length > 0, `«${account.label}» يرى مواعيدَ في نطاقه (${rows.length})`);
}

/* ── 2: العميدان يقرآن النهائيَّ وحده: النسخةَ المقبولة من الفصل الأول رغم إرجاعه بعد القبول ──── */
const approvalOf = (collegeId: number, sectionId: number, termId = 1) =>
  state.scheduleApprovals.find((a: any) => a.AdCollegeId === collegeId && a.AdSectionId === sectionId && a.AdTermId === termId);
const opts = { placeholderInstructorIds: placeholderInstructorIds(state.instructors) };
for (const role of ["dean", "viceDean"] as const) {
  const account = DEMO_ROLE_ACCOUNTS.find(a => a.role === role)!;
  const source = finalSourceFor(approvalOf(1, 1) as any, false);
  const version = source.kind === "version" ? (state.scheduleVersions as any[]).find(v => v.id === source.versionId) : null;
  const finalRows = (version?.rows || []) as any[];
  check(source.kind === "version" && finalRows.length >= 6, `«${account.label}»: نسخةٌ مقبولة في كليته تملأ اللوحة والميزان والعدسات (${countOf(finalRows.length, AR.appointment)})`);
  const days = new Set(finalRows.flatMap(row => ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].filter(day => row[day])));
  check(days.size === 5, `«${account.label}»: والمقبولُ يغطّي أيام الدراسة الخمسة (الأحد–الخميس) — فلا «0 محاضرات اليوم» في يومٍ دراسي`);
  check(approvalBlockerCount(finalRows, state.schedules as any, opts) === 0, `«${account.label}»: والمقبولُ بلا مانع اعتماد`);
  check(source.kind === "version" && (approvalOf(1, 1) as any).status === "returned", `«${account.label}»: يقرأ النسخة المقبولة لا الحيّة المُرجَعة`);
}
const first = approvalOf(1, 1) as any;
check(first?.status === "returned" && first.signatures.length === 2 && first.rounds.some((r: any) => r.acceptedAt) && first.rounds.some((r: any) => r.amendment),
  "الفصل الأول قُبل بتوقيعين ثم أُرجع في جولة تعديل");
check(state.schedules.filter(row => row.AdTermId === 1).every(row => state.instructors.some(p => p.AdInstructorId === row.AdInstructorId)), "وكلُّ أستاذٍ فيه في سجلّ الأساتذة");

/* ── 3: عدسةُ المنتدبين: في الدليل، وفي سجلّ الفصل، ويدرّسون فعلاً ─────────── */
{
  const directory = state.departmentDelegates.find((d: any) => d.scopeKey === "1:1");
  for (const instructorId of DEMO_VISITING_INSTRUCTOR_IDS) {
    check(Boolean(directory?.instructorIds.includes(instructorId)), `المنتدب ${instructorId}: في دليل القسم`);
    const termId = 1;
    const roster = state.visitingRosters.find((r: any) => r.scopeKey === `1:1:${termId}`);
    const teaches = state.schedules.some(row => row.AdTermId === termId && row.AdSectionId === 1 && row.AdInstructorId === instructorId);
    check(Boolean(roster?.instructorIds.includes(instructorId)) && teaches, `المنتدب ${instructorId} · الفصل ${termId}: في السجلّ ويدرّس شعبةً فيه`);
  }
}

/* ── 4: سجلُّ العمليات يحكي الدورة ─────────────────────────────────────────── */
const audit = state.auditLogs as any[];
check(audit.length >= 8, `سجلُّ العمليات مبذور (${audit.length})`);
check(audit.every(entry => entry.id && entry.timestamp && entry.userName && entry.action && entry.path.startsWith("/api/") && entry.entity),
  "كلُّ عمليةٍ بالشكل الذي يكتبه الخادم");
check(audit.every(entry => state.users.some(u => u.SystemUserId === entry.SystemUserId)), "وكلُّ فاعلٍ حسابٌ من حسابات الصندوق");
check(audit.every((entry, i) => i === 0 || audit[i - 1].timestamp >= entry.timestamp), "مرتّبةٌ من الأحدث");
check(audit.some(e => e.status === 403) && audit.some(e => e.action === "تسجيل دخول") && audit.some(e => /اعتماد جدول/.test(e.changes || "")),
  "وفيها اعتمادٌ ودخولٌ ومحاولةٌ مرفوضة");
check(audit.every(e => Date.parse(e.timestamp) <= Date.now()), "ولا عمليةَ في المستقبل");

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const seed = server.slice(server.indexOf("async function seedDemoStories("), server.indexOf("\n}\n", server.indexOf("async function seedDemoStories(")));

/* ── 6: لا تسرّب: البذرُ كلُّه في الصندوق ─────────────────────────────────── */
check(roleDefinition("dean").readOnly && seed.includes("if (!Repository.isDemoRequest()) return;"), "البذرُ لا يعمل خارج الصندوق التجريبي");

/* ── 7: شاشةُ الاعتماد تُري المخالفة: قسمٌ عند التسجيل بمخالفتين لائحيتين مقصودتين ── */
{
  const reg = approvalOf(1, DEMO_REGULATION_SECTION_ID, 1) as any;
  const regRows = state.schedules.filter(row => row.AdTermId === 1 && row.AdCollegeId === 1 && row.AdSectionId === DEMO_REGULATION_SECTION_ID);
  const findings = reviewSchedule({
    rows: regRows as any,
    courses: new Map(state.courses.map(row => [Number(row.AdCourseId), row])),
    instructors: new Map(state.instructors.map(row => [Number(row.AdInstructorId), row])),
  });
  const rules = new Set(findings.map(item => item.rule));
  check(reg?.status === "returned", "الفصل ذو المخالفات مُرجَعٌ — تُرى ملاحظاتُ اللائحة في عمل اللجنة");
  check(rules.has("consecutive-sections") && rules.has("sections-same-hour"), `مخالفتا م.6/3 و م.7/5 تظهران في مراجعة اللائحة (${[...rules].join("، ")})`);
  check(findings.filter(item => item.approvalEffect !== "block").length >= 2, "ومراجعةُ اللائحة تكشف المخالفتين المقصودتين («وقّع مع علمه بـ…»)");
  check(approvalBlockerCount(regRows as any, state.schedules as any, opts) <= 2, "والمخالفاتُ مراجعةٌ لا مانع: لا مانعَ سوى التعارضين المقصودين");
  const run = regRows.filter(row => row.AdInstructorId === DEMO_REGULATION_RUN_INSTRUCTOR_ID && row.fthursday);
  check(run.length === 4 && run.every(row => String(row.fdetail).includes("حالة تجريبية مقصودة")), "كلُّ صفٍّ مخالفٍ مشروحٌ في ملاحظته بأنه مقصود");
  
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
