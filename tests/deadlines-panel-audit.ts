/**
 * ── «مواعيد التسليم»: الموعدُ الواحد واستثناءاتُه ────────────────────────────
 *
 * رئيسُ التسجيل يضع آخر موعدٍ للفصل، ثم يستثني بالأيام قسماً أو كليةً أو الجميع،
 * ويمنح طلبات الأقسام أو يرفضها. هذا التدقيق يمسك:
 *   D1  أيامُ الكويت: الحساب بالتقويم، و«اليوم» بتوقيت الكويت.
 *   D2  الأيامُ من موعد الفصل، أو من استثناء القسم إن كان أبعد (ويُقال أيّهما).
 *   D3  لا استثناءَ قبل موعد الفصل، ولا بلا سبب، ولا في فصلٍ بلا موعد.
 *   D4  الرفعُ يعيد القسم إلى موعد الفصل؛ والمنحُ يطوي الطلب؛ والرفضُ يُقال للقسم.
 *   D5  النطاق: الكلّ والكلية من نطاق صاحب القرار، والمسمّى يُسأل عنه قسماً قسماً.
 *   D6  المسارُ الجماعي: لرئيس التسجيل والإدارة وحدهما، فصلٌ لم ينتهِ، طابورٌ
 *       ومراجعة لكل قسم، وحدثٌ في السجلّ.
 *   D7  حقلُ موعدٍ واحد في الواجهة كلها (لوحة مواعيد التسليم)، لا ثانٍ.
 *   D8  «متأخّر» في اللوحة هو «متأخّر» القاعدة الواحدة (isLate) لا حسابٌ ثانٍ.
 *   D9  الجُمل بالعربية الصحيحة، وسطرُ القسم «موعدكم … (استثناء حتى …)».
 *   D10 البيئةُ التجريبية تحكي القصّة: موعدٌ، واستثناءٌ، وطلبٌ ينتظر.
 */
import fs from "fs";
import path from "path";
import {
  addKuwaitDays, decideException, deadlineCountdown, deadlineDateLong, deadlineHeadline, deadlinePhase, deadlineProgress,
  departmentDeadlineLine, exceptionBase, exceptionDaysLabel, exceptionRefusal, lastExtensionRejection, normalizeExceptionDays,
  planException, presetDeadline, previewExceptions, progressSegment, resolveExceptionTargets, withException, withoutException,
} from "../src/utils/submissionDeadlines";
import { emptyApproval, kuwaitDateISO, readDeadline } from "../src/utils/approvalWorkflow";
import { isLate } from "../src/utils/lateness";
import { canManageDeadline, ACADEMIC_ROLES } from "../src/utils/academicRoles";
import { createDemoSandboxState } from "../src/db/demoSandbox";
import type { ScheduleApproval } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const server = read("server.ts");
const route = (head: string) => {
  const start = server.indexOf(head);
  if (start < 0) return "";
  const end = server.indexOf("\n});\n", start);
  return server.slice(start, end < 0 ? undefined : end);
};
const TERM = "2026-10-08"; // الخميس
const approval = (over: Partial<ScheduleApproval> = {}): ScheduleApproval => ({ ...emptyApproval(1, 2, 1), ...over });

/* ── D1: أيامُ الكويت ─────────────────────────────────────────────────────── */
{
  check(addKuwaitDays("2026-10-29", 5) === "2026-11-03", "D1 الأيامُ تعبر آخر الشهر بالتقويم");
  check(addKuwaitDays("2026-02-26", 3) === "2026-03-01", "D1 وفبراير سنةٍ بسيطة ثمانيةٌ وعشرون");
  check(addKuwaitDays("2026-12-30", 3) === "2027-01-02", "D1 وتعبر السنة");
  check(kuwaitDateISO(new Date("2026-10-08T22:30:00Z")) === "2026-10-09", "D1 «اليوم» بتوقيت الكويت: 22:30 عالمياً هي الغد في الكويت");
  check(presetDeadline("2026-09-26", 1) === "2026-10-03" && presetDeadline("2026-09-26", 3) === "2026-10-17", "D1 «بعد أسبوع/3 أسابيع» من اليوم");
  const lastSecond = readDeadline({ termDeadline: TERM }, new Date("2026-10-08T20:59:59Z"));
  const afterMidnight = readDeadline({ termDeadline: TERM }, new Date("2026-10-08T21:00:01Z"));
  check(!lastSecond.past && afterMidnight.past, "D1 الموعدُ ينتهي 23:59:59 بتوقيت الكويت");
}

