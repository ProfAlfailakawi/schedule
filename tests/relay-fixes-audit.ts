/**
 * ── تدقيق مسار الاعتماد بعد مراجعة الأدوار الستّة ───────────────────────────
 *
 * اللجنة ← رئيس القسم ← التسجيل ← القبول ← ما بعد القبول. كلُّ بندٍ هنا كان
 * قاعدةً مكتوبةً مرّتين فافترقت، أو غيرَ مكتوبةٍ أصلاً. الدوالّ النقية تُختبر
 * بسلوكها، والمواضعُ التي يجب أن تقرأها تُختبر ببنيتها: لا نسخةٌ ثانية.
 */

import fs from "fs";
import path from "path";
import {
  acknowledgeAdditions, amendmentStillOpen, appendApprovalEvent, APPROVAL_EVENT_CAP, approvalLockReason,
  canHeadReturn, canRequestExtension, canReturn, canSubmit, canWithdraw, countAnsweredRegistrarNotes,
  countOpenRegistrarNotes, deadlineEndsAt, deadlinePassed, emptyApproval, extensionRefusal, insistOutcome,
  isSwapEdit, kuwaitDateISO, mergePendingAdditions, openRound, PENDING_ADDITIONS_CAP, pendingAdditionTotal,
  readDeadline, readViewExpectation, roundBaselineVersionId, roundEndVersionId, STALE_VIEW_MESSAGE,
  staleViewRefusal, statusAfterSignatureChange, suggestedExtensionDate,
} from "../src/utils/approvalWorkflow";
import { ApprovalRevisionConflict, Repository } from "../src/db/repository";
import { runApprovalAttempts } from "../src/server/approvalAttempts";
import type { ScheduleAdditionPending, ScheduleApproval, ScheduleApprovalSignature } from "../src/types";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const server = read("server.ts");
const workflow = read("src/utils/approvalWorkflow.ts");
const bar = read("src/components/ApprovalBar.tsx");
const changes = read("src/components/ScheduleChanges.tsx");
const schedules = read("src/components/Schedules.tsx");
const repo = read("src/db/repository.ts");
const between = (text: string, from: string, to: string) => {
  const at = text.indexOf(from);
  if (at < 0) return "";
  const end = text.indexOf(to, at + from.length);
  return text.slice(at, end < 0 ? undefined : end);
};
const route = (signature: string) => between(server, signature, "\napp.");

const sig = (stage: "committee" | "head"): ScheduleApprovalSignature => ({
  stage, SystemUserId: stage === "committee" ? 7 : 8, userName: "س", roleLabel: "ر",
  at: "2026-10-01T08:00:00.000Z", rowCount: 10, verifyCode: "ABC123",
});
const approvalWith = (patch: Partial<ScheduleApproval>): ScheduleApproval => ({ ...emptyApproval(1, 5, 20), ...patch });
const signedBoth = (patch: Partial<ScheduleApproval> = {}) => approvalWith({ signatures: [sig("committee"), sig("head")], status: "head", ...patch });
const noDeadline = readDeadline({}, "2026-10-01");

/* ── R1: السحبُ بعد القبول ممنوع، والمُرجَع يبقى مُرجَعاً ──────────────────── */
{
  const accepted = signedBoth({ status: "accepted", currentRound: 1 });
  const verdict = canWithdraw(accepted, "committee");
  check(verdict.ok === false && verdict.code === "accepted", "R1 لا يُسحب توقيعٌ على جدولٍ معتمد");
  check(canWithdraw(signedBoth({ status: "submitted" }), "head").ok === false, "R1 ولا على جدولٍ عند التسجيل");
  check(canWithdraw(signedBoth({ status: "returned", currentRound: 1 }), "head").ok === true, "R1 ويُسحب في جولةٍ مُرجَعة");
  const returnedAfter = approvalWith({ status: "returned", currentRound: 1, signatures: [sig("committee")] });
  check(statusAfterSignatureChange(returnedAfter) === "returned", "R1 سحبُ التوقيع في جولةٍ مُرجَعة يُبقيها «مُرجَعاً»");
  check(statusAfterSignatureChange(approvalWith({ status: "head", signatures: [sig("committee")] })) === "committee",
    "R1 وخارج الإرجاع تُحسب الحالة من التواقيع كما كانت");
  const withdrawRoute = route('app.post("/api/approvals/withdraw"');
  check(withdrawRoute.includes("canWithdraw(approval, stage)") && withdrawRoute.includes("statusAfterSignatureChange(next)"),
    "R1 مسارُ السحب يقرأ القاعدة الواحدة");
  check(bar.includes("{mine && !locked && !accepted ? ("), "R1 زرُّ «سحب توقيعي» يختفي بعد القبول");
}

