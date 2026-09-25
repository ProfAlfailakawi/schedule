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
const inboxScreen = fs.readFileSync(path.join(process.cwd(), "src/components/InstructorInbox.tsx"), "utf8");

/* ── رقمُ الحالة ────────────────────────────────────────────────────────── */

check(caseRefOf("2ef0d7ca-1111-2222-3333-444444444444") === "2EF0D7CA", "الرقم ثمانيةُ أحرفٍ كبيرةٍ من المعرّف");
check(caseRefFor({ id: "abcdef12-0000" }) === "ABCDEF12", "وسجلٌّ بلا رقمٍ محفوظ يُشتقّ رقمُه كما أُعطي لصاحبه");
/* وهو الموضعُ الذي كان يكسر السلسلة: إعادةُ الإرسال تستبدل السجلّ، فيتغيّر
   الرقمُ الذي طُلب من الطالب أن يحفظه، ويبحث به الموظّفُ فلا يجده. */
check(caseRefFor({ id: "ffffffff-9999", caseRef: "1B86022D" }) === "1B86022D",
  "والرقمُ المحفوظ يعلو المشتقّ، فلا يتغيّر تحت يد صاحبه");
check(types.includes("caseRef?: string"), "وللرقم حقلٌ ثابتٌ في السجلّ");
/* إعادةُ الإرسال صارت تحديثاً في المكان (S4): المعرّفُ نفسُه يبقى، فالرقمُ
   لا يتغيّر أصلاً. والدمجُ قاعدةٌ واحدةٌ يمرّ بها المخزنان. */
const merge = fs.readFileSync(path.join(process.cwd(), "src/utils/studentNeedMerge.ts"), "utf8");
check(merge.includes("caseRef: ordered.map(item => item.caseRef).find(Boolean) || caseRefFromId(keep.id)") && merge.includes("id: keep.id"),
  "ويُورَّث عند إعادة الإرسال، والمعرّفُ نفسُه يبقى");