/* ── D2: من أين تُعدّ الأيام ──────────────────────────────────────────────── */
{
  check(exceptionBase(TERM).from === "term" && exceptionBase(TERM).base === TERM, "D2 بلا استثناء: من موعد الفصل");
  check(exceptionBase(TERM, "2026-10-10").from === "extension", "D2 باستثناءٍ أبعد: من الاستثناء");
  check(exceptionBase(TERM, "2026-10-05").from === "term", "D2 باستثناءٍ أقرب (موعدُ فصلٍ تأخّر بعده): من موعد الفصل");
  const fromTerm = planException(TERM, undefined, { days: 3 });
  check(fromTerm.until === "2026-10-11" && fromTerm.daysAfterTerm === 3, "D2 +3 أيام من الخميس 8 ⇒ الأحد 11");
  const fromExt = planException(TERM, "2026-10-10", { days: 3 });
  check(fromExt.until === "2026-10-13" && fromExt.from === "extension" && fromExt.daysAfterTerm === 5, "D2 +3 على استثناءٍ حتى 10 ⇒ 13 (5 أيام بعد موعد الفصل)");
  const byDate = planException(TERM, "2026-10-20", { until: "2026-10-12" });
  check(byDate.until === "2026-10-12" && byDate.from === "date", "D2 التاريخُ الصريح يُكتب كما هو (تعديلُ استثناء)");
  const preview = previewExceptions(TERM, [{ key: "a" }, { key: "b", extensionUntil: "2026-10-10" }, { key: "c" }], { days: 3 });
  check(preview.fromExtension === 1 && preview.groups.length === 2, "D2 المعاينةُ تقول كم قسماً عُدّ من استثنائه");
}

/* ── D3: ما يُرفض ─────────────────────────────────────────────────────────── */
{
  check(Boolean(exceptionRefusal({ termDeadline: undefined, amount: { days: 3 }, reason: "سببٌ كافٍ" })?.includes("آخر موعد")), "D3 لا استثناءَ في فصلٍ بلا موعد");
  check(Boolean(exceptionRefusal({ termDeadline: TERM, amount: { until: "2026-10-05" }, reason: "سببٌ كافٍ" })?.includes("لا يسبق")), "D3 لا استثناءَ قبل موعد الفصل");
  check(exceptionRefusal({ termDeadline: TERM, amount: { until: "2026-10-08" }, reason: "سببٌ كافٍ" }) === null, "D3 ويومُ الموعد نفسه مقبول");
  check(Boolean(exceptionRefusal({ termDeadline: TERM, amount: { until: "2026-02-30" }, reason: "سببٌ كافٍ" })), "D3 تاريخٌ مستحيل مرفوض");
  check(Boolean(exceptionRefusal({ termDeadline: TERM, amount: { days: 3 }, reason: " " })?.includes("سبب")), "D3 السببُ مطلوب");
  check([0, -1, 61, 2.5, "x"].every(days => exceptionRefusal({ termDeadline: TERM, amount: { days }, reason: "سببٌ كافٍ" }) !== null), "D3 الأيامُ عددٌ صحيحٌ بين 1 و60");
  check(normalizeExceptionDays(7) === 7 && normalizeExceptionDays("5") === 5, "D3 والأيامُ الصحيحة تمرّ");
}