/* ── R2/R3: الإرسالُ لا يمرّ على معتمدٍ ولا على تعارض ──────────────────────── */
{
  const accepted = canSubmit(signedBoth({ status: "accepted", currentRound: 1 }), { openNoteCount: 0, deadlineState: noDeadline });
  check(accepted.ok === false && accepted.code === "already-accepted", "R2 المعتمدُ بلا تغيير لا يُرسل ثانيةً");
  const conflicted = canSubmit(signedBoth(), { openNoteCount: 0, deadlineState: noDeadline, blockingConflicts: 2 });
  check(conflicted.ok === false && conflicted.code === "blocking-conflicts", "R3 التعارضُ المادّي يمنع الإرسال");
  check(canSubmit(signedBoth(), { openNoteCount: 0, deadlineState: noDeadline, blockingConflicts: 0 }).ok === true, "R3 والجدولُ السليم يُرسل");
  const submitFn = between(server, "async function submitToRegistrar(", "\napp.");
  check(submitFn.includes("blockingConflicts: blocking") && submitFn.includes("await blockingConflictCount("),
    "R3 الإرسالُ يعدّ التعارضات ويمرّرها إلى canSubmit");
  check(bar.includes("!locked && !accepted && blockingConflicts === 0"), "R2/R3 شرطُ زرّ الإرسال في الشاشة هو شرط الخادم");
  check(bar.includes("يمنع الإرسال: {blockingConflictPhrase(blockingConflicts)}"), "R3 ويُقال السببُ مكان الزرّ");
}

/* ── R4: عدّادٌ واحد لملاحظات التسجيل المفتوحة ─────────────────────────────── */
{
  const notes = [
    { origin: "registrar", state: "open", round: 1 },   // أصرّ عليها التسجيل من جولةٍ سابقة
    { origin: "registrar", state: "open", round: 3 },
    { origin: "department", state: "open", round: 3 },  // ملاحظةٌ داخلية
    { origin: "registrar", state: "changed", round: 3 },
    { origin: "registrar", state: "answered", round: 3 },
  ];
  check(countOpenRegistrarNotes(notes) === 2, "R4 تُعدّ ملاحظاتُ التسجيل المفتوحة في كل الجولات، لا ملاحظاتُ القسم");
  check(countAnsweredRegistrarNotes(notes) === 1, "R4 والردودُ المنتظرة من التسجيل وحده");
  const returnRoute = route('app.post("/api/approvals/return"');
  check(returnRoute.includes("countOpenRegistrarNotes(") && !returnRoute.includes("=== approval.currentRound).length"),
    "R4 الإرجاعُ لا يقصر العدّ على الجولة الجارية");
  const inboxRoute = route('app.get("/api/approvals/inbox"');
  check(inboxRoute.includes("openNotes: countOpenRegistrarNotes(notes)") && inboxRoute.includes("answeredNotes: countAnsweredRegistrarNotes(notes)"),
    "R4 الواردُ يعدّ بالعدّاد نفسه");
  check(!/\.filter\(note => note\.origin === "registrar" && note\.state === "open"\)/.test(server),
    "R4 لا نسخةَ ثانية من قاعدة العدّ في الخادم");
  check(!/notes\.filter\(note => note\.state === "open"\)\.length/.test(changes) && changes.includes("countOpenRegistrarNotes(report.notes)"),
    "R4 شريطُ القرار في الشاشة يعدّ بالعدّاد نفسه");
  const verdict = route('app.post("/api/schedule-notes/:id/verdict"');
  check(verdict.includes("rebuttalHistory: [...(note.rebuttalHistory || [])"), "R4 الإصرارُ يحفظ الردَّ في سجلّ الردود ولا يمحوه");
}

/* ── R5: القبولُ يُغلق ما بقي من ملاحظات التسجيل ───────────────────────────── */
{
  const accept = route('app.post("/api/approvals/accept"');
  check(accept.includes('resolution: "closed-by-acceptance"') && accept.includes('note.state === "open" || note.state === "answered"'),
    "R5 القبولُ يُغلق المفتوحة والمنتظرة «بالقبول»");
  check(changes.includes("CLOSED_BY_ACCEPTANCE_LABEL"), "R5 والشاشة تقول «أُغلقت بالقبول»");
}

