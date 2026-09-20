/**
 * ── تدقيق كشف التسجيل ───────────────────────────────────────────────────────
 *
 * هذا الكشفُ هو الوصلةُ بين ثلاثة أطراف لم تكن موصولة: القسمُ يجمع الرغبات،
 * والتسجيلُ يقرّر، والطالبُ يقرأ. وأعطالُه كلُّها من نوعٍ واحد — لا تُكتشف
 * بالنظر إلى الشاشة، لأن كلَّ شيءٍ فيها يبدو صحيحاً:
 *
 *   - رقمُ حالةٍ يتغيّر تحت يد صاحبه فيبحث به الموظّفُ ولا يجده.
 *   - قرارُ تسجيلٍ يُمحى لأن الطالبَ أضاف مقرّراً.
 *   - ردٌّ بلا سبب، فيعود الطالبُ إلى المكتب ليسأل «ليش؟» — وهو ما بُني هذا
 *     كلُّه ليُغنيَ عنه.
 *   - أو كشفُ قسمٍ يقرؤه من ليس من أهله.
 */

import fs from "fs";
import path from "path";
import { caseRefFor, caseRefOf } from "../src/db/repository";
import { APPROVAL_WRITE_PREFIXES, roleWriteDecision } from "../src/server/roleGuard";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const repo = fs.readFileSync(path.join(process.cwd(), "src/db/repository.ts"), "utf8");
const types = fs.readFileSync(path.join(process.cwd(), "src/types.ts"), "utf8");
const screen = fs.readFileSync(path.join(process.cwd(), "src/components/StudentRegistration.tsx"), "utf8");

/* ── رقمُ الحالة ────────────────────────────────────────────────────────── */

check(caseRefOf("2ef0d7ca-1111-2222-3333-444444444444") === "2EF0D7CA", "الرقم ثمانيةُ أحرفٍ كبيرةٍ من المعرّف");
check(caseRefFor({ id: "abcdef12-0000" }) === "ABCDEF12", "وسجلٌّ بلا رقمٍ محفوظ يُشتقّ رقمُه كما أُعطي لصاحبه");
/* وهو الموضعُ الذي كان يكسر السلسلة: إعادةُ الإرسال تستبدل السجلّ، فيتغيّر
   الرقمُ الذي طُلب من الطالب أن يحفظه، ويبحث به الموظّفُ فلا يجده. */
check(caseRefFor({ id: "ffffffff-9999", caseRef: "1B86022D" }) === "1B86022D",
  "والرقمُ المحفوظ يعلو المشتقّ، فلا يتغيّر تحت يد صاحبه");
check(types.includes("caseRef?: string"), "وللرقم حقلٌ ثابتٌ في السجلّ");
check(repo.includes("row.caseRef = row.caseRef || replaced.map(item => item.caseRef).find(Boolean) || caseRefOf(row.id)"),
  "ويُورَّث عند الاستبدال في المخزن البعيد");
check(repo.includes("row.caseRef = row.caseRef || replacedLocal.map(item => item.caseRef).find(Boolean) || caseRefOf(row.id)"),
  "وفي المحلّي كذلك، فلا يفترق المخزنان");

/* اشتقاقٌ واحدٌ يقرؤه كلُّ من يعرض الرقم: لو اشتقّه كلٌّ بطريقته لاختلفوا
   يوماً، ووقف الطالبُ أمام الموظّف برقمٍ ليس في كشفه. */
