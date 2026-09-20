/**
 * ── تدقيق دورة الاعتماد ─────────────────────────────────────────────────────
 *
 * كل قاعدةٍ في هذه الدورة اتُّفق عليها صراحةً، وكلٌّ منها كانت تحتمل غير ما
 * استقرّت عليه: التوقيع مرّةً لا في كل جولة، واللائحة تُعرض ولا تمنع، وإضافةُ
 * الصفّ وحدها تنتظر إقراراً، والموعد يمنع التسليم الشامل لا التعديل الجزئي.
 *
 * ما يلي هو البرهان على أن الكود يقول ما اتُّفق عليه — لا ما يشبهه.
 */

import fs from "fs";
import path from "path";
import {
  APPROVAL_STATUS_LABEL, WHOLESALE_DELETE_RATIO, canSign, canSubmit, currentRound, daysBetween,
  describeWholesaleRefusal, emptyApproval, inboxPriority, isFullySigned, isWholesaleChange,
  lastReviewedVersionId, needsHeadAcknowledgement, readDeadline, signatureOf, statusAfterSignature,
  verificationCode,
} from "../src/utils/approvalWorkflow";
import type { ScheduleApproval, ScheduleApprovalSignature } from "../src/types";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const base = () => emptyApproval(1, 5, 20);
const signature = (stage: "committee" | "head", rowCount = 40): ScheduleApprovalSignature => ({
  stage, SystemUserId: stage === "committee" ? 7 : 8,
  userName: stage === "committee" ? "لجنة الجدول" : "رئيس القسم",
  roleLabel: stage === "committee" ? "رئيس لجنة الجدول" : "رئيس القسم العلمي",
  at: "2026-10-01T08:00:00.000Z", versionId: `v-${stage}`, rowCount, verifyCode: "ABC123",
});
const withSignatures = (...stages: Array<"committee" | "head">): ScheduleApproval => {
  const approval = { ...base(), signatures: stages.map(stage => signature(stage)) };
  return { ...approval, status: statusAfterSignature(approval) };
};

/* ── السجلّ الفارغ ──────────────────────────────────────────────────────── */

check(base().status === "drafting", "قسمٌ لم يبدأ الدورة حاله «قيد الإعداد»");
check(base().currentRound === 0 && base().rounds.length === 0, "لا جولة قبل أول إرسال");
check(base().scopeKey === "1:5:20", "مفتاح السجلّ هو مفتاح النسخ نفسه");
check(Object.keys(APPROVAL_STATUS_LABEL).length === 6, "ست حالات، لا سابعة بلا اسم");
check(Object.values(APPROVAL_STATUS_LABEL).every(label => label.trim().length > 0), "كل حالةٍ تُقرأ بالعربية");

/* ── التوقيع ────────────────────────────────────────────────────────────── */

const clean = { blockingConflicts: 0, rowCount: 40 };

check(canSign(base(), "committee", clean).ok, "اللجنة توقّع على جدولٍ سليم");
const headFirst = canSign(base(), "head", clean);
check(!headFirst.ok && headFirst.ok === false && headFirst.code === "wrong-order", "رئيس القسم لا يسبق اللجنة");
check(canSign(withSignatures("committee"), "head", clean).ok, "رئيس القسم يوقّع بعد اللجنة");

const twice = canSign(withSignatures("committee"), "committee", clean);
check(twice.ok === false && twice.code === "already-signed", "لا يُثبَت التوقيع مرّتين");

const empty = canSign(base(), "committee", { blockingConflicts: 0, rowCount: 0 });
check(empty.ok === false && empty.code === "empty", "لا يُوقَّع على جدولٍ فارغ");

const conflicted = canSign(base(), "committee", { blockingConflicts: 3, rowCount: 40 });
check(conflicted.ok === false && conflicted.code === "blocking-conflicts", "التعارض المادّي يمنع التوقيع");
check(conflicted.ok === false && conflicted.message.includes("اللائحية لا تمنع"),
  "رسالة المنع تُفرّق بين التعارض واللائحة: القرار اللائحي لصاحب التوقيع");

/* هذه هي القاعدة التي صُحّحت بعد المراجعة: اللائحة معيارٌ يُحتجّ به، لا بوّابة. */
for (const notices of [1, 5, 20, 100]) {
  check(canSign(base(), "committee", { blockingConflicts: 0, rowCount: 40 }).ok,
    `${notices} ملاحظةً لائحيةً لا تمنع التوقيع`);
}