/* ── D4: المنح والرفع والرفض ──────────────────────────────────────────────── */
{
  const asked = approval({ extensionRequest: { by: "لجنة", role: "committeeChair", at: "2026-10-01T08:00:00Z", reason: "تأخّر المنتدبين", days: 5 } });
  const granted = decideException(asked, { action: "grant", termDeadline: TERM, amount: { days: 5 }, reason: "تأخّر المنتدبين", by: "رئيس التسجيل" });
  check(granted.next?.extensionUntil === "2026-10-13" && !granted.next?.extensionRequest, "D4 المنحُ يكتب الموعد ويطوي الطلب");
  check(granted.next?.extensionReason === "تأخّر المنتدبين" && granted.next?.extensionBy === "رئيس التسجيل" && Boolean(granted.next?.extensionAt), "D4 ويحفظ السبب ومن منح ومتى");
  check(granted.outcome.event?.action === "extension" && granted.outcome.event.detail.includes("+5 أيام"), "D4 وحدثٌ في السجلّ «+5 أيام»");
  const again = decideException(granted.next!, { action: "grant", termDeadline: TERM, amount: { days: 2 }, reason: "تمديدٌ ثانٍ", by: "رئيس التسجيل" });
  check(again.next?.extensionUntil === "2026-10-15", "D4 استثناءٌ ثانٍ بالأيام لا يُقصّر الأول: يُعدّ منه");

  const removed = decideException(granted.next!, { action: "remove", termDeadline: TERM, by: "رئيس التسجيل" });
  check(!removed.next?.extensionUntil && !removed.next?.extensionReason && !removed.next?.extensionBy, "D4 الرفعُ يمحو الاستثناء");
  check(readDeadline({ termDeadline: TERM, extensionUntil: removed.next?.extensionUntil }, "2026-10-01").effective === TERM, "D4 فيعود القسمُ إلى موعد الفصل");
  check(decideException(approval(), { action: "remove", termDeadline: TERM, by: "س" }).outcome.unchanged === true && !decideException(approval(), { action: "remove", termDeadline: TERM, by: "س" }).next,
    "D4 ورفعُ ما لا استثناءَ له لا يكتب شيئاً");

  const rejected = decideException(asked, { action: "reject", termDeadline: TERM, reason: "الموعد كافٍ", by: "رئيس التسجيل" });
  check(!rejected.next?.extensionRequest && !rejected.next?.extensionUntil && rejected.outcome.event?.action === "extension-request-rejected", "D4 الرفضُ يطوي الطلب ولا يمسّ الموعد");
  const withRejection = { ...rejected.next!, events: [{ at: "2026-10-02T08:00:00Z", by: "ر", action: "extension-request-rejected", round: 0, detail: "الموعد كافٍ" }] };
  check(lastExtensionRejection(withRejection)?.detail === "الموعد كافٍ", "D4 والقسمُ يقرأ الرفض وسببه في شريطه");
  check(lastExtensionRejection({ ...withRejection, events: [...withRejection.events, { at: "2026-10-03T08:00:00Z", by: "ل", action: "extension-request", round: 0 }] }) === null,
    "D4 ويسقط الرفضُ متى طلب القسم من جديد");
  check(!decideException(approval(), { action: "reject", termDeadline: TERM, reason: "سبب", by: "س" }).next, "D4 ولا رفضَ بلا طلب");
  const single = withException(asked, { until: "2026-10-12", reason: "س", by: "ر" });
  check(!single.extensionRequest && withoutException(single).extensionUntil === undefined, "D4 مسارُ القسم الواحد يكتب بالدالّتين نفسيهما");
}

/* ── D5: النطاق ───────────────────────────────────────────────────────────── */
{
  const sections = [
    { AdCollegeId: 1, AdSectionId: 1, AdSectionName: "أ" }, { AdCollegeId: 1, AdSectionId: 2, AdSectionName: "ب" },
    { AdCollegeId: 2, AdSectionId: 3, AdSectionName: "ج" },
  ];
  const onlyCollegeOne = (c: number) => c === 1;
  check(resolveExceptionTargets({ kind: "all" }, sections, () => true).targets.length === 3, "D5 «كل الأقسام»");
  check(resolveExceptionTargets({ kind: "all" }, sections, onlyCollegeOne).targets.length === 2, "D5 و«الكل» هو كلُّ نطاق صاحب القرار وحده");
  check(resolveExceptionTargets({ kind: "college", collegeId: 2 }, sections, () => true).targets.map(t => t.sectionId).join() === "3", "D5 «كلية»");
  check(Boolean(resolveExceptionTargets({ kind: "college", collegeId: 2 }, sections, onlyCollegeOne).error), "D5 وكليةٌ خارج النطاق لا قسمَ فيها");
  const named = resolveExceptionTargets({ kind: "departments", departments: [{ collegeId: 1, sectionId: 2 }, { collegeId: 2, sectionId: 3 }, { collegeId: 9, sectionId: 9 }, { collegeId: 1, sectionId: 2 }] }, sections, onlyCollegeOne);
  check(named.targets.length === 3, "D5 المسمّاةُ بلا تكرار");
  check(!named.targets[0].refusal && named.targets[1].refusal === "خارج صلاحيات الأقسام المسموحة لك" && named.targets[2].refusal === "قسمٌ غير موجود.",
    "D5 وما خرج عن النطاق أو لم يوجد يُقال له، لا يُسكت عنه");
  check(Boolean(resolveExceptionTargets({ kind: "x" }, sections, () => true).error) && Boolean(resolveExceptionTargets({ kind: "departments", departments: [] }, sections, () => true).error),
    "D5 ونطاقٌ مجهولٌ أو فارغ مرفوض");
}

