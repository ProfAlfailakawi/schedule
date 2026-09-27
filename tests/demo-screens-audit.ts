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
  createDemoSandboxState, DEMO_ROLE_ACCOUNTS, DEMO_MULTI_SITE, DEMO_MATH, DEMO_CS_VISITING_INSTRUCTOR_ID, DEMO_PREVIOUS_TERM_ID,
} from "../src/db/demoSandbox";
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
for (const account of [...DEMO_ROLE_ACCOUNTS, { role: DEMO_MULTI_SITE.role, label: DEMO_MULTI_SITE.label, SystemUserId: DEMO_MULTI_SITE.id }]) {
  const rows = current.filter(inScope(account.SystemUserId));
  check(rows.length > 0, `«${account.label}» يرى مواعيدَ في نطاقه (${rows.length})`);
}

/* ── 2: العميدان يقرآن النهائيَّ وحده — ويجدان قسماً معتمداً في كليتهما ──── */
const approvalOf = (collegeId: number, sectionId: number) =>
  state.scheduleApprovals.find((a: any) => a.AdCollegeId === collegeId && a.AdSectionId === sectionId && a.AdTermId === 1);
for (const role of ["dean", "viceDean"] as const) {
  const account = DEMO_ROLE_ACCOUNTS.find(a => a.role === role)!;
  const scoped = current.filter(inScope(account.SystemUserId));
  const finalRows = scoped.filter(row => finalSourceFor(approvalOf(Number(row.AdCollegeId), Number(row.AdSectionId)) as any, false).kind === "live");
  check(finalRows.length >= 6, `«${account.label}»: جدولٌ معتمد في كليته يملأ اللوحة والميزان والعدسات (${countOf(finalRows.length, AR.appointment)})`);
  const days = new Set(finalRows.flatMap(row => ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].filter(day => (row as any)[day])));
  check(days.size === 5, `«${account.label}»: والمعتمدُ يغطّي أيام الدراسة الخمسة (الأحد–الخميس) — فلا «0 محاضرات اليوم» في يومٍ دراسي`);
}
const math = approvalOf(1, DEMO_MATH.section.AdSectionId) as any;
check(math?.status === "accepted" && math.signatures.length === 2 && math.rounds[0]?.acceptedAt, "قسم الرياضيات معتمدٌ بتوقيعين وجولةٍ قُبلت");
const opts = { placeholderInstructorIds: placeholderInstructorIds(state.instructors) };
const mathRows = current.filter(row => row.AdSectionId === DEMO_MATH.section.AdSectionId);
check(approvalBlockerCount(mathRows as any, state.schedules as any, opts) === 0, "والمعتمدُ بلا مانع اعتماد");
check(mathRows.every(row => state.instructors.some(p => p.AdInstructorId === row.AdInstructorId)), "وكلُّ أستاذٍ فيه في سجلّ الأساتذة");
check(state.schedules.some(row => row.AdTermId === DEMO_PREVIOUS_TERM_ID && row.AdSectionId === DEMO_MATH.section.AdSectionId), "وله تاريخٌ في الفصل السابق");

/* ── 3: عدسةُ المنتدبين: في الدليل، وفي سجلّ الفصل، ويدرّس فعلاً ─────────── */
for (const [sectionId, instructorId] of [[1, DEMO_CS_VISITING_INSTRUCTOR_ID], [DEMO_MATH.section.AdSectionId, DEMO_MATH.visitingInstructorId]] as const) {
  const directory = state.departmentDelegates.find((d: any) => d.scopeKey === `1:${sectionId}`);
  check(Boolean(directory?.instructorIds.includes(instructorId)), `القسم ${sectionId}: المنتدب في دليل القسم`);
  for (const termId of [1, DEMO_PREVIOUS_TERM_ID]) {
    const roster = state.visitingRosters.find((r: any) => r.scopeKey === `1:${sectionId}:${termId}`);
    const teaches = state.schedules.some(row => row.AdTermId === termId && row.AdSectionId === sectionId && row.AdInstructorId === instructorId);
    check(Boolean(roster?.instructorIds.includes(instructorId)) && teaches, `القسم ${sectionId} · الفصل ${termId}: منتدبٌ في السجلّ ويدرّس شعبةً فيه`);
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

/* ── 5: كشفُ التسجيل لحساب المواقع الثلاثة ─────────────────────────────────── */
const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const seed = server.slice(server.indexOf("async function seedDemoStories("), server.indexOf("\n}\n", server.indexOf("async function seedDemoStories(")));
check(seed.includes('String(row.AdSectionCode) === "ISL"') && seed.includes("surveyLinkId: islSurvey.id"),
  "حسابُ المواقع الثلاثة يجد طلبَ طالبٍ في «كشف التسجيل»");

/* ── 6: لا تسرّب: البذرُ كلُّه في الصندوق ─────────────────────────────────── */
check(roleDefinition("dean").readOnly && seed.includes("if (!Repository.isDemoRequest()) return;"), "البذرُ لا يعمل خارج الصندوق التجريبي");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