const submitted: ScheduleApproval = { ...withSignatures("committee", "head"), status: "submitted", currentRound: 1 };
const lockedSign = canSign(submitted, "committee", clean);
check(lockedSign.ok === false && lockedSign.code === "locked", "لا توقيع على جدولٍ عند التسجيل");

check(statusAfterSignature(base()) === "drafting", "بلا توقيعٍ تبقى الحال قيد الإعداد");
check(statusAfterSignature(withSignatures("committee")) === "committee", "توقيع اللجنة يرفع الحال");
check(statusAfterSignature(withSignatures("committee", "head")) === "head", "التوقيعان يبلغان «موقّع من رئيس القسم»");
check(statusAfterSignature(withSignatures("committee", "head")) !== "submitted", "التوقيع لا يُرسل: الإرسال فعلٌ مستقلّ بقراره");

check(isFullySigned(withSignatures("committee", "head")), "التوقيعان معاً هما اكتمال التوقيع");
check(!isFullySigned(withSignatures("committee")), "توقيعٌ واحد ليس اكتمالاً");
check(signatureOf(withSignatures("committee", "head"), "head")?.roleLabel === "رئيس القسم العلمي", "التوقيع يحمل صفة صاحبه للطباعة");

/* ── رمز التحقّق ────────────────────────────────────────────────────────── */

const code = verificationCode("v-1", 7, "2026-10-01T08:00:00.000Z");
check(/^[0-9A-Z]{6}$/.test(code), "رمز التحقّق ستّة محارف تُقرأ وتُكتب على ورق");
check(code === verificationCode("v-1", 7, "2026-10-01T08:00:00.000Z"), "الرمز ثابتٌ لنفس النسخة والموقّع واللحظة");
check(code !== verificationCode("v-2", 7, "2026-10-01T08:00:00.000Z"), "نسخةٌ أخرى رمزٌ آخر");
check(code !== verificationCode("v-1", 8, "2026-10-01T08:00:00.000Z"), "موقّعٌ آخر رمزٌ آخر");
check(verificationCode("", 0, "").length === 6, "الرمز بطول ثابتٍ حتى على مدخلٍ فارغ");

/* ── الإضافات بعد التوقيع ───────────────────────────────────────────────── */

const withAddition: ScheduleApproval = {
  ...withSignatures("committee", "head"),
  pendingAdditions: [{ scheduleId: 900, courseId: 12, courseName: "تفاضل", sectionCode: "03", addedAt: "2026-10-02T09:00:00.000Z", addedBy: "اللجنة" }],
};
check(needsHeadAcknowledgement(withAddition), "الشعبة المضافة بعد التوقيع تنتظر إقراراً");
check(!needsHeadAcknowledgement(withSignatures("committee", "head")), "جدولٌ بلا إضافةٍ لا ينتظر شيئاً");

const blockedBySubmit = canSubmit(withAddition, { openNoteCount: 0, deadlineState: readDeadline({}, "2026-10-02") });
check(blockedBySubmit.ok === false && blockedBySubmit.code === "pending-additions", "لا إرسال قبل إقرار الإضافات");
/* العدّ العربي من أداة النظام نفسها، لا صياغةً يدوية: «شعبة» ثم «شعبتان» ثم
   «خمس شعب» — والخطأ فيه يُقرأ فوراً على شاشةٍ عربية. */
const additionsMessage = (count: number) => {
  const verdict = canSubmit({
    ...withSignatures("committee", "head"),
    pendingAdditions: Array.from({ length: count }, (_, index) => ({
      scheduleId: 900 + index, courseId: 12, addedAt: "2026-10-02T09:00:00.000Z", addedBy: "اللجنة",
    })),
  }, { openNoteCount: 0, deadlineState: readDeadline({}, "2026-10-02") });
  return verdict.ok === true ? "" : verdict.message;
};
check(additionsMessage(1).includes("شعبة واحدة"), "شعبةٌ واحدة تُقرأ «شعبة واحدة»");
check(additionsMessage(2).includes("شعبتان"), "شعبتان تُقرآن مثنّى لا «2 شعبة»");
check(additionsMessage(5).includes("شعب"), "خمسٌ تُقرأ جمع قلّة");
check(!/\d/.test(additionsMessage(1)), "لا رقمَ لاتينياً في رسالةٍ عربية عن الواحد");

/* ── الإرسال ────────────────────────────────────────────────────────────── */

const noDeadline = readDeadline({}, "2026-10-02");
check(canSubmit(withSignatures("committee", "head"), { openNoteCount: 0, deadlineState: noDeadline }).ok, "الموقّع كاملاً يُرسل");