/* ── D6: المسارُ الجماعي ──────────────────────────────────────────────────── */
{
  const bulk = route('app.post("/api/approvals/extensions"');
  check(bulk.length > 0, "D6 المسار POST /api/approvals/extensions موجود");
  check(bulk.includes("!canManageDeadline(req.user?.Role) && !isPowerUser(req)") && bulk.indexOf("canManageDeadline") < bulk.indexOf("Repository."),
    "D6 لرئيس التسجيل والإدارة وحدهما، قبل أي قراءة");
  const managers = ACADEMIC_ROLES.filter(role => canManageDeadline(role.id)).map(role => role.id);
  check(managers.length === 1 && managers[0] === "registrarHead", "D6 ومن الصفات: رئيس التسجيل وحده");
  check(bulk.includes("AdTermClosed === true || termHasEnded(term"), "D6 فصلٌ انتهى أو أُغلق لا تُعدَّل مواعيده");
  check(bulk.includes("exceptionRefusal({ termDeadline,") && bulk.includes("resolveExceptionTargets(req.body?.scope"), "D6 القواعدُ والنطاق من الدالّتين الواحدتين");
  check(bulk.includes('action === "reject" && reason.length < 3'), "D6 الرفضُ بسبب");
  check(bulk.includes("approvalTransaction(null, collegeId, sectionId, termId,") && bulk.includes("readApproval(collegeId, sectionId, termId)")
    && bulk.indexOf("readApproval(") > bulk.indexOf("approvalTransaction(null"), "D6 كلُّ قسمٍ على طابوره وبمراجعته، ويُقرأ سجلُّه داخل الطابور");
  check(bulk.includes("decideException(approval,") && bulk.includes("withEvent(req, decision.next"), "D6 القرارُ من decideException، وحدثٌ في السجلّ");
  check(bulk.includes("results.push(") && bulk.includes("res.json({ termId,") && bulk.includes("res.locals.auditChanges"), "D6 ويُقال لكل قسمٍ ما جرى له، ويُسجَّل في التدقيق");
  const transaction = server.slice(server.indexOf("async function approvalTransaction("), server.indexOf("async function approvalScopeLabel("));
  check(transaction.includes("res: Response | null") && transaction.includes("!res?.headersSent") && transaction.includes('if (outcome === "conflict" && res)'),
    "D6 الطابورُ نفسُه بلا ردٍّ للقرار الجماعي، لا نسخةٌ ثانية منه");
  const single = route('app.post("/api/approvals/extension"');
  check(single.includes("withException(approval,") && single.includes("withoutException(approval)") && !/extensionUntil:\s*until/.test(server),
    "D6 مسارُ القسم الواحد يكتب بالدالّتين نفسيهما، ولا كتابةَ ثالثة للاستثناء في الخادم");
  const deadline = route('app.post("/api/approvals/deadline"');
  check(deadline.includes("termHasEnded(term"), "D6 ولا موعدَ لفصلٍ انتهى");
  check(route('app.get("/api/approvals/inbox"').includes("extensionBy: approval.extensionBy"), "D6 الواردُ يحمل من منح الاستثناء ومتى");
}

/* ── D7: حقلُ موعدٍ واحد ─────────────────────────────────────────────────── */
{
  const components = fs.readdirSync(path.join(process.cwd(), "src/components")).filter(name => name.endsWith(".tsx"));
  const posting = (needle: string) => components.filter(name => read(`src/components/${name}`).includes(needle));
  check(posting('"/api/approvals/deadline"').join() === "SubmissionDeadlines.tsx", "D7 موعدُ الفصل يُكتب من لوحة مواعيد التسليم وحدها");
  check(posting('"/api/approvals/extensions"').join() === "SubmissionDeadlines.tsx", "D7 والاستثناءاتُ منها وحدها");
  check(posting('"/api/approvals/extension"').length === 0, "D7 ولا واجهةَ تكتب التمديد من طريقٍ ثانٍ");
  const changes = read("src/components/ScheduleChanges.tsx");
  check(!changes.includes("DeadlineControl") && !changes.includes('type="date"'), "D7 الحقلُ المجرّد أُزيل من تغييرات الجدول");
  check(changes.includes("<SubmissionDeadlines") && changes.includes("onExtend={(row) => setExtendFor("), "D7 واللوحةُ في رأس الوارد، و«تمديد» السطر يفتح ورقتها");
  check(changes.includes('focus.panel === "deadlines"') && read("src/utils/notificationCenter.ts").split('panel: "deadlines"').length === 3,
    "D7 إشعارُ «حدّد الموعد» وطلبُ التمديد يفتحان اللوحة");
  const css = read("src/styles/11-approval.css");
  check(!css.includes("changes-deadline-control"), "D7 ولا أسلوبَ باقٍ للحقل المُزال");
}

