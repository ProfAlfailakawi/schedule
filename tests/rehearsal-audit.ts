/**
 * بروفة الفصل الكامل في البيئة التجريبية الحيّة (2026-09-25).
 *
 * كلُّ بندٍ هنا عيبٌ ظهر حين أُدّيت الدورة كما يؤدّيها أصحابها: اللجنة ورئيس
 * القسم والأستاذ والطالب والتسجيل والعمداء. والفحصُ سلوكيٌّ حيث يمكن (الدوالّ
 * نفسها التي تقرؤها الشاشات والخادم)، وبنيويٌّ حيث يلزم أن تبقى القاعدةُ في
 * مكانٍ واحد.
 */
import fs from "fs";
import path from "path";
import {
  additionsAwaitingHead, canSubmit, emptyApproval, extensionRequestRefusal, needsHeadAcknowledgement, readDeadline, withRemainingSignatures,
} from "../src/utils/approvalWorkflow";
import { buildNotifications, pendingExtensionRequest, type CenterScope } from "../src/utils/notificationCenter";
import { judgeRequest, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import { movementAttribution } from "../src/utils/movementAttribution";
import type { AdCourse, AdInstructor, FSchedule, ScheduleApproval } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const server = read("server.ts");
/** جسمُ دالّةٍ أو مسارٍ في الخادم، من بدايته إلى بداية ما يليه. */
const block = (source: string, start: string, end = "\napp.") => {
  const at = source.indexOf(start);
  if (at < 0) return "";
  const stop = source.indexOf(end, at + start.length);
  return source.slice(at, stop < 0 ? undefined : stop);
};

/* ══ R1: الإضافاتُ تنتظر رئيسَ القسم ما دام توقيعُه قائماً ══════════════════
 * البروفة: اللجنة أضافت شعبةً بعد اعتماد رئيس القسم، ثم سحبت توقيعها (فسقط
 * توقيعُه معه) ووقّعت من جديد. فقال الجرسُ لرئيس القسم «شعبة واحدة أُضيفت بعد
 * اعتمادك — وافق عليها» ولا اعتمادَ له، وعُدّت الشعبةُ في عدّاد اللجنة. */
{
  const sig = (stage: "committee" | "head") => ({ stage, SystemUserId: 1, userName: "س", roleLabel: "ص", at: "2026-09-25T00:00:00Z", rowCount: 8, verifyCode: "ABC123" });
  const addition = { scheduleId: 1058, courseId: 17, courseName: "أمن الأنظمة", sectionCode: "02", addedAt: "2026-09-25T00:00:00Z", addedBy: "اللجنة" };
  const base = (signatures: any[], status: any = "returned"): ScheduleApproval => ({
    ...emptyApproval(1, 1, 1), status, currentRound: 1, signatures,
    rounds: [{ number: 1, submittedAt: "2026-09-16T00:00:00Z", returnedAt: "2026-09-22T00:00:00Z" }],
    pendingAdditions: [addition],
  } as ScheduleApproval);

  const signed = base([sig("committee"), sig("head")]);
  check(additionsAwaitingHead(signed) === 1 && needsHeadAcknowledgement(signed), "R1: إضافةٌ بعد اعتمادٍ قائم تنتظر رئيس القسم");
  const committeeOnly = base([sig("committee")]);
  check(additionsAwaitingHead(committeeOnly) === 0 && !needsHeadAcknowledgement(committeeOnly), "R1: بلا توقيع رئيس القسم لا شيء «أُضيف بعد اعتماده»");

  const dropped = withRemainingSignatures(signed, []);
  check(dropped.pendingAdditions.length === 0 && Number(dropped.pendingAdditionsOverflow || 0) === 0 && dropped.signatures.length === 0,
    "R1: سقوطُ توقيع رئيس القسم يطوي قائمة ما كان ينتظره");
  const kept = withRemainingSignatures({ ...signed, pendingAdditionsOverflow: 3 }, [sig("committee"), sig("head")]);
  check(kept.pendingAdditions.length === 1 && kept.pendingAdditionsOverflow === 3, "R1: وما دام توقيعُه باقياً تبقى القائمة كما هي");

  /* الجرس، لرئيس القسم وللجنة، على الحال التي عاشتها البروفة. */
  const scope = (approval: ScheduleApproval): CenterScope => ({
    approval, collegeName: "كلية العلوم التطبيقية", sectionName: "علوم الحاسب", rowCount: 8, openRegistrarNotes: 0, openRequests: 0,
  } as CenterScope);
  const head = buildNotifications({ role: "departmentHead", scopes: [scope(committeeOnly)] });
  check(!head.some(item => item.title.includes("بعد اعتمادك")), "R1: لا يُقال لرئيس القسم «أُضيفت بعد اعتمادك» ولا اعتمادَ له");
  const headBack = head.find(item => item.title.includes("أرجع التسجيل"));
  check(Boolean(headBack) && headBack!.tone === "action" && headBack!.detail.includes("اعتمادُك"),
    "R1: بل يُقال له إن اللجنة وقّعت وإن اعتمادَه يعيد الإرسال");
  const committee = buildNotifications({ role: "committeeChair", scopes: [scope(committeeOnly)] });
  const committeeBack = committee.find(item => item.title.includes("أرجع التسجيل"));
  check(Boolean(committeeBack) && committeeBack!.tone === "waiting" && committeeBack!.detail.includes("اعتماد رئيس القسم")
    && !committeeBack!.detail.includes("إقرارَ"), "R1: واللجنةُ تنتظر اعتمادَ رئيس القسم، لا «إقرارَه على شعبة»");
  const unsigned = buildNotifications({ role: "committeeChair", scopes: [scope(base([]))] }).find(item => item.title.includes("أرجع التسجيل"));
  check(Boolean(unsigned) && unsigned!.tone === "action" && unsigned!.detail.includes("وقّع"), "R1: وإن سحبت توقيعها قيل لها أن توقّع");
  const headWithAdditions = buildNotifications({ role: "departmentHead", scopes: [scope(signed)] });
  check(headWithAdditions.some(item => item.title.includes("بعد اعتمادك")), "R1: وما أُضيف بعد اعتمادٍ قائم يُقال له كما كان");

  /* الإرسال: الإضافةُ المعلّقة على توقيعٍ ساقط لا تُحسب مانعاً ثانياً. */
  const verdict = canSubmit({ ...signed, signatures: [sig("committee"), sig("head")] }, { openNoteCount: 0, deadlineState: readDeadline({}, "2026-09-25") });
  check(verdict.ok === false && verdict.code === "pending-additions", "R1: الإرسالُ ما زال يُمنع بإضافةٍ تنتظر اعتماداً قائماً");

  /* بنيوياً: مسارا السحب وإرجاع رئيس القسم يُسقطان التوقيعَ من المكان الواحد،
     والجرسُ والشريط والعدّاد والوارد يقرؤون القاعدة الواحدة. */
  check(block(server, 'app.post("/api/approvals/withdraw"').includes("withRemainingSignatures(approval, dropped)"),
    "R1: سحبُ التوقيع يمرّ بـwithRemainingSignatures");
  check(block(server, 'app.post("/api/approvals/head-return"').includes("withRemainingSignatures(approval,"),
    "R1: إرجاعُ رئيس القسم يمرّ بـwithRemainingSignatures");
  check(block(server, "async function approvalBadgeForTerm(", "\napp.get").includes('if (stage === "head") open += additionsAwaitingHead(approval);'),
    "R1: العدّادُ يعدّ الإضافات لرئيس القسم وحده وبالقاعدة الواحدة");
  check(block(server, 'app.get("/api/approvals/inbox"').includes("pendingAdditions: additionsAwaitingHead(approval)"),
    "R1: الوارد يقرأ القاعدة الواحدة");
  const center = read("src/utils/notificationCenter.ts");
  check(!/approval\.pendingAdditions\.length/.test(center) && center.includes("additionsAwaitingHead(approval)"),
    "R1: الجرسُ لا يعدّ القائمة الخام");
  const bar = read("src/components/ApprovalBar.tsx");
  check(bar.includes("const pendingAdditions = additionsAwaitingHead(approval);") && !bar.includes("pendingAdditionTotal"),
    "R1: الشريطُ يقرأ القاعدة الواحدة");
}

/* ══ R2: إرجاعُ رئيس القسم يصل اللجنةَ بسببه ═════════════════════════════════
 * البروفة: أرجع رئيس القسم الجدول بسببٍ مكتوب، فقال جرسُ اللجنة «وقّع جدول
 * علوم الحاسب — بعد توقيعك يصل لرئيس القسم» كأنها تبدأ، بلا ذكرٍ للإرجاع. */
{
  const approval = {
    ...emptyApproval(1, 1, 1), status: "drafting", currentRound: 1, signatures: [],
    rounds: [{ number: 1, submittedAt: "2026-09-16T00:00:00Z", returnedAt: "2026-09-22T00:00:00Z" }],
    headReturn: { by: "د. رئيس القسم", at: "2026-09-25T17:47:18.277Z", reason: "راجعوا توقيت الشعبة الثانية" },
  } as ScheduleApproval;
  const scope = { approval, collegeName: "ك", sectionName: "علوم الحاسب", rowCount: 8, openRegistrarNotes: 0, openRequests: 0 } as CenterScope;
  const committee = buildNotifications({ role: "committeeChair", scopes: [scope] });
  const item = committee.find(entry => entry.title.includes("أرجع رئيس القسم"));
  check(Boolean(item) && item!.tone === "action" && item!.detail.includes("راجعوا توقيت الشعبة الثانية"),
    "R2: اللجنةُ تقرأ في جرسها أن رئيس القسم أرجع الجدول، وبسببه");
  check(!committee.some(entry => entry.title.startsWith("وقّع جدول")), "R2: ولا يُقال لها «وقّع» كأنها تبدأ");
  const head = buildNotifications({ role: "departmentHead", scopes: [scope] });
  check(head.some(entry => entry.tone === "waiting" && entry.title.includes("أرجعتَ")), "R2: ورئيسُ القسم يرى أنه ينتظر اللجنة");
}

/* ══ R3: ملخّصُ العميد بالعدّ العربي ═════════════════════════════════════════
 * البروفة: جرسُ العميد والعميد المساعد قال «المعتمد 1 من جدولين» و«بقي 1 لم
 * يعتمده التسجيل بعد» — رقمٌ لاتينيٌّ بلا معدود، خلافَ قاعدة countOf. */
{
  const accepted = [{ number: 1, submittedAt: "2026-09-01T00:00:00Z", acceptedAt: "2026-09-02T00:00:00Z" }];
  const scopeOf = (status: any, rounds: any[] = []) => ({
    approval: { ...emptyApproval(1, 1, 1), status, rounds, currentRound: rounds.length },
    collegeName: "ك", sectionName: `ق${Math.random()}`, rowCount: 7, openRegistrarNotes: 0, openRequests: 0,
  } as unknown as CenterScope);
  const summary = (scopes: CenterScope[]) => buildNotifications({ role: "dean", scopes }).find(item => item.id.startsWith("final-summary"))!;
  const one = summary([scopeOf("accepted", accepted), scopeOf("submitted")]);
  check(one.title === "اعتُمد جدول واحد من جدولين" && one.detail === "جدول واحد لم يعتمده التسجيل بعد.",
    "R3: «اعتُمد جدول واحد من جدولين» و«جدول واحد لم يعتمده التسجيل بعد»");
  const none = summary([scopeOf("submitted"), scopeOf("drafting"), scopeOf("returned")]);
  check(none.title === "لم يُعتمد بعدُ أيٌّ من 3 جداول" && none.detail === "3 جداول لم يعتمدها التسجيل بعد.",
    "R3: ولا «المعتمد 0»: «لم يُعتمد بعدُ أيٌّ من 3 جداول»");
  const two = summary([scopeOf("accepted", accepted), scopeOf("submitted"), scopeOf("drafting")]);
  check(two.detail === "جدولان لم يعتمدهما التسجيل بعد.", "R3: والمثنّى بضميره «لم يعتمدهما»");
  const center = read("src/utils/notificationCenter.ts");
  check(!/`المعتمد \$\{done\}|بقي \$\{total - done\}/.test(center), "R3: لا رقمَ خامٌ في ملخّص العميد");
}

/* ══ R4: طلبُ التمديد بالقاعدة التي يُعرض بها زرُّه ═══════════════════════════
 * البروفة: رئيسُ قسمٍ جدولُه معتمد، والموعدُ بعد ثلاثة عشر يوماً، أرسل طلبَ
 * تمديد فقُبل (200)، ووصل رئيسَ التسجيل «علوم الحاسب يطلب تمديد موعد التسليم»
 * — وسطرُه يقول السبب ولا يقول كم يوماً طُلب. */
{
  const near = { effective: "2026-09-27", past: false, daysLeft: 2 };
  const far = { effective: "2026-10-08", past: false, daysLeft: 13 };
  const at = (status: any, extra: any = {}) => ({ status, ...extra });
  check(extensionRequestRefusal(at("returned"), near) === null, "R4: جدولٌ مُرجَعٌ دنا موعدُه يُطلب له تمديد");
  check(extensionRequestRefusal(at("drafting"), { effective: "2026-09-20", past: true, daysLeft: -5 }) === null, "R4: وبعد انقضاء الموعد");
  check(Boolean(extensionRequestRefusal(at("accepted"), near)?.includes("معتمد")), "R4: ولا يُطلب لجدولٍ معتمد");
  check(Boolean(extensionRequestRefusal(at("submitted"), near)?.includes("عند التسجيل")), "R4: ولا لجدولٍ عند التسجيل");
  check(Boolean(extensionRequestRefusal(at("returned"), far)?.includes("3 أيام")), "R4: ولا والموعدُ بعيد — ويُقال متى يُطلب");
  check(Boolean(extensionRequestRefusal(at("returned", { extensionRequest: { by: "س", role: "", at: "x", reason: "ص", days: 7 } }), near)),
    "R4: ولا طلبٌ ثانٍ فوق طلبٍ معلّق");
  check(Boolean(extensionRequestRefusal(at("returned"), { past: false })), "R4: ولا بلا موعد");

  const route = block(server, 'app.post("/api/approvals/extension-request"');
  check(route.includes("extensionRequestRefusal(approval, deadline)") && route.includes('code: "extension-request-refused"'),
    "R4: المسارُ يسأل القاعدة الواحدة قبل أن يحفظ");
  check(block(server, 'app.get("/api/approvals",').includes("canRequestExtension: extensionRequestRefusal(approval, deadline) === null"),
    "R4: وزرُّ الشريط يُعرض بالقاعدة نفسها");

  const ask = pendingExtensionRequest({ ...emptyApproval(1, 1, 1), extensionRequest: { by: "س", role: "committeeChair", at: "2026-09-25T00:00:00Z", reason: "تأخّر المنتدبين", days: 7 } } as ScheduleApproval);
  check(ask?.days === 7, "R4: الجرسُ يقرأ عددَ الأيام المطلوبة");
  const bell = buildNotifications({ role: "registrarHead", scopes: [{
    approval: { ...emptyApproval(1, 1, 1), status: "returned", rounds: [{ number: 1 }], currentRound: 1,
      extensionRequest: { by: "س", role: "committeeChair", at: "2026-09-25T00:00:00Z", reason: "تأخّر المنتدبين", days: 7 } },
    collegeName: "ك", sectionName: "علوم الحاسب", rowCount: 7, openRegistrarNotes: 0, openRequests: 0,
  } as unknown as CenterScope] }).find(item => item.title.includes("يطلب تمديد"));
  check(Boolean(bell) && bell!.detail === "7 أيام — تأخّر المنتدبين", "R4: «7 أيام — السبب» في سطر رئيس التسجيل");
}

/* ══ R5: قسمٌ كتب مواعيده ليس «لم يبدأ» ═════════════════════════════════════
 * البروفة: ميزانُ العميد وعميد التسجيل قال عن «ريادة الأعمال» «لم يبدأ» وبجانبه
 * ستةُ مواعيد، والواردُ وشريطُ القسم (/api/approvals) يقولان «قيد الإعداد». */
{
  const term = block(server, 'app.get("/api/approvals/term"');
  check(term.includes("Repository.getSchedulesByScope({ termId })") && term.includes("withRows.has("),
    "R5: حالُ القسم بلا سجلٍّ تُقرأ من مواعيده في الفصل");
  check(term.includes('status: drafting ? "drafting" as const : "notStarted" as const'),
    "R5: مواعيدُ بلا توقيع ⇒ «قيد الإعداد» كما في الوارد والشريط، ولا شيء ⇒ «لم يبدأ»");
}

/* ══ R6: رفضُ بندٍ متاح يعرض بدائل ═════════════════════════════════════════════
 * البروفة: طلبت الأستاذة نقل محاضرتها إلى وقتٍ متاح، فرفضته اللجنة لسببٍ لا يراه
 * الفاحص (دفعةٌ مشتركة). ورقةُ الرفض تعرض بدائلها من «أقرب الأوقات»، وكانت
 * القائمةُ فارغةً لكل بندٍ متاح — فلا يجد المنسّق ما يعرضه، ويُغلق البابَ رفضٌ
 * بلا بديل. */
{
  const TEACHER = 6;
  const row = (over: Partial<FSchedule> = {}): FSchedule => ({
    id: 17, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 17, SCode: "01", AdInstructorId: TEACHER,
    fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false,
    fstarttime: "12:30", fendtime: "13:20", AdRoomCode: "901A02", AdRoomHall: "L01", ...over,
  } as FSchedule);
  const course: AdCourse = { AdCourseId: 17, AdCollegeId: 1, AdSectionId: 1, CourseCode: "CS350", CourseName: "أمن الأنظمة", CourseCredit: 3, CourseHours: 3 } as AdCourse;
  const teacher = { AdInstructorId: TEACHER, AdInstructorCivil: "000000000006", AdInstructorName: "د. 6" } as AdInstructor;
  const moved = row({ fstarttime: "11:00", fendtime: "11:50" });
  const context: VerdictContext = {
    instructorId: TEACHER, allRows: [row()], instructorRowsAfter: [moved],
    courses: new Map([[17, course]]), instructors: new Map([[TEACHER, teacher]]),
    knownRoomKeys: [], startLadder: ["08:00", "09:30", "11:00", "12:30", "14:00"],
  };
  const ask = { rowId: 17, action: "change" as const, AdCourseId: 17, days: ["fsunday", "ftuesday"] as any, start: "11:00" };
  const forTeacher = judgeRequest(ask, context);
  check(forTeacher.kind === "clear" && forTeacher.nearestTimes.length === 0 && forTeacher.headline === "الوقت متاح",
    "R6: صفحةُ الأستاذ لا تُعرض عليها «أقرب الأوقات» وطلبُه متاح");
  const forDepartment = judgeRequest(ask, { ...context, offerAlternatives: true });
  check(forDepartment.kind === "clear" && forDepartment.nearestTimes.length > 0 && forDepartment.headline === "الوقت متاح",
    "R6: وللقسم تُحسب البدائل ولو كان البندُ متاحاً — والحكمُ باقٍ «متاح»");
  check(forDepartment.nearestTimes.every(slot => slot.days.join() === "fsunday,ftuesday" && slot.start !== "11:00"),
    "R6: والبديلُ بأيام المحاضرة كلها، غيرُ الوقت المطلوب نفسه");
  check(block(server, "async function judgeRequestItems(", "\n/* ──").includes("offerAlternatives: Boolean(options.forDepartment)"),
    "R6: الواردُ وحده (forDepartment) يطلب البدائل، وصفحةُ الأستاذ لا");
}

/* ══ R7: حركةُ الجدول تُنسب إلى فعلها ووقته ══════════════════════════════════════
 * البروفة: نُقلت محاضرةُ الأستاذة عند 17:44:40، فقرأت في بطاقتها «تغيّر موعدها
 * … الجدول الحالي» بوقت فتحها البطاقة، و«أُضيفت … قبل تعديل موعد دراسي» بوقت
 * النقل لا بوقت الإسناد — واليومُ «الأحد» وحده عن محاضرة الأحد والثلاثاء. */
{
  const edit = movementAttribution({ at: "2026-09-25T17:40:56.000Z", label: "قبل تعديل موعد دراسي" });
  check(edit.at === "2026-09-25T17:40:56.000Z" && edit.label === "تعديل موعد دراسي",
    "R7: ما تغيّر بعد «قبل تعديل موعد دراسي» هو «تعديل موعد دراسي» بوقت تلك اللقطة");
  check(movementAttribution({ at: "x", label: "قبل استبدال الأستاذ: أ ← ب" }).label === "استبدال الأستاذ: أ ← ب",
    "R7: وكلُّ فعلٍ باسمه");
  check(movementAttribution({ at: "x", label: "توقيع رئيس القسم العلمي" }).label === "تعديل الجدول"
    && movementAttribution({ at: "x", label: "" }).label === "تعديل الجدول",
    "R7: ولقطةٌ لا تسبق فعلاً (توقيع، إرسال) لا تُنسب إليها حركةٌ باسمها");
  const movement = block(server, "async function scheduleMovementEntries(", "\nasync function buildStaffCard");
  check(movement.includes("const {at,label}=movementAttribution(states[i-1]);") && !movement.includes("const at=states[i].at"),
    "R7: الحركةُ تُنسب إلى اللقطة السابقة لا اللاحقة");
  check(movement.includes('shareDayIndexes(row).map(index => SHARE_DAY_NAMES[index]).filter(Boolean).join(" · ")'),
    "R7: وأيامُ المحاضرة كلُّها تُذكر، لا أولُها");
}

/* ══ R8: الجلسةُ التجريبية المفقودة تُسمّى باسمها ═════════════════════════════════
 * البروفة: نُشرت نسخةٌ جديدة أثناء الدورة فضاع الصندوقُ التجريبيّ من الذاكرة،
 * وصار كلُّ طلبٍ يُردّ «الرجاء تسجيل الدخول أولاً» — لمن لا حسابَ له أصلاً. */
{
  check(!server.includes('{ error: "الرجاء تسجيل الدخول أولاً" }'), "R8: لا حارسَ يكتب رسالة الدخول بيده");
  check((server.match(/\{ error: signInRequiredMessage\(req\) \}/g) || []).length >= 5, "R8: الحرّاسُ الخمسة يسألون signInRequiredMessage");
  const helper = block(server, "function signInRequiredMessage(", "\n}");
  check(helper.includes('startsWith("demo_") ? DEMO_SESSION_GONE : "الرجاء تسجيل الدخول أولاً"'),
    "R8: كعكةُ جلسةٍ تجريبية ⇒ «انتهت الجلسة التجريبية… ابدأ تجربةً جديدة»، وغيرها كما كان");
  check(block(server, 'app.post("/api/demo/reset"').includes("DEMO_SESSION_GONE") && block(server, 'app.post("/api/demo/role"').includes("DEMO_SESSION_GONE"),
    "R8: وتبديلُ الصفة وإعادةُ الضبط يقولان الجملة نفسها");
}

console.log(`\nRehearsal audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