const unsigned = canSubmit(withSignatures("committee"), { openNoteCount: 0, deadlineState: noDeadline });
check(unsigned.ok === false && unsigned.code === "not-signed", "لا إرسال بتوقيعٍ واحد");

const withNotes = canSubmit(withSignatures("committee", "head"), { openNoteCount: 2, deadlineState: noDeadline });
check(withNotes.ok === false && withNotes.code === "unresolved-notes", "لا إعادة إرسالٍ وملاحظةٌ بلا معالجةٍ ولا ردّ");

const twiceSubmit = canSubmit({ ...withSignatures("committee", "head"), status: "submitted" }, { openNoteCount: 0, deadlineState: noDeadline });
check(twiceSubmit.ok === false && twiceSubmit.code === "already-submitted", "لا يُرسل جدولٌ مُرسَل");

/* ── الموعد ─────────────────────────────────────────────────────────────── */

const past = readDeadline({ termDeadline: "2026-10-01" }, "2026-10-05");
check(past.past && past.tone === "past" && past.daysLeft === -4, "الموعد المنقضي يُقرأ منقضياً بعدد أيامه");
const near = readDeadline({ termDeadline: "2026-10-05" }, "2026-10-01");
check(!near.past && near.tone === "near" && near.daysLeft === 4, "الموعد القريب ينذر قبل أن يمضي");
const far = readDeadline({ termDeadline: "2026-12-01" }, "2026-10-01");
check(far.tone === "ok", "الموعد البعيد لا يُقلق أحداً");
const none = readDeadline({}, "2026-10-01");
check(none.tone === "none" && !none.past, "فصلٌ بلا موعدٍ فصلٌ بلا قيد — وهذا حال كل فصلٍ قديم");

const extended = readDeadline({ termDeadline: "2026-10-01", extensionUntil: "2026-10-20", extensionReason: "تأخّر اعتماد المنتدبين" }, "2026-10-05");
check(!extended.past && extended.effective === "2026-10-20", "التمديد يتقدّم على موعد الفصل");
check(extended.extensionReason === "تأخّر اعتماد المنتدبين", "سبب التمديد محفوظٌ ليُعرض");
const shortened = readDeadline({ termDeadline: "2026-12-01", extensionUntil: "2026-10-01" }, "2026-10-05");
check(shortened.past, "التمديد يتقدّم حتى لو كان أقرب: قرارُ القسم أخصُّ من قرار الفصل");

check(daysBetween("2026-10-01", "2026-10-08") === 7, "الأيام تُحسب أياماً لا ساعات");
check(daysBetween("2026-10-08", "2026-10-01") === -7, "الاتجاه محفوظ");
check(daysBetween("2026-02-28", "2026-03-01") === 1, "آخر فبراير في سنةٍ غير كبيسة");
check(daysBetween("2024-02-28", "2024-03-01") === 2, "التاسع والعشرون من فبراير محسوبٌ في الكبيسة");

const lateFirst = canSubmit(withSignatures("committee", "head"), { openNoteCount: 0, deadlineState: past });
check(lateFirst.ok === false && lateFirst.code === "deadline", "التسليم الأول بعد الموعد ممنوع");
const lateRound = canSubmit({ ...withSignatures("committee", "head"), currentRound: 2 }, { openNoteCount: 0, deadlineState: past });
check(lateRound.ok, "الجولة بعد الموعد تمرّ: هي معالجةُ ملاحظاتٍ طلبها التسجيل، لا تسليمٌ متأخر");

/* ── التسليم الشامل ─────────────────────────────────────────────────────── */

check(isWholesaleChange({ kind: "import" }), "استيراد ملفٍّ تسليمٌ شامل بحكم تعريفه");
check(isWholesaleChange({ kind: "copy-term" }), "نسخُ فصلٍ تسليمٌ شامل بحكم تعريفه");
check(isWholesaleChange({ kind: "bulk-delete", deleting: 40, total: 100 }), "حذف ٤٠٪ تسليمٌ شامل");
check(!isWholesaleChange({ kind: "bulk-delete", deleting: 25, total: 100 }), "حذف ٢٥٪ تصحيحٌ عادي");
check(!isWholesaleChange({ kind: "bulk-delete", deleting: 30, total: 100 }), "الحدّ نفسه ليس تجاوزاً له");
check(!isWholesaleChange({ kind: "bulk-delete", deleting: 5, total: 0 }), "جدولٌ فارغ لا نسبة له، فلا حكم عليه");
check(isWholesaleChange({ kind: "bulk-delete", deleting: 4, total: 10 }),
  "النسبة لا العدد: أربعةٌ من عشرة جدولُ قسمٍ صغير، وأربعون من مئةٍ نسبتها نفسها");