/* ── R6: القرارُ مشدودٌ إلى ما رآه صاحبه ───────────────────────────────────── */
{
  const exp = readViewExpectation({ expectedRound: "2", expectedRowCount: 40 });
  check(exp.expectedRound === 2 && exp.expectedRowCount === 40, "R6 يُقرأ ما رآه الطرف من الطلب");
  check(staleViewRefusal({ round: 3, rowCount: 40 }, exp) === STALE_VIEW_MESSAGE, "R6 جولةٌ تغيّرت تُرفض");
  check(staleViewRefusal({ round: 2, rowCount: 41 }, exp) === STALE_VIEW_MESSAGE, "R6 وعددُ مواعيد تغيّر يُرفض");
  check(staleViewRefusal({ round: 2, rowCount: 40 }, exp) === null, "R6 وما لم يتغيّر يمرّ");
  check(staleViewRefusal({ round: 9, rowCount: 1 }, readViewExpectation({})) === null, "R6 وواجهةٌ قديمة لا ترسل شيئاً تمرّ كما كانت");
  for (const name of ["sign", "submit", "return", "accept", "head-return"]) {
    check(route(`app.post("/api/approvals/${name}"`).includes("refuseIfStale(req, res,"), `R6 مسارُ ${name} يفحص ما رآه صاحبه`);
  }
  check(server.includes('res.status(409).json({ error: refusal, code: "stale-view" })'), "R6 الرفضُ ٤٠٩ برسالةٍ واحدة");
  check(bar.includes("expectedRound: state.approval.currentRound") && changes.includes("expectedRound: report.approval.currentRound"),
    "R6 الشريطُ وشاشةُ القرار يرسلان ما رأيا");
}

/* ── R7: حفظٌ بمراجعة ─────────────────────────────────────────────────────── */
{
  const save = between(repo, "saveScheduleApproval: async", "getShareLink:");
  check(save.includes("runTransaction") && save.includes("throw new ApprovalRevisionConflict"), "R7 الحفظُ في Firestore معاملةٌ تشترط المراجعة");
  check(save.includes("revision: expected + 1"), "R7 وكلُّ حفظٍ يرفع المراجعة");
  check(server.includes("async function approvalTransaction(") && between(server, "async function approvalTransaction(", "\n}\n").includes("runApprovalAttempts(task,"),
    "R7 الخاسرُ يُعاد مرّةً واحدة ثم يُقال له");
  const writeRoutes = ["sign", "withdraw", "head-return", "acknowledge-additions", "submit", "return", "accept", "extension", "extension-request"];
  check(writeRoutes.every(name => route(`app.post("/api/approvals/${name}"`).includes("await approvalTransaction(res,")),
    "R7 كلُّ مسار كتابةٍ في الدورة على الطابور وبالمراجعة");
}

/* ── R8: جولاتُ التعديل بعد القبول ─────────────────────────────────────────── */
{
  const accepted = approvalWith({
    status: "accepted", currentRound: 2,
    rounds: [{ number: 1, reviewedVersionId: "v1", returnedAt: "x" }, { number: 2, reviewedVersionId: "v2", acceptedAt: "y", acceptedVersionId: "v2a" }],
  });
  const opened = openRound(accepted, { at: "t", by: "لجنة", amendment: true, baselineVersionId: roundBaselineVersionId(accepted, 3, { acceptedOnly: true }) });
  const amended: ScheduleApproval = { ...accepted, status: "submitted", ...opened };
  check(opened.currentRound === 3 && amended.rounds[2].amendment === true && amended.rounds[2].baselineVersionId === "v2a",
    "R8 أولُ تعديلٍ بعد القبول يفتح جولةَ تعديلٍ أساسُها ما قُبل");
  const ctx = { termClosed: false, isCommittee: true };
  check(amendmentStillOpen(amended, 0) && approvalLockReason(amended, { ...ctx, registrarNotesInCurrentRound: 0 }) === null,
    "R8 والتعديلُ الثاني يمرّ ويتجمّع في الجولة نفسها");
  check(approvalLockReason(amended, { ...ctx, registrarNotesInCurrentRound: 1 }) !== null,
    "R8 فإذا كتب التسجيل ملاحظةً فيها أُقفلت");
  const plainSubmitted = approvalWith({ status: "submitted", currentRound: 1, rounds: [{ number: 1, reviewedVersionId: "v1" }] });
  check(approvalLockReason(plainSubmitted, { ...ctx, registrarNotesInCurrentRound: 0 }) !== null, "R8 والجولةُ المُرسلة عادةً مقفلة كما كانت");
  check(approvalLockReason(plainSubmitted, { ...ctx, registrarNotesInCurrentRound: 0, registrarLock: false }) === null,
    "R8 وما لا يقفله التسجيل يمرّ");
  check(approvalLockReason(plainSubmitted, { termClosed: true, isCommittee: false, registrarNotesInCurrentRound: 0, registrarLock: false }) !== null,
    "R8 ويبقى عليه حكمُ الفصل المنتهي");
  const mutation = between(server, "async function applyScheduleMutation(", "\n/**");
  check(mutation.includes("openRound(next, {") && mutation.includes("amendment: true") && !mutation.includes("rounds: [...next.rounds, {"),
    "R8 فتحُ الجولة بعد التعديل يستعمل الدالّة نفسها التي يستعملها الإرسال");
  check(between(server, "async function submitToRegistrar(", "\napp.").includes("openRound(approval, {"), "R8 والإرسالُ يبني جولته بها");
  check(server.includes("scheduleLockRefusal(req, Number(row.AdCollegeId), Number(row.AdSectionId), Number(row.AdTermId), { registrarLock: false })"),
    "R8 استثناءُ الأسبوع لا يقفله التسجيل");
  check(server.includes("req, itemScope.collegeId, itemScope.sectionId, Number(stored.AdTermId), { registrarLock: false })"),
    "R8 وقرارُ طلب الأستاذ لا يقفله التسجيل");
  check(server.includes("const issueLock = await scheduleLockRefusal(req, collegeId, sectionId, termId, { registrarLock: false })"),
    "R8 وإصدارُ روابط الطلبات لا يقفله التسجيل");
  const guard = between(server, "async function scheduleLockRefusal(", "\n/** كم ملاحظةً");
  check(guard.includes("return approvalLockReason(approval, {") && !guard.includes('approval.status === "submitted"'),
    "R8 حارسُ الخادم يقرأ القاعدة الواحدة، لا نسخةً ثانية");
}

