# AUDIT PROGRESS — relay stream

Status per finding. Tests: `tests/relay-fixes-audit.ts` (`npm run test:relay-fixes`) unless noted.

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