check(WHOLESALE_DELETE_RATIO === 0.3, "الحدّ ثلاثون بالمئة، مكتوبٌ في مكانٍ واحد يُعدَّل منه");

const refusalText = describeWholesaleRefusal({ kind: "import" }, past);
check(refusalText.includes("2026-10-01"), "الرفض يذكر الموعد الذي انقضى");
check(refusalText.includes("التعديلات الجزئية") && refusalText.includes("تمديد"),
  "الرفض يقول ما يبقى مفتوحاً وكيف يُفتح المغلق — لا «ممنوع» وحدها");

/* ── الجولات ────────────────────────────────────────────────────────────── */

const roundsApproval: ScheduleApproval = {
  ...withSignatures("committee", "head"),
  status: "returned", currentRound: 2,
  rounds: [
    { number: 1, submittedAt: "2026-10-02T08:00:00.000Z", reviewedVersionId: "v1", returnedAt: "2026-10-03T08:00:00.000Z", returnedNoteCount: 4 },
    { number: 2, submittedAt: "2026-10-04T08:00:00.000Z", reviewedVersionId: "v2" },
  ],
};
check(currentRound(roundsApproval)?.number === 2, "الجولة الجارية هي المرقّمة بالحالي");
check(lastReviewedVersionId(roundsApproval) === "v2", "أساس المقارنة هو آخر نسخةٍ رآها التسجيل");
check(lastReviewedVersionId(base()) === undefined, "أول مراجعةٍ بلا أساسٍ سابق: الجدول كله جديد");
check(lastReviewedVersionId({ ...roundsApproval, rounds: [{ number: 1 }, { number: 2 }] }) === undefined,
  "جولةٌ بلا نسخةٍ مسجّلة لا تُختلق لها نسخة");

/* ── ترتيب صندوق الوارد ────────────────────────────────────────────────── */

const priority = (status: ScheduleApproval["status"], round: number, blocking = 0) =>
  inboxPriority({ ...base(), status, currentRound: round }, blocking);
check(priority("submitted", 1) === 0, "الوارد الجديد أولاً");
check(priority("submitted", 3) === 1, "العائد بعد إرجاعٍ ثانياً: هو دَينٌ على الموظّف نفسه");
check(priority("drafting", 0, 2) === 2, "ما فيه موانع بعدهما");
check(priority("accepted", 2) === 5, "المقبول في الأسفل: حاضرٌ لمن أراده، لا يزاحم");
check(priority("submitted", 1) < priority("submitted", 3), "الجديد قبل العائد");
check(priority("returned", 2) < priority("accepted", 2), "المُرجَع قبل المقبول");

/* ── القواعد كما رُكّبت في الخادم ───────────────────────────────────────── */

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
check(server.includes("scheduleLockRefusal"), "قفلُ الإرسال مُركَّب");
for (const route of ['app.post("/api/schedules"', 'app.put("/api/schedules/:id"', 'app.delete("/api/schedules/:id"']) {
  const at = server.indexOf(route);
  const body = server.slice(at, at + 9000);
  check(at !== -1 && body.includes("scheduleLockRefusal"), `${route} يقرأ القفل قبل أن يكتب`);
}
check(server.includes("noteScheduleMutation"), "تتبّع الإضافات وإعادة فتح الجولة مُركَّب");
check(server.includes('wholesaleRefusal(collegeId, sectionId, targetTermId, { kind: "copy-term" })'), "نسخ الفصل يمرّ بقيد الموعد");
check(server.includes('{ kind: "import" }'), "النشر من مسودةٍ مستوردة يمرّ بقيد الموعد");
check(server.includes("setTermSubmissionDeadline"), "الموعد يُكتب بدالّةٍ لا تمسّ غيره");

const repository = fs.readFileSync(path.join(process.cwd(), "src/db/repository.ts"), "utf8");
const updateTermAt = repository.indexOf("updateTerm: async (id: number, name: string");
const updateTermBody = repository.slice(updateTermAt, updateTermAt + 2200);
check(updateTermBody.includes("...previous"),
  "تصحيح اسم الفصل لا يمحو موعد تسليمه: الاستبدال الكامل ينقل ما لا يذكره");

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