check((repo.match(/mergeStudentResubmission\(/g) || []).length === 2,
  "والمخزنان (البعيد والمحلّي) يمرّان بالدمج نفسه، فلا يفترقان");

/* اشتقاقٌ واحدٌ يقرؤه كلُّ من يعرض الرقم: لو اشتقّه كلٌّ بطريقته لاختلفوا
   يوماً، ووقف الطالبُ أمام الموظّف برقمٍ ليس في كشفه. */
check((server.match(/caseRefFor\(/g) || []).length >= 3,
  "وثلاثةُ مواضعَ تعرضه: الإرسال، وصفحةُ الطالب، وكشفُ التسجيل");
check(!/slice\(0,\s*8\)\.toUpperCase\(\)/.test(server),
  "ولا اشتقاقَ ثانيَ في الخادم يمكن أن يفترق عن الأول");

/* ── ما قاله التسجيل لا يمحوه الطالب ───────────────────────────────────── */

check(merge.includes("export function mergeStudentResubmission("),
  "حالاتُ المقرّرات تبقى في السجلّ نفسه عند إعادة الإرسال");
check(merge.includes("wanted.has(Number(state.courseId))") && merge.includes("droppedByStudent: true"),
  "وما حذفه الطالبُ بعد قرارٍ يبقى معلَّماً، لا يُمحى");
check(merge.includes("if (!at || String(state.at) > String(at.at)) newest.set"),
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

check(server.includes("isScopeAllowed(req, Number(need.AdCollegeId), candidate)"),
  "والنطاقُ يُحرس عند الكتابة أيضاً: المعرّفُ يرسله المتصفّح ولا يُصدَّق لوصوله");
/* السؤالُ يمرّ على كلِّ قسمٍ في الكلية ويقف عند أوّلِ قسمٍ يملك الطلبَ وهو في
   نطاق الحساب — لا على قسمٍ واحدٍ يُختار للطلب سلفاً. و`find` تُعيد ذلك القسمَ
   نفسَه لأن حارسَ التوقيع بعدها يحتاج أن يعرف أيَّ جدولٍ يسأل عنه. */
check(server.includes("const owningSectionsInScope ="),
  "ويُسأل عن كلِّ قسمٍ يملك الطلبَ في نطاق الحساب، لا عن قسمٍ واحدٍ يُختار له");
check(server.includes("if (!owningSectionsInScope.length) {"),
  "ومن لا يملكه أيُّ قسمٍ في نطاقه يُردّ");
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
check(screen.includes('const PENDING_COMMITTEE = "بانتظار اللجنة";')
  && screen.includes("course.settled ? STATE_LABEL[course.state] || course.state : PENDING_COMMITTEE"),
  "والكشفُ يفرّق بينهما كذلك: ما لم يُقل فيه شيءٌ «بانتظار اللجنة»");

/* ── اللجنةُ أولاً، ثم التسجيل ──────────────────────────────────────────── */
check(server.includes("const reachedRegistration = (state: any): boolean =>")
  && server.includes('if (viewer === "registration") return reachedRegistration(states.get(Number(id)));'),
  "والتسجيلُ لا يرى إلا ما وافقت عليه اللجنة وسلّمته");
check(server.includes("لم توافق لجنةُ القسم على هذا المقرّر بعد، فلا يُكتب فيه من جهة التسجيل."),
  "ولا يكتب التسجيلُ في مقرّرٍ لم تسلّمه اللجنة، ولو أُرسل الطلبُ بلا شاشة");
check(server.includes("قرارُ «سُجّل» أو «رُدّ» للتسجيل. اللجنةُ توافق أو لا توافق."),
  "واللجنةُ لا تكتب «سُجّل» ولا «رُدّ» باسم التسجيل");
check(server.includes("قرّر التسجيلُ في هذا المقرّر، فلا يُغيَّر من جهة القسم."),
  "ولا تنقض اللجنةُ قراراً قاله التسجيل");
check(server.includes("اختر سبب عدم الموافقة.") && server.includes("STUDENT_COMMITTEE_REASONS"),
  "وعدمُ موافقة اللجنة بلا سببٍ مرفوض، والأسبابُ قائمةٌ مغلقة");
check(server.includes('"committee-rejected":"لم توافق عليه لجنة القسم"'),
  "والطالبُ يرى قرار اللجنة وسببه في صفحته");
check(repo.includes("guard?: (current: StudentCourseState | undefined) => string | null")
  && repo.includes("check(doc.data() as StudentNeed);") && server.includes("}, guardByState);"),
  "وقرارا اللجنة والتسجيل على المقرّر نفسه يُفحصان داخل الكتابة نفسها، لا على نسخةٍ قُرئت قبلها");
check(server.includes("هذا المقرّر لقسمٍ آخر؛ تقرّر فيه لجنةُ ذلك القسم.")
  && server.includes("return !owner || owner === sectionId;"),
  "ولجنةُ القسم ترى مقرّرات قسمها وتقرّر فيها وحدها، ولو جمع الطلبُ القديم قسمين");
check(screen.includes("filterChosen.current") && screen.includes('nextViewer === "registration" ? "approved"'),
  "وكلٌّ يبدأ من طابوره: اللجنةُ بما ينتظرها، والتسجيلُ بما سُلّم إليه");
check(screen.includes("const exportVisible = async () =>")
  && screen.includes('.filter(course => statusFilter === "all" || statusOf(course) === statusFilter)'),
  "والتصديرُ يُخرج ما يُعرض بالتصفية نفسها، فلا يخرج في ملف التسجيل ما لم توافق عليه اللجنة");
check(screen.includes('focus?.view !== "studentRegistration"'),
  "والإشعارُ يفتح الكشفَ على قسمه");
check(screen.includes("const approveAll = async (row: CaseRow)") && !screen.includes("approveEverything"),
  "والموافقةُ الجماعية لطالبٍ واحد لا للكشف كله: النظرُ في كل طالب عملُ اللجنة");


/* ── ثلاثةُ أعطالٍ من مراجعةٍ آلية على العمل نفسه ──────────────────────── */

/* ١) الإذنُ كان يُقاس على قالب الصفة لا على ما مُنح فعلاً. وقالبُ الصفة
      العاديّة يحوي إذنَ الورشة دائماً — فحسابٌ عاديٌّ مُنح إذنَ التقارير
      وحدَه، ولم يُمنح إذنَ الورشة قطّ، كان يمرّ ويكتب. */
check(!/roleDefinition\(role\)\.formIds\.includes\(7\)/.test(server),
  "الإذنُ لا يُقاس على قالب الصفة");
check(server.includes("const canWriteRegistration = (role: unknown, powerUser: boolean, granted: number[])"),
  "بل على الأذونات الممنوحة، تُمرَّر صراحةً");
check(server.includes("return granted.includes(7);"), "ومن سوى التسجيل يكتب بإذنه هو");
check(server.includes("const grantedPermissions = async (req: AuthenticatedRequest)")
  && server.includes("req.permissions ??"),
  "وتُقرأ من مصدر `requirePermission` نفسِه، لا من مصدرٍ ثانٍ يفترق عنه");
/* وصفةُ العرض الصرف تُردّ قبل كل ذلك، مهما مُنحت. */
check(server.includes("if (isViewerOnlyRole(role)) return false;"),
  "وصفةُ العرض الصرف تُردّ ولو مُنحت كلَّ إذن");

/* ٢) القراءةُ والكتابةُ كانتا تنسبان السجلَّ القديم إلى قسمين مختلفين: القراءةُ
      إلى مالك المقرّرات، والكتابةُ إلى قسم الطالب. فطالبٌ من قسمٍ آخرَ طلب
      مقرّراً من هذا القسم يظهر في كشفه ولا تستطيع لجنتُه أن تكتب فيه. */
check(server.includes("const sectionOwnsNeed = "), "ونسبةُ الطلب إلى قسمه قاعدةٌ واحدة");
check((server.match(/sectionOwnsNeed\(/g) || []).length === 2,
  "تقرأ بها الشاشةُ وتكتب بها — موضعان لا ثالثَ لهما، فلا يُعرض ما لا يُكتب فيه");
check(!server.includes("Number(need.surveySectionId || need.AdSectionId || 0);"),
  "ولم يبقَ الاشتقاقُ القديمُ في مسار الكتابة");

/* والطلبُ القديم يُنسب إلى **كلِّ** قسمٍ يملك مقرّراً من مقرّراته، لا إلى
   أوّلِهم. وهو موضعٌ كسرتُه ثم أصلحتُه: «أولُ مالك» كان يُخفي طلبَ طالبٍ
   طلب مقرّراً من قسمين عن ثانيهما بصمت — فيرى القسمُ عدداً أقلّ ولا يعرف
   لماذا، ولا شيء في الشاشة يقول إن طلباً سقط. */
check(server.includes("courses.some(row => Number(row.AdSectionId) === sectionId"),
  "والقديمُ يخصّ كلَّ قسمٍ يملك مقرّراً من المطلوب");
check(!/for \(const id of need\.courseIds \|\| \[\]\) \{[\s\S]{0,120}return section;/.test(server),
  "ولم يبقَ «أولُ مالكٍ» الذي كان يُخفي الطلبَ عن ثانيهما");
check(server.includes("const anyKnownOwner") && server.includes("!anyKnownOwner"),
  "وطلبٌ لا يُعرف مالكُ أيٍّ من مقرّراته يبقى عند قسم صاحبه، فلا يضيع بلا قسم");

/* ٣) قراران في لحظةٍ واحدةٍ كان أحدُهما يمحو الآخر: كلٌّ يقرأ الوثيقةَ ثم
      يكتبها كاملة. والشاشةُ تسمح به لأنها تُعطّل المقرّرَ المشغولَ وحدَه. */
check(repo.includes("firestoreDb.runTransaction(async transaction => {"),
  "وكتابةُ الحالة معاملةٌ واحدة، فلا يمحو قرارٌ قراراً");
check(repo.includes("const doc = await transaction.get(ref);") && repo.includes("transaction.set(ref, merged);"),
  "تقرأ وتكتب داخلها، فمن يخسر السباقَ يُعاد دمجُه");


/* ── اسمُ النطاق يُقرأ من حقله ─────────────────────────────────────────── */

/* الخادمُ يرسل الأسماء في `AdCollegeName` و`AdSectionName` (انظر
   `clientScopeDetails`). وقراءتُها باسمٍ مخترعٍ لا تُخطئ بصوتٍ مسموع: تسقط
   إلى البديل فتظهر «كلية ٥» مكان اسم الكلية — ويبدو للناظر كأن الحساب يحمل
   نطاقاتٍ ليست له. */
check(server.includes("AdCollegeName: collegeById.get(collegeId)"),
  "الخادمُ يرسل اسم الكلية في `AdCollegeName`");
check(server.includes("AdSectionName: sectionName ?? sectionById.get(sectionId)"),
  "واسمَ القسم في `AdSectionName`");
for (const [file, source] of [["StudentRegistration", screen], ["InstructorInbox", inboxScreen]] as const) {
  check(source.includes("scope.AdCollegeName ||"), `و${file} تقرأ الكلية من حقلها`);
  check(source.includes("scope.AdSectionName ||"), `و${file} تقرأ القسم من حقله`);
  check(!/scope\.(CollegeName|SectionName)\b/.test(source),
    `ولا تقرأ ${file} باسمٍ لا يرسله الخادم`);
}


/* ── لا يصل التسجيلَ شيءٌ قبل التوقيعين ──────────────────────────────────────
 *
 * قاعدةُ القسم صريحة: لا يذهب إلى التسجيل شيءٌ — وأوّلَ مرّةٍ بالذات — إلا بعد
 * توقيع لجنة الجدول ورئيس القسم. والجدولُ نفسُه محروسٌ بذلك في `canSubmit`،
 * وكشفُ طلبات الطلبة كان بابه الثاني مفتوحاً: يقرؤه موظّفُ التسجيل قبل أن
 * يوقّع أحد، فيبني على مسوّدة.
 */
check(server.includes("async function registrarBlockReason("),
  "وللتسجيل حارسٌ واحدٌ يقول متى يُمنع");
check(server.includes("if (!isRegistrarRole(req.user?.Role)) return null;"),
  "وهو على التسجيل وحده: القسمُ يرى كشفَه وهو يُعدّه، فذلك عملُه");
check(server.includes("if (isFullySigned(approval)) return null;"),
  "والشرطُ التوقيعان معاً، يُقرآن من `approvalWorkflow` لا من قاعدةٍ تُخترع هنا");
check((server.match(/registrarBlockReason\(/g) || []).length >= 3,
  "ويُسأل عند القراءة وعند الكتابة كلتيهما، فلا يُكتب فيما لا يُقرأ");

/* ── والسؤالُ عن قسم المقرّر المطلوب بعينه ───────────────────────────────
 * الطلبُ القديم يجمع مقرّرَين لقسمين، وموظّفٌ نطاقُه يشملهما كان يُسأل عن
 * جدول أحدهما ويكتب في مقرّر الآخر: يمرّ على قسمٍ لم يوقّع لأن شريكه وقّع.
 * ولذلك يُقرأ المقرّرُ قبل الحرس لا بعده. */
check(server.indexOf("هذا المقرّر ليس ضمن طلب الطالب.") < server.indexOf("const courseOwnerSection ="),
  "والمقرّرُ يُقرأ قبل الحرس، فيُسأل عن قسمه هو");
check(server.includes("const guardedSections = courseOwnerSection ? [courseOwnerSection] : owningSectionsInScope;"),
  "وعن قسمه وحدَه حين يُعرف");
/* ولا يُستعار توقيعُ قسمٍ عن قسم: مقرّرٌ يتيمٌ زال من الكتالوج كان لقسمٍ لم
   يوقّع كان يمرّ بتوقيع شريكه في الطلب — حارسٌ قائمٌ في ظاهره، مخروقٌ في
   الحالة التي وُضع لها. */
check(server.includes("for (const section of guardedSections) {"),
  "وحين لا يُعرف مالكُه يُسأل عن كلِّ قسمٍ يملك الطلب، ويكفي واحدٌ لم يوقّع ليُمنع");

/* ── ما يراه صاحبُ الصلاحية الكاملة ──────────────────────────────────────
 *
 * قوائمُ الكلية والقسم كانت تُبنى من نطاق الحساب وحدَه. وهو صوابٌ لمن له
 * نطاق، وخطأٌ لمن لا نطاقَ له لأن له الكلَّ: صاحبُ الصلاحية الكاملة كان يرى
 * الكليتين المسندتين إليه فقط، ويظنّ أن النظام لا يعرف غيرهما.
 *
 * والقاعدةُ مستقرّةٌ في الشاشات القديمة: الكتالوجُ كاملاً لمن له الكلّ،
 * ومُصفّىً بالنطاق لمن سواه.
 */
const inboxSrc = fs.readFileSync(path.join(process.cwd(), "src/components/InstructorInbox.tsx"), "utf8");
const regSrc = fs.readFileSync(path.join(process.cwd(), "src/components/StudentRegistration.tsx"), "utf8");
const appSrc = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
const approvalCss = fs.readFileSync(path.join(process.cwd(), "src/styles/11-approval.css"), "utf8");
const responsiveCss = fs.readFileSync(path.join(process.cwd(), "src/styles/07-responsive.css"), "utf8");

for (const [name, src] of [["وارد الأساتذة", inboxSrc], ["كشف التسجيل", regSrc]] as const) {
  check(src.includes('const [colleges, sections] = await Promise.all([request("/api/colleges"), request("/api/sections")]);'),
    `${name}: يقرأ الكتالوجَ كاملاً لمن له الكلّ`);
  /* ولا يُقرأ إلا لمن يحتاجه: من له نطاقٌ يكفيه نطاقُه، ورحلتان إضافيتان في
     كل فتحةِ شاشةٍ ثمنٌ بلا مقابل. */
  check(src.includes('if (!powerAdmin) { setCatalog(null); return; }'),
    `${name}: ولا يقرؤه لمن له نطاق`);
  /* ومن له الكلُّ لا يُختار له شيء: اختيارُ أوّلِ كليةٍ يُخفي عنه البقيّةَ
     خلف قراءةٍ بدأت بلا طلبه. */
  check(src.includes("if (collegeId || powerAdmin || !scopes.length) return;"),
    `${name}: ولا يُختار لصاحب الكلِّ نطاقٌ من تلقائه`);
  check(src.includes("}, [scopes, catalog]);") && src.includes("}, [scopes, collegeId, catalog]);"),
    `${name}: والقائمتان تتبعان الكتالوجَ حين يوجد`);
}
check(appSrc.includes("<StudentRegistration scopes={scopes} powerAdmin={isPowerAdmin} />"),
  "والصفةُ تصل كشفَ التسجيل، وإلا بقي الإصلاحُ معطّلاً في شاشةٍ لا تعرفه");
check(responsiveCss.includes(".sidebar .side-nav-link{")
  && responsiveCss.includes("grid-template-columns:24px minmax(0,1fr) auto auto"),
  "وقائمة الهاتف ترتّب مداخل تغييرات الجدول ورغبات الأساتذة وكشف التسجيل في صفٍّ واضح");
check(approvalCss.includes(".request-card-head{align-items:flex-start;flex-direction:column}")
  && approvalCss.includes(".request-diff>div{display:grid;grid-template-columns:minmax(54px,auto) minmax(0,1fr)")
  && approvalCss.includes(".registration-course{align-items:stretch;display:grid"),
  "وشاشتا رغبات الأساتذة وكشف التسجيل لهما ترتيب هاتف صريح لا يترك البطاقات تتزاحم");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
