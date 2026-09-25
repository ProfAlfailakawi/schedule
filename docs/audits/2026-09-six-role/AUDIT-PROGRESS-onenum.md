# AUDIT-PROGRESS — onenum (claude/one-blocker-number)

| Id | Finding | Status | Test |
|----|---------|--------|------|
| A1 | ApprovalBar / review modal / board status showed three different «blocker» numbers | FIXED — headline = blocking conflicts (pairs); rows touched named as «مواعيد» via `approvalBlockerSummary`/`blockingRowIds`; `/api/approvals` + review-readiness expose `blockingRows`; living layer & every server `analyzeSchedule` pass gate options | tests/one-blocker-number-audit.ts |
| A2 | «حجز مزدوج لأستاذ المقرر — هيئة تدريسية» in the review | FIXED/VERIFIED — server + client fallback read `placeholderInstructorIds`; fixture proves no instructor blocker for placeholder pairs | tests/one-blocker-number-audit.ts |
| B1 | Registration sheet must look like the intelligence-centre case register (shared component) | FIXED — src/components/StudentCasesTable.tsx used by IntelligenceWorkspace + StudentRegistration; decision layer via render props; phone card layout | tests/student-registration-audit.ts, tests/student-journey-audit.ts S13/S14 |
| B2 | Graduate / cross-department cases missing from the registration sheet | FIXED — src/utils/studentCaseScope.ts: sheet rule = register rule + course owners (superset by construction) | tests/student-registration-audit.ts |
| B3 | Real name + civil ID for authorised staff on the registration sheet | FIXED — `studentIdentityFor` (one helper, both routes); view-only roles get none | tests/student-registration-audit.ts |