/* ── R9: أساسُ المقارنة قاعدةٌ واحدة ───────────────────────────────────────── */
{
  const history = approvalWith({
    status: "submitted", currentRound: 4,
    rounds: [
      { number: 1, reviewedVersionId: "r1", returnedAt: "a" },
      { number: 2, reviewedVersionId: "r2", acceptedAt: "b", acceptedVersionId: "a2" },
      { number: 3, amendment: true, baselineVersionId: "a2", returnedAt: "c", reviewedVersionId: "r3" },
      { number: 4, reviewedVersionId: "r4" },
    ],
  });
  check(roundBaselineVersionId(history, 2) === "r1", "R9 أساسُ الجولة ما رآه التسجيل في التي قبلها");
  check(roundBaselineVersionId(history, 3) === "a2", "R9 وأساسُ جولة التعديل ما قُبل قبلها");
  check(roundBaselineVersionId(history, 4) === "r3", "R9 وبعد إرجاع جولة التعديل: ما رآه فيها");
  check(roundBaselineVersionId(history, 4, { acceptedOnly: true }) === "a2", "R9 والعميدُ يرى آخرَ ما قُبل بالقاعدة نفسها");
  check(roundEndVersionId(history, 2) === "a2" && roundEndVersionId(history, 4) === undefined,
    "R9 الجولةُ الماضية تنتهي بما قُبل فيها، والجارية بالجدول الحيّ");
  check(between(server, "async function finalRowsWithFinality(", "\nasync function").includes("finalSourceFor(")
    && fs.readFileSync(path.join(process.cwd(), "src/utils/finality.ts"), "utf8").includes("{ acceptedOnly: true }")
    && fs.readFileSync(path.join(process.cwd(), "src/utils/finality.ts"), "utf8").includes("roundBaselineVersionId("),
    "R9 جدولُ العميد يقرأ القاعدة الواحدة");
  const report = route('app.get("/api/reports/schedule-changes"');
  check(report.includes("const roundBaselineId = roundBaselineVersionId(approval, round);") && report.includes("roundEndVersionId(approval, round)"),
    "R9 وتقريرُ التغييرات يقرؤها، وجولةٌ مضت تُقرأ حتى نهايتها");
  check(report.includes('baselineParam === "authority" || (baselineParam !== "round" && !requestedRound)'),
    "R9 وثيقةُ الهيئة أساسٌ يُختار: الجولةُ متى طُلبت جولة");
  check(changes.includes("&baseline=${base}") && changes.includes("report.viewingPastRound"), "R9 والشاشة تختار الأساس وتقول أيّ جولةٍ تعرض");
}

/* ── R10: التسجيلُ يُعيد فتح المعتمد ───────────────────────────────────────── */
{
  const accepted = signedBoth({ status: "accepted", currentRound: 2 });
  const verdict = canReturn(accepted, 1);
  check(verdict.ok === true && verdict.reopensAccepted === true, "R10 المعتمدُ يُرجَع بملاحظةٍ واحدة على الأقل");
  check(canReturn(accepted, 0).ok === false, "R10 ولا يُرجَع بلا ملاحظة");
  check(canReturn(signedBoth({ status: "returned" }), 3).ok === false, "R10 والمُرجَعُ لا يُرجَع ثانيةً");
  check(route('app.post("/api/approvals/return"').includes("if (verdict.reopensAccepted)"), "R10 في جولةٍ جديدة");
  check(changes.includes('report.approval.status === "submitted" || report.approval.status === "accepted"'), "R10 وزرُّ الإرجاع يظهر على المعتمد");
}

