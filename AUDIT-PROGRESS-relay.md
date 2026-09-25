# AUDIT PROGRESS — relay stream

Status per finding. Tests: `tests/relay-fixes-audit.ts` (`npm run test:relay-fixes`) unless noted.

## Round 1 (server core) — superseded by the final table below

| id | status | notes / covering test |
|----|--------|-----------------------|
| R1 | PARTIAL | server: canWithdraw refuses accepted, returned stays returned (statusAfterSignatureChange). client TODO |
| R2 | PARTIAL | server: canSubmit refuses accepted. client TODO |
| R3 | PARTIAL | server: submitToRegistrar passes blockingConflicts to canSubmit. client TODO |
| R4 | PARTIAL | server: countOpenRegistrarNotes used by submit/return/inbox/badge/GET; rebuttalHistory kept. client TODO |
| R5 | FIXED (server) | accept resolves open/answered registrar notes with resolution closed-by-acceptance |
| R6 | PARTIAL | server: readViewExpectation/staleViewRefusal on sign/submit/return/accept/head-return; acknowledge by seen ids. client TODO |
| R7 | FIXED (server) | revision CAS in saveScheduleApproval (Firestore transaction + memory), approvalTransaction retries once then 409 |
| R8 | FIXED (server) | amendment rounds via openRound; approvalLockReason; exceptions/decide/issue registrarLock:false |
| R9 | PARTIAL | roundBaselineVersionId/roundEndVersionId; ?baseline=; client TODO |
| R10 | PARTIAL | canReturn allows accepted (new round). client TODO |
| R11 | PARTIAL | POST /api/approvals/head-return. client TODO |
| R12 | PARTIAL | department notes keyed by author; notes carry `mine`. client TODO |
| R13 | FIXED (server) | isSwapEdit → addition in PUT |
| R14 | PARTIAL | mergePendingAdditions overflow; acknowledgeAdditions by seen ids. client TODO |
| R15 | PARTIAL | kuwaitDateISO/deadlineEndsAt/deadlinePassed in readDeadline; server callers. client TODO |
| R16 | FIXED (server) | extension: approvalScopeFromBody + extensionRefusal |
| R17 | PARTIAL | POST extension-request; inbox exposes it. client TODO |
| R18 | PARTIAL | events via appendApprovalEvent in every route; audit strings name scope. client TODO |
| R19 | PARTIAL | insistOutcome escalatedAt; GET exposes escalatedNotes. client TODO |
| R20 | TODO | |
| R21 | PARTIAL | GET /api/approvals exposes lockReason from approvalLockReason. client TODO |
| R22 | TODO | |
| R23 | FIXED (server) | refuseIfTermClosed on approval writes; noteScheduleMutation records closed-term-edit event instead of opening round |

Existing tests updated because they encoded the old spelling (not behaviour):
- tests/term-freeze-audit.ts (closed-term rule now in approvalLockReason; issue lock carries registrarLock:false)
- tests/approval-integrity-audit.ts (baseline scan now roundBaselineVersionId; nested-lock probe looks for the call, not the name; swap-as-addition string)
- tests/schedule-changes-audit.ts (insist count in insistOutcome; open-note count via countOpenRegistrarNotes)

## Final status (all findings)

Every check below lives in `tests/relay-fixes-audit.ts` under its id prefix; mutation-checked: R1, R2, R4, R7, R15 (restoring each bug fails the suite).

| id | status | what / where |
|----|--------|--------------|
| R1 | FIXED | canWithdraw refuses accepted; statusAfterSignatureChange keeps returned (sign + withdraw); bar hides «سحب توقيعي» when accepted |
| R2 | FIXED | canSubmit code already-accepted; bar readyToSubmit requires !accepted |
| R3 | FIXED | submitToRegistrar counts blocking conflicts → canSubmit; bar shows «يمنع الإرسال» |
| R4 | FIXED | countOpenRegistrarNotes/countAnsweredRegistrarNotes used by submit, return, GET, inbox, badge, notifications line, ScheduleChanges decision bar; rebuttalHistory kept on insist |
| R5 | FIXED | accept closes open/answered registrar notes (resolution closed-by-acceptance, «أُغلقت بالقبول») |
| R6 | FIXED | readViewExpectation/staleViewRefusal → 409 «تغيّر الجدول منذ فتحت الشاشة — حدّث» on sign/submit/return/accept/head-return; acknowledge takes only seen ids; clients send expectations |
| R7 | FIXED | revision + Firestore transaction CAS in saveScheduleApproval (memory/demo mimics); approvalTransaction retries once then 409; behavioural test in demo sandbox |
| R8 | FIXED | amendment rounds (openRound shared with submit), approvalLockReason, registrarLock:false for week exceptions, /decide, /issue |
| R9 | FIXED | roundBaselineVersionId (report + finalRowsOnly), roundEndVersionId for past rounds, ?baseline=round\|authority, UI toggle + past-round label |
| R10 | FIXED | canReturn allows accepted → new round; UI «إعادة فتح وإرجاع للقسم» |
| R11 | FIXED | POST /api/approvals/head-return + canHeadReturn; bar shows headReturn and head's «إرجاع للجنة» |
| R12 | FIXED | department notes keyed by author; notes carry `mine`; author shown |
| R13 | FIXED | isSwapEdit → addition in PUT /api/schedules/:id |
| R14 | FIXED | mergePendingAdditions keeps overflow count; «و N أخرى»; acknowledgeAdditions by seen ids/overflow |
| R15 | FIXED | kuwaitDateISO/deadlineEndsAt/deadlinePassed; readDeadline(Date); server approval routes + ApprovalBar |
| R16 | FIXED | extension: approvalScopeFromBody (isScopeAllowed) + extensionRefusal (not before term deadline) |
| R17 | FIXED | POST extension-request; bar countdown + «طلب تمديد»; inbox row shows request, «تمديد» prefilled (suggestedExtensionDate) |
| R18 | FIXED | approval.events (cap 200) via appendApprovalEvent in every route + amendment/closed-term; audit strings name college·section·term; bar «السجلّ» |
| R19 | FIXED | insistOutcome stores escalatedAt; GET exposes escalatedNotes; head sees it in bar; message now truthful |
| R20 | FIXED | canRebut = signatureStage && !isViewerOnlyRole && !registrar |
| R21 | FIXED | ApprovalBar onLockChange(lockReason from server guard); Schedules disables add buttons, guards openCreate, save-check panel says «لا يُحفظ الآن», physics disabled + drag start refused with notice |
| R22 | FIXED | truthful banner (count + where), «افتح الملاحظات» navigates to scheduleChanges |
| R23 | FIXED | refuseIfTermClosed on every approval/notes write route; noteScheduleMutation records closed-term-edit event instead of opening a round |