/* ── D8: «متأخّر» واحد ────────────────────────────────────────────────────── */
{
  const now = "2026-10-12T09:00:00Z";
  const cases = [
    { status: "notStarted", rowCount: 0, round: 0, extension: undefined },
    { status: "drafting", rowCount: 6, round: 0, extension: undefined },
    { status: "drafting", rowCount: 6, round: 0, extension: "2026-10-15" },
    { status: "submitted", rowCount: 9, round: 1, extension: undefined },
    { status: "returned", rowCount: 9, round: 1, extension: undefined },
    { status: "accepted", rowCount: 9, round: 1, extension: undefined },
    { status: "committee", rowCount: 4, round: 0, extension: undefined },
  ];
  const rows = cases.map(item => ({
    ...item,
    late: isLate({ approvalStatus: item.status === "notStarted" ? null : item.status, submittedRounds: item.round, deadline: TERM, extension: item.extension, now }),
  }));
  const progress = deadlineProgress(rows);
  check(progress.late === 3, `D8 متأخّرو اللوحة هم متأخّرو isLate (${progress.late})`);
  check(progress.total === 7 && progress.sent + progress.accepted + progress.returned + progress.drafting + progress.notStarted === 7, "D8 شريحةٌ واحدة لكل قسم");
  check(progressSegment({ status: "drafting", rowCount: 0, round: 0 }) === "notStarted" && progressSegment({ status: "drafting", rowCount: 3, round: 0 }) === "drafting",
    "D8 بلا مواعيد ولا جولة: لم يبدأ؛ ومواعيدُ بلا إرسال: قيد الإعداد");
  const panel = read("src/components/SubmissionDeadlines.tsx");
  check(!panel.includes("isLate(") && !/daysLeft\s*<\s*0/.test(panel) && panel.includes("deadlineProgress(list)"), "D8 اللوحةُ تعدّ row.late ولا تحكم على التأخّر بنفسها");
  check(route('app.get("/api/approvals/inbox"').includes("late: isLate({"), "D8 والواردُ يحكم بالقاعدة الواحدة");
}

/* ── D9: الجُمل ───────────────────────────────────────────────────────────── */
{
  const upcoming = readDeadline({ termDeadline: TERM }, "2026-09-26");
  check(deadlineHeadline(upcoming) === "آخر موعد: الخميس 8 أكتوبر 2026 · بقي 12 يوماً", `D9 «${deadlineHeadline(upcoming)}»`);
  check(deadlinePhase(readDeadline({ termDeadline: TERM }, TERM)) === "today" && deadlineCountdown(readDeadline({ termDeadline: TERM }, TERM)) === "اليوم آخر يوم", "D9 اليوم");
  check(deadlineCountdown(readDeadline({ termDeadline: TERM }, "2026-10-07")) === "بقي يومٌ واحد — غداً", "D9 غداً");
  check(deadlineCountdown(readDeadline({ termDeadline: TERM }, "2026-10-09")) === "انقضى أمس", "D9 أمس");
  check(deadlineCountdown(readDeadline({ termDeadline: TERM }, "2026-10-10")) === "انقضى منذ يومين", "D9 «منذ يومين» بالمجرور");
  check(deadlinePhase(readDeadline({}, "2026-10-10")) === "none" && deadlineHeadline(readDeadline({}, "2026-10-10")).includes("لم يُحدَّد"), "D9 بلا موعد");
  const six = previewExceptions(TERM, Array.from({ length: 6 }, (_, index) => ({ key: String(index) })), { days: 3 });
  check(six.sentence === "سيصبح موعد 6 أقسام: الأحد 11 أكتوبر", `D9 «${six.sentence}»`);
  check(previewExceptions(TERM, [{ key: "a" }], { days: 1 }).sentence === "سيصبح موعد قسم واحد: الجمعة 9 أكتوبر", "D9 وقسمٌ واحد");
  check(exceptionDaysLabel(3) === "+3 أيام" && exceptionDaysLabel(1) === "+يوم واحد" && exceptionDaysLabel(11) === "+11 يوماً", "D9 «+N أيام» بالعدد والمعدود");
  const extended = readDeadline({ termDeadline: TERM, extensionUntil: "2026-10-11" }, "2026-09-26");
  check(departmentDeadlineLine(extended) === "موعدكم: الأحد 11 أكتوبر 2026 · بقي 15 يوماً (استثناء حتى الأحد 11 أكتوبر)", `D9 «${departmentDeadlineLine(extended)}»`);
  check(departmentDeadlineLine(upcoming) === "موعدكم: الخميس 8 أكتوبر 2026 · بقي 12 يوماً", "D9 وبلا استثناء");
  check(deadlineDateLong("2026-10-08") === "الخميس 8 أكتوبر 2026", "D9 التاريخُ بيوم الأسبوع");
  const bar = read("src/components/ApprovalBar.tsx");
  check(bar.includes("departmentDeadlineLine(") && bar.includes("lastExtensionRejection(approval)"), "D9 شريطُ القسم يقرأ سطر «موعدكم» والرفض من الدالّتين");
  const panel = read("src/components/SubmissionDeadlines.tsx");
  const buttons = [...panel.matchAll(/<(?:button|PrimaryButton|SecondaryButton)\b[^>]*>/g)].map(m => m[0]);
  check(buttons.length > 10 && buttons.every(tag => tag.includes("data-guide-target=") || tag.includes("data-guide-ignore=")), "D9 كلُّ زرٍّ في اللوحة موسومٌ للمرشد");
}