/* ── R11: رئيسُ القسم يُرجع للجنة ──────────────────────────────────────────── */
{
  const committee = approvalWith({ status: "committee", signatures: [sig("committee")] });
  check(canHeadReturn(committee, "شعبتان في وقتٍ واحد").ok === true, "R11 يُرجع بعد توقيع اللجنة وبسبب");
  check(canHeadReturn(committee, "").ok === false, "R11 ولا يُرجع بلا سبب");
  check(canHeadReturn(signedBoth({ status: "submitted" }), "سبب").ok === false, "R11 ولا بعد الإرسال");
  const headReturn = route('app.post("/api/approvals/head-return"');
  check(headReturn.includes('signatureStage(req.user?.Role) !== "head"') && headReturn.includes('status: "drafting"') && headReturn.includes("headReturn: { by:"),
    "R11 المسارُ لرئيس القسم وحده: يُسقط التوقيع ويحفظ السبب");
  check(bar.includes("إرجاع للجنة") && bar.includes("approval.headReturn"), "R11 والشريطُ يعرضه للجنة ويعطي رئيس القسم زرّه");
}

/* ── R12: ملاحظاتُ القسم لكلٍّ كاتبُها ─────────────────────────────────────── */
{
  const post = route('app.post("/api/schedule-notes"');
  check(post.includes('(origin !== "department" || Number(note.SystemUserId) === authorId)'), "R12 ملاحظةُ القسم تُحدَّث لكاتبها وحده");
  check(changes.includes('(mineOrigin !== "department" || Boolean(note.mine))') && changes.includes("<bdi>{note.userName}</bdi>"),
    "R12 والشاشة تسمّي الكاتب ولا تفتح ملاحظة الزميل للكتابة فوقها");
}

/* ── R13: تبديلُ المقرر أو الشعبة إضافة ─────────────────────────────────────── */
{
  check(isSwapEdit({ AdCourseId: 1, SCode: "01" }, { AdCourseId: 2, SCode: "01" }), "R13 تبديلُ المقرر إضافة");
  check(isSwapEdit({ AdCourseId: 1, SCode: "01" }, { AdCourseId: 1, SCode: "02" }), "R13 وتبديلُ رقم الشعبة إضافة");
  check(!isSwapEdit({ AdCourseId: 1, SCode: "01" }, { AdCourseId: 1, SCode: "01" }), "R13 وتغييرُ القاعة أو الوقت ليس إضافة");
  check(server.includes('movedScope || isSwapEdit(existing, updated) ? { kind: "add", row: updated }'), "R13 مسارُ التعديل يُبلّغ بها");
}

/* ── R14: ما زاد على الستين يُعدّ ولا يسقط ─────────────────────────────────── */
{
  const addition = (id: number): ScheduleAdditionPending => ({ scheduleId: id, courseId: 1, addedAt: "t", addedBy: "س" });
  const many = Array.from({ length: PENDING_ADDITIONS_CAP + 25 }, (_, index) => addition(index + 1));
  const merged = mergePendingAdditions({ pendingAdditions: [] }, many);
  check(merged.pendingAdditions.length === PENDING_ADDITIONS_CAP && merged.pendingAdditionsOverflow === 25, "R14 يُسمّى ستون ويُعدّ الباقي");
  check(pendingAdditionTotal(merged) === PENDING_ADDITIONS_CAP + 25, "R14 والمجموعُ يمنع الإرسال كلُّه");
  const pending = approvalWith({ pendingAdditions: [addition(1), addition(2), addition(3)], pendingAdditionsOverflow: 4 });
  const partial = acknowledgeAdditions(pending, { ids: [1, 2], overflow: 4 });
  check(partial.remaining === 1 && partial.next.pendingAdditions[0].scheduleId === 3 && partial.acknowledged === 6,
    "R14 يُقرّ ما رآه وحده، وما وصل بعده ينتظر");
  check(acknowledgeAdditions(pending, { ids: [1, 2, 3], overflow: 2 }).next.pendingAdditionsOverflow === 4,
    "R14 والزائدُ لا يُقرّ إن تغيّر عددُه منذ رآه");
  check(!between(server, "async function applyScheduleMutation(", "\n/**").includes(".slice(0, 60)"), "R14 لا قصَّ صامتاً في الخادم");
  check(bar.includes("expectedPendingIds: approval.pendingAdditions.map") && bar.includes("أخرى"), "R14 والشريطُ يقول «و N أخرى» ويرسل ما رآه");
}