check((server.match(/caseRefFor\(/g) || []).length >= 3,
  "وثلاثةُ مواضعَ تعرضه: الإرسال، وصفحةُ الطالب، وكشفُ التسجيل");
check(!/slice\(0,\s*8\)\.toUpperCase\(\)/.test(server),
  "ولا اشتقاقَ ثانيَ في الخادم يمكن أن يفترق عن الأول");

/* ── ما قاله التسجيل لا يمحوه الطالب ───────────────────────────────────── */

check(repo.includes("const carry = (prior: StudentNeed[]): StudentCourseState[] | undefined"),
  "حالاتُ المقرّرات تُنقل إلى السجلّ الجديد عند إعادة الإرسال");
check(repo.includes("wanted.has(Number(state.courseId))"),
  "ولا يُنقل منها إلا ما يخصّ مقرّراً ما زال مطلوباً");
check(repo.includes("if (!at || String(state.at) > String(at.at)) newest.set"),
  "وأحدثُ قولٍ في المقرّر هو قولُه");
check(repo.includes("setStudentCourseState"), "والكتابةُ الموضعيّة لا تستبدل السجلّ كلَّه");
check(repo.includes("(current.courseStates || []).filter(state => Number(state.courseId) !== Number(next.courseId))"),
  "والحالةُ تُستبدل ولا تُكدَّس، فلا يقول سجلٌّ «سُجّل» و«رُدّ» معاً");

/* ── الردُّ بسبب ───────────────────────────────────────────────────────── */

check(server.includes("اختر سبب الردّ."), "الردُّ بلا سببٍ مرفوض");
check(server.includes("STUDENT_REJECT_REASONS"), "والأسبابُ قائمةٌ مغلقةٌ تُعدّ عبر الفصول");
check(server.includes("STUDENT_COURSE_STATES"), "والحالاتُ كذلك، فلا تُكتب حالةٌ لا يعرفها أحد");
check(server.includes("هذا المقرّر ليس ضمن طلب الطالب."),
  "ومقرّرٌ ليس في الطلب لا تُكتب له حالةٌ ولو أُرسل رقمُه");

/* ── النطاق والصفة ─────────────────────────────────────────────────────── */

check(server.includes("isScopeAllowed(req, Number(need.AdCollegeId), needSection)"),
  "والنطاقُ يُحرس عند الكتابة أيضاً: المعرّفُ يرسله المتصفّح ولا يُصدَّق لوصوله");
check(server.includes("const canWriteRegistration"), "ومن يكتب معرَّفٌ في موضعٍ واحد");
check(server.includes("هذا الكشف للقراءة بصفتك."), "ومن لا يكتب يُقال له ذلك، لا يُترك يضغط بلا أثر");

/* صفةُ التسجيل `readOnly`، وكتابتُها هنا عملُها لا استثناءٌ لها. */
check(APPROVAL_WRITE_PREFIXES.includes("/student-registration" as any),
  "ومسارُ الكشف من مسارات الأقوال التي تكتبها صفاتُ القراءة");
const write = (role: string, path: string) =>
  roleWriteDecision({ method: "POST", path, authenticated: true, powerUser: false, role });
check(write("registrarStaff", "/student-registration/abc/course-state").allowed,
  "فموظّفُ التسجيل يكتب فيه");
check(write("committeeChair", "/student-registration/abc/course-state").allowed,
  "ومن يبني الجدول كذلك");
/* وصفةُ العرض الصرف تبقى قارئةً، حتى في هذه المسارات. */
check(!write("registrarDean", "/student-registration/abc/course-state").allowed,
  "وعميدُ التسجيل يقرأ ولا يكتب");
check(!write("dean", "/student-registration/abc/course-state").allowed, "والعميدُ كذلك");
check(!write("registrarStaff", "/schedules/5").allowed,
  "ولم تُفتح الكتابةُ على الجدول لصفةِ القراءة بحجّة هذا المسار");

/* ── لا يُدّعى مقعد ────────────────────────────────────────────────────── */

check(types.includes("النظام لا يملك مقاعد ولا يدّعي امتلاكها"),
  "ومكتوبٌ في النموذج أن النظام لا يملك مقاعد ولا يدّعي امتلاكها");
check(screen.includes("ولا تعرض جدولاً ولا شعبة"), "والشاشةُ لا تعرض جدولاً ولا شعبة");
const registrationRoute = server.slice(
  server.indexOf('app.post("/api/student-registration/:id/course-state"'),
  server.indexOf("/** The department's tray."),
);
check(registrationRoute.length > 200, "مسارُ الكتابة مقروءٌ للتدقيق");
check(!/Repository\.(createSchedule|updateSchedule|deleteSchedule)/.test(registrationRoute),
  "ولا يكتب في جدولٍ أبداً");

/* ── الطالب يرى ────────────────────────────────────────────────────────── */

check(server.includes('state: state?.state || ""'), "وحالةُ المقرّر تصل صفحةَ الطالب");
/* «لم يُقل فيه شيء» ليس «بانتظار التسجيل»: الانتظارُ قولٌ يقوله القسمُ حين
   يسلّم، لا حالةٌ تُفترض على من لم يُسلَّم بعد. */
check(server.includes("ولا يُسمّى «بانتظار التسجيل»"), "وما لم يُقل فيه شيءٌ لا يُسمّى انتظاراً");
check(screen.includes('"لم يُقل فيه شيء بعد"'), "والكشفُ يفرّق بينهما كذلك");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