/* ── D10: البيئة التجريبية ────────────────────────────────────────────────── */
{
  const demo = createDemoSandboxState();
  const term = demo.terms.find(row => Number(row.AdTermId) === 1)!;
  const deadline = String(term.AdTermSubmissionDeadline || "");
  check(/^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline > kuwaitDateISO(), "D10 الفصلُ التجريبي له موعدٌ قادم");
  const approvals = demo.scheduleApprovals as ScheduleApproval[];
  const withException = approvals.filter(row => row.extensionUntil);
  const withRequest = approvals.filter(row => row.extensionRequest);
  check(withException.length === 1 && withException[0].extensionUntil! > deadline && Boolean(withException[0].extensionReason) && Boolean(withException[0].extensionBy),
    "D10 استثناءٌ واحد بعد موعد الفصل، بسببه ومن منحه");
  check(withRequest.length === 1 && withRequest[0].extensionRequest!.days > 0 && withRequest[0].extensionRequest!.reason.length > 3, "D10 وطلبٌ واحد ينتظر، بأيامه وسببه");
  check(!approvals.some(row => row.AdSectionId === 4), "D10 وقسمُ الاستعراض بلا سجلّ (B15)");
  const grant = decideException(withRequest[0], { action: "grant", termDeadline: deadline, amount: { days: withRequest[0].extensionRequest!.days }, reason: withRequest[0].extensionRequest!.reason, by: "أ. رئيس التسجيل" });
  check(grant.next?.extensionUntil === addKuwaitDays(deadline, withRequest[0].extensionRequest!.days) && !grant.next?.extensionRequest, "D10 ومنحُ الطلب التجريبي يعمل بالقاعدة نفسها");
}

/* الأبعد يحكم: تأخيرُ موعد الفصل بعد منح استثناءٍ أقرب لا يعاقب القسم. */
{
  const later = readDeadline({ termDeadline: "2026-10-20", extensionUntil: "2026-10-10" }, "2026-10-15");
  check(later.effective === "2026-10-20" && !later.past, "موعد الفصل الأبعد يغلب استثناءً صار أقرب منه");
  const ext = readDeadline({ termDeadline: "2026-10-08", extensionUntil: "2026-10-11" }, "2026-10-09");
  check(ext.effective === "2026-10-11" && !ext.past, "والاستثناء الأبعد يغلب موعد الفصل");
  check(!isLate({ approvalStatus: "drafting", submittedRounds: 0, deadline: "2026-10-20", extension: "2026-10-10", now: "2026-10-15T10:00:00+03:00" }),
    "والتأخّر يقرأ القاعدة نفسها: لا متأخّر قبل الموعد الأبعد");
}

console.log(`\nDeadlines panel audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