/* ── R15: الموعدُ بتوقيت الكويت ─────────────────────────────────────────────── */
{
  const lateNight = new Date("2026-10-15T21:30:00.000Z");   // ٠٠:٣٠ من ١٦ أكتوبر في الكويت
  check(kuwaitDateISO(lateNight) === "2026-10-16", "R15 «اليوم» في الكويت يسبق الساعة العالمية بثلاث ساعات");
  check(deadlineEndsAt("2026-10-15") === "2026-10-15T23:59:59+03:00", "R15 الموعدُ ينتهي في ٢٣:٥٩:٥٩ بتوقيت الكويت");
  check(deadlinePassed("2026-10-15", lateNight) && !deadlinePassed("2026-10-15", new Date("2026-10-15T20:59:00.000Z")),
    "R15 ويمضي بعد منتصف ليل الكويت، لا بعد منتصف الليل العالمي");
  check(readDeadline({ termDeadline: "2026-10-15" }, lateNight).past === true, "R15 وقراءةُ الموعد تحكم بالقاعدة نفسها");
  const approvalSection = between(server, "async function readDeadlineFor(", "الملاحظة على الخانة");
  check(!approvalSection.includes("new Date().toISOString().slice(0, 10)"), "R15 لا «يوم» بالساعة العالمية في مسارات الدورة");
  check(bar.includes("deadlinePassed(state.deadline?.effective)"), "R15 والشاشة تقرأ الدالّة نفسها");
}

/* ── R16: التمديدُ في النطاق، ولا يسبق موعد الفصل ────────────────────────── */
{
  check(extensionRefusal("2026-10-10", "2026-10-15") !== null, "R16 تمديدٌ قبل موعد الفصل مرفوض");
  check(extensionRefusal("2026-10-20", "2026-10-15") === null && extensionRefusal("", "2026-10-15") === null, "R16 وما بعده أو رفعُه يمرّ");
  const extension = route('app.post("/api/approvals/extension"');
  check(extension.includes("approvalScopeFromBody(req, res)") && extension.includes("extensionRefusal(until,"), "R16 المسارُ يفحص النطاق والتاريخ");
}

/* ── R17: طلبُ التمديد ──────────────────────────────────────────────────────── */
{
  check(canRequestExtension({ effective: "2026-10-15", past: false, daysLeft: 3 }), "R17 يُعرض قبل الموعد بثلاثة أيام");
  check(canRequestExtension({ effective: "2026-10-15", past: true, daysLeft: -2 }), "R17 وبعد انقضائه");
  check(!canRequestExtension({ effective: "2026-10-15", past: false, daysLeft: 9 }) && !canRequestExtension({ past: false }),
    "R17 ولا يُعرض بعيداً عن الموعد أو بلا موعد");
  check(suggestedExtensionDate("2026-10-15", 7, "2026-10-12") === "2026-10-22", "R17 التاريخُ المقترح من الموعد الساري");
  check(suggestedExtensionDate("2026-10-15", 3, "2026-10-20") === "2026-10-23", "R17 أو من اليوم إن مضى الموعد");
  const request = route('app.post("/api/approvals/extension-request"');
  check(request.includes("extensionRequest: { by:") && request.includes("signatureStage(req.user?.Role)"), "R17 المسارُ للجنة ورئيس القسم ويحفظ الطلب");
  check(route('app.get("/api/approvals/inbox"').includes("extensionRequest: approval.extensionRequest"), "R17 والواردُ يعرضه");
  check(changes.includes("row.suggestedExtensionUntil") && bar.includes("طلب تمديد"), "R17 و«تمديد» يُفتح مملوءاً، والشريطُ يطلبه");
}

/* ── R18: سجلُّ الدورة ──────────────────────────────────────────────────────── */
{
  let approval = emptyApproval(1, 5, 20);
  for (let index = 0; index < APPROVAL_EVENT_CAP + 15; index += 1) approval = appendApprovalEvent(approval, { by: "س", action: "sign" });
  check(approval.events!.length === APPROVAL_EVENT_CAP, "R18 السجلُّ بسقفٍ ثابت");
  const writeRoutes = ["sign", "withdraw", "head-return", "acknowledge-additions", "return", "accept", "extension", "extension-request"];
  check(writeRoutes.every(name => route(`app.post("/api/approvals/${name}"`).includes("withEvent(req,")), "R18 كلُّ مسارٍ يكتب حدثه");
  check(between(server, "async function submitToRegistrar(", "\napp.").includes('"submit"'), "R18 والإرسال");
  check(between(server, "async function applyScheduleMutation(", "\n/**").includes('"amendment-open"'), "R18 وفتحُ جولة التعديل");
  check(writeRoutes.every(name => route(`app.post("/api/approvals/${name}"`).includes("approvalScopeLabel(")), "R18 وسطرُ التدقيق يسمّي الكلية والقسم والفصل");
  check(bar.includes("السجلّ") && bar.includes("approval-history"), "R18 والشريطُ يعرضه مطويّاً");
}

