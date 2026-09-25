# AUDIT-PROGRESS — deadlines panel («مواعيد التسليم»)

| Item | Status | Where | Test |
|---|---|---|---|
| 1 Term picker (non-ended terms, current/upcoming labels) | FIXED | src/components/SubmissionDeadlines.tsx | manual (demo) |
| 2 Main deadline: hero, 23:59 Kuwait, presets 1/2/3 weeks, states none/upcoming/today/passed | FIXED | SubmissionDeadlines.tsx, src/utils/submissionDeadlines.ts | deadlines-panel D1, D9 |
| 3 Live progress (sent/accepted/returned/drafting/not started/late via isLate) | FIXED | submissionDeadlines.ts deadlineProgress | D8 |
| 4 Exceptions: scope all/college/departments, +N days or date, reason, preview, bulk route, list with edit/remove | FIXED | server.ts POST /api/approvals/extensions, submissionDeadlines.ts decideException/resolveExceptionTargets | D2–D6 |
| 5 Pending requests: grant (+N) / reject with reason, same route | FIXED | SubmissionDeadlines.tsx, decideException | D4, D10 |
| 6 Tokens, dark mode, phone width, RTL, guide attributes, countOf; read-only strip for staff/deans; department «موعدكم … (استثناء حتى …)» | FIXED | src/styles/12-deadlines.css, ApprovalBar.tsx, Reports.tsx | D9, guide-audit |
| 7 Old DeadlineControl removed (one control) | FIXED | ScheduleChanges.tsx | D7, report-approval-audit |
| 8 Demo seed: deadline + one exception + one pending request | FIXED | src/db/demoSandbox.ts | D10, blockers-stream B15, demo-* |
