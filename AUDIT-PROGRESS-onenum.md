# AUDIT-PROGRESS — onenum (claude/one-blocker-number)

| Id | Finding | Status | Test |
|----|---------|--------|------|
| A1 | ApprovalBar / review modal / board status showed three different «blocker» numbers | FIXED — headline = blocking conflicts (pairs); rows touched named as «مواعيد» via `approvalBlockerSummary`/`blockingRowIds`; `/api/approvals` + review-readiness expose `blockingRows`; living layer & every server `analyzeSchedule` pass gate options | tests/one-blocker-number-audit.ts |
| A2 | «حجز مزدوج لأستاذ المقرر — هيئة تدريسية» in the review | FIXED/VERIFIED — server + client fallback read `placeholderInstructorIds`; fixture proves no instructor blocker for placeholder pairs | tests/one-blocker-number-audit.ts |
| B1 | Registration sheet must look like the intelligence-centre case register (shared component) | TODO | |
| B2 | Graduate / cross-department cases missing from the registration sheet | TODO | |
| B3 | Real name + civil ID for authorised staff on the registration sheet | TODO | |