/* ── R19: الإصرارُ الثالث يُرفع ─────────────────────────────────────────────── */
{
  const second = insistOutcome({ insistCount: 1 }, "t2");
  const third = insistOutcome({ insistCount: 2 }, "t3");
  const fourth = insistOutcome({ insistCount: 3, escalatedAt: "t3" }, "t4");
  check(second.insistCount === 2 && !second.escalatedAt, "R19 الإصرارُ الثاني يُعدّ ولا يُرفع");
  check(third.insistCount === 3 && third.escalatedAt === "t3", "R19 والثالثُ يُسجَّل لحظتُه");
  check(fourth.escalatedAt === "t3", "R19 ولحظةُ الرفع لا تتبدّل بعده");
  check(route('app.get("/api/approvals"').includes("escalatedNotes:") && bar.includes("أصرّ عليها التسجيل ثلاثاً"),
    "R19 ويظهر لرئيس القسم في شريطه كما تقول الرسالة");
}

/* ── R20: من يقرأ لا يقرّر ─────────────────────────────────────────────────── */
check(changes.includes("const canRebut = Boolean(role.signatureStage) && !isViewerOnlyRole(role.id) && !isRegistrar;")
  && changes.includes('{canRebut && note.origin === "registrar" && note.state === "open" ? ('),
  "R20 «أبقِها كما هي» لمن يوقّع في القسم وحده — لا لعميد التسجيل");

/* ── R21: الورشةُ تعرف القفل قبل أن تفتح المحرّر ─────────────────────────── */
{
  check(bar.includes("onLockChange?.(lockReason)") && route('app.get("/api/approvals"').includes("lockReason,"),
    "R21 الشريطُ يبلّغ سببَ القفل كما يقرؤه الخادم");
  check(schedules.includes("onLockChange={setApprovalLock}") && schedules.includes("if (approvalLock) { setMessage(null); setError(approvalLock); return; }"),
    "R21 وكلُّ أبواب الإضافة تمرّ بالقفل");
  check((schedules.match(/disabled=\{Boolean\(approvalLock\)\}/g) || []).length >= 3, "R21 وأزرارُ «إضافة موعد» معطّلةٌ بسببها");
  check(schedules.includes("Boolean(approvalLock) ||") && schedules.includes("if (approvalLock) { e.preventDefault(); setPhysicsNotice(approvalLock); return; }"),
    "R21 والسحبُ لا يبدأ، ويُقال لماذا");
  check(schedules.includes("<strong>لا يُحفظ الآن</strong>"), "R21 ولوحةُ فحص الحفظ لا تقول «صالح» على جدولٍ مقفل");
}

/* ── R22: لا وعدَ بتلوينٍ لا يقع ────────────────────────────────────────────── */
check(!bar.includes("ملوّنةٌ في مكانها من الجدول") && bar.includes("افتح الملاحظات") && schedules.includes('onNavigate("scheduleChanges")'),
  "R22 الشريطُ يقول عدد الملاحظات ومكانها الحقيقي، ويفتحها");

/* ── R23: الفصلُ المنتهي ────────────────────────────────────────────────────── */
{
  for (const name of ["sign", "withdraw", "head-return", "acknowledge-additions", "submit", "return", "accept", "extension", "extension-request"]) {
    check(route(`app.post("/api/approvals/${name}"`).includes("await refuseIfTermClosed(res, termId)"), `R23 مسارُ ${name} يُرفض في فصلٍ منتهٍ`);
  }
  check(route('app.post("/api/schedule-notes"').includes("await refuseIfTermClosed(res, Number(row.AdTermId))")
    && route('app.post("/api/schedule-notes/:id/rebut"').includes("await refuseIfTermClosed(res, Number(note.AdTermId))")
    && route('app.post("/api/schedule-notes/:id/verdict"').includes("await refuseIfTermClosed(res, Number(note.AdTermId))"),
    "R23 والملاحظةُ والردُّ والقرارُ عليه كذلك");
  const mutation = between(server, "async function applyScheduleMutation(", "\n/**");
  check(mutation.includes("if (await termIsClosed(termId))") && mutation.includes('"closed-term-edit"'),
    "R23 وتعديلُ اللجنة في فصلٍ منتهٍ يُسجَّل حدثاً ولا يفتح جولة");
}

/* ── R7 سلوكاً: وثيقتان تُحفظان فوق المراجعة نفسها ─────────────────────────── */
async function revisionBehaviour() {
  const session = `demo_relay_${Date.now()}`;
  Repository.createDemoSandbox(session, 60_000);
  await Repository.withDemoSandbox(session, async () => {
    const fresh = emptyApproval(9001, 9002, 9003);
    const first = await Repository.saveScheduleApproval(fresh);
    check(first.revision === 1, "R7 أولُ حفظٍ مراجعته ١");
    let conflicted = false;
    try { await Repository.saveScheduleApproval(fresh); } catch (error) { conflicted = error instanceof ApprovalRevisionConflict; }
    check(conflicted, "R7 حفظٌ ثانٍ فوق المراجعة القديمة يُرفض ولا يمحو الأول");
    const second = await Repository.saveScheduleApproval({ ...first, status: "committee" });
    check(second.revision === 2, "R7 وحفظٌ فوق المراجعة الحاضرة يمرّ");

    /* ── مراجعة 5: الإعادةُ لا تكرّر الآثار الجانبية ─────────────────────── */
    const scope = [9101, 9102, 9103] as const;
    await Repository.saveScheduleApproval({ ...emptyApproval(...scope), status: "submitted" });
    let captures = 0, closes = 0, raced = false;
    const isConflict = (error: unknown) => error instanceof ApprovalRevisionConflict;
    const accept = (raceTimes: number) => runApprovalAttempts(async once => {
      const approval = (await Repository.getScheduleApproval(...scope))!;
      const version = await once("accept-version", async () => { captures += 1; return { id: `v${captures}` }; });
      if (raceTimes > 0) { raceTimes -= 1; raced = true; await Repository.saveScheduleApproval({ ...approval, events: [] }); }
      await Repository.saveScheduleApproval({ ...approval, status: "accepted", rounds: [{ number: 1, acceptedVersionId: version.id } as any] });
      closes += 1;
    }, { isConflict, canRetry: () => true });
    check(await accept(1) === "done" && raced, "R5-review قبولٌ سبقه قرارٌ آخر يُعاد فينجح");
    check(captures === 1, "R5-review النسخةُ تُلتقط مرّةً واحدة عبر المحاولتين");
    check(closes === 1, "R5-review إغلاقُ الملاحظات بعد الحفظ الناجح وحده، مرّةً واحدة");
    await Repository.saveScheduleApproval({ ...(await Repository.getScheduleApproval(...scope))!, status: "submitted" });
    captures = 0; closes = 0;
    check(await accept(2) === "conflict" && closes === 0 && captures === 1, "R5-review تعارضٌ متكرّر: 409 ولا ملاحظةٌ أُغلقت");
    let threw = false;
    try { await runApprovalAttempts(async () => { throw new ApprovalRevisionConflict(); }, { isConflict, canRetry: () => false }); } catch { threw = true; }
    check(threw, "R5-review لا إعادةَ بعد أن بدأ الردّ");

    const acceptRoute = route('app.post("/api/approvals/accept"');
    check(acceptRoute.indexOf("await Repository.saveScheduleApproval(next)") < acceptRoute.indexOf("updateScheduleComment(note.id")
      && acceptRoute.includes('once("accept-version", () => captureScopeVersion('), "R5-review مسارُ القبول: نسخةٌ مرّةً، وإغلاقٌ بعد الحفظ");
    const signRoute = route('app.post("/api/approvals/sign"');
    check((signRoute.match(/saveScheduleApproval\(/g) || []).length === 1 && signRoute.includes("sent?.ok === true ? sent.next : next"),
      "R5-review توقيعُ رئيس القسم وإرسالُه حفظٌ واحد");
    const submitFn = between(server, "async function submitToRegistrar(", "\napp.");
    check(!submitFn.includes("saveScheduleApproval(") && submitFn.includes('once("submit-version"'), "R5-review الإرسالُ يبني ولا يحفظ");
    check(!/await captureScopeVersion\(req, collegeId, sectionId, termId, "(قبول التسجيل|إرجاع للقسم|إرجاع جدولٍ معتمد|إرسال إلى التسجيل)"/.test(server),
      "R5-review لا التقاطَ نسخةٍ داخل قرار اعتمادٍ إلا عبر once");
  });
}

revisionBehaviour().then(() => {
  console.log(`\n${passed} نجحت · ${failed} أخفقت`);
  if (failed) process.exit(1);
}).catch(error => { console.error(error); process.exit(1); });
